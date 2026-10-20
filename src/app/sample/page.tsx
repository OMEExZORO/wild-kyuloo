import Link from "next/link";
import { AgentTrace } from "@/components/AgentTrace";
import { Compare } from "@/components/Compare";
import { PlanView } from "@/components/PlanView";
import { Callout, SourceLegend } from "@/components/ui";
import { DEMO_BASELINE, DEMO_PLAN, DEMO_TRACE } from "@/lib/demo";

export const metadata = { title: "Sample plan · Crowd Kit" };

// Static sample: what a finished plan looks like, no API calls.
export default function SamplePage() {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
      <Callout tone="info">
        This is a sample plan with illustrative data (badged &quot;Sample&quot;). <Link className="font-medium text-accent underline" href="/">Build your own</Link>.
      </Callout>
      <div className="grid items-start gap-6 xl:grid-cols-[22rem_1fr]">
        <AgentTrace events={DEMO_TRACE} running={false} />
        <div className="grid min-w-0 gap-6">
          <PlanView plan={DEMO_PLAN} />
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">With vs without Qloo</h2>
          <Compare withQloo={DEMO_PLAN} without={DEMO_BASELINE} />
          <SourceLegend />
        </div>
      </div>
    </main>
  );
}
