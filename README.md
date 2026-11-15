# Crew Swap

Mission-readiness console for a Mars transit crew. Gather sleep and fatigue check-ins, evaluate a stand-down, then replan a repair when coverage changes.

## What it does

1. **Gather** — BIDSleep measured nights + check-ins.
2. **Flag** — score from real sleep + NASA-aligned &lt;6 h rules.
3. **Confirm** — medical officer confirms (Commander reviews the medical officer).
4. **Act** — replan coverage and Earth packet.

Try: **Confirm flag → Stand down → Confirm plan**.

Sleep source: [PhysioNet BIDSleep](https://physionet.org/content/bidsleep-dataset/1.0.1/) — Aung Min→Bidslab01, Thiri Htet→Bidslab00, Kaung Htet→Bidslab02, May Thazin→Bidslab06. Auto-flag: latest sleep, baseline (first 3 nights), nights &lt;6 h, derived fatigue. Score ≥4 stand-down · 2–3 watch. Human confirms.

Also available:

- **Qualifications** — edit crew skills and cooling-loop requirements
- **Medical flags** — injury / EVA limit / contagion holds that block assignment
- **Operator role** — Medical officer opens on Crew health; Commander opens on Mission plan

## Data

- Sleep totals come from the open [PhysioNet BIDSleep dataset](https://physionet.org/content/bidsleep-dataset/1.0.1/) (expert-reviewed overnight stage labels → total sleep time).
- Crew names, roles, qualifications, and the Mars schedule are simulated.
- NASA context links are listed under **Data & references** in the app.

Rebuild the bundled sleep file after refreshing raw labels:

```bash
python3 tools/import_sleep.py
```

## Run locally

```bash
npm start
```

Open [http://127.0.0.1:43730](http://127.0.0.1:43730).

On Desktop, double-click **Open Crew Swap** (`.sh` on Mac/Linux, `.cmd` on Windows) or run `npm start` from this folder.

Fetching `data/sleep.json` needs HTTP — open the app through the local server, not as a raw `file://` page.

## Mission chat (Live AI)

The floating **Mission chat** control is a real multi-turn AI chat (streaming). **Gemini is the default provider.**

1. Copy `.env.example` → `.env` (or edit the existing `.env`)
2. Set:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.6-flash
```

Get a key: [Google AI Studio](https://aistudio.google.com/apikey)

3. Restart:

```bash
npm start
```

Header should show **Live AI · Gemini**. OpenAI still works if you set `OPENAI_API_KEY` (or `AI_PROVIDER=openai`).

## Project layout

- `dist/` — static UI, `favicon.svg`, and `data/sleep.json`
- `server.cjs` — tiny static server on port 43730
- `tools/import_sleep.py` — rebuilds sleep totals from BIDSleep `labels.mat` files under `/tmp/bidsleep`
- `.agents/skills/design-taste-frontend` — [Taste Skill](https://www.tasteskill.dev/) (`design-taste-frontend`) for agent-led UI redesigns

Ask the agent to use the **design-taste-frontend** skill when redesigning or polishing the UI.
