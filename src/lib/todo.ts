import type { Plan } from "./types";

// Turns a plan into the organiser's to-do list. Ticks are remembered per plan
// in the browser (see ToDoList), so ids must be stable for the same plan.

export interface ToDo {
  id: string;
  group: "Food & drink" | "Sponsors" | "Team" | "Venue" | "Merch" | "Vibe";
  text: string;
  detail?: string;
  copy?: string; // text for a "Copy" button, e.g. a sponsor pitch
}

export function planKey(plan: Plan): string {
  let h = 0;
  for (const ch of plan.summary) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `ck-todo-${(h >>> 0).toString(36)}`;
}

export function todosFor(plan: Plan): ToDo[] {
  const items: ToDo[] = [];
  plan.foodAndDrink.vendorsToInvite.forEach((v, i) =>
    items.push({ id: `vendor-${i}`, group: "Food & drink", text: `Invite ${v.name} for a stall`, detail: v.why }),
  );
  plan.sponsors.forEach((s, i) =>
    items.push({ id: `sponsor-${i}`, group: "Sponsors", text: `Pitch ${s.brand}`, detail: s.why, copy: s.pitch }),
  );
  plan.volunteers.stations
    .filter((s) => s.count > 0)
    .forEach((s, i) => items.push({ id: `station-${i}`, group: "Team", text: `Brief ${s.count} volunteer${s.count === 1 ? "" : "s"} for ${s.station}`, detail: s.notes }));
  plan.venue.risks.forEach((r, i) => items.push({ id: `risk-${i}`, group: "Venue", text: r.mitigation, detail: r.risk }));
  plan.merch.forEach((m, i) => items.push({ id: `merch-${i}`, group: "Merch", text: `Source ${m.idea}`, detail: m.why }));
  if (plan.vibe.playlist.length) {
    items.push({
      id: "playlist",
      group: "Vibe",
      text: `Queue the pre-show playlist (${plan.vibe.playlist.length} artists)`,
      detail: plan.vibe.playlist.map((p) => p.artist).join(", "),
      copy: plan.vibe.playlist.map((p) => p.artist).join("\n"),
    });
  }
  return items;
}
