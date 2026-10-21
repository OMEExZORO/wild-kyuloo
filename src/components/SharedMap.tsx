"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { decodeContext, type MapContext } from "@/lib/layout";
import { Callout } from "./ui";

const SiteMap = dynamic(() => import("./SiteMap"), {
  ssr: false,
  loading: () => <div className="grid h-[520px] place-items-center rounded-3xl bg-surface-2 text-sm text-muted">Loading map…</div>,
});

// A teammate's shared site map: editable here, saved in this browser, re-shareable.
export function SharedMap() {
  const [ctx, setCtx] = useState<MapContext | null | "missing">(null);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("ctx");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash is only readable in the browser
    setCtx((raw && decodeContext(raw)) || "missing");
  }, []);

  if (ctx === null) return null;
  if (ctx === "missing") {
    return (
      <Callout tone="info">
        This link doesn&apos;t contain a site map. <Link href="/" className="font-semibold underline">Build a plan</Link> and use &quot;Share with team&quot; on its site map.
      </Callout>
    );
  }
  return (
    <>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Shared site map</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{ctx.event.act}</h1>
        <p className="text-ink-2">
          {ctx.event.venue} · {ctx.event.date} · {ctx.event.attendance.toLocaleString()} expected
        </p>
      </header>
      <SiteMap context={ctx} />
    </>
  );
}
