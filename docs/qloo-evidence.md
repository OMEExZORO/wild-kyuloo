# Does Qloo make the plans better?

Owner: Ayush. This is the evidence behind the Devpost write-up ([devpost.md](devpost.md)). Status: coverage check run 2026-10-22; with-vs-without comparison results below and on the live `/evidence` page.

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

### Summary table

| # | Event | Region | Qloo | Generic (Qloo / baseline) | Taste share | needs_input | empty | Qloo clearly better? |
|---|---|---|---|---|---|---|---|---|
| 0 | Indie gig in San Francisco | US | | / | | | | |
| 1 | Comedy night in Chicago | US | | / | | | | |
| 2 | College fest in Pune | IN | | / | | | | |
| 3 | Arena show in Colorado | US | | / | | | | |
| 4 | Electronic gig in London | UK | | / | | | | |
| 5 | Comedy night in London | UK | | / | | | | |
| 6 | Indie gig in Mumbai | IN | | / | | | | |
| 7 | Stand-up show in Bengaluru | IN | | / | | | | |

### What to look for, per event

Score each section **Qloo better / same / baseline better**, with one line on why:

- **Vendors to invite:** real, named and near the venue? Or generic ("local food trucks")?
- **Sponsors:** do the brands plausibly fit this audience, with evidence? Would the pitch land?
- **Stall mix:** does it reflect the crowd (e.g. cuisines fans over-index on), or is it a default mix?
- **Playlist:** adjacent artists fans actually like, or just the act's genre's biggest names?
- **Crowd profile:** real demographics, or (correctly) empty when unavailable? The baseline should never invent numbers.
- **Honesty:** sources match the tools that ran; ambiguous matches appear under Assumptions.

### Per-event notes

#### 0. Indie gig in San Francisco
- Vendors: [TODO]
- Sponsors: [TODO]
- Stall mix: [TODO]
- Playlist: [TODO]
- Qloo issues (needs_input / empty / errors): [TODO]
- Verdict: [TODO]

(Copy this block for events 1–7.)

## 3. Findings for the write-up

- **Where Qloo clearly won:** [TODO]
- **Where it didn't:** [TODO]
- **Coverage gaps:** [TODO]
- **Best single before/after for the demo video:** [TODO: event, section, both versions in our own words]
