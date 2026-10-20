// Prompt-tuning eval for the Crowd Kit agent.
//
//   npx tsx scripts/eval-agent.ts                 # the 3 sample events, agent only
//   npx tsx scripts/eval-agent.ts --baseline      # also run the LLM-only baseline
//   npx tsx scripts/eval-agent.ts --only 0        # just the first event
//   npx tsx scripts/eval-agent.ts --evidence --baseline   # the 8 evidence events (docs/qloo-evidence.md)
//
// Reads ANTHROPIC_API_KEY (and optionally QLOO_API_KEY) from .env.local.
// EVERY RUN COSTS REAL MONEY: the script prints an estimated cost per run.
// Results are written to .cache/evals/ (gitignored; may contain Qloo data).

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { PRESETS } from "../src/lib/presets";
import { EVIDENCE_EVENTS } from "./evidence-events";
import { newStats, runBaseline, runCrowdKit, type AgentStats } from "../src/lib/agent";
import { PlanSchema, type AgentEvent, type EventInput, type Plan } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fine: env may come from the shell
}
if (process.env.CROWDKIT_DEMO === "1") {
  console.error("CROWDKIT_DEMO=1 is set; the eval needs real runs. Remove it for this shell.");
  process.exit(1);
}

// Claude Opus 5.5 list prices, USD per million tokens (cache write = 1.25x input).
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, webSearch: 0.01 };

const GENERIC = [
  /\bdiverse\b/i,
  /\ba variety of\b/i,
  /\blocal vendors?\b/i,
  /\ba local (beverage|food|coffee) brand\b/i,
  /\bpopular (brands|hits|options)\b/i,
  /\bcrowd-?pleasers?\b/i,
  /\bengage the audience\b/i,
  /\bensure adequate\b/i,
];

function allText(plan: Plan): string[] {
  return [
    plan.summary,
    plan.crowd.headline,
    ...plan.crowd.loves.flatMap((l) => [l.category, ...l.items]),
    ...plan.foodAndDrink.stallMix.flatMap((s) => [s.concept, s.why]),
    ...plan.foodAndDrink.vendorsToInvite.flatMap((v) => [v.name, v.why]),
    ...plan.foodAndDrink.drinks.flatMap((d) => [d.item, d.why]),
    ...plan.sponsors.flatMap((s) => [s.brand, s.why, s.pitch]),
    ...plan.merch.flatMap((m) => [m.idea, m.why]),
    ...plan.vibe.playlist.flatMap((p) => [p.artist, p.why]),
  ];
}

function sources(plan: Plan) {
  return [
    ...plan.crowd.loves, ...plan.crowd.vsRegulars, ...plan.venue.facts, ...plan.venue.risks,
    ...plan.foodAndDrink.stallMix, ...plan.foodAndDrink.vendorsToInvite, ...plan.foodAndDrink.drinks,
    ...plan.sponsors, ...plan.merch, ...plan.vibe.playlist,
  ].map((x) => x.source);
}

function score(plan: Plan, input: EventInput, toolsUsed: Set<string>, qlooMode: string) {
  const issues: string[] = [];
  const text = allText(plan);
  const generic = text.flatMap((t) => GENERIC.filter((re) => re.test(t)).map((re) => `"${t.slice(0, 60)}" ~ ${re.source}`));
  if (generic.length) issues.push(...generic.map((g) => `generic: ${g}`));

  const stallSum = plan.foodAndDrink.stallMix.reduce((s, x) => s + x.count, 0);
  if (input.foodStalls !== undefined && stallSum !== input.foodStalls) issues.push(`stalls add to ${stallSum}, planner has ${input.foodStalls} slots`);

  const size = (name: string, n: number, lo: number, hi: number) => {
    if (n < lo || n > hi) issues.push(`${name}: ${n} (want ${lo}-${hi})`);
  };
  size("vendorsToInvite", plan.foodAndDrink.vendorsToInvite.length, 3, 5);
  size("sponsors", plan.sponsors.length, 2, 4);
  size("merch", plan.merch.length, 2, 4);
  size("playlist", plan.vibe.playlist.length, 5, 8);
  size("loves", plan.crowd.loves.length, 3, 5);
  size("risks", plan.venue.risks.length, 2, 4);

  // Source honesty: a label must match a tool that actually ran.
  const src = sources(plan);
  const qlooUsed = [...toolsUsed].some((t) => t.startsWith("qloo_"));
  if (src.includes("qloo") && (qlooMode !== "live" || !qlooUsed)) issues.push(`labelled "qloo" but Qloo was ${qlooMode === "live" ? "never called" : "in mock mode"}`);
  if (src.includes("mock") && qlooMode === "live") issues.push(`labelled "mock" during a live Qloo run`);
  if (src.includes("web") && !toolsUsed.has("web_search")) issues.push(`labelled "web" but web_search never ran`);
  if (src.includes("osm") && !toolsUsed.has("nearby_osm") && !toolsUsed.has("geocode_venue")) issues.push(`labelled "osm" but no map tool ran`);
  if (!toolsUsed.has("plan_volunteers") && toolsUsed.size > 0) issues.push("plan_volunteers was never called");
  if (!plan.limitations.length) issues.push("no limitations");

  const taste = src.filter((s) => s === "qloo" || s === "mock").length;
  return { issues, genericCount: generic.length, tasteShare: src.length ? taste / src.length : 0, items: src.length };
}

const cost = (s: AgentStats) =>
  (s.inputTokens * PRICE.input + s.outputTokens * PRICE.output + s.cacheReadTokens * PRICE.cacheRead + s.cacheWriteTokens * PRICE.cacheWrite) / 1e6 +
  s.webSearches * PRICE.webSearch;

async function main() {
  const args = process.argv.slice(2);
  const withBaseline = args.includes("--baseline");
  const onlyIdx = args.indexOf("--only");
  const pool = args.includes("--evidence") ? EVIDENCE_EVENTS : PRESETS;
  const events = onlyIdx >= 0 ? [pool[Number(args[onlyIdx + 1])]] : pool;

  const outDir = path.join(process.cwd(), ".cache", "evals");
  mkdirSync(outDir, { recursive: true });
  const results: unknown[] = [];

  for (const preset of events) {
    console.log(`\n=== ${preset.name} ===`);
    const stats = newStats();
    const trace: AgentEvent[] = [];
    const toolsUsed = new Set<string>();
    let plan: Plan | null = null;
    let error: string | null = null;
    try {
      plan = await runCrowdKit(preset.input, (e) => {
        trace.push(e);
        if (e.type === "tool_call") toolsUsed.add(e.tool);
        if (e.type === "note") console.log(`  · ${e.message}`);
        if (e.type === "tool_result" && (e.status === "error" || e.preview.startsWith("ERROR"))) console.log(`  ! ${e.tool}: ${e.preview}`);
      }, stats);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const row: Record<string, unknown> = {
      event: preset.name,
      qloo: stats.qlooMode,
      ok: !!plan && !error,
      seconds: Math.round(stats.ms / 1000),
      turns: stats.turns,
      toolCalls: stats.toolCalls,
      parallelTurnShare: stats.turns ? +(stats.multiCallTurns / stats.turns).toFixed(2) : 0,
      cacheReadShare: +(stats.cacheReadTokens / Math.max(1, stats.inputTokens + stats.cacheReadTokens + stats.cacheWriteTokens)).toFixed(2),
      costUSD: +cost(stats).toFixed(3),
    };
    // Qloo envelope statuses, for the evidence write-up (needs_input / empty / error are worth noting).
    const qlooStatus: Record<string, number> = {};
    for (const e of trace) {
      if (e.type === "tool_result" && e.tool.startsWith("qloo_")) qlooStatus[e.status ?? "ok"] = (qlooStatus[e.status ?? "ok"] ?? 0) + 1;
    }
    Object.assign(row, { qlooCalls: Object.values(qlooStatus).reduce((s, n) => s + n, 0), needsInput: qlooStatus.needs_input ?? 0, empty: qlooStatus.empty ?? 0 });
    if (plan) {
      const valid = PlanSchema.safeParse(plan).success;
      const s = score(plan, preset.input, toolsUsed, stats.qlooMode);
      Object.assign(row, { schemaValid: valid, items: s.items, tasteShare: +s.tasteShare.toFixed(2), generic: s.genericCount, issues: s.issues.length });
      s.issues.forEach((i) => console.log(`  - ${i}`));
    } else {
      console.log(`  FAILED: ${error}`);
    }
    console.table([row]);

    let baseline: Plan | null = null;
    if (withBaseline) {
      try {
        baseline = await runBaseline(preset.input);
        const b = score(baseline, preset.input, new Set(), "none");
        console.log(`  baseline: ${b.items} items, ${b.genericCount} generic phrases, taste share ${b.tasteShare.toFixed(2)}`);
      } catch (err) {
        console.log(`  baseline FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
    results.push({ ...row, qlooStatus, stats, toolsUsed: [...toolsUsed], plan, baseline, trace });
  }

  const file = path.join(outDir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${file}`);
}

// Exit explicitly: the `qloo mcp` child process would otherwise keep Node alive.
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
