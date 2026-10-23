# Does Qloo make the plans better?

Owner: Ayush. This is the evidence behind the Devpost write-up ([devpost.md](devpost.md)). Status: coverage check run 2026-10-22; with-vs-without comparison run 2026-10-23 on all 8 events, results below and on the live `/evidence` page.

**Rule:** write findings in our own words. Never paste raw Qloo responses here or in any other committed file. The eval output (in the OS temp folder, `crowdkit-cache/evals`) stays local; only derived numbers go into `src/lib/evidence.json`.

## 1. Coverage check (run first, it's cheap)

No Gemini calls; a few Qloo calls per name.

```bash
npx tsx scripts/qloo-coverage.ts
npx tsx scripts/qloo-coverage.ts "Ritviz" "Kenny Sebastian:person"   # extra names, name[:type]
```

For each act or venue it resolves the name to one Qloo entity, then checks audience demographics and brand recommendations for it. The verdict is `strong`, `partial`, `thin` or `not found`, with "(needs disambiguation)" when Qloo couldn't match the plain name directly and the script had to pick from its candidates.

Hackathon keys only work against `https://hackathon.api.qloo.com`. Run `qloo config set base-url https://hackathon.api.qloo.com` before `qloo setup --qloo`, or the key is rejected.

### Results (run 2026-10-22, harness 0.1.26)

| Act / venue | Region | Verdict | Notes |
|---|---|---|---|
| Prateek Kuhad | IN | strong | Also exists as a "person" entity, so a bare name in `qloo_recommend` returns `needs_input`. Resolve to the artist first. |
| Anuv Jain | IN | strong | Same as above |
| Ritviz | IN | strong | Same as above |
| The Local Train | IN | strong | |
| Arijit Singh | IN | strong | Same as above |
| Zakir Khan | IN | strong (needs disambiguation) | A typed `person` lookup offers only other people with the same name. An untyped lookup finds him as "Zakir Khan, Comedian". |
| Kenny Sebastian | IN | strong (needs disambiguation) | Listed as "Kenneth Sebastian". The plain name only finds his comedy specials. [TODO: confirm in `qloo explore` that this is the comedian.] |
| Biswa Kalyan Rath | IN | strong | |
| NSCI Dome, Mumbai | IN | strong (needs disambiguation) | Listed as "Dome SVP Stadium". The plain name also matches a nearby banquet hall, which ranks higher. |
| Chowdiah Memorial Hall, Bengaluru | IN | thin (needs disambiguation) | Found, but no demographics and brand recommendations failed |
| Phoebe Bridgers | US | strong | Control |
| Hasan Minhaj | US | strong | Control |
| Fred again.. | UK | strong | Control |
| Romesh Ranganathan | UK | strong | Control |

**Coverage of Indian acts is good.** Every musician and comedian tested has audience demographics and brand recommendations. The weak spot is **name resolution**, not data: comedians and Indian venues often don't match their plain names.

**Decision:** keep all the Indian events in `scripts/evidence-events.ts`. Chowdiah Memorial Hall is thin as a venue, but the stand-up event's taste data comes from the act (Zakir Khan), which is strong.

**For Aditya (agent prompt):** the prompt says "a comedian or speaker is a person". For Zakir Khan, a lookup typed as `person` misses the comedian entirely, while an untyped one finds him. Consider telling the agent to retry `qloo_describe` without a type when a typed lookup returns `needs_input` and no candidate fits, and to pass resolved entity IDs, not names, into `qloo_recommend`.

## 2. With vs without Qloo, 8 real events

The events are in `scripts/evidence-events.ts`: the 3 UI presets plus 5 more, covering US, UK and India, and music, comedy and a fest.

```bash
# Free (Gemini free tier), but each event uses ~8 Gemini requests plus 1 for the baseline, so mind the daily limits.
npx tsx scripts/eval-agent.ts --evidence --baseline --only 0
npx tsx scripts/eval-agent.ts --evidence --baseline --summary src/lib/evidence.json   # also updates /evidence
```

Make sure `CROWDKIT_DEMO` is **not** set and the run says Qloo is `live` (column `qloo`). A `mock` run doesn't count as evidence.

For each event, the script records: `issues` (failed quality checks), `generic` (filler phrases like "a variety of"), `tasteShare` (share of items sourced from Qloo), `qlooCalls`, `needsInput` and `empty`. It also prints the baseline's generic count. Then open both plans in the app's **With vs without Qloo** view and judge them by eye.

### Summary table (run 2026-10-23, gemini-3.5-flash-lite, Qloo live)

Measured after the demographic fix (see section 3). "Data-backed" is the share of items tied to any tool (Qloo, map, web, weather, calculation) rather than the model's own say-so. The baseline is 0% on both by construction, since it has no tools.

| # | Event | Region | Items (Qloo / baseline) | Qloo-backed | Data-backed | Receipts cited | needs_input | empty | Qloo clearly better? |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Indie gig in San Francisco | US | 31 / 14 | 77% | 100% | 43 | 0 | 0 | Yes |
| 1 | Comedy night in Chicago | US | 34 / 11 | 38% | 100% | 15 | 0 | 0 | Yes (food came from the map, not Qloo) |
| 2 | College fest in Pune | IN | 30 / 11 | 83% | 97% | 25 | 0 | 0 | Yes |
| 3 | Arena show in Colorado | US | 33 / 11 | 52% | 91% | 17 | 0 | 0 | Yes |
| 4 | Electronic gig in London | UK | 37 / 9 | 49% | 65% | 17 | 0 | 0 | Partly: food was the model's own |
| 5 | Comedy night in London | UK | 31 / 11 | 77% | 100% | 24 | 0 | 0 | Yes |
| 6 | Indie gig in Mumbai | IN | 32 / 15 | 66% | 78% | 27 | 1 | 0 | Yes |
| 7 | Stand-up show in Bengaluru | IN | 29 / 10 | 45% | 93% | 15 | 1 | 0 | Yes (food came from the web) |
| | **Average** | | **32 / 11.5** | **61%** | **91%** | **183 total** | **2 total** | **0** | |

The generic-phrase check found 0 filler phrases in both versions on every event. The baseline gets the same "never write" rules, so this check doesn't separate them. The difference is in what the items rest on, and how many there are.

### What to look for, per event

Score each section **Qloo better / same / baseline better**, with one line on why:

- **Vendors to invite:** real, named and near the venue? Or generic ("local food trucks")?
- **Sponsors:** do the brands plausibly fit this audience, with evidence? Would the pitch land?
- **Stall mix:** does it reflect the crowd (e.g. cuisines fans over-index on), or is it a default mix?
- **Playlist:** adjacent artists fans actually like, or just the act's genre's biggest names?
- **Crowd profile:** real demographics, or (correctly) empty when unavailable? The baseline should never invent numbers.
- **Honesty:** sources match the tools that ran; ambiguous matches appear under Assumptions.

### Per-event notes

Where the with-Qloo plan's items came from, per section (Q = Qloo, M = map, W = web, C = calculation, L = the model's own):

| Event | Crowd | Stalls | Vendors | Drinks | Sponsors | Merch | Playlist | Venue risks |
|---|---|---|---|---|---|---|---|---|
| SF indie | Q | Q | Q | Q | Q | Q | Q | C, W |
| Chicago comedy | Q | M | M | M | Q | C, Q, M | Q | C |
| Pune fest | Q | Q | Q | Q | Q | Q | Q | C |
| Colorado arena | Q | C, L | W | W, C | Q | Q, W | Q | W |
| London electronic | Q | L | L | L | Q | Q | Q | W, C |
| London comedy | Q | Q | Q | Q, W | Q | Q | Q | W |
| Mumbai indie | Q | Q, L | L | Q | Q | Q | Q | L |
| Bengaluru stand-up | Q | W, Q | W | W | Q | L | Q | C, W |

Crowd, sponsors and playlist are Qloo-backed in all 8 plans.

Food is where plans differ:
- When Qloo returned places in the venue's city, the food items come from Qloo.
- Otherwise they come from the map or the web.
- In London electronic and Mumbai, they are the model's own suggestions, labelled "llm" in the plan, as they should be.

The baseline has none of this: every item is the model's own.

The quality checks flagged two small things:
- The Pune plan has 1 venue risk; we ask for 2-4.
- One Colorado summary line tripped the "local vendors" filter.

## 3. Findings for the write-up

- **Where Qloo clearly won:**
  - Crowd profile, sponsors and playlist, on every event. In these sections the baseline can only guess. The Qloo plan names real brands and artists that fans over-index on, each with a receipt.
  - Plans with Qloo are about 3x longer: 32 items vs 11.5.
  - 91% of items rest on a data source, against 0% for the baseline.
- **Where it didn't:** food.
  - Qloo's place recommendations don't always cover the venue's city. When they don't, the agent falls back to the map or web search.
  - Twice (London electronic, Mumbai) it fell back to its own suggestions, which the plan labels honestly.
  - This is why the Qloo-backed share ranges from 38% to 83%.
- **The fix that mattered:**
  - The first 8-event run (the morning of 2026-10-23) averaged 59% Qloo-backed. Khruangbin at Red Rocks was only 9%.
  - The cause: the agent added a free-text `demographic` filter to `qloo_recommend` ("music fans", "London", even "men 35-44"). Qloo answered `needs_input` 36 times across the 8 events.
  - We now hide that filter from the agent, because the act's ID already defines the audience.
  - needs_input fell from 36 to 2. Khruangbin went from 9% to 52%.
- **Coverage gaps:**
  - The gaps are in name resolution, not data (see section 1). Zakir Khan is only found untyped. The agent now retries untyped when a typed lookup misses.
  - OpenStreetMap's Overpass servers were down for most runs. When they were up (Chicago), food came from the map.
- **Best single before/after for the demo video:** the indie gig in San Francisco.
  - Every food, sponsor, merch and playlist item is Qloo-backed, with 43 receipts cited.
  - The baseline has 14 items and no sources.
  - Show the sponsor section side by side.
