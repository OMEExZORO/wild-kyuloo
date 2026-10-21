import Link from "next/link";
import { AgentTrace } from "@/components/AgentTrace";
import { Compare } from "@/components/Compare";
import { PlanView } from "@/components/PlanView";
import { Callout, SourceLegend } from "@/components/ui";
import { DEMO_BASELINE, DEMO_PLAN, DEMO_TRACE } from "@/lib/demo";
import { PRESETS } from "@/lib/presets";

export const metadata = { title: "Sample plan · Crowd Kit" };

// Static sample: what a finished plan looks like, no API calls.
export default function SamplePage() {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
      <Callout tone="info">
        This is a sample plan with illustrative data (badged &quot;Sample&quot;). <Link className="font-semibold text-ink underline" href="/">Build your own</Link>.
      </Callout>
      <PlanView plan={DEMO_PLAN} event={PRESETS[0].input} />
      <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-ink">With vs without Qloo</h2>
      <Compare withQloo={DEMO_PLAN} without={DEMO_BASELINE} />
      <details className="group rounded-3xl border border-hair bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-display text-base font-semibold text-ink">
          How Crowd Kit built this plan
          <span className="text-sm font-normal text-muted group-open:hidden">Show the agent&apos;s steps</span>
        </summary>
        <div className="px-2 pb-2">
          <AgentTrace events={DEMO_TRACE} running={false} />
        </div>
      </details>
      <SourceLegend />
    </main>
  );
}
