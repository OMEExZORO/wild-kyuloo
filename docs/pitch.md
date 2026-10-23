# Pitch for the judges

Owner: Ayush. About 90 seconds spoken, which fits a 2–3 minute demo video with screen time to spare. Fill the `[TODO]`s from [qloo-evidence.md](qloo-evidence.md) before recording.

## Script

**The problem (15s)**
Every event planner makes the same bets: which food stalls, which sponsors, what merch, how many volunteers on the door. Most of those bets are gut feel. Get them wrong and you've paid for a stall nobody visits and pitched a sponsor who says no.

**The idea (15s)**
Crowd Kit plans your event around the crowd that's actually coming. You tell it the venue, the act, the date and how many people and volunteers you have. An agent does the research and gives you a plan you can act on.

**The demo (40s)** *(screen: run a preset live, or use a cached run)*
Watch the trace: it's asking Qloo who Phoebe Bridgers' fans are, what they eat, which brands they love, and how they differ from The Fillmore's usual crowd. At the same time it's mapping the venue: entrances, transit, food nearby, the weather.

Here's the plan. Six stalls, matching our six slots. Named restaurants nearby, ranked for this audience. Sponsors with a pitch for each. Volunteers by station, weighted by the crowd's profile. And every line shows where it came from.

**Why Qloo (15s)** *(screen: the "With vs without Qloo" view)*
Same model, same brief, no taste data. Without Qloo: eleven items, every one the model's guess. With Qloo: over thirty, nine in ten traced to real data, each with a receipt you can click. Across 8 real events in the US, UK and India, 61% of every plan comes straight from Qloo's taste data.

**Close (5s)**
Crowd Kit: plan for the crowd that's coming, not the crowd you imagine.

## Likely judge questions

- **"Isn't this just ChatGPT with extra steps?"** The comparison view answers this: same model, no Qloo, and the plan shrinks to guesses. Across 8 events: 32 items vs 11.5, 91% tied to a data source vs 0%, 183 Qloo receipts cited vs none.
- **"Is it predicting what people will buy?"** No. Qloo describes aggregate audience affinities, and the plan says "fans over-index on", never "attendees will buy".
- **"What if Qloo doesn't know the act?"** The agent falls back to tags for the theme, records its choice under Assumptions, and says what's missing under Limitations. Real example: Qloo lists Zakir Khan only as "Zakir Khan, Comedian", so a typed lookup misses him; the agent retries untyped and records the match it chose.
- **"Would anyone pay for this?"** [TODO: a quote or finding from the planner interviews.]
- **"How does it handle safety?"** Volunteer numbers come from a deterministic formula, not the model, and the plan says it supports, and never replaces, professional safety staffing.
