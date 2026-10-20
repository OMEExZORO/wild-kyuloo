# Crowd Kit

**Plan your event around the crowd that's actually coming.**

Event planners tell Crowd Kit their venue, act or theme, date, expected attendance and number of volunteers. An AI agent then researches:

- **Who is coming**, using [Qloo](https://qloo.com)'s taste graph: the act's audience by age and gender, and the cuisines, brands and artists they love. This is combined with the taste of the neighbourhood around the venue.
- **Where they are going**: venue capacity, entrances, house rules, transit, parking, nearby food, past events and the weather.

It returns a ready-to-use operations plan:

- **Food and drink:** which stalls to have, and named local vendors to invite.
- **Sponsors and merch:** brands whose fans overlap the crowd, with a pitch for each.
- **Volunteers:** stations and shifts.
- **Vibe:** a pre-show playlist and theme ideas.

Every line shows its source. A **"Without Qloo"** view shows the same plan from an LLM alone, so you can see what the taste data changes.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) by Aditya, Ayush and Om.

## Running locally

Requires **Node.js 22.19 or newer**.

```bash
# 1. Qloo's event harness (the supported way to reach Qloo; see qloo/qloo-hackathon-kit)
npm install --global @qloo/qloo-harness
qloo setup --qloo            # paste the event credential once; it stays in qloo's private config
qloo setup --status

# 2. The app
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude runs the agent loop |
| `QLOO_API_KEY` | on servers | Locally, `qloo setup --qloo` is enough. With no usable credential, or without `qloo` installed, Qloo tools return clearly labelled **mock** data. |
| `QLOO_BIN` | no | Full path to `qloo` if it isn't on PATH (Windows: `where.exe qloo`) |

OpenStreetMap (Nominatim, Overpass) and Open-Meteo need no keys.

## Deploying

`qloo mcp` is a local stdio process, and Qloo's kit says serverless functions are not supported. So we deploy as **one Docker container** on Render, Railway or Fly.io:

```bash
docker build -t crowd-kit .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... -e QLOO_API_KEY=... crowd-kit
```

On the host, set both keys as secrets in the dashboard. Never put them in the repo or the image.

## How it works

```
Browser form ──POST /api/plan?mode=qloo────▶ Claude agent (tool runner)
     ▲                                          │
     │  Server-Sent Events                       ├─ qloo_* workflows via `qloo mcp` (MCP stdio) (Qloo)
     │  (live trace + final plan)                ├─ geocode_venue / nearby_osm               (OpenStreetMap)
     │                                          ├─ weather_for_date                         (Open-Meteo)
     │                                          ├─ web_search                               (Claude server tool)
     │                                          ├─ plan_volunteers                          (deterministic formula)
     └──────────────────────────────────────────└─ submit_plan → Plan JSON
Browser form ──POST /api/plan?mode=baseline──▶ Claude, no tools ("Without Qloo")
```

| Path | What it is |
|---|---|
| `src/lib/types.ts` | **Shared contracts:** `EventInput`, `Plan`, `ToolResult`, `AgentEvent`. Tell the team before you change them. |
| `src/lib/agent.ts` | Agent loop, system prompt, tool wiring, baseline |
| `src/lib/tools/qloo.ts` | Starts `qloo mcp`, exposes its workflows to Claude, handles mock mode |
| `src/lib/tools/geo.ts` | Geocoding, nearby places and weather |
| `src/lib/tools/staffing.ts` | Volunteer formula. The LLM never invents headcounts. |
| `src/lib/cache.ts` | Server-side response cache (`.cache/`, gitignored) |
| `src/app/api/plan/route.ts` | Streaming API route |
| `src/components/CrowdKit.tsx` | Form, live trace and plan view |

## Team

| Who | Owns |
|---|---|
| Aditya | Agent and Qloo integration, Devpost write-up |
| Ayush | Product and frontend |
| Om | Venue research tools, staffing formula, caching, deploys |

## How Qloo is used

| Qloo workflow | What Crowd Kit does with it |
|---|---|
| `qloo_describe`, `qloo_find_tags` | Resolve the act or theme to Qloo IDs. If a match is ambiguous (`needs_input`), the agent records its choice as an assumption for the planner to check. |
| `qloo_audience_demographics` | Crowd profile: age and gender mix |
| `qloo_recommend` | Brands, local places and artists that the act's fans over-index on |
| `qloo_compare_audiences` | Tonight's crowd vs the venue's usual crowd (recent acts found with web search) |
| `qloo_rank` | Rank **real** shortlists (nearby vendors, candidate sponsors) for this audience |
| `qloo_trends` | Rising artists for the pre-show playlist |

## Known limitations

- Qloo results describe **aggregate audience affinities**. They are not predictions about any individual attendee, and the plan words them that way.
- Venue facts from web search can be out of date. The plan labels them `web` so the planner can check.
- The volunteer formula uses rules of thumb for community events. It supports, and never replaces, professional safety staffing.
- Public OpenStreetMap servers are sometimes overloaded. When they fail, the plan says so instead of guessing.

## Rules we follow

- **Never commit Qloo response data or API keys.** The cache lives in `.cache/`, which is gitignored.
- **Never send personal data to Qloo.** Inputs are public venues, acts and themes.
- Every recommendation carries a `source` (`qloo`, `web`, `osm`, `weather`, `calc`, `llm` or `mock`).

## License

[MIT](LICENSE)
