import Link from "next/link";
import { Suspense } from "react";
import { CrowdCompare } from "@/components/CrowdCompare";
import { PRESETS, SAMPLE_EVENT } from "@/lib/presets";

export const metadata = { title: "Same venue, different crowd · Crowd Kit" };

type Params = Record<string, string | string[] | undefined>;

// /crowds?venue=...&act=... (opened from a finished plan) or the Eminem vs Phoebe Bridgers default.
export default function CrowdsPage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <header>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">← Crowd Kit</Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">Same venue, different crowd</p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">Same room. Different night.</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">
          Venues reuse the same floor plan for every show, but the crowd changes. Pick two acts for one venue and Crowd Kit plans both
          nights with Qloo, then shows exactly what changes: who&apos;s coming, staffing by station, food, sponsors, merch and music.
        </p>
      </header>
      {/* The form depends on the URL, so it streams in after the static header. */}
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[2rem] bg-surface-2" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Compare({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams;
  const str = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
  const num = (k: string) => (str(k) && Number.isFinite(Number(str(k))) ? Number(str(k)) : undefined);

  const { act, actId, actType, ...base } = PRESETS[0].input;
  void actId;
  void actType;
  const initial = {
    ...base,
    venue: str("venue") ?? base.venue,
    date: str("date") ?? base.date,
    startTime: str("startTime") ?? base.startTime,
    durationHours: num("durationHours") ?? base.durationHours,
    attendance: num("attendance") ?? base.attendance,
    volunteers: num("volunteers") ?? base.volunteers,
    budget: str("budget") ?? base.budget,
    foodStalls: num("foodStalls") ?? base.foodStalls,
  };
  const actA = str("act") ?? act;
  // Compare against the Phoebe Bridgers sample night, or against the first preset when A is Phoebe.
  const actB = actA === SAMPLE_EVENT.input.act ? act : SAMPLE_EVENT.input.act;
  return <CrowdCompare initial={initial} actA={actA} actB={actB} />;
}
