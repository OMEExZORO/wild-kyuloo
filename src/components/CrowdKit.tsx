"use client";

// Working skeleton UI (Ayush owns polishing this). It already speaks the real
// contracts: posts EventInput, reads AgentEvents over SSE, renders a Plan.

import { useState } from "react";
import type { AgentEvent, EventInput, Plan, SourceKind } from "@/lib/types";

const SAMPLE: EventInput = {
  venue: "The Fillmore, San Francisco",
  act: "Phoebe Bridgers",
  date: "2026-11-21",
  startTime: "19:00",
  durationHours: 4,
  attendance: 1150,
  volunteers: 30,
  budget: "$8,000",
  foodStalls: 6,
};

type Mode = "qloo" | "baseline";

export function CrowdKit() {
  const [form, setForm] = useState<EventInput>(SAMPLE);
  const [trace, setTrace] = useState<AgentEvent[]>([]);
  const [plans, setPlans] = useState<Partial<Record<Mode, Plan>>>({});
  const [view, setView] = useState<Mode>("qloo");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: Mode) {
    const res = await fetch(`/api/plan?mode=${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setTrace([]);
    setPlans({});
    setView("qloo");
    try {
      // Run both side by side: the comparison is the point.
      await Promise.all([run("qloo"), run("baseline")]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const plan = plans[view];

  return (
    <div className="grid gap-8">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-zinc-200 p-5 sm:grid-cols-2 dark:border-zinc-800">
        <Field label="Venue"><input className={inp} value={form.venue} onChange={(e) => set("venue", e.target.value)} required /></Field>
        <Field label="Act, lineup or theme"><input className={inp} value={form.act} onChange={(e) => set("act", e.target.value)} required /></Field>
        <Field label="Date"><input type="date" className={inp} value={form.date} onChange={(e) => set("date", e.target.value)} required /></Field>
        <Field label="Start time"><input type="time" className={inp} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></Field>
        <Field label="Duration (hours)"><input type="number" className={inp} value={form.durationHours} onChange={(e) => set("durationHours", +e.target.value)} /></Field>
        <Field label="Expected attendance"><input type="number" className={inp} value={form.attendance} onChange={(e) => set("attendance", +e.target.value)} /></Field>
        <Field label="Volunteers"><input type="number" className={inp} value={form.volunteers} onChange={(e) => set("volunteers", +e.target.value)} /></Field>
        <Field label="Food stall slots"><input type="number" className={inp} value={form.foodStalls ?? ""} onChange={(e) => set("foodStalls", e.target.value === "" ? undefined : +e.target.value)} /></Field>
        <Field label="Budget (optional)"><input className={inp} value={form.budget ?? ""} onChange={(e) => set("budget", e.target.value || undefined)} /></Field>
        <Field label="Notes (optional)"><input className={inp} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} /></Field>
        <button disabled={running} className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white disabled:opacity-50 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900">
          {running ? "Researching…" : "Build my plan"}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}

      {trace.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">What the agent is doing</h2>
          <ol className="grid gap-1 font-mono text-xs">
            {trace.map((e, i) => (
              <li key={i} className="truncate text-zinc-600 dark:text-zinc-400">
                {e.type === "status" && `• ${e.message}`}
                {e.type === "tool_call" && `→ ${e.tool} ${JSON.stringify(e.input)}`}
                {e.type === "tool_result" && `← ${e.tool} [${e.source}${e.cached ? ", cached" : ""}] ${e.preview}`}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(plans.qloo || plans.baseline) && (
        <section className="grid gap-6">
          <div className="flex gap-2">
            {(["qloo", "baseline"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setView(m)} className={`rounded-full px-4 py-1.5 text-sm ${view === m ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-300 dark:border-zinc-700"}`}>
                {m === "qloo" ? "Crowd Kit (with Qloo)" : "Without Qloo"} {plans[m] ? "" : "…"}
              </button>
            ))}
          </div>
          {plan ? <PlanView plan={plan} /> : <p className="text-zinc-500">Still working…</p>}
        </section>
      )}
    </div>
  );
}

const inp = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Badge({ source, evidence }: { source: SourceKind; evidence?: string }) {
  return (
    <span title={evidence} className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {source}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function PlanView({ plan }: { plan: Plan }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="grid gap-4">
      <p className="text-lg">{plan.summary}</p>
      <Card title={`Crowd: ${plan.crowd.headline}`}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {plan.crowd.ageMix.map((a) => `${a.band} ${pct(a.share)}`).join(" · ")}
          {plan.crowd.genderMix.length > 0 && " | " + plan.crowd.genderMix.map((g) => `${g.label} ${pct(g.share)}`).join(" · ")}
        </p>
        <ul className="mt-2 grid gap-1 text-sm">
          {plan.crowd.loves.map((l, i) => (
            <li key={i}><b>{l.category}:</b> {l.items.join(", ")}<Badge source={l.source} evidence={l.evidence} /></li>
          ))}
        </ul>
      </Card>
      <Card title={`Venue: ${plan.venue.name}`}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {plan.venue.address}
          {plan.venue.capacity ? ` · capacity ${plan.venue.capacity}` : ""}
          {plan.venue.entrances ? ` · ${plan.venue.entrances} entrances` : ""}
        </p>
        <ul className="mt-2 grid gap-1 text-sm">
          {plan.venue.facts.map((f, i) => <li key={i}>{f.fact}<Badge source={f.source} evidence={f.evidence} /></li>)}
          {plan.venue.risks.map((r, i) => <li key={`r${i}`}>⚠ {r.risk}: {r.mitigation}<Badge source={r.source} evidence={r.evidence} /></li>)}
        </ul>
      </Card>
      <Card title="Food & drink">
        <ul className="grid gap-1 text-sm">
          {plan.foodAndDrink.stallMix.map((s, i) => <li key={i}><b>{s.count}× {s.concept}</b>: {s.why}<Badge source={s.source} evidence={s.evidence} /></li>)}
          {plan.foodAndDrink.vendorsToInvite.map((v, i) => <li key={`v${i}`}>Invite <b>{v.name}</b>: {v.why}<Badge source={v.source} evidence={v.evidence} /></li>)}
          {plan.foodAndDrink.drinks.map((d, i) => <li key={`d${i}`}>{d.item}: {d.why}<Badge source={d.source} evidence={d.evidence} /></li>)}
        </ul>
      </Card>
      <Card title="Sponsors & merch">
        <ul className="grid gap-1 text-sm">
          {plan.sponsors.map((s, i) => <li key={i}><b>{s.brand}</b>: {s.why} <i>“{s.pitch}”</i><Badge source={s.source} evidence={s.evidence} /></li>)}
          {plan.merch.map((m, i) => <li key={`m${i}`}>Merch: {m.idea} ({m.why})<Badge source={m.source} evidence={m.evidence} /></li>)}
        </ul>
      </Card>
      <Card title={`Volunteers: ${plan.volunteers.available} available, ${plan.volunteers.recommended} recommended`}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{plan.volunteers.shifts.map((s) => `${s.label} ${s.start}–${s.end}`).join(" · ")}</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {plan.volunteers.stations.map((s, i) => <li key={i}><b>{s.count}</b> at {s.station}: {s.notes}</li>)}
          {plan.volunteers.warnings.map((w, i) => <li key={`w${i}`} className="text-amber-700 dark:text-amber-400">⚠ {w}</li>)}
        </ul>
      </Card>
      <Card title="Vibe">
        <ul className="grid gap-1 text-sm">
          {plan.vibe.playlist.map((p, i) => <li key={i}>{p.artist}: {p.why}<Badge source={p.source} evidence={p.evidence} /></li>)}
          {plan.vibe.themeIdeas.map((t, i) => <li key={`t${i}`}>Theme idea: {t}</li>)}
        </ul>
      </Card>
    </div>
  );
}
