# Does Qloo make the plans better?

Owner: Ayush. This is the evidence behind the Devpost write-up ([devpost.md](devpost.md)). Status: **not yet run.** It waits on our Qloo and Claude keys.

**Rule:** write findings in our own words. Never paste raw Qloo responses here or in any other committed file. The eval output in `.cache/evals/` stays local.

## 1. Coverage check (run first, it's cheap)

No Claude calls; a few Qloo calls per name.

```bash
npx tsx scripts/qloo-coverage.ts
npx tsx scripts/qloo-coverage.ts "Ritviz" "Kenny Sebastian:person"   # extra names, name[:type]
```

For each act or venue it prints `describe`, `demographics` and `brands` statuses and a verdict (`strong`, `partial`, `thin`, `ambiguous`, `not found`). The default list covers Indian musicians, comedians and venues, plus US and UK controls.

If the first run errors on an argument, check the real input schema with `qloo explore` and adjust the call in the script. The argument shapes come from the harness tool descriptions in `src/lib/tools/qloo.ts`, not from a live run.

| Act / venue | Region | Verdict | Notes |
|---|---|---|---|
| [TODO] | | | |

**Decision:** [TODO: which Indian events are strong enough to demo. If coverage is thin, swap them in `scripts/evidence-events.ts` and, after telling Aditya, in `src/lib/presets.ts`.]

## 2. With vs without Qloo, 8 real events

The events are in `scripts/evidence-events.ts`: the 3 UI presets plus 5 more, covering US, UK and India, and music, comedy and a fest.

```bash
# Costs real money: the script prints an estimated cost per run. Try one event first.
npx tsx scripts/eval-agent.ts --evidence --baseline --only 0
npx tsx scripts/eval-agent.ts --evidence --baseline
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
