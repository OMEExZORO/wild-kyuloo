import type { ToolResult } from "../types";

// Deterministic volunteer planner. The LLM never invents headcounts: it calls
// this with crowd-derived weights (from Qloo) and explains the result.
// Ratios are rules of thumb for community/festival events; tune with real planners.

export interface StaffingInput {
  attendance: number;
  volunteers: number;
  entrances: number;
  durationHours: number;
  startTime: string; // "18:00"
  foodStalls: number;
  merchWeight: number; // 0.5 (crowd rarely buys merch) .. 2 (merch-heavy fanbase)
  accessibilityWeight: number; // 0.5 .. 2 (older crowd, families, mobility needs)
  alcohol: boolean;
}

interface Station { station: string; count: number; notes: string }

export function planStaffing(i: StaffingInput): ToolResult {
  const per = (n: number, ratio: number, min: number) => Math.max(min, Math.ceil(n / ratio));
  const ideal: Station[] = [
    { station: "Entry & ticket check", count: Math.max(i.entrances * 2, per(i.attendance, 250, 2)), notes: `${i.entrances} entrance(s), peak arrival in the first 60-90 min` },
    { station: "Food & drink support", count: Math.ceil(i.foodStalls * 0.5) + per(i.attendance, 1000, 1), notes: "Queue marshals and runners; vendors staff their own stalls" },
    { station: "Merch", count: Math.round(per(i.attendance, 600, 1) * i.merchWeight), notes: "Scaled by how merch-heavy this fanbase is" },
    { station: "Info & accessibility desk", count: Math.round(per(i.attendance, 1000, 2) * i.accessibilityWeight), notes: "Scaled by accessibility needs of the crowd" },
    { station: "First aid support", count: per(i.attendance, 1000, 2), notes: "Supports, never replaces, licensed medical staff" },
    { station: "Crowd flow & stage barrier", count: per(i.attendance, 500, 2), notes: "Pinch points, exits, barrier line" },
    { station: "Waste & recycling", count: per(i.attendance, 750, 1), notes: "Bin stations near food" },
  ];
  if (i.alcohol) ideal.push({ station: "ID check at bars", count: per(i.attendance, 1500, 1), notes: "Alcohol service present" });

  const perShift = ideal.reduce((s, x) => s + x.count, 0);
  const twoShifts = i.durationHours > 5;
  const recommended = twoShifts ? Math.ceil(perShift * 1.6) : perShift; // shifts overlap at peak

  const [h, m] = i.startTime.split(":").map(Number);
  const fmt = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const start = h * 60 + (m || 0) - 60; // volunteers arrive an hour early
  const end = h * 60 + (m || 0) + i.durationHours * 60 + 30;
  const mid = Math.round((start + end) / 2 / 15) * 15;
  const shifts = twoShifts
    ? [{ label: "Shift A", start: fmt(start), end: fmt(mid + 30) }, { label: "Shift B", start: fmt(mid - 30), end: fmt(end) }]
    : [{ label: "Full event", start: fmt(start), end: fmt(end) }];

  // Scale down proportionally if short, keeping minimums for safety-critical stations.
  const warnings: string[] = [];
  const available = twoShifts ? Math.floor(i.volunteers / 1.6) : i.volunteers;
  let stations = ideal;
  if (available < perShift) {
    const ratio = available / perShift;
    stations = ideal.map((s) => {
      const critical = /Entry|First aid|Crowd/.test(s.station);
      return { ...s, count: Math.max(critical ? Math.min(s.count, 2) : 0, Math.floor(s.count * ratio)) };
    });
    warnings.push(`You have ${i.volunteers} volunteers; this event needs about ${recommended}. Safety-critical stations were protected first.`);
  }

  return {
    data: { available: i.volunteers, recommended, perShift, shifts, stations, warnings },
    source: "calc",
    cached: false,
  };
}
