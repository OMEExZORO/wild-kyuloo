"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Promo } from "@/lib/promo";
import { Callout, Chip, CopyButton, Icon, SubHeading } from "./ui";

const PromoMap = dynamic(() => import("./PromoMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-surface-2" />,
});

export interface PromoContext {
  act: string;
  actId?: string;
  venue: string;
  date: string;
  attendance: number;
  center: [number, number] | null;
  crowd: string;
}

// "Fill the room": where this crowd hangs out, who takes posters, which podcasts
// to pitch and what to post. Runs on demand (a few Qloo calls + one Gemini request).
export function FillTheRoom({ context }: { context: PromoContext }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [promo, setPromo] = useState<Promo | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setPromo(data);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  if (!promo) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-ink-2">
          Seats left? Find the neighbourhoods where this crowd stands out, the local places that should get your posters, the podcasts to
          pitch, and captions written for this crowd.
        </p>
        <div className="grid gap-1">
          <button
            type="button"
            onClick={run}
            disabled={state === "loading"}
            className="inline-flex items-center gap-2 rounded-xl bg-volt px-4 py-2.5 font-display text-sm font-bold text-volt-ink disabled:opacity-60"
          >
            {state === "loading" ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="pin" />}
            {state === "loading" ? "Reading the city…" : "Find where this crowd hangs out"}
          </button>
          {state === "error" && <span className="text-xs text-critical">{error}</span>}
        </div>
      </div>
    );
  }

  const byArea = promo.partners.reduce<Record<string, Promo["partners"]>>((acc, p) => ((acc[p.neighbourhood ?? "Elsewhere in the city"] ??= []).push(p), acc), {});
  const receiptChip = (id: string) => (
    <a key={id} href={`#receipt-${id}`} className="ml-1 rounded-md border border-qloo/40 px-1 font-mono text-[10px] font-semibold text-qloo hover:bg-qloo hover:text-white">
      {id}
    </a>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <SubHeading>Where this crowd stands out in {promo.city}</SubHeading>
          {promo.hotspots.length ? (
            <>
              <PromoMap hotspots={promo.hotspots} venue={context.center} />
              <ol className="mt-3 grid gap-1.5 text-sm">
                {promo.hotspots.map((h, i) => (
                  <li key={h.area} className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-volt font-display text-xs font-bold text-volt-ink">{i + 1}</span>
                    <span className="font-semibold text-ink">{h.area}</span>
                    {receiptChip(h.receipt)}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="text-sm text-muted">No neighbourhood data for this act here.</p>
          )}
        </div>

        <div>
          <SubHeading>Drop posters here</SubHeading>
          {promo.partners.length ? (
            <div className="grid gap-3">
              {Object.entries(byArea).map(([area, list]) => (
                <div key={area}>
                  <div className="text-xs font-semibold text-muted">{area}</div>
                  <ul className="mt-1 grid gap-1">
                    {list.map((p) => (
                      <li key={p.name} className="text-sm">
                        <a
                          href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${p.name} ${p.address ?? promo.city}`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-ink hover:underline"
                        >
                          {p.name}
                        </a>
                        {receiptChip(p.receipt)}
                        {p.address && <span className="block text-xs text-ink-2">{p.address}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div>
                <CopyButton text={promo.partners.map((p) => `${p.name}${p.address ? `, ${p.address}` : ""}`).join("\n")} label="Copy list for the street team" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No partner places found.</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <SubHeading>Captions for this crowd</SubHeading>
          <ul className="grid gap-2">
            {promo.captions.map((c) => (
              <li key={c} className="flex items-start justify-between gap-3 rounded-2xl border border-hair p-3 text-sm text-ink">
                <span>{c}</span>
                <CopyButton text={c} />
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-4">
          <div>
            <SubHeading>Street-team brief</SubHeading>
            <div className="rounded-2xl bg-surface-2 p-3 text-sm text-ink">
              {promo.streetTeam}
              <div className="mt-2">
                <CopyButton text={promo.streetTeam} label="Copy brief" />
              </div>
            </div>
          </div>
          {promo.podcasts.length > 0 && (
            <div>
              <SubHeading>Podcasts to pitch</SubHeading>
              <div className="flex flex-wrap items-center gap-1.5">
                {promo.podcasts.map((p) => <Chip key={p.name}>{p.name}</Chip>)}
                {receiptChip(promo.podcasts[0].receipt)}
              </div>
            </div>
          )}
        </div>
      </div>

      {promo.limitations.map((l) => (
        <Callout key={l} tone="info">{l}</Callout>
      ))}

      <details className="rounded-2xl border border-hair">
        <summary className="cursor-pointer p-3 text-sm font-semibold text-ink">Qloo calls behind this ({promo.receipts.length})</summary>
        <ol className="grid gap-2 p-3 pt-0 md:grid-cols-2">
          {promo.receipts.map((r) => (
            <li key={r.id} id={`receipt-${r.id}`} className="scroll-mt-24 rounded-xl border border-hair p-2.5 text-xs target:border-qloo target:ring-4 target:ring-qloo/25">
              <span className="rounded bg-qloo px-1 font-mono font-bold text-white">{r.id}</span> <span className="font-mono font-semibold text-ink">{r.tool}</span> · {r.status}
              <code className="mt-1 block break-all text-ink-2">{JSON.stringify(r.input)}</code>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
