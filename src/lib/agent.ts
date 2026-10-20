import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { geocode, nearby, weather } from "./tools/geo";
import { qlooTools } from "./tools/qloo";
import { planStaffing } from "./tools/staffing";
import { PlanSchema, type AgentEvent, type EventInput, type Plan, type ToolResult } from "./types";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

type Emit = (e: AgentEvent) => void;

const SYSTEM = `You are Crowd Kit, an event-operations agent. A planner gives you a venue, an act or theme, a date, expected attendance and a volunteer count. You research WHO is coming and WHERE they are going, then produce an operations plan.

Qloo tools (qloo_*) are the differentiator - lean on them. Each returns an envelope with a status:
ok | empty | needs_input | partial | degraded | error. Read "summary" on partial/degraded. Retry an error only if error.retryable is true.

Workflow (adapt as needed, run independent calls in parallel):
1. Resolve the act. qloo_describe the act (and qloo_find_tags for a vague theme like "indie college fest").
   - needs_input means the match is ambiguous. Pick a candidate only if one clearly fits the act and the venue's city, and record the choice in "assumptions". Otherwise use the closest tags instead. Never pass an uncertain match into later calls.
2. Crowd. qloo_audience_demographics for the act. qloo_recommend with the act as signal for brands, local places near the venue, and artists.
3. Venue regulars. Use web_search to find 2-4 acts that recently played this venue, resolve them, then qloo_compare_audiences (act vs those regulars). Put the differences in crowd.vsRegulars.
4. Shortlists, then rank. Find REAL candidates first (local vendors from nearby_osm or web_search, plausible sponsor brands from qloo_recommend), then qloo_rank them against the act's audience. Ranked real options beat open-ended suggestions.
5. Optional: qloo_trends for rising artists for the pre-show playlist.
6. Venue: geocode_venue, then nearby_osm (food, transit, parking, safety) and weather_for_date. web_search for capacity, entrances, house rules (outside food, alcohol). If a tool fails, continue without it and note the gap in "limitations".
7. Volunteers: call plan_volunteers. Set merchWeight and accessibilityWeight from the Qloo crowd profile and say why.
8. Call submit_plan exactly once with the finished plan. That is how you deliver it.

Rules:
- Every recommendation carries a source and short evidence. Use "qloo" only for facts from a qloo_* result whose source was qloo, "mock" for mock Qloo results, "web", "osm", "weather", "calc" for the matching tools, and "llm" for your own reasoning.
- Qloo describes aggregate audience affinities. Write "fans over-index on X", never "attendees will buy X". Do not present affinities as predictions about individuals.
- Never send personal data (names of private people, emails, phone numbers) to any tool.
- Be specific: named vendors, named brands, numbers. Generic advice ("offer diverse food options") is a failure.
- Respect the planner's budget and stall count when given.
- "limitations" must say what the plan does not establish.`;

function preview(data: unknown): string {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  return s.length > 280 ? s.slice(0, 280) + "…" : s;
}

// Wraps a local tool so the browser sees each call and result in the live trace.
function traced<I>(emit: Emit, name: string, fn: (input: I) => Promise<ToolResult> | ToolResult) {
  return async (input: I) => {
    const id = crypto.randomUUID();
    emit({ type: "tool_call", id, tool: name, input });
    try {
      const r = await fn(input);
      emit({ type: "tool_result", id, tool: name, source: r.source, cached: r.cached, preview: preview(r.data) });
      return JSON.stringify({ source: r.source, data: r.data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "tool_result", id, tool: name, source: "llm", cached: false, preview: `ERROR: ${message}`, status: "error" });
      return JSON.stringify({ error: message });
    }
  };
}

export async function runCrowdKit(input: EventInput, emit: Emit): Promise<Plan> {
  let submitted: Plan | null = null;

  const qloo = await qlooTools((info, toolInput) => {
    const id = crypto.randomUUID();
    emit({ type: "tool_call", id, tool: info.tool, input: toolInput });
    emit({ type: "tool_result", id, tool: info.tool, source: info.source, cached: info.cached, preview: info.summary, status: info.status });
  });
  if (qloo.mode === "mock") emit({ type: "status", message: `Qloo mock mode: ${qloo.reason}` });

  const localTools = [
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
    qloo.mode === "mock" && `NOTE: Qloo tools are in mock mode. Label Qloo-derived items with source "mock".`,
  ]
    .filter(Boolean)
    .join("\n");

  emit({ type: "status", message: "Researching…" });

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 20000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 30,
    tools: [...qloo.tools, ...localTools, { type: "web_search_20260209", name: "web_search", max_uses: 8 }],
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
