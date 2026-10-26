import type { Plan } from "./types";

// "Same venue, different crowd": compares two Qloo-backed plans for one venue.
// Code computes every difference; nothing here is written by the model.

export interface Side {
  name: string;
  plan: Plan;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

// Items in only one plan, and items both plans share (matched by normalised name).
export function overlap<T>(a: T[], b: T[], key: (t: T) => string) {
  const inB = new Set(b.map((t) => norm(key(t))));
  const inA = new Set(a.map((t) => norm(key(t))));
  return {
    onlyA: a.filter((t) => !inB.has(norm(key(t)))),
    onlyB: b.filter((t) => !inA.has(norm(key(t)))),
    shared: new Set([...inA].filter((k) => inB.has(k))),
  };
}
export const isShared = (shared: Set<string>, name: string) => shared.has(norm(name));

// Volunteers per station, both plans side by side, biggest change first.
export function stationRows(a: Plan, b: Plan) {
  const rows = new Map<string, { station: string; a: number; b: number }>();
  for (const s of a.volunteers.stations) rows.set(norm(s.station), { station: s.station, a: s.count, b: 0 });
  for (const s of b.volunteers.stations) {
    const row = rows.get(norm(s.station));
    if (row) row.b = s.count;
    else rows.set(norm(s.station), { station: s.station, a: 0, b: s.count });
  }
  return [...rows.values()].map((r) => ({ ...r, delta: r.b - r.a })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// The age band and gender a crowd over-indexes on most (Qloo affinity, -1..+1).
export function skew(plan: Plan) {
  const age = [...plan.crowd.ageIndex].sort((x, y) => y.index - x.index)[0];
  const gender = [...plan.crowd.genderIndex].sort((x, y) => y.index - x.index)[0];
  return { age: age && age.index > 0 ? age.band : null, gender: gender && gender.index > 0.05 ? gender.label.toLowerCase() : null };
}

const band = (b: string) =>
  b.replace(/^(\d+)_and_younger$/, "under $1").replace(/^(\d+)_and_older$/, "$1+").replace(/^(\d+)_to_(\d+)$/, "$1–$2").replace(/_/g, " ");
const poss = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Plain-language headline changes, from A's night to B's night.
export function headlineChanges(A: Side, B: Side): string[] {
  const out: string[] = [];
  const sa = skew(A.plan);
  const sb = skew(B.plan);
  const age = ageShift(A, B);
  if (age) out.push(age);
  if (sa.gender !== sb.gender && (sa.gender || sb.gender)) {
    const lean = (s: Side, g: string | null) => (g ? `${poss(s.name)} crowd leans ${g}` : `${poss(s.name)} is close to typical`);
    out.push(`${lean(A, sa.gender)}; ${lean(B, sb.gender)}.`);
  }

  const va = A.plan.volunteers.recommended;
  const vb = B.plan.volunteers.recommended;
  const moved = stationRows(A.plan, B.plan).filter((r) => r.delta !== 0);
  if (va !== vb || moved.length) {
    const top = moved.slice(0, 3).map((r) => `${r.station} ${r.a} → ${r.b}`).join(", ");
    out.push(`Volunteers: ${va} → ${vb} recommended${top ? ` (${top})` : ""}.`);
  } else {
    out.push(`Volunteers: the same ${va} at the same stations. Same room and headcount, so the staffing formula doesn't move.`);
  }

  const food = overlap(A.plan.foodAndDrink.stallMix, B.plan.foodAndDrink.stallMix, (s) => s.concept);
  out.push(
    food.shared.size
      ? `Food: ${plural(food.shared.size, "stall concept")} carry over; ${plural(food.onlyB.length, "new one")} for ${B.name}.`
      : `Food: a completely different stall mix (${plural(B.plan.foodAndDrink.stallMix.length, "concept")}, none carried over).`,
  );

  const spons = overlap(A.plan.sponsors, B.plan.sponsors, (s) => s.brand);
  out.push(spons.shared.size ? `Sponsors: ${spons.shared.size} of ${B.plan.sponsors.length} still fit; pitch ${plural(spons.onlyB.length, "new brand")}.` : `Sponsors: none carry over. Pitch a different list of ${plural(B.plan.sponsors.length, "brand")}.`);

  const music = overlap(A.plan.vibe.playlist, B.plan.vibe.playlist, (p) => p.artist);
  out.push(`Pre-show playlist: ${music.shared.size ? `${music.shared.size} artists in common` : "no artists in common"}.`);
  return out;
}

// Rough middle age of each Qloo band, for telling which crowd skews older.
function bandAge(b: string) {
  const n = (b.match(/\d+/g) ?? []).map(Number);
  if (/younger/.test(b)) return (n[0] ?? 24) - 3;
  if (/older/.test(b)) return (n[0] ?? 55) + 5;
  return n.length === 2 ? (n[0] + n[1]) / 2 : NaN;
}

// Which crowd skews older, and the age band where the two differ most.
function ageShift(A: Side, B: Side): string | null {
  const a = A.plan.crowd.ageIndex;
  const b = B.plan.crowd.ageIndex;
  if (!a.length || !b.length) return null;
  // Centre of each crowd's over-represented ages (positive indices only).
  const centre = (rows: typeof a) => {
    const pos = rows.filter((r) => r.index > 0 && !Number.isNaN(bandAge(r.band)));
    const w = pos.reduce((s, r) => s + r.index, 0);
    return w ? pos.reduce((s, r) => s + bandAge(r.band) * r.index, 0) / w : NaN;
  };
  const gaps = a
    .map((r) => ({ band: r.band, a: r.index, b: b.find((x) => x.band === r.band)?.index }))
    .filter((r): r is { band: string; a: number; b: number } => r.b !== undefined)
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a));
  const top = gaps[0];
  const pts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v * 100))}`;
  const diff = centre(B.plan.crowd.ageIndex) - centre(a);
  const where = top && Math.abs(top.b - top.a) >= 0.2 ? ` Biggest gap: ages ${band(top.band)} (${pts(top.a)} for ${A.name}, ${pts(top.b)} for ${B.name}).` : "";
  if (Number.isNaN(diff) || Math.abs(diff) < 2) return `Similar ages on both nights.${where}`;
  return `${poss(B.name)} crowd skews ${diff > 0 ? "older" : "younger"} than ${poss(A.name)}.${where}`;
}
