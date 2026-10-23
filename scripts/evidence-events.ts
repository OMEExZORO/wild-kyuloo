import { PRESETS } from "../src/lib/presets";
import type { EventInput } from "../src/lib/types";

// Events for the "does Qloo make plans better?" evidence run (docs/qloo-evidence.md).
// A mix of US / UK / India and music / comedy. The first three are the UI presets.
// Only public venues and acts: never put personal data here (it is sent to Qloo).
export const EVIDENCE_EVENTS: { name: string; region: "US" | "UK" | "IN"; kind: "music" | "comedy" | "fest"; input: EventInput }[] = [
  { ...PRESETS[0], region: "US", kind: "music" },
  { ...PRESETS[1], region: "US", kind: "comedy" },
  { ...PRESETS[2], region: "IN", kind: "fest" },
  {
    name: "Arena show in Colorado",
    region: "US",
    kind: "music",
    input: { venue: "Red Rocks Amphitheatre, Morrison, Colorado", act: "Khruangbin", date: "2026-11-14", startTime: "18:30", durationHours: 4, attendance: 9500, volunteers: 80, budget: "$20,000", foodStalls: 12 },
  },
  {
    name: "Electronic gig in London",
    region: "UK",
    kind: "music",
    input: { venue: "O2 Academy Brixton, London", act: "Fred again..", date: "2026-11-28", startTime: "19:00", durationHours: 4, attendance: 4900, volunteers: 50, budget: "£10,000", foodStalls: 6 },
  },
  {
    name: "Comedy night in London",
    region: "UK",
    kind: "comedy",
    input: { venue: "Eventim Apollo, Hammersmith, London", act: "Romesh Ranganathan", date: "2026-12-03", startTime: "19:30", durationHours: 3, attendance: 3600, volunteers: 35, budget: "£6,000", foodStalls: 4 },
  },
  {
    name: "Indie gig in Mumbai",
    region: "IN",
    kind: "music",
    input: { venue: "NSCI Dome, Worli, Mumbai", act: "Anuv Jain", date: "2026-12-19", startTime: "18:00", durationHours: 4, attendance: 4000, volunteers: 45, budget: "₹4,00,000", foodStalls: 10 },
  },
  {
    name: "Stand-up show in Bengaluru",
    region: "IN",
    kind: "comedy",
    input: { venue: "Chowdiah Memorial Hall, Bengaluru", act: "Zakir Khan", date: "2026-12-26", startTime: "19:00", durationHours: 3, attendance: 1100, volunteers: 20, budget: "₹1,50,000", foodStalls: 4 },
  },
];
