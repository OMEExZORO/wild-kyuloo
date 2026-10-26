"use client";

// Interactive venue map for organisers: place stage, entrances, stalls, first
// aid..., draw the standing area, see live safety checks, and ask the AI to
// review the layout (optionally with a stage photo). Saved in this browser and
// shareable as a link. Loaded with next/dynamic (no SSR): Leaflet needs `window`.

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import {
  areaM2,
  decodeLayout,
  encodeContext,
  emptyLayout,
  encodeLayout,
  EXIT_WIDTH_DEFAULT_M,
  isWayOut,
  newId,
  placedCounts,
  runChecks,
  ZONE_KINDS,
  type Layout,
  type MapContext,
  type ZoneKind,
} from "@/lib/layout";
import type { Review } from "@/lib/review";
import { Icon } from "./ui";

type Mode = { type: "place"; kind: ZoneKind } | { type: "area"; points: [number, number][] } | null;

// Keyless tile sources. OpenStreetMap's tiles are free for light use with
// attribution (dark mode is a CSS filter: .ck-map-dark in globals.css).
// Satellite imagery is Esri's; check their terms before heavy production use.
const TILES = {
  map: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors", maxNativeZoom: 19 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics", maxNativeZoom: 19 },
};

const storageKey = (e: MapContext["event"]) => `ck-layout-${(e.venue + "|" + e.date + "|" + e.act).toLowerCase().replace(/[^a-z0-9|]+/g, "-")}`;

function pinIcon(kind: ZoneKind, label: string, highlight: boolean) {
  const safe = label.replace(/[<>&"]/g, "");
  return L.divIcon({
    className: "ck-pin-anchor",
    iconSize: [0, 0],
    html: `<div class="ck-pin${highlight ? " ck-pin-hl" : ""}"><span>${ZONE_KINDS[kind].emoji}</span><b>${safe}</b></div>`,
  });
}

export default function SiteMap({ context, shareable = true }: { context: MapContext; shareable?: boolean }) {
  const key = storageKey(context.event);
  const [center, setCenter] = useState<[number, number] | null>(context.center);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [base, setBase] = useState<"map" | "satellite">("map");
  const [dark, setDark] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const mapRef = useRef<L.Map | null>(null);

  // Venue coordinates: from the plan, or look the venue up.
  useEffect(() => {
    if (center) return;
    fetch(`/api/geocode?q=${encodeURIComponent(context.event.venue)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => g && setCenter([g.lat, g.lon]))
      .catch(() => {});
  }, [center, context.event.venue]);

  // Load: a shared link wins, then this browser's saved layout, then empty.
  useEffect(() => {
    if (!center || layout) return;
    let loaded: Layout | null = null;
    const hash = new URLSearchParams(window.location.hash.slice(1)).get("layout");
    if (hash) loaded = decodeLayout(hash);
    if (!loaded) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) loaded = JSON.parse(saved) as Layout;
      } catch {
        // storage unavailable
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-only state after mount
    setLayout(loaded ?? emptyLayout(center));
  }, [center, key, layout]);

  // Autosave.
  useEffect(() => {
    if (!layout) return;
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      // not persisted; the share link still works
    }
  }, [key, layout]);

  // Follow the app's light/dark theme for the base map.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const forced = document.documentElement.dataset.theme;
      setDark(forced ? forced === "dark" : mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const checks = useMemo(() => (layout ? runChecks(layout, context.event.attendance) : []), [layout, context.event.attendance]);
  const placed = useMemo(() => (layout ? placedCounts(layout) : {}), [layout]);

  if (!center || !layout) {
    return <div className="grid h-[420px] place-items-center rounded-2xl bg-surface-2 text-sm text-muted">Finding the venue on the map…</div>;
  }

  const update = (fn: (l: Layout) => Layout) => setLayout((l) => (l ? fn(l) : l));
  const tiles = TILES[base];

  function addZone(kind: ZoneKind, lat: number, lon: number) {
    update((l) => {
      const n = l.zones.filter((z) => z.kind === kind).length + 1;
      return { ...l, zones: [...l.zones, { id: newId(), kind, label: `${ZONE_KINDS[kind].label} ${n}`, lat, lon, qty: 1 }] };
    });
  }

  function finishArea() {
    if (mode?.type !== "area" || mode.points.length < 3) return;
    const points = mode.points;
    update((l) => ({ ...l, areas: [...l.areas, { id: newId(), label: `Crowd area ${l.areas.length + 1}`, points }] }));
    setMode(null);
  }

  function focus(ids: string[]) {
    setHighlight(ids);
    const pts: [number, number][] = [
      ...layout!.zones.filter((z) => ids.includes(z.id)).map((z) => [z.lat, z.lon] as [number, number]),
      ...layout!.areas.filter((a) => ids.includes(a.id)).flatMap((a) => a.points),
    ];
    if (pts.length && mapRef.current) mapRef.current.flyToBounds(L.latLngBounds(pts).pad(0.6), { maxZoom: 19, duration: 0.6 });
  }

  async function share() {
    const url = `${window.location.origin}/map#${new URLSearchParams({ layout: encodeLayout(layout!), ctx: encodeContext({ ...context, center }) })}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(ZONE_KINDS) as ZoneKind[]).map((k) => {
          const active = mode?.type === "place" && mode.kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setMode(active ? null : { type: "place", kind: k })}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? "border-ink bg-ink text-page" : "border-hair bg-surface text-ink-2 hover:border-ink hover:text-ink"}`}
            >
              <span aria-hidden="true">{ZONE_KINDS[k].emoji}</span> {ZONE_KINDS[k].label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMode(mode?.type === "area" ? null : { type: "area", points: [] })}
          className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-bold transition ${mode?.type === "area" ? "border-volt bg-volt text-volt-ink" : "border-dashed border-ink text-ink hover:bg-volt hover:text-volt-ink"}`}
        >
          ✏️ Draw crowd area
        </button>
      </div>

      {mode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-volt px-4 py-2.5 text-sm font-semibold text-volt-ink">
          {mode.type === "place" ? (
            <span>Click the map to place a {ZONE_KINDS[mode.kind].label.toLowerCase()}. Drag pins to move them.</span>
          ) : (
            <span>Click around the standing area ({mode.points.length} point{mode.points.length === 1 ? "" : "s"}), then finish.</span>
          )}
          <span className="flex gap-2">
            {mode.type === "area" && (
              <button type="button" disabled={mode.points.length < 3} onClick={finishArea} className="rounded-full bg-volt-ink px-3 py-1 text-xs text-volt disabled:opacity-40">
                Finish area
              </button>
            )}
            <button type="button" onClick={() => setMode(null)} className="rounded-full border border-volt-ink px-3 py-1 text-xs">
              Done
            </button>
          </span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
        {/* Map */}
        <div className="relative overflow-hidden rounded-3xl border border-hair">
          <MapContainer
            ref={mapRef}
            center={layout.center}
            zoom={19}
            maxZoom={21}
            scrollWheelZoom
            className={`h-[520px] w-full ${mode ? "cursor-crosshair" : ""} ${dark && base === "map" ? "ck-map-dark" : ""}`}
          >
            <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} maxZoom={21} maxNativeZoom={tiles.maxNativeZoom} />
            <ClickHandler
              onClick={(lat, lon) => {
                if (mode?.type === "place") addZone(mode.kind, lat, lon);
                else if (mode?.type === "area") setMode({ type: "area", points: [...mode.points, [lat, lon]] });
              }}
            />
            <CircleMarker center={layout.center} radius={6} pathOptions={{ color: "#6250d6", weight: 2, fillOpacity: 0.6 }}>
              <Tooltip direction="top">{context.event.venue}</Tooltip>
            </CircleMarker>

            {layout.areas.map((a) => {
              const m2 = areaM2(a.points);
              const hl = highlight.includes(a.id);
              return (
                <Polygon key={a.id} positions={a.points} pathOptions={{ color: hl ? "#c6f432" : "#3987e5", weight: hl ? 4 : 2, dashArray: "6 6", fillOpacity: 0.15 }}>
                  <Tooltip sticky>
                    {a.label}: {Math.round(m2).toLocaleString()} m² · fits ~{Math.floor(m2 * 2).toLocaleString()}
                  </Tooltip>
                  <Popup>
                    <AreaPopup label={a.label} m2={m2} onDelete={() => update((l) => ({ ...l, areas: l.areas.filter((x) => x.id !== a.id) }))} />
                  </Popup>
                </Polygon>
              );
            })}

            {mode?.type === "area" && mode.points.length > 0 && (
              <>
                <Polyline positions={mode.points} pathOptions={{ color: "#c6f432", weight: 3, dashArray: "4 6" }} />
                {mode.points.map((p, i) => (
                  <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#c6f432", fillOpacity: 1 }} />
                ))}
              </>
            )}

            {layout.zones.map((z) => (
              <Marker
                key={z.id}
                position={[z.lat, z.lon]}
                icon={pinIcon(z.kind, z.qty > 1 ? `${z.label} ×${z.qty}` : z.widthM ? `${z.label} · ${z.widthM} m` : z.label, highlight.includes(z.id))}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    update((l) => ({ ...l, zones: l.zones.map((x) => (x.id === z.id ? { ...x, lat: p.lat, lon: p.lng } : x)) }));
                  },
                }}
              >
                <Popup>
                  <ZonePopup
                    zone={z}
                    onChange={(patch) => update((l) => ({ ...l, zones: l.zones.map((x) => (x.id === z.id ? { ...x, ...patch } : x)) }))}
                    onDelete={() => update((l) => ({ ...l, zones: l.zones.filter((x) => x.id !== z.id) }))}
                  />
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map controls */}
          <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
            <div className="inline-flex rounded-xl border border-hair bg-glass p-0.5 text-xs font-semibold backdrop-blur">
              {(["map", "satellite"] as const).map((b) => (
                <button key={b} type="button" onClick={() => setBase(b)} className={`rounded-lg px-2.5 py-1 capitalize ${base === b ? "bg-ink text-page" : "text-ink-2"}`}>
                  {b}
                </button>
              ))}
            </div>
            {shareable && (
              <button type="button" onClick={share} className="inline-flex items-center gap-1 rounded-xl border border-hair bg-glass px-2.5 py-1.5 text-xs font-semibold text-ink backdrop-blur hover:border-ink">
                <Icon name={shareState === "copied" ? "check" : "copy"} className="size-3.5" />
                {shareState === "copied" ? "Link copied" : "Share with team"}
              </button>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="grid gap-4">
          <PlaceList planned={context.planned} placed={placed} onPick={(k) => setMode({ type: "place", kind: k })} />
          <ChecksList checks={checks} onFocus={focus} />
        </div>
      </div>

      <AiReview context={context} layout={layout} onFocus={focus} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Saved automatically in this browser. Use &quot;Share with team&quot; to send an editable copy.</span>
        <button
          type="button"
          onClick={() => {
            setLayout(emptyLayout(layout.center));
            setHighlight([]);
          }}
          className="rounded-full border border-hair px-2.5 py-0.5 hover:border-critical hover:text-critical"
        >
          Clear map
        </button>
      </div>
    </div>
  );
}

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function ZonePopup({ zone, onChange, onDelete }: { zone: Layout["zones"][number]; onChange: (p: Partial<Layout["zones"][number]>) => void; onDelete: () => void }) {
  return (
    <div className="grid w-52 gap-2 font-sans">
      <label className="grid gap-1 text-xs font-semibold">
        Name
        <input defaultValue={zone.label} onBlur={(e) => onChange({ label: e.target.value || zone.label })} className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal" />
      </label>
      {(zone.kind === "toilets" || zone.kind === "food") && (
        <label className="grid gap-1 text-xs font-semibold">
          {zone.kind === "toilets" ? "Toilet units here" : "Stalls here"}
          <input type="number" min={1} defaultValue={zone.qty} onBlur={(e) => onChange({ qty: Math.max(1, Number(e.target.value) || 1) })} className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal" />
        </label>
      )}
      {isWayOut(zone) && (
        <label className="grid gap-1 text-xs font-semibold">
          Clear width (metres)
          <input
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={zone.widthM ?? ""}
            placeholder={`${EXIT_WIDTH_DEFAULT_M} (assumed)`}
            onBlur={(e) => {
              const w = Number(e.target.value);
              onChange({ widthM: e.target.value && w > 0 ? w : undefined });
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm font-normal"
          />
          <span className="font-normal text-gray-500">The narrowest point people pass through.</span>
        </label>
      )}
      <button type="button" onClick={onDelete} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
        Remove
      </button>
    </div>
  );
}

function AreaPopup({ label, m2, onDelete }: { label: string; m2: number; onDelete: () => void }) {
  return (
    <div className="grid w-52 gap-1 font-sans text-sm">
      <b>{label}</b>
      <span>{Math.round(m2).toLocaleString()} m²</span>
      <span>Comfortable: ~{Math.floor(m2 * 2).toLocaleString()} people · Max: ~{Math.floor(m2 * 3).toLocaleString()}</span>
      <button type="button" onClick={onDelete} className="mt-1 rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
        Remove area
      </button>
    </div>
  );
}

function PlaceList({ planned, placed, onPick }: { planned: MapContext["planned"]; placed: Partial<Record<ZoneKind, number>>; onPick: (k: ZoneKind) => void }) {
  const rows = (Object.entries(planned) as [ZoneKind, number][]).filter(([, n]) => n > 0);
  return (
    <div className="rounded-3xl border border-hair bg-surface p-4">
      <h4 className="font-display text-base font-semibold text-ink">From your plan: place these</h4>
      <p className="mb-3 mt-1 text-base leading-snug text-ink-2">
        Pick an item, then click the map to drop it there. <b className="font-bold text-ink">Drag a pin to move it.</b>
      </p>
      <ul className="grid gap-1">
        {rows.map(([k, need]) => {
          const have = placed[k] ?? 0;
          const done = have >= need;
          return (
            <li key={k}>
              <button type="button" onClick={() => onPick(k)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                <span className="flex items-center gap-2 text-ink">
                  <span aria-hidden="true">{ZONE_KINDS[k].emoji}</span>
                  {ZONE_KINDS[k].label}
                  {k === "toilets" && <span className="text-xs text-muted">(units)</span>}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${done ? "bg-volt text-volt-ink" : "bg-surface-2 text-ink-2"}`}>
                  {done && <Icon name="check" className="size-3" />}
                  {have}/{need}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SEV = {
  critical: { label: "Critical", cls: "bg-critical-wash text-critical", icon: "alert" },
  warning: { label: "Check", cls: "bg-warning-wash text-warning", icon: "alert" },
  ok: { label: "OK", cls: "bg-surface-2 text-good", icon: "check" },
  tip: { label: "Tip", cls: "bg-accent-wash text-accent", icon: "info" },
} as const;

function SevPill({ s }: { s: keyof typeof SEV }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${SEV[s].cls}`}>
      <Icon name={SEV[s].icon} className="size-3" />
      {SEV[s].label}
    </span>
  );
}

function ChecksList({ checks, onFocus }: { checks: ReturnType<typeof runChecks>; onFocus: (ids: string[]) => void }) {
  return (
    <div className="rounded-3xl border border-hair bg-surface p-4">
      <h4 className="mb-2 font-display text-sm font-semibold text-ink">Live safety checks</h4>
      <ul className="grid gap-2">
        {checks.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onFocus(c.zoneIds)} className="grid w-full gap-0.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <SevPill s={c.severity} />
                {c.title}
              </span>
              <span className="text-xs text-ink-2">{c.detail}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">Rules of thumb (about 2 people per m², 1 toilet per 100). They support, never replace, a professional safety plan.</p>
    </div>
  );
}

// Downscale a photo in the browser before sending it (keeps requests small).
async function toJpeg(file: File): Promise<{ mime: "image/jpeg"; data: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.82);
  return { mime: "image/jpeg", data: url.split(",")[1], preview: url };
}

function AiReview({ context, layout, onFocus }: { context: MapContext; layout: Layout; onFocus: (ids: string[]) => void }) {
  const [photo, setPhoto] = useState<{ mime: "image/jpeg"; data: string; preview: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<{ review: Review; source: "ai" | "rules"; warning?: string } | null>(null);

  async function run() {
    setState("loading");
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, event: context.event, crowd: context.crowd, risks: context.risks, photo: photo ? { mime: photo.mime, data: photo.data } : undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-3xl border-2 border-qloo/40 bg-qloo-wash p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Icon name="spark" className="size-5 text-qloo" /> AI layout review
          </h4>
          <p className="text-sm text-ink-2">Spot crushes, blocked exits and queue clashes before the night. Add a stage or venue photo for a hazard check.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-hair bg-surface px-3 py-2 text-sm font-semibold text-ink hover:border-ink">
            📷 {photo ? "Change photo" : "Add stage photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await toJpeg(f).catch(() => null));
              }}
            />
          </label>
          <button
            type="button"
            onClick={run}
            disabled={state === "loading" || (layout.zones.length === 0 && !photo)}
            className="inline-flex items-center gap-2 rounded-xl bg-volt px-4 py-2 font-display text-sm font-bold text-volt-ink disabled:opacity-50"
          >
            {state === "loading" ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="search" />}
            Review my layout
          </button>
        </div>
      </div>

      {photo && (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
          <img src={photo.preview} alt="Stage photo to review" className="h-16 w-24 rounded-xl object-cover" />
          <button type="button" onClick={() => setPhoto(null)} className="text-xs text-muted hover:text-ink">
            Remove photo
          </button>
        </div>
      )}
      {layout.zones.length === 0 && !photo && <p className="mt-3 text-xs text-muted">Place a few things on the map first (or add a photo).</p>}
      {state === "error" && <p className="mt-3 text-sm text-critical">The review didn&apos;t go through. Try again in a moment.</p>}

      {result && (
        <div className="animate-row-in mt-4 grid gap-3">
          <p className="text-[15px] font-medium text-ink">{result.review.summary}</p>
          {result.source === "rules" && (
            <p className="text-xs text-muted">{result.warning ?? "Showing the fixed safety checks (AI review needs a Gemini key)."}</p>
          )}
          <ul className="grid gap-2 md:grid-cols-2">
            {result.review.issues.map((i, n) => (
              <li key={n}>
                <button type="button" onClick={() => onFocus(i.zoneIds)} className="grid h-full w-full gap-1 rounded-2xl border border-hair bg-surface p-3 text-left transition hover:border-ink">
                  <span className="flex items-start gap-2 text-sm font-semibold text-ink">
                    <SevPill s={i.severity} />
                    {i.title}
                  </span>
                  <span className="text-xs text-ink-2">{i.detail}</span>
                  <span className="text-xs font-semibold text-ink">Fix: {i.fix}</span>
                  {i.zoneIds.length > 0 && <span className="text-[11px] text-muted">Click to show on the map</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">AI suggestions support, and never replace, a professional safety assessment.</p>
        </div>
      )}
    </div>
  );
}
