// Prompt-tuning eval for the Crowd Kit agent.
//
//   npx tsx scripts/eval-agent.ts                 # the 3 sample events, agent only
//   npx tsx scripts/eval-agent.ts --baseline      # also run the LLM-only baseline
//   npx tsx scripts/eval-agent.ts --only 0        # just the first event
//   npx tsx scripts/eval-agent.ts --baseline --summary src/lib/evidence.json   # refresh the Evidence page
//
// Reads GEMINI_API_KEY from .env.local (free tier; mind the daily request limits).
// Qloo uses the harness credential from `qloo setup --qloo`.
// Results are written to <OS temp>/crowdkit-cache/evals (may contain Qloo data; never commit).

import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { PRESETS } from "../src/lib/presets";
import { newStats, runBaseline, runCrowdKit } from "../src/lib/agent";
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
  const relabelled = JSON.stringify(plan).match(/Unverified \(/g)?.length ?? 0;
  if (relabelled) issues.push(`${relabelled} item(s) auto-relabelled after failing the source check`);

  const taste = src.filter((s) => s === "qloo" || s === "mock").length;
  const backed = src.filter((s) => s !== "llm").length; // tied to some data source, not the model's own say-so
  const cited = JSON.stringify(plan).match(/\[Q\d+\]/g)?.length ?? 0;
  return {
    issues,
    genericCount: generic.length,
    tasteShare: src.length ? taste / src.length : 0,
    backedShare: src.length ? backed / src.length : 0,
    namedVendors: plan.foodAndDrink.vendorsToInvite.length,
    cited,
    items: src.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const withBaseline = args.includes("--baseline");
  const onlyIdx = args.indexOf("--only");
  const events = onlyIdx >= 0 ? [PRESETS[Number(args[onlyIdx + 1])]] : PRESETS;

  // Outside the project: files appearing in it make a running dev server reload the page.
  const outDir = path.join(tmpdir(), "crowdkit-cache", "evals");
  mkdirSync(outDir, { recursive: true });
  const results: unknown[] = [];
  // Derived numbers only (counts, shares, timings): safe to commit, unlike raw Qloo data.
  const summary: Record<string, unknown>[] = [];

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
      model: stats.model,
      qloo: stats.qlooMode,
      ok: !!plan && !error,
      seconds: Math.round(stats.ms / 1000),
      turns: stats.turns,
      toolCalls: stats.toolCalls,
      parallelTurnShare: stats.turns ? +(stats.multiCallTurns / stats.turns).toFixed(2) : 0,
      tokensIn: stats.inputTokens + stats.cacheReadTokens,
      tokensOut: stats.outputTokens,
      webSearches: stats.webSearches,
    };
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
    let b: ReturnType<typeof score> | null = null;
    if (withBaseline) {
      try {
        baseline = await runBaseline(preset.input);
        b = score(baseline, preset.input, new Set(), "none");
        console.log(`  baseline: ${b.items} items, ${b.genericCount} generic phrases, taste share ${b.tasteShare.toFixed(2)}`);
      } catch (err) {
        console.log(`  baseline FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
    results.push({ ...row, stats, toolsUsed: [...toolsUsed], plan, baseline, trace });

    const s = plan ? score(plan, preset.input, toolsUsed, stats.qlooMode) : null;
    const round = (n: number) => +n.toFixed(2);
    summary.push({
      event: preset.name,
      act: preset.input.act,
      venue: preset.input.venue,
      model: stats.model,
      ok: !!plan,
      seconds: Math.round(stats.ms / 1000),
      turns: stats.turns,
      toolCalls: stats.toolCalls,
      qlooCalls: plan?.receipts?.length ?? 0,
      withQloo: s && { items: s.items, tasteShare: round(s.tasteShare), backedShare: round(s.backedShare), generic: s.genericCount, namedVendors: s.namedVendors, cited: s.cited, issues: s.issues.length },
      withoutQloo: b && { items: b.items, tasteShare: round(b.tasteShare), backedShare: round(b.backedShare), generic: b.genericCount, namedVendors: b.namedVendors, cited: b.cited },
    });
  }

  const summaryIdx = args.indexOf("--summary");
  if (summaryIdx >= 0) {
    const out = args[summaryIdx + 1];
    writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), runs: summary }, null, 2) + "\n");
    console.log(`Summary (derived numbers only) written to ${out}`);
  }

  const file = path.join(outDir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${file}`);
}

// Exit explicitly: the `qloo mcp` child process would otherwise keep Node alive.
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
