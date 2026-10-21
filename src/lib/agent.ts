import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { geocode, nearby, weather } from "./tools/geo";
import { qlooTools } from "./tools/qloo";
import { planStaffing } from "./tools/staffing";
import { PlanSchema, type AgentEvent, type EventInput, type Plan, type ToolResult } from "./types";

const MODEL = "claude-opus-5-5";
// Created on first use so demo mode works without ANTHROPIC_API_KEY.
let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

type Emit = (e: AgentEvent) => void;

const SYSTEM = `You are Crowd Kit, an event-operations agent. A planner gives you a venue, an act or theme, a date, expected attendance and a volunteer count. You research who is coming (the act's audience) and where they are going (the venue and its surroundings), then deliver an operations plan by calling submit_plan.

# How you run
The planner is not watching in real time and cannot answer questions mid-run. Never stop to ask; make the judgement call, record it in "assumptions", and finish. The run is complete only when submit_plan has been called.
Before each batch of tool calls, write one short plain sentence saying what you are checking next. The planner sees these lines live.
Keep the run efficient: about 25 tool calls is plenty. Do not use web_search for anything a Qloo or map tool answers.

# Qloo is the differentiator
Qloo tools (qloo_*) describe what an audience over-indexes on across music, film, food, brands and places. Every plan section should lean on them. Each returns an envelope with a status:
- ok: use the results.
- empty: refine the input once (broader type, a tag instead of an entity), then move on.
- needs_input: the match is ambiguous. Pick a candidate only if one clearly fits the act and the venue's city, and record the choice in "assumptions". Otherwise switch to tags. Never pass an uncertain match into later calls.
- partial / degraded: use what came back and read "summary".
- error: retry only if error.retryable is true.

# How Qloo inputs behave (learned from live calls)
- Names are ambiguous. "Phoebe Bridgers" matches both an artist and a person, so a name in signals or options returns needs_input. Resolve each name once with qloo_describe, then pass the entity's Qloo ID (the UUID, e.g. "AFBC71A7-...") in signals, options, group_a and group_b. Never pass the bare name again after you have its ID.
- Category words are ambiguous too: "restaurant" or "cafe" each match several tags. Use exact tag IDs in include_tags / signal_tags. For food places use include_tags ["urn:tag:genre:place:restaurant", "urn:tag:category:place:cafe"] with include_tags_operator "union". For anything else, look the tag up with qloo_find_tags and pick the ID whose type fits.
- Location must be a city with its region or country: "San Francisco, CA", "Chicago, IL", "Pune, India". Never a neighbourhood ("Fillmore District" matched Bogotá) and never coordinates (they matched the wrong state). Check that returned addresses are in the right city; discard any that are not and note it in "limitations".
- Without include_tags, qloo_recommend for places returns any kind of place (museums, shops). Add tags when you want food.

# Workflow (run independent calls in the same turn)
1. Resolve the act with qloo_describe. A musician is an artist; a comedian or speaker is a person. For a lineup, resolve up to three headliners and use them all as signals. For a theme with no headliner ("indie college fest"), use qloo_find_tags and recommend from the tag IDs.
2. Crowd: qloo_audience_demographics for the act, then qloo_recommend with the act's ID as signal for brands, food places in the venue's city (with the food tags above), and artists.
3. Venue regulars: web_search for 2-4 acts that recently played this venue, resolve them, and qloo_compare_audiences (the act vs those regulars). If you cannot find past acts, leave crowd.vsRegulars empty and say so in "limitations".
4. Shortlist, then rank: collect real candidates first (food places from nearby_osm, qloo_recommend places, or web_search; sponsor brands from qloo_recommend), then qloo_rank them against the act's audience. Ranked real options beat open-ended suggestions.
5. Venue: geocode_venue, then in one turn nearby_osm (food, transit, parking, safety), weather_for_date, and web_search for capacity, entrances and house rules (outside food, alcohol, bag policy). If a tool fails, continue without it and note the gap in "limitations".
6. Volunteers: call plan_volunteers. Set merchWeight and accessibilityWeight from the Qloo crowd profile (merch-heavy fanbase, older crowd, families) and explain the choice in a station note or assumption.
7. Optional: qloo_trends for rising artists to add to the pre-show playlist.
8. Call submit_plan exactly once.

# What a good plan looks like
- Sizes: stallMix counts add up to the planner's food stall slots when given (otherwise 4-8 stalls); 3-5 vendorsToInvite; 2-4 sponsors; 2-4 merch ideas; 5-8 playlist artists; 3-5 "loves" categories; 3-6 venue facts; 2-4 risks.
- Every item names something real: a vendor, a brand, an artist, a street, a number. These patterns are failures, so never write them: "diverse" or "a variety of" food options; "local vendors" or "a local beverage brand" without a name; "popular brands"; "popular hits" or "crowd-pleasers"; "engage the audience"; "ensure adequate staffing"; a vendor or brand no tool returned, unless it is labelled "llm".
- qloo_audience_demographics returns affinity indices, not percentages: each age band and gender has a value from -1 (far fewer than a typical audience) to +1 (far more), e.g. {"25_to_29": 0.33, "35_to_44": -0.63}. Copy them into crowd.ageIndex and crowd.genderIndex unchanged, keeping Qloo's band names. Describe them as over- or under-representation ("skews 25-29, few fans over 35"), never as shares ("33% are 25-29"). If demographics are unavailable, leave both arrays empty rather than estimating.
- Fit the budget: do not recommend more stalls, sponsors or merch than the planner's budget and slots allow, and say so in "assumptions" when you trim.

# Sources and wording
- Every item carries a source and short evidence. Use "qloo" only for facts from a qloo_* result whose envelope came from Qloo, and cite the specific signal in the evidence (for example "qloo_rank score 0.91 for fans of Phoebe Bridgers"). Use "mock" for mock Qloo results; "web", "osm", "weather" and "calc" for those tools; "llm" for your own reasoning.
- Qloo describes aggregate audience affinities. Write "fans over-index on X", never "attendees will buy X". Never present an affinity as a prediction about an individual.
- Never send personal data (private people's names, emails, phone numbers) to any tool.
- "limitations" must say what this plan does not establish, including any tool that failed.`;

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

// Optional run statistics, filled in as the agent works (used by scripts/eval-agent.ts).
export interface AgentStats {
  turns: number;
  toolCalls: number;
  multiCallTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  ms: number;
  qlooMode: "live" | "mock" | "unknown";
}

export const newStats = (): AgentStats => ({
  turns: 0, toolCalls: 0, multiCallTurns: 0, inputTokens: 0, outputTokens: 0,
  cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, ms: 0, qlooMode: "unknown",
});

export async function runCrowdKit(input: EventInput, emit: Emit, stats?: AgentStats): Promise<Plan> {
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
    // Placed in the user turn rather than the system prompt: it moves parallel tool use more there.
    "\nFirst privately list what you need next; then request every item that doesn't depend on another's result in this one response.",
  ]
    .filter(Boolean)
    .join("\n");

  emit({ type: "status", message: "Researching…" });
  const started = Date.now();

  const runner = anthropic().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 20000,
    system: SYSTEM,
    // Short progress notes between tool calls (shown in the live trace).
    thinking: { type: "adaptive", display: "updates" },
    output_config: { effort: "medium" },
    // The runner resends the whole conversation each step; cache it.
    cache_control: { type: "ephemeral" },
    betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
    fallbacks: "default",
    max_iterations: 30,
    tools: [...qloo.tools, ...localTools, { type: "web_search_20260209", name: "web_search", max_uses: 6 }],
    messages: [{ role: "user", content: brief }],
  });

  for await (const message of runner) {
    let callsThisTurn = 0;
    for (const block of message.content) {
      if (block.type === "server_tool_use") {
        callsThisTurn++;
        emit({ type: "tool_call", id: block.id, tool: block.name, input: block.input });
      } else if (block.type === "tool_use") {
        callsThisTurn++;
      } else if (block.type === "thinking" && block.thinking.trim()) {
        emit({ type: "note", message: block.thinking.trim() });
      }
    }
    if (stats) {
      stats.turns++;
      stats.toolCalls += callsThisTurn;
      if (callsThisTurn > 1) stats.multiCallTurns++;
      const u = message.usage;
      stats.inputTokens += u.input_tokens;
      stats.outputTokens += u.output_tokens;
      stats.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      stats.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
      stats.webSearches += u.server_tool_use?.web_search_requests ?? 0;
      stats.ms = Date.now() - started;
      stats.qlooMode = qloo.mode;
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
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(PlanSchema) },
    // A fair baseline: same planner brief and quality bar, just no tools or audience data.
    system:
      "You are an event-operations assistant. Produce an operations plan for this event from your own knowledge only. " +
      "Be as specific as you honestly can: name real vendors, brands and artists you know of, and give numbers. " +
      "stallMix counts should add up to the planner's food stall slots when given. " +
      "Leave crowd.ageIndex and crowd.genderIndex empty: you have no audience data. " +
      'Use source "llm" for every item, and say in "limitations" that no audience data was used.',
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (!response.parsed_output) throw new Error(`Baseline produced no plan (stop_reason: ${response.stop_reason})`);
  return response.parsed_output;
}
