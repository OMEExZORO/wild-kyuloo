# Devpost submission draft

Owner: Ayush. Status: **draft**. Anything in `[TODO: ...]` waits on real runs (see [qloo-evidence.md](qloo-evidence.md)) or planner interviews (see [user-testing.md](user-testing.md)). Don't submit with a TODO left in.

---

## Crowd Kit

**Plan your event around the crowd that's actually coming.**

### Inspiration

People who run gigs, comedy nights and college fests make the same calls every time: which food stalls to book, which sponsors to pitch, what merch to print, how many volunteers to put on the door. Most of those calls come from gut feel or "what we did last year". They're expensive to get wrong. A stall nobody visits is wasted money, and a sponsor that doesn't fit the crowd says no.

The answer is usually already known in aggregate: the people who love this act also tend to love certain foods, brands and other artists. Qloo's taste graph holds that knowledge. We wanted to put it in front of the planner as a plan they can act on.

### What it does

The planner enters a venue, an act or theme, a date, expected attendance, the number of volunteers and, optionally, a budget and the number of food stall slots. An AI agent then researches two questions:

- **Who is coming?** Qloo gives the act's audience by age and gender, plus the cuisines, brands, places and artists that fans over-index on. The agent also compares tonight's audience with the venue's usual crowd.
- **Where are they going?** Venue capacity, entrances, house rules, transit, parking, nearby food, safety services and the weather on the day.

It returns an operations plan:

- **Food and drink:** a stall mix that fits the planner's slots, and named nearby vendors to invite, ranked for this audience.
- **Sponsors and merch:** brands whose fans overlap the crowd, each with a one-line pitch.
- **Volunteers:** stations and shifts from a deterministic formula, never invented by the model.
- **Vibe:** a pre-show playlist and theme ideas.
- **Assumptions and limitations:** what the agent decided for you, and what the plan does not establish.

**Every line shows its source** (`qloo`, `web`, `osm`, `weather`, `calc`, `llm`). A **"Without Qloo"** view runs the same brief through the same model with no tools, so you can see, row by row, what the taste data changes.

### How we use Qloo

All Qloo access goes through Qloo's hackathon harness (`qloo mcp`), which Crowd Kit starts as a local MCP server and exposes to the agent as tools.

| Qloo workflow | What Crowd Kit does with it |
|---|---|
| `qloo_describe`, `qloo_find_tags` | Resolve the act or theme to Qloo entities. For a theme with no headliner ("indie college fest"), recommend from tags instead. |
| `qloo_audience_demographics` | The crowd's age and gender mix, copied as returned. If unavailable, the plan leaves it empty instead of guessing. |
| `qloo_recommend` | Brands, places near the venue and artists that the act's fans over-index on. |
| `qloo_compare_audiences` | Tonight's crowd vs the venue's regulars (recent acts found with web search). |
| `qloo_rank` | Rank **real** shortlists, such as nearby food places from OpenStreetMap or candidate sponsors, for this audience. |
| `qloo_trends` | Rising artists for the pre-show playlist. |

Two design choices matter here:

1. **Shortlist, then rank.** The agent collects real candidates first (named restaurants near the venue, actual brands) and then asks Qloo to rank them for this audience. So recommendations are real things the planner can call, ordered by taste fit, not open-ended suggestions.
2. **Taste data shapes the logistics too.** The Qloo crowd profile sets the weights in the volunteer formula. A merch-heavy fanbase gets more merch-desk volunteers, and an older or family crowd gets more at the accessibility desk.

We follow Qloo's rules. Each of us uses our own key, no Qloo responses are committed (the cache is gitignored), and we send no personal data, only public venues, acts and themes. The plan describes audiences in aggregate ("fans over-index on X"), never as predictions about individuals.

### Request to result: a walkthrough

Example: **Phoebe Bridgers at The Fillmore, San Francisco**, 1,150 people, 30 volunteers, 6 food stall slots, $8,000.

1. **Resolve the act.** `qloo_describe` matches "Phoebe Bridgers" to the Qloo artist entity. If the match were ambiguous (`needs_input`), the agent would pick only if one candidate clearly fit, and list the choice under *Assumptions* for the planner to check.
2. **Profile the crowd.** In one turn: `qloo_audience_demographics` (age and gender mix) and `qloo_recommend` for brands, places near the venue and artists, with the act as the signal.
3. **Find the venue's regulars.** Web search finds acts that recently played The Fillmore, and `qloo_compare_audiences` shows how tonight's crowd differs, for example tasting more indie and less mainstream.
4. **Research the venue.** `geocode_venue`, then in parallel: `nearby_osm` (food, transit, parking, safety), `weather_for_date`, and web search for capacity, entrances and house rules.
5. **Shortlist, then rank.** Nearby restaurants from OpenStreetMap and candidate sponsor brands go into `qloo_rank` against the act's audience.
6. **Staff it.** `plan_volunteers` computes stations and shifts, with merch and accessibility weights taken from the crowd profile.
7. **Deliver.** `submit_plan` returns the structured plan. The UI streams every step live, so the planner sees the research happen.

[TODO: replace the illustrative details in steps 3 and 5 with what a real run returned, in words only. Quote no raw Qloo output.]

### What Qloo changed: evidence

We ran [TODO: N] real events (US, UK and India; music, comedy and a college fest) in both modes and compared the plans. Full method and per-event notes: [qloo-evidence.md](qloo-evidence.md).

- [TODO: headline finding, e.g. "With Qloo, X of N plans named real vendors and sponsors for every slot; without it, Y of N fell back to generic categories."]
- [TODO: the clearest single example: one row from the comparison view, before and after.]
- [TODO: where Qloo did *not* help, honestly, e.g. thin coverage for some Indian acts.]

### How we built it

- **Next.js 16** app with one streaming API route (Server-Sent Events) that sends the agent's trace and final plan to the browser.
- **Claude** (Anthropic API) runs the agent loop with the SDK's tool runner: Qloo tools via MCP, OpenStreetMap (Nominatim, Overpass) for places, Open-Meteo for weather, Claude's web search for venue facts, and a deterministic staffing formula.
- **Zod schemas** define the plan, so the model must return a typed, sourced plan, and the UI renders exactly that shape.
- A server-side cache keeps repeat runs fast and cheap, and a **demo mode** replays a recorded run so judges can explore with no keys.
- Deployed as a **single Docker container** (the `qloo` harness is a local process, so serverless isn't an option). [TODO: host + URL]

### Challenges

- **Ambiguous matches.** Act names often resolve to several entities. We treat `needs_input` as a judgement call to record, never something to pass silently into later calls.
- **Public map servers.** OpenStreetMap's Overpass servers were overloaded during development. We try several mirrors, and the agent finishes the plan and notes the gap if all of them fail.
- **Making the comparison fair.** The "Without Qloo" baseline gets the same brief and the same quality bar ("name real vendors and brands"), so any difference comes from the data, not a weaker prompt.
- **Keeping the model honest about sources.** Our eval script flags any item labelled `qloo` when Qloo never ran, and any generic filler ("a variety of food options").

### What we learned

[TODO: 2–3 lines from the evidence run and planner interviews.]

### What's next

- Post-event feedback: did the recommended stalls actually sell? Use it to tune the plan.
- Vendor contact details and a one-click "invite" email for each recommended vendor.
- Multi-act lineups and multi-day festivals, with a plan per stage or day.
- [TODO: anything planners asked for in interviews.]

### Known limitations

- Qloo results describe **aggregate audience affinities**. They are not predictions about individual attendees, and the plan says so.
- Venue facts from web search can be out of date. They're labelled `web` so the planner knows to check.
- The volunteer formula uses rules of thumb for community events. It supports, and never replaces, professional safety staffing.
- Public OpenStreetMap servers are sometimes overloaded. When they fail, the plan says so instead of guessing.
- Coverage varies by region. [TODO: summarise the result of the Indian coverage check.]

### Built with

`qloo` · `qloo-hackathon-harness` · `mcp` · `claude` · `anthropic-api` · `next.js` · `react` · `typescript` · `tailwindcss` · `zod` · `openstreetmap` · `open-meteo` · `docker`

### Team

Aditya (agent and frontend), Om (venue research tools, staffing, deploys), Ayush (Qloo quality, testing, submission).

---

## Screenshots to capture

Take these from a **live** run with real keys (not demo mode, which shows "Sample" badges). Check every shot for keys, emails and other personal data before uploading. Raw Qloo JSON must not appear in a screenshot either; the plan's own wording is fine.

1. **Hero:** the form filled in for a demo event, with the plan below it.
2. **Live trace:** the agent mid-run, with Qloo calls visible in the trace.
3. **Crowd section:** age and gender mix and the "fans over-index on" categories, with source badges.
4. **Food and vendors:** stall mix and named vendors with `qloo` rank evidence.
5. **With vs without Qloo:** the comparison view. This is the money shot.
6. **Volunteers:** stations and shifts, ideally with a crowd-weighted note.
7. **Assumptions and limitations:** shows we're honest about what the plan does not establish.

Gallery image size: Devpost uses 3:2. Capture at 1500×1000 or larger.
