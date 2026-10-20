import type { AgentEvent, Plan } from "./types";

// Demo mode (CROWDKIT_DEMO=1): canned trace + plans so the frontend can be
// built with no Anthropic or Qloo key and no API cost. Everything Qloo-shaped
// here is labelled "mock": it is sample content, not real Qloo output.

export const DEMO_TRACE: AgentEvent[] = [
  { type: "status", message: "Demo mode: canned data, no API calls" },
  { type: "tool_call", id: "d1", tool: "qloo_describe", input: { entity: "Phoebe Bridgers", type: "artist" } },
  { type: "tool_result", id: "d1", tool: "qloo_describe", source: "mock", cached: false, status: "ok", preview: "Matched Phoebe Bridgers (artist, indie folk)" },
  { type: "tool_call", id: "d2", tool: "qloo_audience_demographics", input: { entity: "Phoebe Bridgers" } },
  { type: "tool_result", id: "d2", tool: "qloo_audience_demographics", source: "mock", cached: false, status: "ok", preview: "Audience skews 18-29 and female" },
  { type: "tool_call", id: "d3", tool: "geocode_venue", input: { query: "The Fillmore, San Francisco" } },
  { type: "tool_result", id: "d3", tool: "geocode_venue", source: "osm", cached: true, preview: "The Fillmore, 1805 Geary Blvd, San Francisco (37.784, -122.433)" },
  { type: "tool_call", id: "d4", tool: "web_search", input: { query: "The Fillmore San Francisco capacity entrances bag policy" } },
  { type: "tool_call", id: "d5", tool: "qloo_recommend", input: { target_type: "brand", signals: ["Phoebe Bridgers"] } },
  { type: "tool_result", id: "d5", tool: "qloo_recommend", source: "mock", cached: false, status: "ok", preview: "5 brands returned" },
  { type: "tool_call", id: "d6", tool: "qloo_compare_audiences", input: { group_a: ["Phoebe Bridgers"], group_b: ["Recent Fillmore acts"] } },
  { type: "tool_result", id: "d6", tool: "qloo_compare_audiences", source: "mock", cached: false, status: "ok", preview: "Differences found in 3 categories" },
  { type: "tool_call", id: "d7", tool: "qloo_rank", input: { options: ["Sample Vendor A", "Sample Vendor B", "Sample Vendor C"], option_type: "place" } },
  { type: "tool_result", id: "d7", tool: "qloo_rank", source: "mock", cached: false, status: "ok", preview: "Ranked 3 options" },
  { type: "tool_call", id: "d8", tool: "weather_for_date", input: { lat: 37.784, lon: -122.433, date: "2026-11-21" } },
  { type: "tool_result", id: "d8", tool: "weather_for_date", source: "weather", cached: false, preview: "High 17°C, low 10°C, 20% chance of rain" },
  { type: "tool_call", id: "d9", tool: "plan_volunteers", input: { attendance: 1150, volunteers: 30 } },
  { type: "tool_result", id: "d9", tool: "plan_volunteers", source: "calc", cached: false, preview: "23 recommended across 8 stations" },
  { type: "status", message: "Plan submitted" },
];

const mock = (evidence: string) => ({ source: "mock" as const, evidence: `Sample data: ${evidence}` });

export const DEMO_PLAN: Plan = {
  summary:
    "A sold-out indie-folk night with a young, mostly female crowd that over-indexes on coffee culture, vintage fashion and plant-based food. Lean the stalls toward vegan and café concepts, pitch two lifestyle brands for sponsorship, and put extra volunteers on merch, where this fanbase queues longest.",
  crowd: {
    headline: "Young indie-folk fans, mostly 18-29, mostly female",
    ageMix: [
      { band: "18-24", share: 0.38 },
      { band: "25-29", share: 0.31 },
      { band: "30-34", share: 0.17 },
      { band: "35+", share: 0.14 },
    ],
    genderMix: [
      { label: "Female", share: 0.64 },
      { label: "Male", share: 0.33 },
      { label: "Other", share: 0.03 },
    ],
    loves: [
      { category: "Food", items: ["Plant-based bowls", "Third-wave coffee", "Bakery"], ...mock("fans over-index on vegan and café places") },
      { category: "Brands", items: ["Sample Outdoor Brand", "Sample Vinyl Label", "Sample Thrift Store"], ...mock("brand affinities for the act") },
      { category: "Music", items: ["Sample Artist 1", "Sample Artist 2", "Sample Artist 3"], ...mock("artists fans also like") },
    ],
    vsRegulars: [
      { difference: "Younger than the venue's usual rock crowd", ...mock("compare_audiences, act vs recent Fillmore acts") },
      { difference: "Much stronger interest in coffee and vegan food", ...mock("compare_audiences, food tags") },
      { difference: "Weaker interest in craft beer than usual", ...mock("compare_audiences, drink tags") },
    ],
  },
  venue: {
    name: "The Fillmore",
    address: "1805 Geary Blvd, San Francisco, CA 94115",
    lat: 37.7841,
    lon: -122.4332,
    capacity: 1150,
    entrances: 2,
    facts: [
      { fact: "Historic ballroom with a standing-room floor and a small balcony", source: "web", evidence: "Sample web result" },
      { fact: "Several bus lines stop on Geary Blvd nearby", source: "osm", evidence: "Sample OpenStreetMap transit count" },
    ],
    transit: ["Geary Blvd bus lines", "Rideshare drop-off on Fillmore St"],
    parking: ["Japan Center garage (about 5 min walk)"],
    risks: [
      { risk: "Light rain possible during doors", mitigation: "Put the merch queue under cover and hand out ponchos at the line", source: "weather", evidence: "Sample forecast: 20% chance of rain" },
      { risk: "Merch queue blocking the lobby", mitigation: "Open a second merch point on the balcony level", source: "llm", evidence: "Planner judgement for a merch-heavy fanbase" },
    ],
  },
  foodAndDrink: {
    stallMix: [
      { concept: "Vegan bowls", count: 2, why: "Strongest food affinity for this crowd", ...mock("vegan places rank highest") },
      { concept: "Specialty coffee and tea", count: 2, why: "Coffee culture over-indexes strongly", ...mock("café affinity") },
      { concept: "Bakery and sweets", count: 1, why: "Late-night sweet tooth", ...mock("bakery affinity") },
      { concept: "Classic burgers", count: 1, why: "Keeps a familiar option for the rest of the crowd", source: "llm", evidence: "Balance for non-core fans" },
    ],
    vendorsToInvite: [
      { name: "Sample Vendor A", why: "Ranked first for this audience among places within 1 km", ...mock("qloo_rank score 0.91") },
      { name: "Sample Vendor B", why: "Ranked second", ...mock("qloo_rank score 0.84") },
    ],
    drinks: [
      { item: "Oat-milk lattes and cold brew", why: "Coffee affinity", ...mock("café affinity") },
      { item: "Natural wine and low-alcohol options", why: "Weaker craft-beer interest than the venue's usual crowd", ...mock("compare_audiences") },
    ],
  },
  sponsors: [
    { brand: "Sample Outdoor Brand", why: "Fans over-index on this brand", pitch: "Your customers are already in the room: co-brand the poster and the tote bag.", ...mock("brand affinity 0.88") },
    { brand: "Sample Vinyl Label", why: "Strong overlap with the act's audience", pitch: "Sponsor a listening corner in the lobby before doors.", ...mock("brand affinity 0.82") },
  ],
  merch: [
    { idea: "Screen-printed tote bags in muted colours", why: "Vintage and thrift fashion affinity", ...mock("fashion tags") },
    { idea: "Limited tour poster, numbered", why: "Collector behaviour typical of this fanbase", source: "llm", evidence: "Planner judgement" },
  ],
  volunteers: {
    available: 30,
    recommended: 23,
    shifts: [{ label: "Full event", start: "18:00", end: "23:30" }],
    stations: [
      { station: "Entry & ticket check", count: 5, notes: "2 entrances, peak arrival in the first 60-90 min" },
      { station: "Food & drink support", count: 5, notes: "Queue marshals and runners" },
      { station: "Merch", count: 5, notes: "Raised for a merch-heavy fanbase" },
      { station: "Info & accessibility desk", count: 2, notes: "Standard for this crowd" },
      { station: "First aid support", count: 2, notes: "Supports licensed medical staff" },
      { station: "Crowd flow & stage barrier", count: 3, notes: "Pinch points and exits" },
      { station: "Waste & recycling", count: 2, notes: "Bin stations near food" },
      { station: "ID check at bars", count: 1, notes: "Alcohol service present" },
    ],
    warnings: [],
  },
  vibe: {
    playlist: [
      { artist: "Sample Artist 1", why: "Fans of the act also like this artist", ...mock("artist affinity") },
      { artist: "Sample Artist 2", why: "Rising with this audience", ...mock("trends") },
    ],
    themeIdeas: ["Cosy autumn lobby with warm lighting", "Handwritten setlist wall for fan photos"],
  },
  assumptions: ["Matched 'Phoebe Bridgers' to the indie-folk artist (demo)", "Assumed the event sells out at venue capacity"],
  limitations: [
    "Demo data: Qloo items are samples, not real Qloo results",
    "Qloo affinities describe audiences in aggregate, not individual attendees",
  ],
};

// What the same request looks like from an LLM alone: generic, no named evidence.
export const DEMO_BASELINE: Plan = {
  ...DEMO_PLAN,
  summary: "A typical concert night. Offer a range of food and drink options, recruit relevant sponsors, and staff the main areas of the venue.",
  crowd: {
    headline: "Concert-goers of mixed ages",
    ageMix: [],
    genderMix: [],
    loves: [{ category: "General", items: ["Music", "Food", "Drinks"], source: "llm", evidence: "General knowledge" }],
    vsRegulars: [],
  },
  foodAndDrink: {
    stallMix: [
      { concept: "Burgers", count: 2, why: "Popular at concerts", source: "llm", evidence: "General knowledge" },
      { concept: "Pizza", count: 2, why: "Easy to eat standing", source: "llm", evidence: "General knowledge" },
      { concept: "Snacks", count: 2, why: "Quick service", source: "llm", evidence: "General knowledge" },
    ],
    vendorsToInvite: [],
    drinks: [{ item: "Beer and soft drinks", why: "Standard concert offering", source: "llm", evidence: "General knowledge" }],
  },
  sponsors: [{ brand: "A local beverage brand", why: "Common concert sponsor", pitch: "Reach concert-goers.", source: "llm", evidence: "General knowledge" }],
  merch: [{ idea: "T-shirts", why: "Standard merch", source: "llm", evidence: "General knowledge" }],
  vibe: {
    playlist: [{ artist: "Popular hits", why: "Crowd-pleasers", source: "llm", evidence: "General knowledge" }],
    themeIdeas: ["Concert night"],
  },
  assumptions: [],
  limitations: ["Based on general knowledge only, with no audience data"],
};
