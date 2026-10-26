import type { EventInput, Plan } from "./types";

// Site layout: what the organiser places on the venue map, plus the fixed
// safety checks run on it. Shared by the map (browser) and the AI review (server).

export const ZONE_KINDS = {
  stage: { label: "Stage", emoji: "🎤" },
  entrance: { label: "Entrance", emoji: "🎟️" },
  exit: { label: "Exit", emoji: "🚪" },
  food: { label: "Food stall", emoji: "🍜" },
  bar: { label: "Bar", emoji: "🍹" },
  merch: { label: "Merch", emoji: "👕" },
  firstaid: { label: "First aid", emoji: "⛑️" },
  toilets: { label: "Toilets", emoji: "🚻" },
  volunteer: { label: "Volunteer post", emoji: "🙋" },
  parking: { label: "Parking", emoji: "🅿️" },
} as const;
export type ZoneKind = keyof typeof ZONE_KINDS;

export interface Zone {
  id: string;
  kind: ZoneKind;
  label: string;
  lat: number;
  lon: number;
  qty: number; // e.g. a toilet block of 6 units
  widthM?: number; // exits and entrances: clear width in metres (unset: EXIT_WIDTH_DEFAULT_M)
}

export interface CrowdArea {
  id: string;
  label: string;
  points: [number, number][]; // [lat, lon]
}

export interface Layout {
  v: 1;
  center: [number, number];
  zones: Zone[];
  areas: CrowdArea[];
}

export const newId = () => Math.random().toString(36).slice(2, 8);

export function emptyLayout(center: [number, number]): Layout {
  return { v: 1, center, zones: [], areas: [] };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Polygon area in m² (local equirectangular projection; fine at venue scale).
export function areaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const lat0 = (points.reduce((s, p) => s + p[0], 0) / points.length) * (Math.PI / 180);
  const xy = points.map(([lat, lon]) => [lon * 111320 * Math.cos(lat0), lat * 110540]);
  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// ---------------------------------------------------------------------------
// What the plan says should be on the map
// ---------------------------------------------------------------------------
export function plannedCounts(plan: Plan | undefined, event: EventInput | undefined): Partial<Record<ZoneKind, number>> {
  const attendance = event?.attendance ?? 0;
  return {
    stage: 1,
    entrance: plan?.venue.entrances ?? 1,
    exit: Math.max(2, Math.ceil(attendance / 1500)),
    food: plan ? plan.foodAndDrink.stallMix.reduce((s, x) => s + x.count, 0) : event?.foodStalls ?? 0,
    firstaid: Math.max(1, Math.ceil(attendance / 3000)),
    toilets: Math.max(1, Math.ceil(attendance / 100)), // units, not blocks
    volunteer: plan?.volunteers.stations.filter((s) => s.count > 0).length ?? 0,
  };
}

export function placedCounts(layout: Layout): Partial<Record<ZoneKind, number>> {
  const out: Partial<Record<ZoneKind, number>> = {};
  for (const z of layout.zones) out[z.kind] = (out[z.kind] ?? 0) + (z.kind === "toilets" || z.kind === "food" ? z.qty : 1);
  return out;
}

// ---------------------------------------------------------------------------
// Fixed safety checks. Rules of thumb for outdoor/standing events (e.g. about
// 2 people per m² comfortable standing, 3 per m² maximum; ~1 toilet per 100).
// They support, and never replace, a professional safety plan.
// ---------------------------------------------------------------------------
// Egress planning figures. The UK Green Guide plans level exits at about 82 people
// per metre of clear width per minute, and outdoor venues at an 8-minute exit time.
export const EXIT_FLOW_PER_M_MIN = 82;
export const EGRESS_LIMIT_MIN = 8;
export const EXIT_WIDTH_DEFAULT_M = 2;
// Above about 4 people per m², a moving crowd is at risk of crushing.
export const CRUSH_DENSITY = 4;

export const isWayOut = (z: Zone) => z.kind === "exit" || z.kind === "entrance";
export const exitWidth = (z: Zone) => z.widthM ?? EXIT_WIDTH_DEFAULT_M;

export type Severity = "critical" | "warning" | "ok";
export interface Check {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  zoneIds: string[];
}

export function runChecks(layout: Layout, attendance: number): Check[] {
  const checks: Check[] = [];
  const of = (k: ZoneKind) => layout.zones.filter((z) => z.kind === k);
  const nearest = (from: Zone, kind: ZoneKind) =>
    of(kind).map((z) => ({ z, d: distanceM(from, z) })).sort((a, b) => a.d - b.d)[0];

  // Crowd density
  const area = layout.areas.reduce((s, a) => s + areaM2(a.points), 0);
  if (layout.areas.length === 0) {
    checks.push({ id: "area-missing", severity: "warning", title: "No standing area drawn", detail: "Draw the crowd area so Crowd Kit can check how many people fit.", zoneIds: [] });
  } else {
    const comfortable = Math.floor(area * 2);
    const max = Math.floor(area * 3);
    const density = area > 0 ? attendance / area : Infinity;
    const sev: Severity = attendance > max ? "critical" : attendance > comfortable ? "warning" : "ok";
    checks.push({
      id: "density",
      severity: sev,
      title:
        density > CRUSH_DENSITY
          ? `Crush risk: ${density.toFixed(1)} people per m²`
          : sev === "ok" ? "Standing area fits the crowd" : sev === "warning" ? "Standing area will be tight" : "Standing area is too small",
      detail:
        `${Math.round(area).toLocaleString()} m² fits about ${comfortable.toLocaleString()} people comfortably (${max.toLocaleString()} max); ${attendance.toLocaleString()} expected, ${density.toFixed(1)} per m².` +
        (density > CRUSH_DENSITY ? ` Above ${CRUSH_DENSITY} per m² a moving crowd can crush: enlarge the area, cap entry, or split the crowd into pens.` : ""),
      zoneIds: layout.areas.map((a) => a.id),
    });
  }

  // How long everyone takes to get out, and again with the widest way out blocked.
  const waysOut = layout.zones.filter(isWayOut);
  if (waysOut.length && attendance > 0) {
    const widths = waysOut.map(exitWidth).sort((a, b) => b - a);
    const total = widths.reduce((s, w) => s + w, 0);
    const minutes = (w: number) => attendance / (w * EXIT_FLOW_PER_M_MIN);
    const all = minutes(total);
    const blocked = widths.length > 1 ? minutes(total - widths[0]) : Infinity;
    const needM = Math.ceil((attendance / (EXIT_FLOW_PER_M_MIN * EGRESS_LIMIT_MIN)) * 10) / 10;
    const assumed = waysOut.filter((z) => z.widthM === undefined).length;
    const fmt = (m: number) => (m === Infinity ? "no way out" : `${m < 10 ? m.toFixed(1) : Math.round(m)} min`);
    const severity: Severity = all > EGRESS_LIMIT_MIN ? "critical" : blocked > EGRESS_LIMIT_MIN ? "warning" : "ok";
    checks.push({
      id: "egress",
      severity,
      title:
        severity === "critical" ? `Too slow to get out: about ${fmt(all)}` : severity === "warning" ? "Too slow if one exit is blocked" : `Everyone out in about ${fmt(all)}`,
      detail:
        `${total.toLocaleString()} m of exit width for ${attendance.toLocaleString()} people: about ${fmt(all)} (limit ${EGRESS_LIMIT_MIN} min), ` +
        `${widths.length > 1 ? `${fmt(blocked)} with the widest exit blocked` : "and nothing left if that exit is blocked"}. ` +
        `Needs at least ${needM} m in total, plus spare for a blocked exit.` +
        (assumed ? ` ${assumed} of ${waysOut.length} widths assumed ${EXIT_WIDTH_DEFAULT_M} m: click an exit to set its real width.` : ""),
      zoneIds: waysOut.map((z) => z.id),
    });
  }

  // Ways out
  const exits = of("exit").length + of("entrance").length;
  const needExits = Math.max(2, Math.ceil(attendance / 1500));
  checks.push({
    id: "exits",
    severity: exits === 0 ? "critical" : exits < needExits ? "warning" : "ok",
    title: exits < needExits ? "Not enough ways out" : "Enough ways out",
    detail: `${exits} entrance/exit point${exits === 1 ? "" : "s"} placed; aim for at least ${needExits} for ${attendance.toLocaleString()} people.`,
    zoneIds: [...of("exit"), ...of("entrance")].map((z) => z.id),
  });

  // First aid near the stage
  const stage = of("stage")[0];
  if (of("firstaid").length === 0) {
    checks.push({ id: "firstaid", severity: "critical", title: "No first aid point", detail: "Place at least one first aid point.", zoneIds: [] });
  } else if (stage) {
    const n = nearest(stage, "firstaid")!;
    checks.push({
      id: "firstaid",
      severity: n.d > 150 ? "warning" : "ok",
      title: n.d > 150 ? "First aid is far from the stage" : "First aid is close to the stage",
      detail: `Nearest first aid is ${Math.round(n.d)} m from the stage (aim for under 150 m).`,
      zoneIds: [stage.id, n.z.id],
    });
  }

  // Toilets
  const toiletUnits = of("toilets").reduce((s, z) => s + z.qty, 0);
  const needToilets = Math.ceil(attendance / 100);
  checks.push({
    id: "toilets",
    severity: toiletUnits === 0 ? "critical" : toiletUnits < needToilets ? "warning" : "ok",
    title: toiletUnits < needToilets ? "Too few toilets" : "Enough toilets",
    detail: `${toiletUnits} toilet unit${toiletUnits === 1 ? "" : "s"} placed; about ${needToilets} needed (1 per 100 people).`,
    zoneIds: of("toilets").map((z) => z.id),
  });

  // Queues next to entrances
  const queueMakers = [...of("food"), ...of("bar"), ...of("merch")];
  const clashes = queueMakers.flatMap((q) => of("entrance").filter((e) => distanceM(q, e) < 20).map((e) => [q, e] as const));
  if (clashes.length) {
    checks.push({
      id: "queues",
      severity: "warning",
      title: "Queues will block an entrance",
      detail: `${clashes.length} stall/bar/merch point${clashes.length === 1 ? " is" : "s are"} within 20 m of an entrance, so their queues will meet the arrival flow.`,
      zoneIds: [...new Set(clashes.flat().map((z) => z.id))],
    });
  }

  // Stage too far from any exit
  if (stage && exits > 0) {
    const toExit = [...of("exit"), ...of("entrance")].map((z) => ({ z, d: distanceM(stage, z) })).sort((a, b) => a.d - b.d)[0];
    if (toExit.d > 250) {
      checks.push({ id: "stage-exit", severity: "warning", title: "Long way from the stage to an exit", detail: `The nearest exit is ${Math.round(toExit.d)} m from the stage.`, zoneIds: [stage.id, toExit.z.id] });
    }
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Share links: the whole layout lives in the URL hash, no server needed.
// ---------------------------------------------------------------------------
export function encodeLayout(layout: Layout): string {
  const bytes = new TextEncoder().encode(JSON.stringify(layout));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeLayout(s: string): Layout | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const l = JSON.parse(json) as Layout;
    return l && l.v === 1 && Array.isArray(l.zones) && Array.isArray(l.areas) ? l : null;
  } catch {
    return null;
  }
}

// Plain-text summary for the AI review.
export function describeLayout(layout: Layout): string {
  const lines = layout.zones.map(
    (z) =>
      `${z.id}: ${ZONE_KINDS[z.kind].label}${z.qty > 1 ? ` x${z.qty}` : ""}${isWayOut(z) ? ` ${exitWidth(z)} m wide${z.widthM === undefined ? " (assumed)" : ""}` : ""} "${z.label}" at ${z.lat.toFixed(5)},${z.lon.toFixed(5)}`,
  );
  const areas = layout.areas.map((a) => `${a.id}: standing area "${a.label}" ${Math.round(areaM2(a.points))} m²`);
  const stage = layout.zones.find((z) => z.kind === "stage");
  const dists = stage
    ? layout.zones.filter((z) => z.id !== stage.id).map((z) => `${ZONE_KINDS[z.kind].label} ${z.id} is ${Math.round(distanceM(stage, z))} m from the stage`)
    : [];
  return [...lines, ...areas, ...dists].join("\n");
}

// ---------------------------------------------------------------------------
// What the map needs to know about the event. Share links carry it too, so
// /map works on a teammate's phone without the plan.
// ---------------------------------------------------------------------------
export interface MapContext {
  event: { act: string; venue: string; date: string; attendance: number; volunteers: number };
  center: [number, number] | null; // null: geocode the venue
  planned: Partial<Record<ZoneKind, number>>;
  crowd?: string;
  risks?: string;
}

const toB64 = (text: string) => {
  let bin = "";
  new TextEncoder().encode(text).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export const encodeContext = (ctx: MapContext) => toB64(JSON.stringify(ctx));

export function decodeContext(s: string): MapContext | null {
  try {
    const ctx = JSON.parse(fromB64(s)) as MapContext;
    return ctx?.event?.venue ? ctx : null;
  } catch {
    return null;
  }
}
