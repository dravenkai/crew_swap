#!/usr/bin/env python3
"""Build dist/data/sleep.json from PhysioNet BIDSleep expert labels."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[1]
RAW = Path("/tmp/bidsleep")
OUT = ROOT / "dist" / "data" / "sleep.json"

# BIDSleep Dreem-style stages in 30-second epochs.
SLEEP_STAGES = {1, 2, 3, 4, 5}

# Four subjects with seven measured nights each.
CREW_MAP = {
    "chen": "Bidslab00",  # declining series ending near 5 h
    "ibarra": "Bidslab07",
    "alvarez": "Bidslab16",
    "okonkwo": "Bidslab30",
}


def total_sleep_hours(labels: np.ndarray) -> float:
    labels = np.asarray(labels).ravel()
    sleep_epochs = int(np.isin(labels, list(SLEEP_STAGES)).sum())
    return round(sleep_epochs * 30 / 3600, 2)


def load_subject(subject: str) -> list[dict]:
    nights = []
    for night in range(1, 8):
        path = RAW / subject / str(night) / "labels.mat"
        if not path.exists() or path.stat().st_size < 200:
            raise SystemExit(f"Missing usable labels: {path}")
        mat = loadmat(path)
        labels = mat["expert_label"]
        nights.append(
            {
                "night": night,
                "sleep_hours": total_sleep_hours(labels),
                "recorded_at": str(mat["recStart"][0]),
                "epochs": int(np.asarray(labels).size),
                "source_file": f"{subject}/{night}/labels.mat",
            }
        )
    return nights


def pack_crew(crew_id: str, subject: str) -> dict:
    nights = load_subject(subject)
    history = [n["sleep_hours"] for n in nights]
    baseline = round(float(np.mean(history[:6])), 2)  # usual sleep before last night
    latest = history[-1]
    deficit = round(baseline - latest, 2)
    return {
        "id": crew_id,
        "subject": subject,
        "baseline_hours": baseline,
        "latest_hours": latest,
        "deficit_hours": deficit,
        "history_hours": history,
        "nights": nights,
    }


def main() -> None:
    crew = {crew_id: pack_crew(crew_id, subject) for crew_id, subject in CREW_MAP.items()}
    payload = {
        "dataset": {
            "name": "BIDSleep Dataset",
            "version": "1.0.1",
            "url": "https://physionet.org/content/bidsleep-dataset/1.0.1/",
            "doi": "https://doi.org/10.13026/0kh5-0t28",
            "license": "Open Data Commons Attribution License v1.0",
            "notes": (
                "Expert-reviewed sleep-stage labels from overnight wearable recordings. "
                "Total sleep time is derived from non-wake stages in 30-second epochs. "
                "These Earth sleep histories stand in for wearable crew sleep trends in the demo. "
                "Crew names, roles, qualifications, and the Mars mission schedule remain simulated."
            ),
        },
        "context": {
            "nasa_reassignment": "https://www.nasa.gov/news-release/nasa-coverage-of-rescheduled-spacewalk-preparing-for-new-solar-array/",
            "nasa_fatigue_research": "https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/20140016946.pdf",
        },
        "crew": crew,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    for crew_id, record in crew.items():
        print(
            f"  {crew_id}: {record['history_hours']} "
            f"(baseline {record['baseline_hours']}, latest {record['latest_hours']})"
        )


if __name__ == "__main__":
    main()
