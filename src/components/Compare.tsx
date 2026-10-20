"use client";

import type { Plan } from "@/lib/types";
import { evidenceCounts } from "./PlanView";
import { Icon, SourceBadge } from "./ui";

// The demo's key moment: the same request with and without Qloo, row by row.
export function Compare({ withQloo, without }: { withQloo?: Plan; without?: Plan }) {
  const rows: { label: string; render: (p: Plan) => React.ReactNode }[] = [
    { label: "Summary", render: (p) => <p>{p.summary}</p> },
    { label: "Who's coming", render: (p) => <p>{p.crowd.headline}</p> },
    {
      label: "Food stalls",
      render: (p) => (
        <ul className="grid gap-1">
          {p.foodAndDrink.stallMix.map((s, i) => (
            <li key={i}>
              {s.count}× {s.concept}
              <SourceBadge source={s.source} evidence={s.evidence} />
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: "Vendors to invite",
      render: (p) =>
        p.foodAndDrink.vendorsToInvite.length ? (
          <ul className="grid gap-1">
            {p.foodAndDrink.vendorsToInvite.map((v, i) => (
              <li key={i}>
                {v.name}
                <SourceBadge source={v.source} evidence={v.evidence} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        ),
    },
    {
      label: "Sponsors to pitch",
      render: (p) => (
        <ul className="grid gap-1">
          {p.sponsors.map((s, i) => (
            <li key={i}>
              {s.brand}
              <SourceBadge source={s.source} evidence={s.evidence} />
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: "vs. venue regulars",
      render: (p) =>
        p.crowd.vsRegulars.length ? (
          <ul className="grid gap-1">
            {p.crowd.vsRegulars.map((d, i) => (
              <li key={i}>
                {d.difference}
                <SourceBadge source={d.source} evidence={d.evidence} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        ),
    },
  ];

  const a = withQloo && evidenceCounts(withQloo);
  const b = without && evidenceCounts(without);

  return (
    <section className="overflow-hidden rounded-2xl border border-hair bg-surface">
      <div className="grid grid-cols-[1fr_1fr] border-b border-hair md:grid-cols-[10rem_1fr_1fr]">
        <div className="hidden md:block" />
        <ColumnHead title="With Qloo" accent stat={a ? `${a.taste} of ${a.total} items backed by taste data` : "Working…"} />
        <ColumnHead title="LLM only" stat={b ? `${b.taste} of ${b.total} items backed by taste data` : "Working…"} />
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_1fr] border-b border-hair last:border-0 md:grid-cols-[10rem_1fr_1fr]">
          <div className="col-span-2 bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted md:col-span-1 md:bg-transparent md:py-4">{r.label}</div>
          <div className="border-r border-hair px-4 py-3 text-sm text-ink md:py-4">{withQloo ? r.render(withQloo) : <Loading />}</div>
          <div className="px-4 py-3 text-sm text-ink-2 md:py-4">{without ? r.render(without) : <Loading />}</div>
        </div>
      ))}
    </section>
  );
}

function ColumnHead({ title, stat, accent }: { title: string; stat: string; accent?: boolean }) {
  return (
    <div className={`px-4 py-3 ${accent ? "border-r border-hair bg-qloo-wash" : ""}`}>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {accent && <Icon name="spark" className="size-4 text-qloo" />}
        {title}
      </div>
      <div className="text-xs text-muted">{stat}</div>
    </div>
  );
}

const Empty = () => <span className="text-muted">Nothing specific</span>;
const Loading = () => <span className="inline-block h-4 w-2/3 animate-pulse rounded bg-surface-2" />;
