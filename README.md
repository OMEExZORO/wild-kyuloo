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

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev                  # http://localhost:3000
```

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude runs the agent loop |
| `QLOO_API_KEY` | no | If it's empty, Qloo tools return clearly labelled **mock** data |
| `QLOO_BASE_URL` | no | Defaults to `https://hackathon.api.qloo.com`, the only URL hackathon keys work with |

OpenStreetMap (Nominatim, Overpass) and Open-Meteo need no keys.

## How it works

```
Browser form ──POST /api/plan?mode=qloo────▶ Claude agent (tool runner)
     ▲                                          │
     │  Server-Sent Events                       ├─ qloo_search / qloo_tags / qloo_insights   (Qloo)
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
| `src/lib/tools/qloo.ts` | Qloo client with response slimming and mock mode |
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

## Rules we follow

- **Never commit Qloo response data or API keys.** The cache lives in `.cache/`, which is gitignored.
- Every recommendation carries a `source` (`qloo`, `web`, `osm`, `weather`, `calc`, `llm` or `mock`).

## License

[MIT](LICENSE)
