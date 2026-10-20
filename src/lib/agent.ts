import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { geocode, nearby, weather } from "./tools/geo";
import { qlooInsights, qlooIsMock, qlooSearch, qlooTags } from "./tools/qloo";
import { planStaffing } from "./tools/staffing";
import { PlanSchema, type AgentEvent, type EventInput, type Plan, type ToolResult } from "./types";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

type Emit = (e: AgentEvent) => void;

const SYSTEM = `You are Crowd Kit, an event-operations agent. A planner gives you a venue, an act or theme, a date, expected attendance and a volunteer count. You research WHO is coming and WHERE they are going, then produce an operations plan.

Workflow (adapt as needed, run independent calls in parallel):
1. Crowd, from Qloo (the differentiator - lean on it):
   - qloo_search the act to get its entity id (types: urn:entity:artist, or urn:entity:person for comedians).
   - qloo_insights with filter.type=urn:demographics and signal.interests.entities=<id> for age/gender mix.
   - qloo_insights with signal.interests.entities=<id> and filter.type = urn:entity:brand (sponsors, drinks, merch styles), urn:entity:place with filter.location.query=<venue city> (local vendors to invite), urn:entity:artist (pre-show playlist).
   - Use qloo_tags to turn words like "korean bbq" into tag ids before using them as signals or filters. Freeform strings are not valid tag ids.
   - Invalid parameters are silently ignored. If a call returns nothing useful, change parameters rather than inventing results.
2. Venue: geocode_venue, then nearby_osm (food, transit, parking, safety) and weather_for_date. Use web_search for capacity, entrances, house rules (outside food, alcohol), and past events at the venue.
3. Volunteers: call plan_volunteers. Set merchWeight and accessibilityWeight from the Qloo crowd profile and say why in the plan.
4. Call submit_plan exactly once with the finished plan. That is how you deliver it.

Rules:
- Every recommendation carries a source and short evidence. Use "qloo" only for facts that came from a Qloo tool result, "mock" when the Qloo tool returned source "mock", "web", "osm", "weather", "calc" for the matching tools, and "llm" for your own reasoning.
- Be specific: named vendors, named brands, numbers. Generic advice ("offer diverse food options") is a failure.
- Respect the planner's budget and stall count when given.`;

function preview(r: ToolResult): string {
  const s = JSON.stringify(r.data);
  return s.length > 280 ? s.slice(0, 280) + "…" : s;
}

// Wraps a tool so the browser sees each call and result in the live trace.
function traced<I>(emit: Emit, name: string, fn: (input: I) => Promise<ToolResult> | ToolResult) {
  return async (input: I) => {
    const id = crypto.randomUUID();
    emit({ type: "tool_call", id, tool: name, input });
    try {
      const r = await fn(input);
      emit({ type: "tool_result", id, tool: name, source: r.source, cached: r.cached, preview: preview(r) });
      return JSON.stringify({ source: r.source, data: r.data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "tool_result", id, tool: name, source: "llm", cached: false, preview: `ERROR: ${message}` });
      return JSON.stringify({ error: message });
    }
  };
}

export async function runCrowdKit(input: EventInput, emit: Emit): Promise<Plan> {
  let submitted: Plan | null = null;

  const tools = [
    betaZodTool({
      name: "qloo_search",
      description: "Find Qloo entity ids by name (artists, people, places, brands, movies...).",
      inputSchema: z.object({
        query: z.string(),
        types: z.string().optional().describe("Comma-separated entity URNs, e.g. urn:entity:artist"),
      }),
      run: traced(emit, "qloo_search", (i: { query: string; types?: string }) => qlooSearch(i.query, i.types)),
    }),
    betaZodTool({
      name: "qloo_tags",
      description: "Find Qloo tag ids (cuisines, genres, styles) by keyword. Use the returned ids in signal.interests.tags / filter.tags.",
      inputSchema: z.object({ query: z.string(), tagType: z.string().optional() }),
      run: traced(emit, "qloo_tags", (i: { query: string; tagType?: string }) => qlooTags(i.query, i.tagType)),
    }),
    betaZodTool({
      name: "qloo_insights",
      description:
        "GET /v2/insights. Pass raw Qloo query params as a flat object. filter.type is required " +
        "(urn:entity:artist|brand|place|movie|tv_show|podcast|book|person|destination, urn:demographics, urn:heatmap). " +
        "Useful params: signal.interests.entities, signal.interests.tags, signal.demographics.age, filter.location.query, " +
        "filter.location.radius, filter.tags, bias.trends, diversify.by, feature.explainability=true, take.",
      inputSchema: z.object({ params: z.record(z.string(), z.union([z.string(), z.number()])) }),
      run: traced(emit, "qloo_insights", (i: { params: Record<string, string | number> }) => qlooInsights(i.params)),
    }),
    betaZodTool({
      name: "geocode_venue",
      description: "Geocode a venue name/address with OpenStreetMap. Returns candidates with lat/lon.",
      inputSchema: z.object({ query: z.string() }),
      run: traced(emit, "geocode_venue", (i: { query: string }) => geocode(i.query)),
    }),
    betaZodTool({
      name: "nearby_osm",
      description: "Count and name OpenStreetMap features around a point. Groups: food, transit, parking, safety.",
      inputSchema: z.object({
        lat: z.number(),
        lon: z.number(),
        radiusM: z.number().int().min(100).max(3000).default(800),
        groups: z.array(z.enum(["food", "transit", "parking", "safety"])),
      }),
      run: traced(emit, "nearby_osm", (i: { lat: number; lon: number; radiusM: number; groups: string[] }) =>
        nearby(i.lat, i.lon, i.radiusM, i.groups),
      ),
    }),
    betaZodTool({
      name: "weather_for_date",
      description: "Weather forecast for the event date (or same day last year if beyond 16 days).",
      inputSchema: z.object({ lat: z.number(), lon: z.number(), date: z.string() }),
      run: traced(emit, "weather_for_date", (i: { lat: number; lon: number; date: string }) => weather(i.lat, i.lon, i.date)),
    }),
    betaZodTool({
      name: "plan_volunteers",
      description: "Deterministic volunteer staffing plan by station and shift. Always use this for headcounts.",
      inputSchema: z.object({
        attendance: z.number().int(),
        volunteers: z.number().int(),
        entrances: z.number().int().min(1),
        durationHours: z.number(),
        startTime: z.string(),
        foodStalls: z.number().int(),
        merchWeight: z.number().min(0.5).max(2),
        accessibilityWeight: z.number().min(0.5).max(2),
        alcohol: z.boolean(),
      }),
      run: traced(emit, "plan_volunteers", planStaffing),
    }),
    betaZodTool({
      name: "submit_plan",
      description: "Deliver the finished plan. Call exactly once, at the end.",
      inputSchema: PlanSchema,
      run: async (plan) => {
        submitted = plan;
        emit({ type: "status", message: "Plan submitted" });
        return "Plan received.";
      },
    }),
  ];

  const brief = [
    `Venue: ${input.venue}`,
    `Act / theme: ${input.act}`,
    `Date: ${input.date}, starting ${input.startTime}, about ${input.durationHours} hours`,
    `Expected attendance: ${input.attendance}`,
    `Volunteers available: ${input.volunteers}`,
    input.budget && `Budget: ${input.budget}`,
    input.foodStalls !== undefined && `Food stall slots: ${input.foodStalls}`,
    input.notes && `Notes from the planner: ${input.notes}`,
    qlooIsMock && `NOTE: Qloo is running in mock mode. Label Qloo-derived items with source "mock".`,
  ]
    .filter(Boolean)
    .join("\n");

  emit({ type: "status", message: qlooIsMock ? "Researching (Qloo mock mode)…" : "Researching…" });

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 20000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 30,
    tools: [...tools, { type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: brief }],
  });

  for await (const message of runner) {
    for (const block of message.content) {
      if (block.type === "server_tool_use") {
        emit({ type: "tool_call", id: block.id, tool: block.name, input: block.input });
      }
    }
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (message.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: message.content });
    }
    if (submitted) break;
  }

  if (!submitted) throw new Error("The agent finished without submitting a plan.");
  return submitted;
}

// "Without Qloo": same brief, no tools, the model's own knowledge only.
export async function runBaseline(input: EventInput): Promise<Plan> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(PlanSchema) },
    system:
      "You are an event-operations assistant. Produce an operations plan from your own general knowledge only. " +
      'Use source "llm" for every item.',
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (!response.parsed_output) throw new Error(`Baseline produced no plan (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
