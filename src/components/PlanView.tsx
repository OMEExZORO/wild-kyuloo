"use client";

import type { Plan, SourceKind } from "@/lib/types";
import { BarList, Callout, Card, Chip, Icon, SourceBadge, SplitBar, StatTile, SubHeading } from "./ui";

// Count claims backed by Qloo (or Qloo-shaped sample data) vs everything else.
export function evidenceCounts(plan: Plan) {
  const sources: SourceKind[] = [
    ...plan.crowd.loves.map((x) => x.source),
    ...plan.crowd.vsRegulars.map((x) => x.source),
    ...plan.venue.facts.map((x) => x.source),
    ...plan.venue.risks.map((x) => x.source),
    ...plan.foodAndDrink.stallMix.map((x) => x.source),
    ...plan.foodAndDrink.vendorsToInvite.map((x) => x.source),
    ...plan.foodAndDrink.drinks.map((x) => x.source),
    ...plan.sponsors.map((x) => x.source),
    ...plan.merch.map((x) => x.source),
    ...plan.vibe.playlist.map((x) => x.source),
  ];
  const taste = sources.filter((s) => s === "qloo" || s === "mock").length;
  const data = sources.filter((s) => s !== "llm").length;
  return { total: sources.length, taste, data };
}

export function PlanView({ plan }: { plan: Plan }) {
  const { total, taste } = evidenceCounts(plan);
  const stalls = plan.foodAndDrink.stallMix.reduce((s, x) => s + x.count, 0);
  const v = plan.volunteers;
  const short = v.available < v.recommended;

  return (
    <div className="grid gap-5">
      {/* Summary */}
      <section className="print-break rounded-2xl border border-hair bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your plan</p>
        <p className="mt-2 text-lg leading-relaxed text-ink sm:text-xl">{plan.summary}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Who's coming" value={plan.crowd.ageMix[0] ? topBand(plan) : "—"} note={plan.crowd.headline} />
          <StatTile label="Volunteers" value={`${v.available} / ${v.recommended}`} note={short ? `${v.recommended - v.available} short of recommended` : "available / recommended"} />
          <StatTile label="Food & drink stalls" value={String(stalls)} note={`${plan.foodAndDrink.vendorsToInvite.length} named vendors to invite`} />
          <StatTile label="Backed by taste data" value={`${taste} of ${total}`} note="recommendations from Qloo" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Crowd */}
        <Card title="The crowd" icon="users" subtitle={plan.crowd.headline} className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              {plan.crowd.ageMix.length > 0 && (
                <>
                  <SubHeading>Age</SubHeading>
                  <BarList rows={plan.crowd.ageMix.map((a) => ({ label: a.band, value: a.share }))} format={(n) => `${Math.round(n * 100)}%`} max={Math.max(...plan.crowd.ageMix.map((a) => a.share))} />
                </>
              )}
              {plan.crowd.genderMix.length > 0 && (
                <>
                  <SubHeading>Gender</SubHeading>
                  <SplitBar parts={plan.crowd.genderMix.map((g) => ({ label: g.label, share: g.share }))} />
                </>
              )}
              {plan.crowd.ageMix.length === 0 && plan.crowd.genderMix.length === 0 && (
                <p className="text-sm text-muted">No audience profile available.</p>
              )}
            </div>
            <div>
              <SubHeading>What they love</SubHeading>
              <ul className="grid gap-3">
                {plan.crowd.loves.map((l, i) => (
                  <li key={i}>
                    <div className="mb-1.5 flex items-center text-sm font-medium text-ink">
                      {l.category}
                      <SourceBadge source={l.source} evidence={l.evidence} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {l.items.map((it) => <Chip key={it}>{it}</Chip>)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {plan.crowd.vsRegulars.length > 0 && (
            <div className="mt-6 rounded-xl bg-qloo-wash p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon name="spark" className="size-4 text-qloo" /> Tonight vs. the venue&apos;s usual crowd
              </h4>
              <ul className="mt-2 grid gap-1.5 text-sm text-ink">
                {plan.crowd.vsRegulars.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-qloo" />
                    <span>
                      {d.difference}
                      <SourceBadge source={d.source} evidence={d.evidence} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Food & drink */}
        <Card title="Food & drink" icon="food" subtitle="Stall mix and who to invite">
          <SubHeading>Stall mix</SubHeading>
          <ul className="grid gap-2.5">
            {plan.foodAndDrink.stallMix.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-accent-wash px-1.5 text-sm font-semibold tabular-nums text-accent">{s.count}</span>
                <div className="text-sm">
                  <span className="font-medium text-ink">{s.concept}</span>
                  <SourceBadge source={s.source} evidence={s.evidence} />
                  <p className="text-ink-2">{s.why}</p>
                </div>
              </li>
            ))}
          </ul>
          {plan.foodAndDrink.vendorsToInvite.length > 0 && (
            <>
              <SubHeading>Vendors to invite</SubHeading>
              <ol className="grid gap-2">
                {plan.foodAndDrink.vendorsToInvite.map((v, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-xl border border-hair p-3 text-sm">
                    <span className="text-xs font-semibold tabular-nums text-muted">#{i + 1}</span>
                    <div>
                      <span className="font-medium text-ink">{v.name}</span>
                      <SourceBadge source={v.source} evidence={v.evidence} />
                      <p className="text-ink-2">{v.why}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          {plan.foodAndDrink.drinks.length > 0 && (
            <>
              <SubHeading>At the bar</SubHeading>
              <ul className="grid gap-1.5 text-sm">
                {plan.foodAndDrink.drinks.map((d, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{d.item}</span>
                    <SourceBadge source={d.source} evidence={d.evidence} />
                    <span className="text-ink-2"> · {d.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Sponsors & merch */}
        <Card title="Sponsors & merch" icon="star" subtitle="Brands whose fans are already in the room">
          <ul className="grid gap-3">
            {plan.sponsors.map((s, i) => (
              <li key={i} className="rounded-xl border border-hair p-3.5">
                <div className="flex items-center text-sm font-semibold text-ink">
                  {s.brand}
                  <SourceBadge source={s.source} evidence={s.evidence} />
                </div>
                <p className="mt-0.5 text-sm text-ink-2">{s.why}</p>
                <blockquote className="mt-2 border-l-2 border-accent pl-3 text-sm italic text-ink">“{s.pitch}”</blockquote>
              </li>
            ))}
          </ul>
          {plan.merch.length > 0 && (
            <>
              <SubHeading>Merch ideas</SubHeading>
              <ul className="grid gap-1.5 text-sm">
                {plan.merch.map((m, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{m.idea}</span>
                    <SourceBadge source={m.source} evidence={m.evidence} />
                    <span className="text-ink-2"> · {m.why}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Volunteers */}
        <Card title="Volunteers" icon="shield" subtitle={v.shifts.map((s) => `${s.label} ${s.start}–${s.end}`).join(" · ")}>
          {v.warnings.map((w, i) => (
            <div key={i} className="mb-3">
              <Callout tone="warning">{w}</Callout>
            </div>
          ))}
          <BarList rows={v.stations.map((s) => ({ label: s.station, value: s.count, note: s.notes }))} />
          <p className="mt-3 text-xs text-muted">
            {v.available} available · {v.recommended} recommended. Headcounts come from a fixed formula, adjusted for this crowd. Hover a row for notes.
            <SourceBadge source="calc" />
          </p>
        </Card>

        {/* Venue */}
        <Card title={plan.venue.name} icon="pin" subtitle={plan.venue.address}>
          <div className="mb-4 flex flex-wrap gap-2">
            {plan.venue.capacity && <Chip>Capacity {plan.venue.capacity.toLocaleString()}</Chip>}
            {plan.venue.entrances && <Chip>{plan.venue.entrances} entrances</Chip>}
            {plan.venue.lat !== null && plan.venue.lon !== null && (
              <a
                className="inline-flex items-center gap-1 rounded-full border border-hair px-2.5 py-0.5 text-[13px] text-accent hover:border-accent"
                href={`https://www.openstreetmap.org/?mlat=${plan.venue.lat}&mlon=${plan.venue.lon}#map=17/${plan.venue.lat}/${plan.venue.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                Open map <Icon name="arrow" className="size-3" />
              </a>
            )}
          </div>
          <ul className="grid gap-1.5 text-sm text-ink">
            {plan.venue.facts.map((f, i) => (
              <li key={i}>
                {f.fact}
                <SourceBadge source={f.source} evidence={f.evidence} />
              </li>
            ))}
          </ul>
          {(plan.venue.transit.length > 0 || plan.venue.parking.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {plan.venue.transit.length > 0 && (
                <div>
                  <SubHeading>Getting there</SubHeading>
                  <ul className="grid gap-1 text-sm text-ink-2">{plan.venue.transit.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
              {plan.venue.parking.length > 0 && (
                <div>
                  <SubHeading>Parking</SubHeading>
                  <ul className="grid gap-1 text-sm text-ink-2">{plan.venue.parking.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {plan.venue.risks.length > 0 && (
            <>
              <SubHeading>Risks to plan for</SubHeading>
              <div className="grid gap-2">
                {plan.venue.risks.map((r, i) => (
                  <Callout key={i} tone="warning">
                    <span className="font-medium">{r.risk}.</span> {r.mitigation}
                    <SourceBadge source={r.source} evidence={r.evidence} />
                  </Callout>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Vibe */}
        <Card title="Vibe" icon="music" subtitle="Pre-show playlist and theme">
          <ol className="grid gap-2">
            {plan.vibe.playlist.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="w-5 pt-px text-right text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                <div>
                  <span className="font-medium text-ink">{p.artist}</span>
                  <SourceBadge source={p.source} evidence={p.evidence} />
                  <p className="text-ink-2">{p.why}</p>
                </div>
              </li>
            ))}
          </ol>
          {plan.vibe.themeIdeas.length > 0 && (
            <>
              <SubHeading>Theme ideas</SubHeading>
              <div className="flex flex-wrap gap-1.5">{plan.vibe.themeIdeas.map((t) => <Chip key={t}>{t}</Chip>)}</div>
            </>
          )}
        </Card>

        {/* Assumptions & limitations */}
        <Card title="Check before you rely on this" icon="info">
          <div className="grid gap-5">
            <div>
              <SubHeading>Assumptions the agent made</SubHeading>
              {plan.assumptions.length ? (
                <ul className="grid gap-1.5 text-sm text-ink">{plan.assumptions.map((a, i) => <li key={i} className="flex gap-2"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-muted" />{a}</li>)}</ul>
              ) : (
                <p className="text-sm text-muted">None recorded.</p>
              )}
            </div>
            <div>
              <SubHeading>What this plan doesn&apos;t establish</SubHeading>
              <ul className="grid gap-1.5 text-sm text-ink-2">{plan.limitations.map((l, i) => <li key={i} className="flex gap-2"><Icon name="info" className="mt-0.5 size-4 shrink-0 text-muted" />{l}</li>)}</ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function topBand(plan: Plan) {
  const top = [...plan.crowd.ageMix].sort((a, b) => b.share - a.share)[0];
  return `${top.band} (${Math.round(top.share * 100)}%)`;
}
