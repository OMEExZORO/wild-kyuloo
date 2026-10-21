import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { z } from "zod";
import { SYSTEM } from "./prompt";
import { geocode, nearby, weather } from "./tools/geo";
import { qlooTools } from "./tools/qloo";
import { planStaffing } from "./tools/staffing";
import { cleanSchema, type AgentTool } from "./tools/tool";
import { PlanSchema, type AgentEvent, type EventInput, type Plan, type SourceKind, type ToolResult } from "./types";

// Gemini free tier. The agent runs on MODEL; web_search makes a separate call
// to SEARCH_MODEL because Google Search grounding is only free on 2.5 Flash.
// Note: on the free tier Google may use requests to improve its products.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL ?? "gemini-2.5-flash";
const MAX_TURNS = 30;

// Created on first use so demo mode works without GEMINI_API_KEY.
let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to .env.local.");
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

type Emit = (e: AgentEvent) => void;

// Free-tier rate limits are tight: wait and retry on 429 / 503 instead of failing.
async function withRetry<T>(emit: Emit | null, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError && (err.status === 429 || err.status === 503);
      if (!retryable || attempt >= 4) throw err;
      const seconds = 5 * 2 ** attempt;
      emit?.({ type: "status", message: `Gemini is busy (free-tier limit); retrying in ${seconds}s` });
      await new Promise((r) => setTimeout(r, seconds * 1000));
    }
  }
}

function preview(data: unknown): string {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  return s.length > 280 ? s.slice(0, 280) + "…" : s;
}

// A local tool: validates input against its zod schema, shows the call in the
// live trace, and returns { source, data } (or { error }) to the model.
function localTool<S extends z.ZodType>(
  emit: Emit,
  okSources: Set<SourceKind>,
  name: string,
  description: string,
  schema: S,
  fn: (input: z.infer<S>) => Promise<ToolResult> | ToolResult,
): AgentTool {
  return {
    name,
    description,
    parameters: cleanSchema(z.toJSONSchema(schema)),
    run: async (raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return JSON.stringify({ error: "Invalid input", issues: parsed.error.issues.slice(0, 5) });
      const id = crypto.randomUUID();
      emit({ type: "tool_call", id, tool: name, input: parsed.data });
      try {
        const r = await fn(parsed.data);
        okSources.add(r.source);
        emit({ type: "tool_result", id, tool: name, source: r.source, cached: r.cached, preview: preview(r.data) });
        return JSON.stringify({ source: r.source, data: r.data });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit({ type: "tool_result", id, tool: name, source: "llm", cached: false, preview: `ERROR: ${message}`, status: "error" });
        return JSON.stringify({ error: message });
      }
    },
  };
}

// Web research through a separate Gemini call with Google Search grounding.
async function webSearch(query: string, emit: Emit, stats?: AgentStats): Promise<ToolResult> {
  const res = await withRetry(emit, () =>
    gemini().models.generateContent({
      model: SEARCH_MODEL,
      contents: `Research this for an event planner and answer with concrete facts (numbers, names, dates). Say "unknown" for anything you cannot confirm.\n\n${query}`,
      config: { tools: [{ googleSearch: {} }] },
    }),
  );
  if (stats) stats.webSearches++;
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? "", url: c.web.uri }] : [])).slice(0, 6);
  return { data: { answer: res.text ?? "", sources }, source: "web", cached: false };
}

// Optional run statistics, filled in as the agent works (used by scripts/eval-agent.ts).
export interface AgentStats {
  turns: number;
  toolCalls: number;
  multiCallTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  webSearches: number;
  ms: number;
  model: string;
  qlooMode: "live" | "mock" | "unknown";
}

export const newStats = (): AgentStats => ({
  turns: 0, toolCalls: 0, multiCallTurns: 0, inputTokens: 0, outputTokens: 0,
  cacheReadTokens: 0, webSearches: 0, ms: 0, model: MODEL, qlooMode: "unknown",
});

// Gemini's thought summaries are paragraphs, often with a bold heading; keep one readable line.
function noteFrom(text: string): string {
  const heading = text.match(/\*\*(.+?)\*\*/)?.[1];
  const firstSentence = text.replace(/\*\*.+?\*\*/g, "").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return (heading ?? firstSentence).trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// Grounding check: a "qloo" label must point at a name Qloo actually returned,
// and every source kind used must have succeeded at least once in this run.
// ---------------------------------------------------------------------------
type Sourced = { source: SourceKind; evidence: string };
interface GroundingIssue { message: string; item: Sourced }

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function checkGrounding(plan: Plan, qlooNames: Set<string>, okSources: Set<SourceKind>, venue: string): GroundingIssue[] {
  const issues: GroundingIssue[] = [];
  // Agents often append the city ("Godaam Pune"); ignore venue words when matching.
  const venueWords = new Set(normalizeName(venue).split(" ").filter((w) => w.length > 2));
  const strip = (s: string) => normalizeName(s).split(" ").filter((w) => !venueWords.has(w)).join(" ");
  const known = [...qlooNames].map(strip).filter((n) => n.length >= 3);
  const matches = (name: string) => {
    const n = strip(name);
    return n.length >= 3 && known.some((k) => k === n || k.includes(n) || n.includes(k));
  };

  const named: [string, string, Sourced][] = [
    ...plan.foodAndDrink.vendorsToInvite.map((v): [string, string, Sourced] => ["vendor", v.name, v]),
    ...plan.sponsors.map((s): [string, string, Sourced] => ["sponsor", s.brand, s]),
    ...plan.vibe.playlist.map((p): [string, string, Sourced] => ["playlist artist", p.artist, p]),
  ];
  for (const [kind, name, item] of named) {
    if (item.source === "qloo" && !matches(name)) issues.push({ item, message: `${kind} "${name}" is labelled qloo but no Qloo result had that name` });
  }

  const all: Sourced[] = [
    ...plan.crowd.loves, ...plan.crowd.vsRegulars, ...plan.venue.facts, ...plan.venue.risks,
    ...plan.foodAndDrink.stallMix, ...plan.foodAndDrink.vendorsToInvite, ...plan.foodAndDrink.drinks,
    ...plan.sponsors, ...plan.merch, ...plan.vibe.playlist,
  ];
  for (const item of all) {
    if (!okSources.has(item.source) && !issues.some((i) => i.item === item)) {
      issues.push({ item, message: `an item is labelled "${item.source}" but no ${item.source} tool succeeded in this run: "${item.evidence.slice(0, 80)}"` });
    }
  }
  return issues;
}

// Mutates the flagged items in place: keep the content, drop the unverified label.
function relabelUnverified(issues: GroundingIssue[]) {
  for (const { item } of issues) {
    item.evidence = `Unverified (${item.source} label could not be confirmed): ${item.evidence}`;
    item.source = "llm";
  }
}

export async function runCrowdKit(input: EventInput, emit: Emit, stats?: AgentStats): Promise<Plan> {
  let submitted: Plan | null = null;
  // What actually came back this run, for checking the plan's source labels.
  const okSources = new Set<SourceKind>(["llm"]);
  const qlooNames = new Set<string>();
  let groundingRejections = 0;

  const qloo = await qlooTools((info, toolInput) => {
    if (info.status !== "error" && info.status !== "needs_input") okSources.add(info.source);
    info.names.forEach((n) => qlooNames.add(normalizeName(n)));
    const id = crypto.randomUUID();
    emit({ type: "tool_call", id, tool: info.tool, input: toolInput });
    emit({ type: "tool_result", id, tool: info.tool, source: info.source, cached: info.cached, preview: info.summary, status: info.status });
  });
  if (qloo.mode === "mock") emit({ type: "status", message: `Qloo mock mode: ${qloo.reason}` });

  const tools: AgentTool[] = [
    ...qloo.tools,
    localTool(emit, okSources, "web_search", "Search the web for facts about the venue (capacity, entrances, house rules) or recent acts that played there. One focused question per call.",
      z.object({ query: z.string().min(3) }), (i) => webSearch(i.query, emit, stats)),
    localTool(emit, okSources, "geocode_venue", "Geocode a venue name/address with OpenStreetMap. Returns candidates with lat/lon.",
      z.object({ query: z.string() }), (i) => geocode(i.query)),
    localTool(emit, okSources, "nearby_osm", "Count and name OpenStreetMap features around a point. Groups: food, transit, parking, safety.",
      z.object({
        lat: z.number(),
        lon: z.number(),
        radiusM: z.number().int().min(100).max(3000).default(800),
        groups: z.array(z.enum(["food", "transit", "parking", "safety"])),
      }),
      (i) => nearby(i.lat, i.lon, i.radiusM, i.groups)),
    localTool(emit, okSources, "weather_for_date", "Weather forecast for the event date (or same day last year if beyond 16 days).",
      z.object({ lat: z.number(), lon: z.number(), date: z.string() }), (i) => weather(i.lat, i.lon, i.date)),
    localTool(emit, okSources, "plan_volunteers", "Deterministic volunteer staffing plan by station and shift. Always use this for headcounts.",
      z.object({
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
      planStaffing),
    {
      name: "submit_plan",
      description: "Deliver the finished plan. Call exactly once, at the end. If it returns an error, fix the listed fields and call it again.",
      parameters: cleanSchema(z.toJSONSchema(PlanSchema)),
      // Gemini does not enforce the schema strictly, so validate here and let the model fix mistakes.
      run: async (raw) => {
        const parsed = PlanSchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
          emit({ type: "status", message: "Plan had format errors; asking the agent to fix them" });
          return JSON.stringify({ error: "The plan does not match the required format. Fix these fields and call submit_plan again.", issues });
        }
        const issues = checkGrounding(parsed.data, qlooNames, okSources, input.venue);
        if (issues.length) {
          if (++groundingRejections <= 2) {
            emit({ type: "status", message: "Some sources could not be verified; asking the agent to fix them" });
            return JSON.stringify({
              error: 'Some items are labelled with a source that did not provide them. Use names exactly as the tools returned them, or relabel the item "llm".',
              issues: issues.map((i) => i.message),
            });
          }
          // Still wrong after two corrections: relabel rather than loop.
          relabelUnverified(issues);
          emit({ type: "status", message: `Relabelled ${issues.length} unverified item(s) as AI judgement` });
        }
        submitted = parsed.data;
        emit({ type: "status", message: "Plan submitted" });
        return JSON.stringify({ ok: true });
      },
    },
  ];
  const byName = new Map(tools.map((t) => [t.name, t]));

  const brief = [
    `Venue: ${input.venue}`,
    `Act / theme: ${input.act}`,
    input.actId && `The planner confirmed this act on Qloo: ID ${input.actId}${input.actType ? ` (${input.actType})` : ""}. Use this ID directly; no need to resolve the name.`,
    `Date: ${input.date}, starting ${input.startTime}, about ${input.durationHours} hours`,
    `Expected attendance: ${input.attendance}`,
    `Volunteers available: ${input.volunteers}`,
    input.budget && `Budget: ${input.budget}`,
    input.foodStalls !== undefined && `Food stall slots: ${input.foodStalls}`,
    input.notes && `Notes from the planner: ${input.notes}`,
    qloo.mode === "mock" && `NOTE: Qloo tools are in mock mode. Label Qloo-derived items with source "mock".`,
    "\nFirst privately list what you need next; then request every item that doesn't depend on another's result in this one response.",
  ]
    .filter(Boolean)
    .join("\n");

  emit({ type: "status", message: "Researching…" });
  const started = Date.now();
  if (stats) {
    stats.qlooMode = qloo.mode;
    stats.model = MODEL;
  }

  const contents: Content[] = [{ role: "user", parts: [{ text: brief }] }];
  const declarations = tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  let nudges = 0;

  for (let turn = 0; turn < MAX_TURNS && !submitted; turn++) {
    const res = await withRetry(emit, () =>
      gemini().models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM,
          tools: [{ functionDeclarations: declarations }],
          thinkingConfig: { includeThoughts: true, thinkingLevel: ThinkingLevel.MEDIUM },
          maxOutputTokens: 32768,
        },
      }),
    );

    const candidate = res.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      throw new Error(`Gemini returned no content (finish reason: ${candidate?.finishReason ?? res.promptFeedback?.blockReason ?? "unknown"})`);
    }
    // Keep the model's turn exactly as returned: thought signatures must come back unchanged.
    contents.push(candidate.content);

    const parts = candidate.content.parts;
    for (const p of parts) {
      if (p.text?.trim() && !p.functionCall) {
        const note = p.thought ? noteFrom(p.text) : p.text.trim().slice(0, 200);
        if (note) emit({ type: "note", message: note });
      }
    }
    const calls = parts.filter((p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } => !!p.functionCall);

    if (stats) {
      const u = res.usageMetadata;
      stats.turns++;
      stats.toolCalls += calls.length;
      if (calls.length > 1) stats.multiCallTurns++;
      stats.cacheReadTokens += u?.cachedContentTokenCount ?? 0;
      stats.inputTokens += (u?.promptTokenCount ?? 0) - (u?.cachedContentTokenCount ?? 0);
      stats.outputTokens += (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
      stats.ms = Date.now() - started;
    }

    if (calls.length === 0) {
      // The model stopped without delivering; remind it once or twice.
      if (++nudges > 2) break;
      contents.push({ role: "user", parts: [{ text: "You have not delivered the plan yet. Finish any research you still need, then call submit_plan." }] });
      continue;
    }

    const responses: Part[] = await Promise.all(
      calls.map(async (p) => {
        const name = p.functionCall.name ?? "";
        const tool = byName.get(name);
        let result: string;
        try {
          result = tool ? await tool.run(p.functionCall.args ?? {}) : JSON.stringify({ error: `Unknown tool ${name}` });
        } catch (err) {
          // A failing tool must never end the run: report it and let the agent work around it.
          result = JSON.stringify({ error: `${name} failed: ${err instanceof Error ? err.message : String(err)}` });
          emit({ type: "status", message: `${name} failed; continuing without it` });
        }
        return { functionResponse: { id: p.functionCall.id, name, response: { result } } };
      }),
    );
    contents.push({ role: "user", parts: responses });
  }

  if (!submitted) throw new Error("The agent finished without submitting a plan.");
  return submitted;
}

// "Without Qloo": same brief, no tools, the model's own knowledge only.
export async function runBaseline(input: EventInput): Promise<Plan> {
  const res = await withRetry(null, () =>
    gemini().models.generateContent({
      model: MODEL,
      contents: JSON.stringify(input),
      config: {
        // A fair baseline: same planner brief and quality bar, just no tools or audience data.
        systemInstruction:
          "You are an event-operations assistant. Produce an operations plan for this event from your own knowledge only. " +
          "Be as specific as you honestly can: name real vendors, brands and artists you know of, and give numbers. " +
          "stallMix counts should add up to the planner's food stall slots when given. " +
          "Leave crowd.ageIndex and crowd.genderIndex empty: you have no audience data. " +
          'Use source "llm" for every item, and say in "limitations" that no audience data was used.',
        responseMimeType: "application/json",
        responseJsonSchema: cleanSchema(z.toJSONSchema(PlanSchema)),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 32768,
      },
    }),
  );
  let json: unknown;
  try {
    json = JSON.parse(res.text ?? "");
  } catch {
    throw new Error("Baseline returned invalid JSON");
  }
  const parsed = PlanSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Baseline plan did not match the format: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
