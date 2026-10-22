// Quick check of how well Qloo covers the acts and venues we might demo,
// especially Indian ones. Cheap: no Claude calls, a few Qloo calls per name.
//
//   npx tsx scripts/qloo-coverage.ts
//   npx tsx scripts/qloo-coverage.ts "Ritviz" "Kenny Sebastian:person"   # your own names (name[:type])
//
// Needs a live Qloo credential (`qloo setup --qloo` or QLOO_API_KEY in .env.local).
// Prints only status and counts, and writes nothing to disk, so no Qloo data
// can end up in the repo. Copy the verdicts into docs/qloo-evidence.md.

import { qlooBackend, type QlooEnvelope } from "../src/lib/tools/qloo";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fine: env may come from the shell
}

const DEFAULT: { name: string; type: string; region: string }[] = [
  // India: music
  { name: "Prateek Kuhad", type: "artist", region: "IN" },
  { name: "Anuv Jain", type: "artist", region: "IN" },
  { name: "Ritviz", type: "artist", region: "IN" },
  { name: "The Local Train", type: "artist", region: "IN" },
  { name: "Arijit Singh", type: "artist", region: "IN" },
  // India: comedy
  { name: "Zakir Khan", type: "person", region: "IN" },
  { name: "Kenny Sebastian", type: "person", region: "IN" },
  { name: "Biswa Kalyan Rath", type: "person", region: "IN" },
  // India: venues
  { name: "NSCI Dome Mumbai", type: "place", region: "IN" },
  { name: "Chowdiah Memorial Hall Bengaluru", type: "place", region: "IN" },
  // Controls (expected to be well covered)
  { name: "Phoebe Bridgers", type: "artist", region: "US" },
  { name: "Hasan Minhaj", type: "person", region: "US" },
  { name: "Fred again..", type: "artist", region: "UK" },
  { name: "Romesh Ranganathan", type: "person", region: "UK" },
];

// When qloo_describe returns needs_input, pick the candidate of the wanted type whose
// description fits (a comedian, a musician, a concert venue), most popular first.
const HINT: Record<string, RegExp> = {
  artist: /singer|musician|band|composer|rapper|producer|dj|music/i,
  person: /comed|stand.?up/i,
  place: /concert|stadium|arena|auditorium|theat|event venue|music venue|performing/i,
};

type Candidate = { id: string; name: string; type?: string; description?: string; popularity?: number };
const candidates = (e: QlooEnvelope): Candidate[] =>
  ((e.resolution as { issues?: { candidates?: Candidate[] }[] } | undefined)?.issues ?? []).flatMap((i) => i.candidates ?? []);

function verdict(how: string, demo: QlooEnvelope, rec: QlooEnvelope): string {
  if (how === "none") return "not found";
  const ok = (e: QlooEnvelope) => (e.status === "ok" || e.status === "partial") && e.result_count > 0;
  const data = ok(demo) && ok(rec) ? "strong" : ok(demo) || ok(rec) ? "partial" : "thin";
  return how === "direct" ? data : `${data} (needs disambiguation)`;
}

async function main() {
  const args = process.argv.slice(2);
  const names = args.length
    ? args.map((a) => { const [name, type = "artist"] = a.split(":"); return { name, type, region: "?" }; })
    : DEFAULT;

  const b = await qlooBackend();
  if (b.mode !== "live") {
    console.error(`Qloo is not live: ${b.reason}`);
    process.exit(1);
  }
  const call = async (name: string, args: Record<string, unknown>): Promise<QlooEnvelope> => {
    const r: any = await b.client.callTool({ name, arguments: args }); // eslint-disable-line @typescript-eslint/no-explicit-any
    return r?.structuredContent ?? { status: "error", summary: "no structured result", results: [], result_count: 0 };
  };

  // Resolve to one Qloo entity id: a direct typed match, else the best-fitting candidate
  // from a typed or untyped lookup (a typed "person" lookup can miss comedians).
  const resolve = async (n: { name: string; type: string }) => {
    const typed = await call("qloo_describe", { entity: n.name, type: n.type });
    const top = typed.results[0] as { entity_id?: string; name?: string } | undefined;
    if ((typed.status === "ok" || typed.status === "partial") && top?.entity_id) {
      return { status: typed.status, how: "direct", id: top.entity_id, as: top.name ?? n.name };
    }
    const untyped = typed.status === "needs_input" || typed.status === "empty" ? await call("qloo_describe", { entity: n.name }) : typed;
    const hint = HINT[n.type];
    const pick = [...candidates(typed), ...candidates(untyped)]
      .filter((c) => c.type?.endsWith(`:${n.type}`) && (!hint || hint.test(`${c.name} ${c.description ?? ""}`)))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
    return pick
      ? { status: typed.status, how: "picked", id: pick.id, as: pick.name }
      : { status: typed.status, how: "none", id: null, as: "" };
  };

  const rows = [];
  for (const n of names) {
    const r = await resolve(n);
    const skip: QlooEnvelope = { status: "empty", summary: "skipped", results: [], result_count: 0 };
    const [demo, rec] = r.id
      ? await Promise.all([
          call("qloo_audience_demographics", { entity: r.id, entity_type: n.type }),
          call("qloo_recommend", { target_type: "brand", signals: [r.id], limit: 10 }),
        ])
      : [skip, skip];
    rows.push({
      name: n.name,
      type: n.type,
      region: n.region,
      describe: r.status,
      resolvedAs: r.as,
      demographics: `${demo.status} (${demo.result_count ?? 0})`,
      brands: `${rec.status} (${rec.result_count ?? 0})`,
      verdict: verdict(r.how, demo, rec),
    });
  }
  console.table(rows);
}

// Exit explicitly: the `qloo mcp` child process would otherwise keep Node alive.
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
