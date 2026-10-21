import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared contracts. Every team member builds against these two shapes:
//   1. EventInput  -> what the planner submits
//   2. Plan        -> what the agent returns (and what the UI renders)
// Change them only after telling the team.
// ---------------------------------------------------------------------------

export const EventInputSchema = z.object({
  venue: z.string().min(2).describe("Venue name and city, e.g. 'The Fillmore, San Francisco'"),
  act: z.string().min(2).describe("Headliner, lineup or theme, e.g. 'Phoebe Bridgers' or 'indie college fest'"),
  // Set when the planner confirmed the act with "Find artist": saves the agent a lookup.
  actId: z.string().optional().describe("Qloo entity ID the planner confirmed for the act"),
  actType: z.string().optional().describe("Qloo entity type of the confirmed act, e.g. artist or person"),
  date: z.string().describe("ISO date, e.g. 2026-11-22"),
  startTime: z.string().default("18:00"),
  durationHours: z.number().min(1).max(16).default(5),
  attendance: z.number().int().min(10).max(200000),
  volunteers: z.number().int().min(0).max(5000),
  budget: z.string().optional().describe("Free text, e.g. '$5,000' or '₹2L'"),
  foodStalls: z.number().int().min(0).max(200).optional(),
  notes: z.string().optional(),
});
export type EventInput = z.infer<typeof EventInputSchema>;

// Where a claim came from. The UI shows this as a badge on every line.
export const SourceKind = z.enum(["qloo", "web", "osm", "weather", "calc", "llm", "mock"]);
export type SourceKind = z.infer<typeof SourceKind>;

const Sourced = { source: SourceKind, evidence: z.string().describe("Short evidence, e.g. 'Qloo: fans over-index on Korean BBQ (affinity 0.91)'") };

export const PlanSchema = z.object({
  summary: z.string().describe("3-4 sentence overview for the planner"),
  crowd: z.object({
    headline: z.string().describe("One line describing who is coming"),
    // Qloo returns affinity indices, not shares: -1 (far fewer than typical) .. +1 (far more).
    ageIndex: z
      .array(z.object({ band: z.string(), index: z.number().min(-1).max(1) }))
      .describe("Copied from qloo_audience_demographics age. Empty if unavailable."),
    genderIndex: z
      .array(z.object({ label: z.string(), index: z.number().min(-1).max(1) }))
      .describe("Copied from qloo_audience_demographics gender. Empty if unavailable."),
    loves: z.array(z.object({ category: z.string(), items: z.array(z.string()), ...Sourced })),
    vsRegulars: z
      .array(z.object({ difference: z.string(), ...Sourced }))
      .describe("How tonight's audience differs from the venue's usual crowd (qloo_compare_audiences). Empty if unknown."),
  }),
  venue: z.object({
    name: z.string(),
    address: z.string(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
    capacity: z.number().nullable(),
    entrances: z.number().nullable(),
    facts: z.array(z.object({ fact: z.string(), ...Sourced })),
    transit: z.array(z.string()),
    parking: z.array(z.string()),
    risks: z.array(z.object({ risk: z.string(), mitigation: z.string(), ...Sourced })),
  }),
  foodAndDrink: z.object({
    stallMix: z.array(z.object({ concept: z.string(), count: z.number().int(), why: z.string(), ...Sourced })),
    vendorsToInvite: z.array(z.object({ name: z.string(), why: z.string(), ...Sourced })),
    drinks: z.array(z.object({ item: z.string(), why: z.string(), ...Sourced })),
  }),
  sponsors: z.array(z.object({ brand: z.string(), why: z.string(), pitch: z.string(), ...Sourced })),
  merch: z.array(z.object({ idea: z.string(), why: z.string(), ...Sourced })),
  volunteers: z.object({
    available: z.number().int(),
    recommended: z.number().int(),
    shifts: z.array(z.object({ label: z.string(), start: z.string(), end: z.string() })),
    stations: z.array(z.object({ station: z.string(), count: z.number().int(), notes: z.string() })),
    warnings: z.array(z.string()),
  }),
  vibe: z.object({
    playlist: z.array(z.object({ artist: z.string(), why: z.string(), ...Sourced })),
    themeIdeas: z.array(z.string()),
  }),
  assumptions: z
    .array(z.string())
    .describe("Choices the agent made that the planner should check, e.g. which Qloo entity the act was matched to"),
  limitations: z
    .array(z.string())
    .describe("What this plan does not establish, e.g. Qloo affinities describe audiences in aggregate, not individual attendees"),
});
export type Plan = z.infer<typeof PlanSchema>;

// Every tool returns this envelope so the trace UI and the agent see the same thing.
export interface ToolResult<T = unknown> {
  data: T;
  source: SourceKind;
  cached: boolean;
}

// Events streamed from /api/plan to the browser (one JSON object per SSE message).
export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "note"; message: string } // the agent's own short progress note between tool calls
  | { type: "tool_call"; id: string; tool: string; input: unknown }
  | { type: "tool_result"; id: string; tool: string; source: SourceKind; cached: boolean; preview: string; status?: string }
  | { type: "plan"; plan: Plan; mode: "qloo" | "baseline" }
  | { type: "error"; message: string };
