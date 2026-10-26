"use client";

import { headlineChanges, isShared, overlap, stationRows, type Side } from "@/lib/crowdDiff";
import type { SourceKind } from "@/lib/types";
import { prettyBand } from "./PlanView";
import { Card, DivergingBars, Icon, Portrait, SourceBadge, SubHeading } from "./ui";

export interface DiffSide extends Side {
  image?: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Same venue, two crowds: what changes on the night, section by section.
export function CrowdDiff({ a, b }: { a: DiffSide; b: DiffSide }) {
  const changes = headlineChanges(a, b);
  const stations = stationRows(a.plan, b.plan);

  return (
    <div className="grid gap-6">
      <Card title="What changes on the night" icon="spark" subtitle={`Same room, same date, same headcount. Only the act changes: ${a.name} → ${b.name}.`}>
        <ul className="grid gap-2.5">
          {changes.map((c) => (
            <li key={c} className="flex gap-2.5 text-[15px] leading-snug text-ink">
              <Icon name="arrow" className="mt-0.5 size-4 shrink-0 text-qloo" />
              {c}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Who's coming" icon="users" subtitle="Qloo affinity indices: how much more or less than a typical audience.">
        <Columns a={a} b={b} render={(s) => (
          <>
            <p className="mb-3 text-sm text-ink-2">{s.plan.crowd.headline}</p>
            {s.plan.crowd.ageIndex.length > 0 ? (
              <>
                <SubHeading>Age</SubHeading>
                <DivergingBars rows={s.plan.crowd.ageIndex.map((x) => ({ label: prettyBand(x.band), value: x.index }))} />
              </>
            ) : (
              <p className="text-sm text-muted">No age data from Qloo for this act.</p>
            )}
            {s.plan.crowd.genderIndex.length > 0 && (
              <>
                <SubHeading>Gender</SubHeading>
                <DivergingBars rows={s.plan.crowd.genderIndex.map((x) => ({ label: capitalize(x.label), value: x.index }))} />
              </>
            )}
          </>
        )} />
      </Card>

      <Card title="Volunteers by station" icon="calc" subtitle="From the same staffing formula, weighted by each crowd's Qloo profile.">
        <StationTable a={a} b={b} stations={stations} />
      </Card>

      <Card title="Food stalls" icon="food">
        <Columns a={a} b={b} render={(s, other) => {
          const { shared } = overlap(s.plan.foodAndDrink.stallMix, other.plan.foodAndDrink.stallMix, (x) => x.concept);
          return <Items rows={s.plan.foodAndDrink.stallMix.map((x) => ({ text: `${x.count}× ${x.concept}`, source: x.source, evidence: x.evidence, both: isShared(shared, x.concept) }))} />;
        }} />
      </Card>

      <ListCard title="Sponsors to pitch" icon="star" a={a} b={b} pick={(s) => s.plan.sponsors.map((x) => ({ name: x.brand, source: x.source, evidence: x.evidence }))} />
      <ListCard title="Merch" icon="ticket" a={a} b={b} pick={(s) => s.plan.merch.map((x) => ({ name: x.idea, source: x.source, evidence: x.evidence }))} />
      <ListCard title="Drinks" icon="food" a={a} b={b} pick={(s) => s.plan.foodAndDrink.drinks.map((x) => ({ name: x.item, source: x.source, evidence: x.evidence }))} />
      <ListCard title="Pre-show playlist" icon="music" a={a} b={b} pick={(s) => s.plan.vibe.playlist.map((x) => ({ name: x.artist, source: x.source, evidence: x.evidence }))} />
    </div>
  );
}

// Volunteers per station. When nothing moves, one line says so and the table folds away.
function StationTable({ a, b, stations }: { a: DiffSide; b: DiffSide; stations: ReturnType<typeof stationRows> }) {
  const same = stations.every((r) => r.delta === 0) && a.plan.volunteers.recommended === b.plan.volunteers.recommended;
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <thead>
          <tr className="border-b border-hair text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">Station</th>
            <th className="px-3 py-2 text-right font-medium">{a.name}</th>
            <th className="px-3 py-2 text-right font-medium">{b.name}</th>
            <th className="py-2 pl-3 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((r) => (
            <tr key={r.station} className="border-b border-hair/60">
              <td className="py-2 pr-3 text-ink">{r.station}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">{r.a}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-2">{r.b}</td>
              <td className="py-2 pl-3 text-right"><Delta n={r.delta} /></td>
            </tr>
          ))}
          <tr className="font-semibold text-ink">
            <td className="py-2 pr-3">Recommended total</td>
            <td className="px-3 py-2 text-right tabular-nums">{a.plan.volunteers.recommended}</td>
            <td className="px-3 py-2 text-right tabular-nums">{b.plan.volunteers.recommended}</td>
            <td className="py-2 pl-3 text-right"><Delta n={b.plan.volunteers.recommended - a.plan.volunteers.recommended} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
  if (!same) return table;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[15px] text-ink">
        Same {a.plan.volunteers.recommended} volunteers at the same stations for both crowds.{" "}
        <span className="text-sm text-muted underline group-open:hidden">Show stations</span>
      </summary>
      <div className="mt-3">{table}</div>
    </details>
  );
}

type Row = { name: string; source: SourceKind; evidence: string };

function ListCard({ title, icon, a, b, pick }: { title: string; icon: string; a: DiffSide; b: DiffSide; pick: (s: DiffSide) => Row[] }) {
  const { shared } = overlap(pick(a), pick(b), (x) => x.name);
  return (
    <Card title={title} icon={icon}>
      <Columns a={a} b={b} render={(s) => <Items rows={pick(s).map((x) => ({ text: x.name, source: x.source, evidence: x.evidence, both: isShared(shared, x.name) }))} />} />
    </Card>
  );
}

function Columns({ a, b, render }: { a: DiffSide; b: DiffSide; render: (s: DiffSide, other: DiffSide) => React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {[a, b].map((s, i) => (
        <div key={i} className="min-w-0">
          <div className="mb-3 flex items-center gap-2 border-b border-hair pb-2">
            <Portrait name={s.name} image={s.image} className="size-7" />
            <span className="font-display text-sm font-semibold text-ink">{s.name}</span>
          </div>
          {render(s, i === 0 ? b : a)}
        </div>
      ))}
    </div>
  );
}

function Items({ rows }: { rows: { text: string; source: SourceKind; evidence: string; both: boolean }[] }) {
  if (!rows.length) return <p className="text-sm text-muted">None in this plan.</p>;
  return (
    <ul className="grid gap-1.5 text-sm text-ink">
      {rows.map((r, i) => (
        <li key={i} className={r.both ? "text-ink-2" : ""}>
          {r.text}
          {r.both && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">both</span>}
          <SourceBadge source={r.source} evidence={r.evidence} />
        </li>
      ))}
    </ul>
  );
}

function Delta({ n }: { n: number }) {
  if (n === 0) return <span className="text-xs text-muted">same</span>;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${n > 0 ? "bg-volt text-volt-ink" : "bg-surface-2 text-ink-2"}`}>
      {n > 0 ? `+${n}` : `−${-n}`}
    </span>
  );
}
