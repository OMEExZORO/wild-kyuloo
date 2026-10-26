"use client";

import { useState } from "react";
import type { ActLookup } from "@/lib/act";
import { streamPlan } from "@/lib/planStream";
import type { EventInput, Plan } from "@/lib/types";
import { CrowdDiff } from "./CrowdDiff";
import { Callout, Icon, Portrait, SourceLegend } from "./ui";

const input =
  "w-full rounded-xl border border-hair bg-surface/80 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted outline-none transition focus:border-ink focus:ring-4 focus:ring-volt/40";

type Progress = { state: "idle" | "running" | "done" | "error"; message: string; steps: number };
type Venue = Omit<EventInput, "act" | "actId" | "actType">;

const idle: Progress = { state: "idle", message: "", steps: 0 };

// Two real Crowd Kit plans for one venue, one per act, then the differences side by side.
export function CrowdCompare({ initial, actA, actB }: { initial: Venue; actA: string; actB: string }) {
  const [venue, setVenue] = useState<Venue>(initial);
  const [acts, setActs] = useState<[string, string]>([actA, actB]);
  const [plans, setPlans] = useState<[Plan | null, Plan | null]>([null, null]);
  const [images, setImages] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [progress, setProgress] = useState<[Progress, Progress]>([idle, idle]);
  const [shown, setShown] = useState<[string, string] | null>(null);
  const [running, setRunning] = useState(false);

  const set = <K extends keyof Venue>(k: K, v: Venue[K]) => setVenue((x) => ({ ...x, [k]: v }));
  const update = (i: 0 | 1, p: Partial<Progress>) =>
    setProgress((all) => {
      const next = [...all] as [Progress, Progress];
      next[i] = { ...next[i], ...p };
      return next;
    });

  async function photo(i: 0 | 1, name: string) {
    try {
      const res = await fetch(`/api/act?q=${encodeURIComponent(name)}&type=artist`);
      const data = (await res.json()) as ActLookup;
      setImages((all) => (i === 0 ? [data.match?.image, all[1]] : [all[0], data.match?.image]));
    } catch {
      // no photo: the initials fallback is fine
    }
  }

  async function plan(i: 0 | 1, act: string) {
    update(i, { state: "running", message: "Starting", steps: 0 });
    // Assigned inside the stream callback, so TypeScript cannot narrow them.
    let result = null as Plan | null;
    let failed = "" as string;
    await streamPlan({ ...venue, act }, "qloo", (e) => {
      if (e.type === "plan") result = e.plan;
      else if (e.type === "error") failed = e.message;
      else if (e.type === "status" || e.type === "note") update(i, { message: e.message });
      else if (e.type === "tool_call") setProgress((all) => all.map((p, j) => (j === i ? { ...p, steps: p.steps + 1 } : p)) as [Progress, Progress]);
    }).catch((err) => {
      failed = err instanceof Error ? err.message : String(err);
    });
    if (result) {
      setPlans((all) => (i === 0 ? [result, all[1]] : [all[0], result]));
      update(i, { state: "done", message: "Plan ready" });
    } else {
      update(i, { state: "error", message: failed || "No plan came back" });
    }
  }

  async function compare(e: React.FormEvent) {
    e.preventDefault();
    const [a, b] = acts.map((s) => s.trim()) as [string, string];
    setRunning(true);
    setPlans([null, null]);
    setImages([undefined, undefined]);
    setProgress([idle, idle]);
    setShown([a, b]);
    photo(0, a);
    photo(1, b);
    // One after the other: the free Gemini tier struggles with two agents at once.
    await plan(0, a);
    await plan(1, b);
    setRunning(false);
  }

  const ready = plans[0] && plans[1] && shown;

  return (
    <div className="grid gap-8">
      <form onSubmit={compare} className="grid gap-5 rounded-[2rem] border border-hair bg-surface p-5 shadow-sm sm:p-7">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field id="act-a" label="Crowd A">
            <input id="act-a" className={input} value={acts[0]} onChange={(e) => setActs([e.target.value, acts[1]])} required minLength={2} />
          </Field>
          <span className="hidden pb-3 font-display text-sm font-bold text-muted sm:block">vs</span>
          <Field id="act-b" label="Crowd B">
            <input id="act-b" className={input} value={acts[1]} onChange={(e) => setActs([acts[0], e.target.value])} required minLength={2} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Field id="venue" label="Same venue">
              <input id="venue" className={input} value={venue.venue} onChange={(e) => set("venue", e.target.value)} required minLength={2} />
            </Field>
          </div>
          <Field id="date" label="Date">
            <input id="date" type="date" className={input} value={venue.date} onChange={(e) => set("date", e.target.value)} required />
          </Field>
          <Field id="attendance" label="Attendance">
            <input id="attendance" type="number" min={10} className={input} value={venue.attendance} onChange={(e) => set("attendance", Number(e.target.value))} required />
          </Field>
          <Field id="volunteers" label="Volunteers">
            <input id="volunteers" type="number" min={0} className={input} value={venue.volunteers} onChange={(e) => set("volunteers", Number(e.target.value))} required />
          </Field>
        </div>
        <button
          disabled={running}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-volt px-5 py-3.5 font-display text-lg font-bold text-volt-ink shadow-lg shadow-volt/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          <Icon name="users" className="size-5" />
          {running ? "Planning both nights…" : "Compare the two crowds"}
        </button>
        <p className="text-center text-xs text-muted">Runs a full Qloo plan for each act, one after the other (about 2 minutes each; saved events replay instantly).</p>
      </form>

      {shown && (
        <div className="grid gap-4 sm:grid-cols-2">
          {([0, 1] as const).map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-3xl border border-hair bg-surface p-4">
              <Portrait name={shown[i]} image={images[i]} className="size-16" />
              <div className="min-w-0">
                <div className="font-display text-lg font-bold text-ink">{shown[i]}</div>
                <div className="flex items-center gap-1.5 text-sm text-ink-2">
                  {progress[i].state === "running" && <span className="size-2 shrink-0 animate-pulse rounded-full bg-qloo" />}
                  {progress[i].state === "done" && <Icon name="check" className="size-4 shrink-0 text-qloo" />}
                  <span className="truncate">
                    {progress[i].state === "idle" ? "Waiting for the first plan" : progress[i].message}
                    {progress[i].state === "running" && progress[i].steps > 0 && ` · ${progress[i].steps} steps`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {progress.map((p, i) => p.state === "error" && shown && <Callout key={i} tone="critical">{shown[i]}: {p.message}</Callout>)}

      {ready && (
        <>
          <CrowdDiff a={{ name: shown[0], plan: plans[0]!, image: images[0] }} b={{ name: shown[1], plan: plans[1]!, image: images[1] }} />
          <SourceLegend />
        </>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}
