"use client";

import { PRESETS } from "@/lib/presets";
import type { EventInput } from "@/lib/types";
import { Icon } from "./ui";

const input =
  "w-full rounded-lg border border-hair bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25";

export function EventForm({
  value,
  onChange,
  onSubmit,
  running,
}: {
  value: EventInput;
  onChange: (v: EventInput) => void;
  onSubmit: () => void;
  running: boolean;
}) {
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => onChange({ ...value, [k]: v });
  const num = (s: string) => (s === "" ? 0 : Number(s));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-2xl border border-hair bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Try a sample:</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onChange(p.input)}
            className="rounded-full border border-hair px-3 py-1 text-xs text-ink-2 transition hover:border-accent hover:text-accent"
          >
            {p.name}
          </button>
        ))}
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">The event</legend>
        <Field label="Venue" hint="Name and city" wide>
          <input className={input} value={value.venue} onChange={(e) => set("venue", e.target.value)} placeholder="The Fillmore, San Francisco" required minLength={2} />
        </Field>
        <Field label="Act, lineup or theme" hint="A headliner works best" wide>
          <input className={input} value={value.act} onChange={(e) => set("act", e.target.value)} placeholder="Phoebe Bridgers" required minLength={2} />
        </Field>
        <Field label="Date">
          <input type="date" className={input} value={value.date} onChange={(e) => set("date", e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doors">
            <input type="time" className={input} value={value.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
          <Field label="Hours">
            <input type="number" min={1} max={16} className={input} value={value.durationHours} onChange={(e) => set("durationHours", num(e.target.value))} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-6 grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Your resources</legend>
        <Field label="Expected attendance">
          <input type="number" min={10} className={input} value={value.attendance} onChange={(e) => set("attendance", num(e.target.value))} required />
        </Field>
        <Field label="Volunteers">
          <input type="number" min={0} className={input} value={value.volunteers} onChange={(e) => set("volunteers", num(e.target.value))} required />
        </Field>
        <Field label="Food stall slots" hint="Optional">
          <input type="number" min={0} className={input} value={value.foodStalls ?? ""} onChange={(e) => set("foodStalls", e.target.value === "" ? undefined : num(e.target.value))} />
        </Field>
        <Field label="Budget" hint="Optional">
          <input className={input} value={value.budget ?? ""} onChange={(e) => set("budget", e.target.value || undefined)} placeholder="$8,000" />
        </Field>
        <Field label="Anything else?" hint="Optional: e.g. no alcohol, family crowd" wide>
          <input className={input} value={value.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} />
        </Field>
      </fieldset>

      <button
        disabled={running}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
      >
        {running ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Researching your crowd…
          </>
        ) : (
          <>
            Build my event plan <Icon name="arrow" />
          </>
        )}
      </button>
    </form>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
