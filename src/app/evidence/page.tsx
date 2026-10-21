import Link from "next/link";
import evidence from "@/lib/evidence.json";

export const metadata = { title: "Evidence · Crowd Kit" };

interface Side {
  items: number;
  tasteShare: number;
  backedShare: number;
  generic: number;
  namedVendors: number;
  cited: number;
  issues?: number;
}
interface Run {
  event: string;
  act: string;
  venue: string;
  model: string;
  ok: boolean;
  seconds: number;
  turns: number;
  toolCalls: number;
  qlooCalls: number;
  withQloo: Side | null;
  withoutQloo: Side | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Measured with scripts/eval-agent.ts (derived numbers only; no Qloo responses are stored here).
export default function EvidencePage() {
  const runs = (evidence.runs as unknown as Run[]).filter((r) => r.ok && r.withQloo);
  const paired = runs.filter((r) => r.withoutQloo);
  const w = runs.map((r) => r.withQloo!);
  const wo = paired.map((r) => r.withoutQloo!);

  const tiles = [
    { label: "Items backed by Qloo taste data", a: pct(avg(w.map((s) => s.tasteShare))), b: pct(avg(wo.map((s) => s.tasteShare))) },
    { label: "Items tied to any data source", a: pct(avg(w.map((s) => s.backedShare))), b: pct(avg(wo.map((s) => s.backedShare))) },
    { label: "Specific items per plan (avg)", a: String(Math.round(avg(w.map((s) => s.items)))), b: String(Math.round(avg(wo.map((s) => s.items)))) },
    { label: "Claims citing a Qloo receipt", a: String(w.reduce((s, x) => s + x.cited, 0)), b: String(wo.reduce((s, x) => s + x.cited, 0)) },
  ];

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-10 sm:px-6">
      <header>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">← Crowd Kit</Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Evidence</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">Does Qloo actually make the plan better?</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">
          The hackathon asks: if it would work the same without Qloo, it&apos;s the wrong thing. So we run every sample event twice, once
          through the full agent with Qloo and once through the same model with the same brief and quality bar but no tools, and measure
          the difference. Measured {evidence.measuredAt} on {runs.length} event{runs.length === 1 ? "" : "s"}.
        </p>
      </header>

      {runs.length === 0 ? (
        <p className="rounded-2xl bg-surface-2 p-5 text-ink-2">No measured runs yet. Run <code>npx tsx scripts/eval-agent.ts --baseline --summary src/lib/evidence.json</code>.</p>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-3xl border border-hair bg-surface p-5">
                <div className="text-sm text-muted">{t.label}</div>
                <div className="mt-2 flex items-end gap-6">
                  <div>
                    <div className="font-display text-4xl font-bold tracking-tight text-ink">{t.a}</div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-qloo px-2 py-px text-[11px] font-semibold text-white">With Qloo</div>
                  </div>
                  <div>
                    <div className="font-display text-4xl font-bold tracking-tight text-muted">{t.b}</div>
                    <div className="mt-1 inline-flex rounded-full bg-surface-2 px-2 py-px text-[11px] font-semibold text-ink-2">LLM only</div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Event by event</h2>
            <div className="mt-4 overflow-x-auto rounded-3xl border border-hair bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-hair text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="p-4 font-semibold">Event</th>
                    <th className="p-4 font-semibold">Qloo-backed</th>
                    <th className="p-4 font-semibold">Data-backed</th>
                    <th className="p-4 font-semibold">Generic phrases</th>
                    <th className="p-4 font-semibold">Qloo calls</th>
                    <th className="p-4 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {runs.map((r) => (
                    <tr key={r.event} className="border-b border-hair last:border-0">
                      <td className="p-4">
                        <div className="font-semibold text-ink">{r.act}</div>
                        <div className="text-xs text-muted">{r.venue}</div>
                      </td>
                      <td className="p-4"><b className="text-ink">{pct(r.withQloo!.tasteShare)}</b> <span className="text-muted">vs {r.withoutQloo ? pct(r.withoutQloo.tasteShare) : "–"}</span></td>
                      <td className="p-4"><b className="text-ink">{pct(r.withQloo!.backedShare)}</b> <span className="text-muted">vs {r.withoutQloo ? pct(r.withoutQloo.backedShare) : "–"}</span></td>
                      <td className="p-4"><b className="text-ink">{r.withQloo!.generic}</b> <span className="text-muted">vs {r.withoutQloo ? r.withoutQloo.generic : "–"}</span></td>
                      <td className="p-4 text-ink">{r.qlooCalls}</td>
                      <td className="p-4 text-ink-2">{Math.round(r.seconds / 6) / 10} min · {r.model}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">With Qloo first, LLM only after &quot;vs&quot;. &quot;Data-backed&quot; counts items tied to Qloo, web search, maps, weather or the staffing formula rather than the model&apos;s own say-so.</p>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-hair bg-surface p-6">
              <h2 className="font-display text-xl font-bold text-ink">How honesty is enforced</h2>
              <ul className="mt-3 grid gap-2 text-sm text-ink-2">
                <li><b className="text-ink">Source check in code.</b> A plan is rejected if it labels a vendor, sponsor or artist &quot;Qloo&quot; that no Qloo call returned, or uses a source whose tool failed in that run.</li>
                <li><b className="text-ink">Receipts.</b> Every Qloo call gets an id (Q1, Q2…) and Qloo-backed claims cite it, so anyone can check a claim against the exact request.</li>
                <li><b className="text-ink">Code computes, the model explains.</b> Staffing headcounts, safety checks and promo hot spots are calculated, not generated.</li>
                <li><b className="text-ink">Audience patterns, not predictions.</b> Plans say &quot;fans over-index on X&quot;, never &quot;attendees will buy X&quot;.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-hair bg-surface p-6">
              <h2 className="font-display text-xl font-bold text-ink">What these numbers don&apos;t show</h2>
              <ul className="mt-3 grid gap-2 text-sm text-ink-2">
                <li>A small sample ({runs.length} events), on free-tier Gemini models that change hour to hour.</li>
                <li>&quot;Qloo-backed&quot; measures where a claim came from, not whether an organiser would act on it. We haven&apos;t yet measured outcomes like sales or queue times.</li>
                <li>The generic-phrase list is ours. The LLM-only plan may name real vendors, but nothing checks them.</li>
                <li>Qloo&apos;s coverage varies by act and city; comedy and smaller acts return less.</li>
              </ul>
            </div>
          </section>

          <p className="text-sm text-ink-2">
            Reproduce it: <code className="rounded bg-surface-2 px-1.5 py-0.5">npx tsx scripts/eval-agent.ts --baseline --summary src/lib/evidence.json</code>. See a full plan with receipts on the{" "}
            <Link href="/sample" className="font-semibold text-ink underline">sample page</Link>.
          </p>
        </>
      )}
    </main>
  );
}
