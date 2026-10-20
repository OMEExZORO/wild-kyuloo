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

function verdict(describe: QlooEnvelope, demo: QlooEnvelope, rec: QlooEnvelope): string {
  if (describe.status === "error") return "error";
  if (describe.status === "empty") return "not found";
  if (describe.status === "needs_input") return "ambiguous";
  const ok = (e: QlooEnvelope) => (e.status === "ok" || e.status === "partial") && e.result_count > 0;
  if (ok(demo) && ok(rec)) return "strong";
  if (ok(demo) || ok(rec)) return "partial";
  return "thin";
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

  const rows = [];
  for (const n of names) {
    const describe = await call("qloo_describe", { entity: n.name, type: n.type });
    const skip: QlooEnvelope = { status: "empty", summary: "skipped", results: [], result_count: 0 };
    const resolved = describe.status === "ok" || describe.status === "partial";
    const [demo, rec] = resolved
      ? await Promise.all([
          call("qloo_audience_demographics", { entity: n.name, entity_type: n.type }),
          call("qloo_recommend", { target_type: "brand", signals: [n.name], limit: 10 }),
        ])
      : [skip, skip];
    rows.push({
      name: n.name,
      type: n.type,
      region: n.region,
      describe: describe.status,
      demographics: `${demo.status} (${demo.result_count})`,
      brands: `${rec.status} (${rec.result_count})`,
      verdict: verdict(describe, demo, rec),
    });
  }
  console.table(rows);
}

// Exit explicitly: the `qloo mcp` child process would otherwise keep Node alive.
main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
