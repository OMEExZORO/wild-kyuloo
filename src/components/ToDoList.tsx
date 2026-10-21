"use client";

import { useEffect, useMemo, useState } from "react";
import { planKey, todosFor, type ToDo } from "@/lib/todo";
import type { Plan } from "@/lib/types";
import { CopyButton, Icon } from "./ui";

// The organiser's checklist. Ticks live in this browser only (localStorage),
// keyed per plan; storage can be unavailable (private mode), so every access is guarded.
export function ToDoList({ plan }: { plan: Plan }) {
  const items = useMemo(() => todosFor(plan), [plan]);
  const key = planKey(plan);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after mount
      setDone(new Set(saved ? (JSON.parse(saved) as string[]) : []));
    } catch {
      setDone(new Set());
    }
  }, [key]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // not persisted; fine
      }
      return next;
    });
  }

  const groups = items.reduce<Record<string, ToDo[]>>((acc, t) => ((acc[t.group] ??= []).push(t), acc), {});
  const pct = items.length ? Math.round((done.size / items.length) * 100) : 0;

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="To-do progress">
          <div className="h-full rounded-full bg-volt transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-display text-sm font-semibold tabular-nums text-ink">
          {done.size}/{items.length} done
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {Object.entries(groups).map(([group, list]) => (
          <div key={group}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{group}</h4>
            <ul className="grid gap-1.5">
              {list.map((t) => {
                const checked = done.has(t.id);
                return (
                  <li key={t.id} className={`flex items-start gap-3 rounded-2xl border p-3 transition ${checked ? "border-transparent bg-surface-2" : "border-hair"}`}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggle(t.id)}
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition ${checked ? "border-volt bg-volt text-volt-ink" : "border-axis hover:border-ink"}`}
                    >
                      {checked && <Icon name="check" className="size-3.5" />}
                      <span className="sr-only">{t.text}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-medium ${checked ? "text-muted line-through" : "text-ink"}`}>{t.text}</div>
                      {t.detail && <div className="line-clamp-2 text-xs text-ink-2">{t.detail}</div>}
                    </div>
                    {t.copy && <CopyButton text={t.copy} label={t.group === "Sponsors" ? "Copy pitch" : "Copy"} />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Ticks are saved in this browser only.</p>
    </div>
  );
}
