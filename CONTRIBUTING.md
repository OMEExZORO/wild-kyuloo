# Contributing to Crowd Kit

Team: **Aditya** (lead, agent + frontend), **Om**, **Ayush**.
Deadline: **Oct 30, 2026** (one day before the Devpost cut-off of Oct 31, 9:15am IST). Feature freeze: **Oct 27**.

## 1. One-time setup

You need **Node.js 22.19 or newer** (`node --version`) and Git.

```bash
git clone https://github.com/inslot2525-ctrl/wild-kyuloo.git
cd wild-kyuloo
npm install

# Qloo's event harness (the supported way to reach Qloo)
npm install --global @qloo/qloo-harness
qloo --version            # must be 0.1.26 or newer
```

Create `.env.local` in the project root. It is gitignored, so never commit it:

```bash
# Build the UI with no keys: canned trace + sample plans, no API cost
CROWDKIT_DEMO=1

# Real runs: remove CROWDKIT_DEMO and add your free Gemini key
# (https://aistudio.google.com/apikey)
# GEMINI_API_KEY=...
```

Then:

```bash
npm run dev               # http://localhost:3000 (use `npx next dev -p 3001` if 3000 is busy)
```

Open `/` to run a plan, or `/sample` to see a finished one.

### Your Qloo key

**Each of us must use our own Qloo key.** Qloo's rules say keys are individual and must never be shared. Request yours here: <https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key>. When it arrives:

```bash
qloo config set base-url https://hackathon.api.qloo.com   # REQUIRED: the default server rejects hackathon keys
qloo setup --qloo         # paste the key; it stays in qloo's private config
qloo setup --status       # should show "qloo":{"ready":true,...}
```

Until then the app runs Qloo in **mock mode**. Results are labelled "Sample" in the UI.

## 2. How we work

1. **Pull first:** `git checkout main && git pull`
2. **Branch per task:** `git checkout -b om/osm-fallback` (format: `yourname/short-topic`)
3. **Commit small, with clear messages:** `git commit -m "Fall back to Qloo places when OSM is down"`
4. **Before pushing, all three must pass:**
   ```bash
   npx tsc --noEmit
   npx eslint src
   npm run build
   ```
5. **Push and open a pull request:**
   ```bash
   git push -u origin om/osm-fallback
   ```
   Then open the link GitHub prints. Aditya reviews and merges.
6. **Never push straight to `main`.** It's what we deploy and demo.

If you get a merge conflict in `src/lib/types.ts`, stop and ask in the group chat. See rule 1 below.

## 3. Rules that protect the submission

1. **`src/lib/types.ts` is the shared contract.** `EventInput`, `Plan` and `AgentEvent` are used by the agent, the API and the UI. Tell the team before you change a field.
2. **Never commit secrets or Qloo data.** No keys in code, screenshots or commit messages. Qloo responses must not land in the repo (Qloo's rules). The cache lives outside the repo (OS temp folder, or `CROWDKIT_CACHE_DIR`).
3. **Never send personal data to Qloo.** Inputs are public venues, acts and themes only.
4. **Every claim in a plan carries a `source`.** If you add a tool, give its results a source kind (`qloo`, `web`, `osm`, `weather`, `calc`, `llm`, `mock`).
5. **Qloo results are audience patterns, not predictions.** Write "fans over-index on X", never "attendees will buy X".
6. **Keep demo mode working.** Judges and teammates rely on `/sample` and `CROWDKIT_DEMO=1`.

## 4. Where things live

| Path | What it is | Usual owner |
|---|---|---|
| `src/lib/agent.ts` | Gemini agent loop, baseline | Aditya |
| `src/lib/prompt.ts` | Agent system prompt | Aditya |
| `src/lib/tools/qloo.ts` | Starts `qloo mcp`, Qloo tools, mock mode | Aditya |
| `src/lib/tools/geo.ts` | Geocoding, nearby places (OSM), weather | Om |
| `src/lib/tools/staffing.ts` | Volunteer formula | Om |
| `src/lib/cache.ts` | Server-side response cache | Om |
| `src/app/api/plan/route.ts` | Streaming API (SSE) and demo mode | Aditya |
| `src/components/*` | UI: form, trace, plan, comparison | Aditya |
| `src/lib/demo.ts` | Sample trace and plans | anyone |
| `Dockerfile` | Production image (app + qloo harness) | Om |

## 5. Your first tasks

### Om: research tools and deployment

1. **Fix nearby places.** Public OpenStreetMap (Overpass) servers were timing out on Oct 20. In `src/lib/tools/geo.ts`, either find a reliable mirror or add a fallback (for example, `qloo_recommend` with `target_type: place` near the venue already returns real places). The agent must still finish if this tool fails.
2. **Deploy.** The `qloo` harness is a local process, so **no Vercel/serverless**. Deploy the `Dockerfile` to Render, Railway or Fly.io. Set `GEMINI_API_KEY` and `QLOO_API_KEY` as secrets in the host's dashboard. Share the public URL.
3. **Keep the demo reliable.** Pre-run the three sample events in `src/components/EventForm.tsx` once keys exist so they're cached, and make sure a judge never waits on a cold start.
4. **Tune the staffing formula** in `src/lib/tools/staffing.ts` with real numbers. Ask one or two event organisers you know.

### Ayush: Qloo quality, testing and submission

1. **Prove Qloo makes plans better.** Once keys arrive, run 5–8 real events (mix of US/UK/India, music and comedy) in both modes. Record where Qloo clearly beat the LLM-only plan and where it didn't, and note any `needs_input` or empty results. This becomes the evidence in our Devpost write-up.
2. **Check Qloo coverage early.** Using `qloo explore` or the app, test whether Indian acts and venues return useful data. If coverage is thin, pick demo events where it's strong.
3. **Test with real planners.** Show the app to 2–3 people who run events (college fest committees are easy to reach). Write down what confused them and what they'd pay for.
4. **Own the submission material:** the Devpost description (problem, how Qloo is used, a request-to-result walkthrough, known limitations), screenshots, and a short pitch for the judges. Draft in `docs/` and open a PR.

### Aditya

Review and merge PRs, run the agent with real keys and tune the prompt, and polish the frontend.

## 6. Getting help

- Qloo API questions: the hackathon Discord, `#api-help`.
- Qloo harness issues: run `qloo doctor`, and see <https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/TROUBLESHOOTING.md>.
- Anything in this repo: ask in the team chat before you spend more than 30 minutes stuck.
