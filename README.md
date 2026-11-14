# Crew Swap

Mission-readiness console for a Mars transit crew. Gather sleep and fatigue check-ins, evaluate a stand-down, then replan a repair when coverage changes.

## What it does

1. **Gather** — review measured sleep trends and self-reported fatigue.
2. **Evaluate** — the crew medical officer confirms whether someone stands down.
3. **Act** — the mission plan recalculates coverage, conflicts, and an Earth handoff packet.

Try: **Review check-in → Confirm stand-down → Confirm plan**.

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

Or open `dist/index.html` from the Desktop folder after starting the server (fetching `data/sleep.json` needs HTTP).

## Project layout

- `dist/` — static UI and `data/sleep.json`
- `server.cjs` — tiny static server
- `tools/import_sleep.py` — builds sleep totals from BIDSleep `labels.mat` files
