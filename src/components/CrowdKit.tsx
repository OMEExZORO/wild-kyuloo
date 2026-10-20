"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { AgentEvent, EventInput, Plan } from "@/lib/types";
import { AgentTrace } from "./AgentTrace";
import { Compare } from "./Compare";
import { EventForm, PRESETS } from "./EventForm";
import { PlanView } from "./PlanView";
import { Callout, Icon, SourceLegend } from "./ui";

type Mode = "qloo" | "baseline";
type View = "plan" | "compare" | "baseline";

// Posts the event, reads AgentEvents over SSE, and lays out form -> trace -> plan.
export function CrowdKit() {
  const [form, setForm] = useState<EventInput>(PRESETS[0].input);
  const [trace, setTrace] = useState<AgentEvent[]>([]);
  const [plans, setPlans] = useState<Partial<Record<Mode, Plan>>>({});
  const [view, setView] = useState<View>("plan");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function run(mode: Mode) {
    const res = await fetch(`/api/plan?mode=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}) ${detail.slice(0, 200)}`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";
      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as AgentEvent;
        if (event.type === "plan") setPlans((p) => ({ ...p, [event.mode]: event.plan }));
        else if (event.type === "error") setError(event.message);
        else if (mode === "qloo") setTrace((t) => [...t, event]);
      }
    }
  }

  async function submit() {
    setRunning(true);
    setError(null);
    setTrace([]);
    setPlans({});
    setView("plan");
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      // Both at once: the comparison is the point.
      await Promise.all([run("qloo"), run("baseline")]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const started = running || trace.length > 0 || plans.qloo || plans.baseline || error;

  return (
    <div className="grid gap-10">
      {/* Hero + form */}
      <section className="no-print grid items-start gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="lg:sticky lg:top-8">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-qloo-wash px-3 py-1 text-xs font-medium text-qloo">
            <Icon name="spark" className="size-3.5" /> Powered by Qloo taste data
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Plan the night around the crowd that&apos;s actually coming.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">
            Tell us the venue, the act and how many volunteers you have. Our agent researches who your audience is and what
            they love, then builds the food, sponsor, merch and staffing plan around them.
          </p>
          <ul className="mt-6 grid gap-2.5 text-[15px] text-ink">
            {[
              ["users", "Who's coming: age, gender and what the act's fans over-index on"],
              ["food", "Stalls and named local vendors ranked for this crowd"],
              ["star", "Sponsors whose fans are already in the room, with a pitch"],
              ["shield", "Your volunteers assigned to stations and shifts"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
                  <Icon name={icon} className="size-3.5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <Link href="/sample" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            See a finished sample plan <Icon name="arrow" className="size-3.5" />
          </Link>
        </div>
        <EventForm value={form} onChange={setForm} onSubmit={submit} running={running} />
      </section>

      {/* Results */}
      <div ref={resultsRef} className="scroll-mt-6">
        {started && (
          <div className="grid gap-6">
            {error && <Callout tone="critical">{error}</Callout>}

            <div className="grid items-start gap-6 xl:grid-cols-[22rem_1fr]">
              <div className="xl:sticky xl:top-6">
                <AgentTrace events={trace} running={running} />
              </div>

              <div className="grid min-w-0 gap-4">
                <div className="no-print flex flex-wrap items-center justify-between gap-3">
                  <div role="tablist" className="inline-flex rounded-xl border border-hair bg-surface p-1">
                    <Tab active={view === "plan"} onClick={() => setView("plan")} ready={!!plans.qloo}>
                      <Icon name="spark" className="size-3.5" /> Crowd Kit plan
                    </Tab>
                    <Tab active={view === "compare"} onClick={() => setView("compare")} ready={!!plans.qloo && !!plans.baseline}>
                      With vs without Qloo
                    </Tab>
                    <Tab active={view === "baseline"} onClick={() => setView("baseline")} ready={!!plans.baseline}>
                      LLM only
                    </Tab>
                  </div>
                  {plans.qloo && (
                    <button
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hair bg-surface px-3 py-1.5 text-sm text-ink-2 hover:border-accent hover:text-accent"
                    >
                      <Icon name="print" /> Save as PDF
                    </button>
                  )}
                </div>

                {view === "compare" ? (
                  <Compare withQloo={plans.qloo} without={plans.baseline} />
                ) : (view === "plan" ? plans.qloo : plans.baseline) ? (
                  <>
                    {view === "baseline" && (
                      <Callout tone="info">
                        This is what a general-purpose AI suggests with no audience data. Compare it with the Crowd Kit plan.
                      </Callout>
                    )}
                    <PlanView plan={(view === "plan" ? plans.qloo : plans.baseline)!} />
                  </>
                ) : (
                  !error && <PlanSkeleton />
                )}

                <div className="no-print pt-2">
                  <SourceLegend />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({ active, ready, onClick, children }: { active: boolean; ready: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-ink text-page" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
      {!ready && <span className="size-1.5 animate-pulse rounded-full bg-current opacity-60" />}
    </button>
  );
}

function PlanSkeleton() {
  return (
    <div className="grid gap-5" aria-hidden="true">
      <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
