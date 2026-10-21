"use client";

import { useId } from "react";
import type { SourceKind } from "@/lib/types";

// ---------------------------------------------------------------------------
// Icons (inline, 16px, stroke = currentColor)
// ---------------------------------------------------------------------------
const paths: Record<string, string> = {
  spark: "M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1",
  globe: "M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM1.5 8h13M8 1.5c1.8 1.8 2.6 4 2.6 6.5S9.8 12.7 8 14.5C6.2 12.7 5.4 10.5 5.4 8S6.2 3.3 8 1.5Z",
  pin: "M8 14.5s5-4.3 5-8a5 5 0 0 0-10 0c0 3.7 5 8 5 8Z M8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z",
  cloud: "M4.5 12.5h7a3 3 0 0 0 .4-6 4 4 0 0 0-7.7.9A2.6 2.6 0 0 0 4.5 12.5Z",
  calc: "M3.5 1.5h9v13h-9zM5.5 4h5M5.5 7.5h1M7.5 7.5h1M9.5 7.5h1M5.5 10h1M7.5 10h1M9.5 10h1M5.5 12.5h1M7.5 12.5h1M9.5 12.5h1",
  brain: "M6 2.5a2 2 0 0 0-2 2 2 2 0 0 0-1.5 3.3A2.2 2.2 0 0 0 4.5 11.5 2 2 0 0 0 8 12.5v-9A1.8 1.8 0 0 0 6 2.5ZM10 2.5a2 2 0 0 1 2 2 2 2 0 0 1 1.5 3.3 2.2 2.2 0 0 1-2 3.7A2 2 0 0 1 8 12.5",
  users: "M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c.4-2.5 2.2-4 4.5-4s4.1 1.5 4.5 4M11 7a2 2 0 1 0 0-4M12.5 10.2c1.2.5 1.9 1.9 2 3.3",
  food: "M4 1.5v5.5a1.5 1.5 0 0 0 3 0V1.5M5.5 1.5v13M11.5 14.5v-13c-1.7 0-2.5 2-2.5 4.5v3h2.5",
  star: "M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z",
  music: "M6 12.5V3l7-1.5V11M6 12.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM13 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  shield: "M8 14.5s5.5-2.3 5.5-7V3L8 1.5 2.5 3v4.5c0 4.7 5.5 7 5.5 7Z",
  check: "M3 8.5l3 3 7-7",
  alert: "M8 5.5v3.5M8 11.5v.01M7.1 2.3 1.6 12a1 1 0 0 0 .9 1.5h11a1 1 0 0 0 .9-1.5L8.9 2.3a1 1 0 0 0-1.8 0Z",
  info: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5v4M8 5v.01",
  arrow: "M3 8h10M9 4l4 4-4 4",
  print: "M4 6V1.5h8V6M4 12H2.5v-5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v5H12M4 9.5h8v5H4z",
  bus: "M3.5 2.5h9v9h-9zM3.5 7.5h9M5.5 13.5v-2M10.5 13.5v-2M5.5 9.7v.01M10.5 9.7v.01",
  ticket: "M1.5 5a1.5 1.5 0 0 0 0 3v3.5h13V8a1.5 1.5 0 0 1 0-3V1.5h-13zM10 1.5v10",
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name] ?? paths.info} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sources: every claim in a plan carries one. Qloo is the hero, so it is the
// only colored badge; mock wears the same hue as an outline so it never passes
// for real Qloo data.
// ---------------------------------------------------------------------------
export const SOURCES: Record<SourceKind, { label: string; icon: string; blurb: string }> = {
  qloo: { label: "Qloo", icon: "spark", blurb: "From Qloo's taste graph: what this audience over-indexes on" },
  mock: { label: "Sample", icon: "spark", blurb: "Sample Qloo-shaped data (demo or no Qloo credential)" },
  web: { label: "Web", icon: "globe", blurb: "Found by web search; check it's current" },
  osm: { label: "Map", icon: "pin", blurb: "OpenStreetMap data around the venue" },
  weather: { label: "Weather", icon: "cloud", blurb: "Open-Meteo forecast for the date" },
  calc: { label: "Formula", icon: "calc", blurb: "Deterministic staffing formula" },
  llm: { label: "AI judgement", icon: "brain", blurb: "The agent's own reasoning, no data behind it" },
};

export function SourceBadge({ source, evidence }: { source: SourceKind; evidence?: string }) {
  const id = useId();
  const s = SOURCES[source];
  const tone =
    source === "qloo"
      ? "bg-qloo text-white border-qloo"
      : source === "mock"
        ? "border-qloo text-qloo bg-qloo-wash"
        : "border-hair text-ink-2 bg-surface-2";
  return (
    <span className="group relative ml-1.5 inline-flex align-middle">
      <span
        tabIndex={0}
        aria-describedby={evidence ? id : undefined}
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-medium leading-4 outline-none focus-visible:ring-2 focus-visible:ring-accent ${tone}`}
      >
        <Icon name={s.icon} className="size-3" />
        {s.label}
      </span>
      {evidence && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg border border-hair bg-surface p-2.5 text-xs leading-snug text-ink-2 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          <span className="mb-0.5 block font-medium text-ink">{s.label}</span>
          {evidence}
        </span>
      )}
    </span>
  );
}

export function SourceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      <span>Every line shows where it came from:</span>
      {(Object.keys(SOURCES) as SourceKind[]).map((k) => (
        <span key={k} className="inline-flex items-center" title={SOURCES[k].blurb}>
          <SourceBadge source={k} />
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
export function Card({
  title,
  icon,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  icon?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`print-break rounded-2xl border border-hair bg-surface p-5 sm:p-6 ${className}`}>
      <header className="mb-4">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {icon && (
            <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-ink-2">
              <Icon name={icon} />
            </span>
          )}
          {title}
        </h3>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</h4>;
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-hair bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {note && <div className="mt-0.5 text-xs text-ink-2">{note}</div>}
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-hair bg-surface-2 px-2.5 py-0.5 text-[13px] text-ink">{children}</span>;
}

export function Callout({ tone, children }: { tone: "warning" | "critical" | "info"; children: React.ReactNode }) {
  const style =
    tone === "warning"
      ? "bg-warning-wash text-ink border-warning/40"
      : tone === "critical"
        ? "bg-critical-wash text-ink border-critical/40"
        : "bg-accent-wash text-ink border-accent/30";
  const iconColor = tone === "warning" ? "text-warning" : tone === "critical" ? "text-critical" : "text-accent";
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${style}`}>
      <span className={`mt-0.5 shrink-0 ${iconColor}`}>
        <Icon name={tone === "info" ? "info" : "alert"} />
      </span>
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts (dataviz specs: <=24px bars, 4px rounded data-end square at the
// baseline, value at the tip in text ink, hover readout per mark).
// ---------------------------------------------------------------------------
export function BarList({
  rows,
  format = (n) => String(n),
  max,
}: {
  rows: { label: string; value: number; note?: string }[];
  format?: (n: number) => string;
  max?: number;
}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[minmax(7rem,48%)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}${r.note ? ` (${r.note})` : ""}`}>
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-4 rounded-r-[4px] bg-series-1 transition-[filter] group-hover:brightness-110"
              style={{ width: `max(4px, calc((100% - 3rem) * ${r.value / top}))` }}
            />
            <span className="text-[13px] font-medium tabular-nums text-ink">{format(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Diverging bars for Qloo affinity indices (-1..+1): blue grows right for
// "more than typical", red grows left for "fewer", from a neutral zero line.
// Values are shown as signed points (+33 / -63) at the bar tip, in text ink.
export function DivergingBars({ rows }: { rows: { label: string; value: number }[] }) {
  const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}`;
  const describe = (v: number) => (v > 0.05 ? "more than typical" : v < -0.05 ? "fewer than typical" : "about typical");
  return (
    <div>
      <ul className="grid gap-2">
        {rows.map((r) => {
          const v = Math.max(-1, Math.min(1, r.value));
          const width = `max(3px, ${Math.abs(v) * 50}%)`;
          return (
            <li key={r.label} className="group grid grid-cols-[minmax(6rem,34%)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${pts(v)} (${describe(v)})`}>
              <span className="truncate text-ink-2">{r.label}</span>
              <span className="relative h-5">
                <span className="absolute inset-y-0 left-1/2 w-px bg-axis" />
                {v >= 0 ? (
                  <span className="absolute top-0.5 flex h-4 items-center" style={{ left: "50%", width }}>
                    <span className="h-4 w-full rounded-r-[4px] bg-series-1 group-hover:brightness-110" />
                    <span className="ml-1.5 text-[12px] font-medium tabular-nums text-ink">{pts(v)}</span>
                  </span>
                ) : (
                  <span className="absolute top-0.5 flex h-4 flex-row-reverse items-center" style={{ right: "50%", width }}>
                    <span className="h-4 w-full rounded-l-[4px] bg-diverge-neg group-hover:brightness-110" />
                    <span className="mr-1.5 text-[12px] font-medium tabular-nums text-ink">{pts(v)}</span>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 grid grid-cols-[minmax(6rem,34%)_1fr] gap-3 text-[11px] text-muted">
        <span />
        <span className="flex justify-between">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-diverge-neg" /> Fewer than typical</span>
          <span className="inline-flex items-center gap-1">More than typical <span className="size-2 rounded-sm bg-series-1" /></span>
        </span>
      </div>
    </div>
  );
}
