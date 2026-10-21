"use client";

import { useEffect, useState } from "react";
import type { ActLookup, ActMatch } from "@/lib/act";
import { PRESETS } from "@/lib/presets";
import type { EventInput } from "@/lib/types";
import { Icon, Portrait } from "./ui";

const input =
  "w-full rounded-xl border border-hair bg-surface/80 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted outline-none transition focus:border-ink focus:ring-4 focus:ring-volt/40";

export function EventForm({
  value,
  onChange,
  onSubmit,
  running,
  act,
  onActChange,
}: {
  value: EventInput;
  onChange: (v: EventInput) => void;
  onSubmit: () => void;
  running: boolean;
  act: ActMatch | null;
  onActChange: (a: ActMatch | null) => void;
}) {
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => onChange({ ...value, [k]: v });
  const num = (s: string) => (s === "" ? 0 : Number(s));

  const [lookup, setLookup] = useState<{ state: "idle" | "loading" | "none" | "error"; others: ActLookup["candidates"] }>({ state: "idle", others: [] });

  // The form opens on a sample event: resolve its act once so the page greets you with a photo.
  useEffect(() => {
    if (!act && PRESETS.some((p) => p.input.act === value.act)) findAct();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Confirming an act stores its Qloo ID on the event, so the agent skips the name lookup.
  function applyAct(match: ActMatch | null, base: EventInput = value) {
    onActChange(match);
    onChange({ ...base, actId: match?.id || undefined, actType: match?.type || undefined });
  }

  async function findAct(name = value.act, type?: string, base: EventInput = value) {
    if (name.trim().length < 2) return;
    setLookup({ state: "loading", others: [] });
    try {
      const res = await fetch(`/api/act?q=${encodeURIComponent(name)}${type ? `&type=${type}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ActLookup;
      applyAct(data.match, base);
      setLookup({ state: data.match ? "idle" : "none", others: data.candidates });
    } catch {
      setLookup({ state: "error", others: [] });
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-[2rem] border border-hair bg-glass p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-7"
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Try one:</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => {
              applyAct(null, p.input);
              // Presets are known acts: look them up straight away so the photo appears.
              findAct(p.input.act, undefined, p.input);
            }}
            className="rounded-full border border-hair bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2 transition hover:-translate-y-0.5 hover:border-ink hover:text-ink"
          >
            {p.name}
          </button>
        ))}
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">The event</legend>

        <Field id="ck-act" label="Who's performing?" hint="Artist, comedian, lineup or a theme" wide>
          <div className="flex gap-2">
            <input id="ck-act"
              className={input}
              value={value.act}
              onChange={(e) => {
                // A confirmed act no longer applies once the name changes.
                const next = { ...value, act: e.target.value, actId: undefined, actType: undefined };
                if (act) onActChange(null);
                setLookup({ state: "idle", others: [] });
                onChange(next);
              }}
              placeholder="Phoebe Bridgers"
              required
              minLength={2}
            />
            <button
              type="button"
              onClick={() => findAct()}
              disabled={lookup.state === "loading" || value.act.trim().length < 2}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-ink px-3.5 text-sm font-semibold text-ink transition hover:bg-volt hover:text-volt-ink disabled:opacity-40"
            >
              {lookup.state === "loading" ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon name="search" />
              )}
              <span className="hidden sm:inline">Find on Qloo</span>
            </button>
          </div>

          {act && (
            <div className="animate-row-in mt-3 flex items-center gap-3 rounded-2xl border border-hair bg-surface/80 p-3">
              <Portrait name={act.name} image={act.image} className="size-14" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-display text-base font-semibold text-ink">{act.name}</span>
                  {act.id && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-qloo px-2 py-px text-[10.5px] font-semibold text-white">
                      <Icon name="check" className="size-3" /> Qloo match{act.type ? ` · ${act.type}` : ""}
                    </span>
                  )}
                </div>
                {act.description && <p className="line-clamp-1 text-xs text-ink-2">{act.description}</p>}
                {act.imageCredit && (
                  <a href={act.imageCredit.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:underline">
                    Photo: {act.imageCredit.label}
                  </a>
                )}
              </div>
              <button type="button" onClick={() => applyAct(null)} aria-label="Remove act match" className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
                <Icon name="x" />
              </button>
            </div>
          )}
          {lookup.others.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Not them?
              {lookup.others.map((c) => (
                <button key={c.id} type="button" onClick={() => findAct(c.name, c.type)} className="rounded-full border border-hair px-2.5 py-0.5 text-ink-2 hover:border-ink hover:text-ink">
                  {c.name} ({c.type})
                </button>
              ))}
            </div>
          )}
          {lookup.state === "none" && (
            <p className="mt-2 text-xs text-muted">No exact Qloo match. That&apos;s fine for a theme: the agent will plan from matching tastes instead.</p>
          )}
          {lookup.state === "error" && <p className="mt-2 text-xs text-critical">Couldn&apos;t look that up right now. You can still build the plan.</p>}
        </Field>

        <Field id="ck-venue" label="Venue" hint="Name and city" wide>
          <input id="ck-venue" className={input} value={value.venue} onChange={(e) => set("venue", e.target.value)} placeholder="The Fillmore, San Francisco" required minLength={2} />
        </Field>
        <Field id="ck-date" label="Date">
          <input id="ck-date" type="date" className={input} value={value.date} onChange={(e) => set("date", e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ck-doors" label="Doors">
            <input id="ck-doors" type="time" className={input} value={value.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
          <Field id="ck-hours" label="Hours">
            <input id="ck-hours" type="number" min={1} max={16} className={input} value={value.durationHours} onChange={(e) => set("durationHours", num(e.target.value))} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-7 grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted">Your resources</legend>
        <Field id="ck-attendance" label="Expected crowd">
          <input id="ck-attendance" type="number" min={10} className={input} value={value.attendance} onChange={(e) => set("attendance", num(e.target.value))} required />
        </Field>
        <Field id="ck-volunteers" label="Volunteers">
          <input id="ck-volunteers" type="number" min={0} className={input} value={value.volunteers} onChange={(e) => set("volunteers", num(e.target.value))} required />
        </Field>
        <Field id="ck-stalls" label="Food stall slots" hint="Optional">
          <input id="ck-stalls" type="number" min={0} className={input} value={value.foodStalls ?? ""} onChange={(e) => set("foodStalls", e.target.value === "" ? undefined : num(e.target.value))} />
        </Field>
        <Field id="ck-budget" label="Budget" hint="Optional">
          <input id="ck-budget" className={input} value={value.budget ?? ""} onChange={(e) => set("budget", e.target.value || undefined)} placeholder="$8,000" />
        </Field>
        <Field id="ck-notes" label="Anything else?" hint="e.g. no alcohol, family crowd" wide>
          <input id="ck-notes" className={input} value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} />
        </Field>
      </fieldset>

      <button
        disabled={running}
        className="group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-volt px-5 py-4 font-display text-lg font-bold text-volt-ink shadow-lg shadow-volt/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-volt/30 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70"
      >
        {running ? (
          <>
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Reading the room…
          </>
        ) : (
          <>
            Build my event plan <Icon name="arrow" className="size-5 transition group-hover:translate-x-1" />
          </>
        )}
      </button>
    </form>
  );
}

function Field({ id, label, hint, wide, children }: { id: string; label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid content-start gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-semibold text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
