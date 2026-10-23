# Devpost submission

This mirrors what is on our Devpost entry (filled in 2026-10-22; still a draft until someone ticks the terms and clicks **Submit project**). Edit Devpost and this file together so they never drift. Numbers come from the live [/evidence](https://crowd-kit.onrender.com/evidence) page; refresh both after a new evidence run.

## Project name
Crowd Kit

## Elevator pitch (max 200 characters)
Plan the night around the crowd that's actually coming: an AI agent turns Qloo taste data into food, sponsor, merch, staffing and site plans for event organisers.

## Try it out links
- Live app: https://crowd-kit.onrender.com
- Finished sample plan (no wait): https://crowd-kit.onrender.com/sample
- Evidence (with vs without Qloo, measured): https://crowd-kit.onrender.com/evidence
- Code: https://github.com/inslot2525-ctrl/wild-kyuloo

## Built with
qloo, qloo-hackathon-harness, mcp, gemini, google-genai, next.js, react, typescript, tailwindcss, zod, leaflet, openstreetmap, open-meteo, docker, render

---

## About the project

## Inspiration
People who run gigs, comedy nights and college fests make the same expensive calls every time: which food stalls to book, which sponsors to pitch, what merch to print, how many volunteers to put on the door, and where the stage, exits and first aid go. Most of those calls come from gut feel or "what we did last year". A stall nobody visits is wasted money, a sponsor that doesn't fit the crowd says no, and a badly laid-out site causes crushes and queues on the night.

The answer is usually already known in aggregate: people who love this act also tend to love certain foods, brands, places and artists. Qloo's taste graph holds that knowledge. We wanted to turn it into a plan an organiser can act on, not another chatbot answer.

## What it does
The organiser enters the act, venue, date, expected crowd and volunteer count. **Find on Qloo** confirms the act (with its photo) so the agent works with the exact Qloo entity. An AI agent then researches **who is coming** (Qloo) and **where they are going** (venue facts, transit, weather) and returns a dashboard:

- **Who's coming:** age and gender compared with a typical audience, what fans over-index on, and how tonight's crowd differs from the venue's usual crowd.
- **Food & drink:** a stall mix that fits the organiser's slots and real nearby vendors, ranked for this audience.
- **Sponsors & merch:** brands whose fans are already in the room, each with a ready-to-send pitch.
- **Volunteer team:** stations and shifts from a fixed formula, weighted by the crowd profile (a merch-heavy fanbase gets more people on merch).
- **To-do list:** every task the plan implies, ready to tick off, with copy-pitch buttons.
- **Fill the room:** for shows with seats left, the neighbourhoods where this crowd stands out, local places to drop posters, podcasts to pitch, and captions written for this crowd.
- **Site map:** place the stage, entrances, exits, stalls, first aid and toilets on a real map, draw the standing area, and get live safety checks (crowd density, exits, toilet ratio, first-aid distance, queues near entrances). **AI layout review** (optionally with a stage photo) flags crushes, blocked exits and queue clashes before the night. Share an editable copy with the team by link.

Every claim shows its source (Qloo, web, map, weather, formula or AI judgement), and Qloo-backed claims link to a **receipt**: the exact Qloo call that produced them. A **"with vs without Qloo"** view runs the same brief through the same model with no tools, so you can see what the taste data changes.

## How we use Qloo
All Qloo access goes through Qloo's hackathon harness (`qloo mcp`), which Crowd Kit starts as a local MCP server and gives to the agent as tools:

- `qloo_describe`, `qloo_find_tags`: resolve the act (or a theme with no headliner) to Qloo entities; ambiguous matches are recorded as assumptions, never guessed silently.
- `qloo_audience_demographics`: age and gender as over/under-indexing, copied as returned.
- `qloo_recommend`: brands, places in the venue's city (with exact tag IDs for food places) and artists fans over-index on.
- `qloo_compare_audiences`: tonight's crowd vs the venue's regulars.
- `qloo_rank`: rank **real** shortlists (nearby vendors, candidate sponsors) for this audience.
- `qloo_where_popular`: neighbourhood hot spots for promotion, ranked against how busy each area is in general.
- `qloo_trends`: rising artists for the pre-show playlist.

What we learned from live calls shaped the agent: pass Qloo IDs, not names (names are ambiguous); use exact tag IDs (category words are ambiguous); locations must be "City, Region" (a neighbourhood name once resolved to Bogotá). Qloo's taste data also drives logistics: the crowd profile sets the staffing weights and informs the AI layout review.

## Evidence: does Qloo make the plan better?
We run every sample event twice, with Qloo and with the same model, brief and quality bar but no tools, and publish the numbers at /evidence. Measured on 3 events (indie gig in San Francisco, comedy night in Chicago, college fest in Pune):

- **78% vs 0%** of plan items backed by Qloo taste data
- **97% vs 0%** of items tied to a data source rather than the model's own say-so
- **~30 vs ~12** specific items per plan
- **71 vs 0** claims citing a Qloo receipt

Honesty is enforced in code: a plan is rejected if it labels a vendor, sponsor or artist "Qloo" that no Qloo call returned, or uses a source whose tool failed in that run.

## How we built it
- **Next.js 16 + TypeScript**, one streaming API route that sends the agent's live trace and the final plan to the browser.
- **Gemini (free tier) agent loop** with function calling over our tools: Qloo via MCP, OpenStreetMap (geocoding, nearby places), Open-Meteo weather, web search via Gemini with Google Search grounding, and a deterministic staffing formula. Every request has a time limit and falls back through several Gemini models when one is overloaded.
- **Zod schemas** define the plan, so the agent must return a typed, sourced plan; `submit_plan` validates it and sends errors back for the agent to fix.
- **Leaflet** site map on OpenStreetMap tiles; layouts save in the browser and share by link, no database needed.
- **Code computes, the model explains:** staffing, safety checks and promo hot spots are calculated; the model writes the words.
- Deployed as one **Docker** container on Render (the `qloo` harness is a local process, so not serverless). A server-side cache replays identical events instantly.

## Challenges we ran into
- **Hackathon keys and the harness:** the harness defaults to Qloo's production server, which rejects hackathon keys; we point it at the hackathon server.
- **Ambiguity everywhere:** acts that are both an "artist" and a "person", category words with several tags, neighbourhoods resolving to the wrong country. We learned to pass exact IDs.
- **Free-tier reliability:** Gemini models hang or hit quotas; we added time limits, a model fallback chain and cooldowns, and the UI says what's happening.
- **Keeping sources honest:** a weaker model labelled invented vendors as Qloo-backed, so we added the source check in code and receipts.
- **Fair comparison:** the "without Qloo" baseline gets the same brief and quality bar, so the difference comes from the data, not a weaker prompt.

## Accomplishments that we're proud of
- Plans where almost every line traces back to a data source, with receipts anyone can check.
- A measured, reproducible with-vs-without-Qloo comparison instead of a claim.
- A complete organiser tool: plan, to-do list, promotion, site map and safety review in one flow.

## What we learned
Taste data is most useful when it decides things that cost money (which vendors, which sponsors, how many people on merch) and when every claim can be checked. Being explicit about what the data does *not* establish made the product more trustworthy, not less.

## What's next
- Post-event feedback (did the stalls sell, how long were queues) to tune the plan.
- One-click vendor and sponsor outreach.
- Multi-day festivals with a plan per stage and day.

## Known limitations
- Qloo describes **aggregate audience affinities**, not individual attendees; plans say "fans over-index on X", never "attendees will buy X".
- Safety checks are rules of thumb and support, never replace, a professional safety plan.
- Runs on Gemini's free tier, so a new plan can take 2–3 minutes and Google may use free-tier requests to improve its products; don't enter private data.
- Qloo coverage varies by act and city; comedy and smaller acts return less.

---

## Screenshots to capture

Take these from the **live** site with real data (not demo mode, which shows "Sample" badges). Check every shot for keys, emails and personal data before uploading; raw Qloo JSON must not appear either.

1. **Hero:** the form with the artist poster and Qloo match card.
2. **Live trace:** the agent mid-run, with Qloo calls and receipt ids visible.
3. **Crowd section:** age and gender bars and what fans over-index on, with source badges.
4. **With vs without Qloo:** the comparison view. This is the money shot.
5. **To-do list and Fill the room:** neighbourhoods map, poster partners and captions.
6. **Site map:** pins, crowd area, live safety checks and an AI layout review.
7. **Evidence page:** the with-vs-without numbers.

Gallery images are 3:2; capture at 1500x1000 or larger.
