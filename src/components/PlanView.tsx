"use client";

import dynamic from "next/dynamic";
import type { ActMatch } from "@/lib/act";
import { plannedCounts, type MapContext } from "@/lib/layout";
import { todosFor } from "@/lib/todo";
import type { EventInput, Plan, SourceKind } from "@/lib/types";
import { ToDoList } from "./ToDoList";
import { BarList, Callout, Card, Chip, CopyButton, DivergingBars, Icon, Portrait, SourceBadge, StatTile, SubHeading } from "./ui";

// Leaflet needs the browser, so the map loads client-side only.
const SiteMap = dynamic(() => import("./SiteMap"), {
  ssr: false,
  loading: () => <div className="grid h-[520px] place-items-center rounded-3xl bg-surface-2 text-sm text-muted">Loading map…</div>,
});

// What the site map needs from the plan.
function mapContext(plan: Plan, event: EventInput): MapContext {
  const loves = plan.crowd.loves.map((l) => `${l.category}: ${l.items.join(", ")}`).join("; ");
  const regulars = plan.crowd.vsRegulars.map((d) => d.difference).join("; ");
  return {
    event: { act: event.act, venue: event.venue, date: event.date, attendance: event.attendance, volunteers: event.volunteers },
    center: plan.venue.lat !== null && plan.venue.lon !== null ? [plan.venue.lat, plan.venue.lon] : null,
    planned: plannedCounts(plan, event),
    crowd: [plan.crowd.headline, loves && `Loves: ${loves}`, regulars && `Vs regulars: ${regulars}`].filter(Boolean).join(". "),
    risks: plan.venue.risks.map((r) => `${r.risk}: ${r.mitigation}`).join("; "),
  };
}

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

const SECTIONS = [
  ["overview", "Overview"],
  ["todo", "To-do"],
  ["map", "Site map"],
  ["crowd", "Crowd"],
  ["food", "Food & drink"],
  ["sponsors", "Sponsors"],
  ["team", "Team"],
  ["venue", "Venue"],
  ["vibe", "Vibe"],
] as const;

export function PlanView({ plan, event, act, showNav = true }: { plan: Plan; event?: EventInput; act?: ActMatch | null; showNav?: boolean }) {
  const { total, taste } = evidenceCounts(plan);
  const stalls = plan.foodAndDrink.stallMix.reduce((s, x) => s + x.count, 0);
  const v = plan.volunteers;
  const short = v.available < v.recommended;
  const nextMoves = todosFor(plan).slice(0, 4);

  return (
    <div className="grid gap-5">
      {event && <EventHeader event={event} act={act ?? null} />}

      {showNav && (
        <nav className="no-print sticky top-2 z-20 -mx-1 overflow-x-auto rounded-2xl border border-hair bg-glass p-1.5 backdrop-blur-xl" aria-label="Plan sections">
          <ul className="flex min-w-max gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-xl px-3 py-1.5 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Overview: summary + headline numbers + what to do first */}
      <section id="overview" className="grid scroll-mt-20 gap-5 lg:grid-cols-3">
        <div className="print-break rounded-3xl border border-hair bg-surface p-6 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">The plan in a nutshell</p>
          <p className="mt-2 text-lg leading-relaxed text-ink sm:text-xl">{plan.summary}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Over-represented" value={plan.crowd.ageIndex.length ? topBand(plan) : "—"} note="age group vs typical" />
            <StatTile label="Volunteers" value={`${v.available}/${v.recommended}`} note={short ? `${v.recommended - v.available} short` : "have / need"} />
            <StatTile label="Stalls" value={String(stalls)} note={`${plan.foodAndDrink.vendorsToInvite.length} vendors named`} />
            <StatTile label="Taste-backed" value={`${taste}/${total}`} note="items from Qloo" />
          </div>
        </div>
        <div className="print-break flex flex-col rounded-3xl bg-volt p-6 text-volt-ink">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Do these first</p>
          <ol className="mt-3 grid flex-1 gap-2.5">
            {nextMoves.map((t, i) => (
              <li key={t.id} className="flex gap-2.5 text-[15px] font-medium leading-snug">
                <span className="font-display font-bold opacity-60">{i + 1}</span>
                {t.text}
              </li>
            ))}
          </ol>
          <a href="#todo" className="no-print mt-4 inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline">
            Full to-do list <Icon name="arrow" className="size-3.5" />
          </a>
        </div>
        {v.warnings.length > 0 && (
          <div className="lg:col-span-3">
            {v.warnings.map((w, i) => (
              <Callout key={i} tone="warning">{w}</Callout>
            ))}
          </div>
        )}
      </section>

      {/* To-do */}
      <section id="todo" className="scroll-mt-20">
        <Card title="Your to-do list" icon="list" subtitle="Everything this plan asks of you, ready to tick off">
          <ToDoList plan={plan} />
        </Card>
      </section>

      {/* Site map: place everything, draw the crowd area, get it reviewed */}
      {event && (
        <section id="map" className="no-print scroll-mt-20">
          <Card title="Site map" icon="pin" subtitle="Place the stage, entrances, stalls and first aid, draw the standing area, then let AI check it before the night">
            <SiteMap context={mapContext(plan, event)} />
          </Card>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Crowd */}
        <section id="crowd" className="scroll-mt-20 lg:col-span-2">
          <Card title="Who's coming" icon="users" subtitle={plan.crowd.headline}>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                {plan.crowd.ageIndex.length > 0 && (
                  <>
                    <SubHeading>Age, compared with a typical audience</SubHeading>
                    <DivergingBars rows={plan.crowd.ageIndex.map((a) => ({ label: prettyBand(a.band), value: a.index }))} />
                  </>
                )}
                {plan.crowd.genderIndex.length > 0 && (
                  <>
                    <SubHeading>Gender, compared with a typical audience</SubHeading>
                    <DivergingBars rows={plan.crowd.genderIndex.map((g) => ({ label: capitalize(g.label), value: g.index }))} />
                  </>
                )}
                {plan.crowd.ageIndex.length === 0 && plan.crowd.genderIndex.length === 0 && (
                  <p className="text-sm text-muted">No audience profile available.</p>
                )}
              </div>
              <div>
                <SubHeading>What they love</SubHeading>
                <ul className="grid gap-3">
                  {plan.crowd.loves.map((l, i) => (
                    <li key={i}>
                      <div className="mb-1.5 flex items-center text-sm font-semibold text-ink">
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
              <div className="mt-6 rounded-2xl bg-qloo-wash p-4">
                <h4 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
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
        </section>

        {/* Food & drink */}
        <section id="food" className="scroll-mt-20">
          <Card title="Food & drink" icon="food" subtitle="Stall mix and who to invite" className="h-full">
            <SubHeading>Stall mix</SubHeading>
            <ul className="grid gap-2.5">
              {plan.foodAndDrink.stallMix.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-8 min-w-8 place-items-center rounded-xl bg-volt px-1.5 font-display text-sm font-bold tabular-nums text-volt-ink">{s.count}</span>
                  <div className="text-sm">
                    <span className="font-semibold text-ink">{s.concept}</span>
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
                  {plan.foodAndDrink.vendorsToInvite.map((vd, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-2xl border border-hair p-3 text-sm">
                      <span className="font-display text-xs font-bold tabular-nums text-muted">#{i + 1}</span>
                      <div>
                        <span className="font-semibold text-ink">{vd.name}</span>
                        <SourceBadge source={vd.source} evidence={vd.evidence} />
                        <p className="text-ink-2">{vd.why}</p>
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
                      <span className="font-semibold text-ink">{d.item}</span>
                      <SourceBadge source={d.source} evidence={d.evidence} />
                      <span className="text-ink-2"> · {d.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </section>

        {/* Sponsors & merch */}
        <section id="sponsors" className="scroll-mt-20">
          <Card title="Sponsors & merch" icon="star" subtitle="Brands whose fans are already in the room" className="h-full">
            <ul className="grid gap-3">
              {plan.sponsors.map((s, i) => (
                <li key={i} className="rounded-2xl border border-hair p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center font-display text-base font-semibold text-ink">
                      {s.brand}
                      <SourceBadge source={s.source} evidence={s.evidence} />
                    </div>
                    <CopyButton text={s.pitch} label="Copy pitch" />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">{s.why}</p>
                  <blockquote className="mt-2 border-l-2 border-volt pl-3 text-sm text-ink">“{s.pitch}”</blockquote>
                </li>
              ))}
            </ul>
            {plan.merch.length > 0 && (
              <>
                <SubHeading>Merch ideas</SubHeading>
                <ul className="grid gap-1.5 text-sm">
                  {plan.merch.map((m, i) => (
                    <li key={i}>
                      <span className="font-semibold text-ink">{m.idea}</span>
                      <SourceBadge source={m.source} evidence={m.evidence} />
                      <span className="text-ink-2"> · {m.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </section>

        {/* Team */}
        <section id="team" className="scroll-mt-20">
          <Card title="Your volunteer team" icon="shield" subtitle={v.shifts.map((s) => `${s.label} ${s.start}–${s.end}`).join(" · ")} className="h-full">
            <BarList rows={v.stations.map((s) => ({ label: s.station, value: s.count, note: s.notes }))} />
            <p className="mt-3 text-xs text-muted">
              {v.available} available · {v.recommended} recommended. Headcounts come from a fixed formula, adjusted for this crowd. Hover a row for notes.
              <SourceBadge source="calc" />
            </p>
          </Card>
        </section>

        {/* Venue */}
        <section id="venue" className="scroll-mt-20">
          <Card title={plan.venue.name} icon="pin" subtitle={plan.venue.address} className="h-full">
            <div className="mb-4 flex flex-wrap gap-2">
              {plan.venue.capacity && <Chip>Capacity {plan.venue.capacity.toLocaleString()}</Chip>}
              {plan.venue.entrances && <Chip>{plan.venue.entrances} entrances</Chip>}
              {plan.venue.lat !== null && plan.venue.lon !== null && (
                <a
                  className="inline-flex items-center gap-1 rounded-full border border-hair px-2.5 py-0.5 text-[13px] font-medium text-ink hover:border-ink"
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
                      <span className="font-semibold">{r.risk}.</span> {r.mitigation}
                      <SourceBadge source={r.source} evidence={r.evidence} />
                    </Callout>
                  ))}
                </div>
              </>
            )}
          </Card>
        </section>

        {/* Vibe */}
        <section id="vibe" className="scroll-mt-20">
          <Card title="Vibe check" icon="music" subtitle="Pre-show playlist and theme" className="h-full">
            <ol className="grid gap-1">
              {plan.vibe.playlist.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition hover:bg-surface-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 font-display text-xs font-bold tabular-nums text-ink-2">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-ink">{p.artist}</span>
                    <SourceBadge source={p.source} evidence={p.evidence} />
                    <p className="truncate text-xs text-ink-2">{p.why}</p>
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
        </section>

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

// Poster-style header: the act's photo, name and the event's key facts.
function EventHeader({ event, act }: { event: EventInput; act: ActMatch | null }) {
  const name = act?.name ?? event.act;
  const date = formatDate(event.date);
  return (
    <header className="print-break relative overflow-hidden rounded-[2rem] border border-hair bg-surface">
      {act?.image && (
        <div aria-hidden="true" className="absolute inset-0 scale-105 bg-cover bg-[center_25%] opacity-50 blur-lg" style={{ backgroundImage: `url("${act.image}")` }} />
      )}
      <div className="relative flex flex-col gap-5 bg-gradient-to-r from-surface via-surface/85 to-surface/40 p-6 sm:flex-row sm:items-center sm:p-8">
        <Portrait name={name} image={act?.image} className="h-36 w-28 sm:h-44 sm:w-36" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Event plan</p>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">{name}</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Chip><Icon name="pin" className="mr-1 size-3.5" />{event.venue}</Chip>
            <Chip><Icon name="calendar" className="mr-1 size-3.5" />{date} · {event.startTime}</Chip>
            <Chip><Icon name="users" className="mr-1 size-3.5" />{event.attendance.toLocaleString()} expected</Chip>
            {act?.id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-qloo px-2.5 py-0.5 text-[13px] font-semibold text-white">
                <Icon name="spark" className="size-3.5" /> Qloo match
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// Qloo age bands look like "24_and_younger", "25_to_29", "55_and_older".
export function prettyBand(band: string) {
  return band
    .replace(/^(\d+)_and_younger$/, "$1 and under")
    .replace(/^(\d+)_and_older$/, "$1+")
    .replace(/^(\d+)_to_(\d+)$/, "$1–$2")
    .replace(/_/g, " ");
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function topBand(plan: Plan) {
  const top = [...plan.crowd.ageIndex].sort((a, b) => b.index - a.index)[0];
  return prettyBand(top.band);
}
