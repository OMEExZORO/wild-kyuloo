"use client";

import { useMemo } from "react";
import { describeInput, toolLabel } from "@/lib/labels";
import type { AgentEvent, SourceKind } from "@/lib/types";
import { Icon, SourceBadge } from "./ui";

interface Step {
  id: string;
  tool: string;
  input: unknown;
  result?: { source: SourceKind; cached: boolean; preview: string; status?: string };
}

// Pairs tool_call / tool_result events into steps and shows them as a timeline.
export function AgentTrace({ events, running }: { events: AgentEvent[]; running: boolean }) {
  const { steps, statuses } = useMemo(() => {
    const steps: Step[] = [];
    const byId = new Map<string, Step>();
    const statuses: string[] = [];
    for (const e of events) {
      if (e.type === "tool_call") {
        const s: Step = { id: e.id, tool: e.tool, input: e.input };
        byId.set(e.id, s);
        steps.push(s);
      } else if (e.type === "tool_result") {
        const s = byId.get(e.id);
        if (s) s.result = { source: e.source, cached: e.cached, preview: e.preview, status: e.status };
      } else if (e.type === "status") {
        statuses.push(e.message);
      }
    }
    return { steps, statuses };
  }, [events]);

  const qlooCalls = steps.filter((s) => s.tool.startsWith("qloo_")).length;

  return (
    <section className="no-print rounded-2xl border border-hair bg-surface p-5" aria-live="polite">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">What the agent is doing</h2>
          <p className="mt-0.5 text-xs text-muted">
            {steps.length} steps · {qlooCalls} Qloo calls
            {statuses.length > 0 && ` · ${statuses[statuses.length - 1]}`}
          </p>
        </div>
        {running && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1 text-xs font-medium text-accent">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Live
          </span>
        )}
      </header>

      <ol className="relative grid gap-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-hair">
        {steps.map((s) => {
          const { label, icon } = toolLabel(s.tool);
          const isQloo = s.tool.startsWith("qloo_");
          const failed = s.result?.status === "error" || s.result?.preview.startsWith("ERROR");
          const pending = !s.result && running && s.tool !== "web_search";
          return (
            <li key={s.id} className="animate-row-in relative grid grid-cols-[28px_1fr] gap-3">
              <span
                className={`relative z-10 grid size-7 place-items-center rounded-full border ${
                  isQloo ? "border-qloo bg-qloo-wash text-qloo" : "border-hair bg-surface-2 text-ink-2"
                }`}
              >
                {pending ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={icon} className="size-3.5" />}
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-1 text-sm font-medium text-ink">
                  {label}
                  {s.result && <SourceBadge source={s.result.source} />}
                  {s.result?.status && s.result.status !== "ok" && <StatusPill status={s.result.status} />}
                  {s.result?.cached && <span className="ml-1 text-[11px] text-muted">cached</span>}
                </div>
                {describeInput(s.input) && <div className="truncate text-xs text-muted">{describeInput(s.input)}</div>}
                {s.result && (
                  <div className={`mt-0.5 line-clamp-2 text-xs ${failed ? "text-critical" : "text-ink-2"}`}>{s.result.preview}</div>
                )}
              </div>
            </li>
          );
        })}
        {steps.length === 0 && running && <li className="pl-10 text-sm text-muted">Starting up…</li>}
      </ol>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "error" ? "text-critical bg-critical-wash" : status === "needs_input" || status === "degraded" || status === "partial" ? "text-warning bg-warning-wash" : "text-muted bg-surface-2";
  const label = status === "needs_input" ? "ambiguous match" : status;
  return <span className={`ml-1 rounded-full px-1.5 py-px text-[10.5px] font-medium ${tone}`}>{label}</span>;
}
