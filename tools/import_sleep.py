"""Import a reproducible, checksum-verified BIDSleep subset. Requires numpy/scipy."""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.request

import numpy as np
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist' / 'data'
RAW = OUT / 'raw' / 'bidsleep'
BASE = 'https://physionet.org/files/bidsleep-dataset/1.0.1/'
SUBJECTS = ['Bidslab00', 'Bidslab01', 'Bidslab02', 'Bidslab06']


def fetch(relative):
    target = RAW / relative
    if not target.exists():
        request = urllib.request.Request(BASE + relative, headers={'User-Agent': 'CrewSwapResearchPrototype/1.0'})
        with urllib.request.urlopen(request, timeout=40) as response:
            body = response.read()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    return target.read_bytes()


def import_night(item):
    relative, expected_hash = item
    body = fetch(relative)
    checksum = hashlib.sha256(body).hexdigest()
    if checksum != expected_hash:
        raise ValueError(f'Checksum mismatch: {relative}')
    record = loadmat(io.BytesIO(body))
    labels = np.asarray(record['expert_label']).ravel()
    if not np.isin(labels, [0, 1, 2, 3, 4, 5]).all():
        raise ValueError(f'Unexpected stage codes: {relative}')
    date = str(np.asarray(record['recStart']).ravel()[0])
    counts = {str(code): int(np.sum(labels == code)) for code in range(6)}
    sleep_epochs = sum(counts[str(code)] for code in [1, 2, 3, 4])
    valid_epochs = len(labels) - counts['5']
    assert sum(counts.values()) == len(labels)
    participant, night, _ = relative.split('/')
    return participant, {
        'nightId': night,
        'recordingStart': date,
        'date': date.split(' ')[0],
        'timeZone': 'US/Eastern (source local time)',
        'epochSeconds': 30,
        'epochCount': len(labels),
        'stageCounts': counts,
        'sleepMinutes': sleep_epochs / 2,
        'recordingMinutes': len(labels) / 2,
        'unknownMinutes': counts['5'] / 2,
        'scoredCoveragePercent': round(valid_epochs / len(labels) * 100, 2),
        'sourceUrl': BASE + relative,
        'localFile': 'data/raw/bidsleep/' + relative,
        'sha256': checksum,
        'stages': labels.astype(int).tolist(),
    }


def main():
    lines = fetch('SHA256SUMS.txt').decode().splitlines()
    selected = []
    for line in lines:
        checksum, relative = line.split(maxsplit=1)
        if relative.split('/')[0] in SUBJECTS and relative.endswith('/labels.mat'):
            selected.append((relative, checksum))
    assert selected
    fetch('LICENSE.txt')
    fetch('README.md')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(import_night, selected))
    subjects = []
    for subject in SUBJECTS:
        nights = sorted([night for participant, night in records if participant == subject], key=lambda n: n['recordingStart'])
        assert len(nights) >= 4
        subjects.append({'id': subject, 'nights': nights})
    data = {
        'id': 'bidsleep-1.0.1', 'title': 'BIDSleep', 'version': '1.0.1',
        'doi': '10.13026/rees-1092',
        'url': 'https://physionet.org/content/bidsleep-dataset/1.0.1/',
        'citation': 'Song, T., Zhang, Y., Zhou, Z., & Dutta, J. (2026). A Multi-Night Instantaneous Heart Rate and Accelerometry Dataset with EEG Sleep Stage Labels (v1.0.1). PhysioNet. DOI: 10.13026/rees-1092.',
        'publication': 'Song et al. AI-driven sleep staging using instantaneous heart rate and accelerometry. DOI: 10.1109/TBME.2025.3612158.',
        'platformCitation': 'Pollard et al. (2026). PhysioNet as a global platform for biomedical research. DOI: 10.1038/s44360-026-00096-z.',
        'license': 'Open Data Commons Attribution License v1.0',
        'licenseUrl': 'https://opendatacommons.org/licenses/by/1-0/',
        'retrieved': '2026-11-14',
        'population': 'Earth-based volunteers; anonymized research participants',
        'selection': 'First four participant folders in repository order; every available night retained.',
        'method': 'Sleep minutes = count of expert_label stages 1–4 × 30 / 60. Wake (0) and unknown (5) are excluded. Dates and ordering come from recStart in source local time.',
        'baselineMethod': 'Within-participant comparison: arithmetic mean of the first three recordings. Later recordings never contribute to this reference. This is a short study reference, not an established clinical baseline.',
        'subjects': subjects,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(data, ensure_ascii=False)
    (OUT / 'sleep.json').write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    (OUT / 'sleep-data.js').write_text('window.CREW_SLEEP_DATA = ' + serialized + ';\n', encoding='utf-8')
    print(json.dumps({'records': len(records), 'verifiedFiles': len(records), 'subjects': [
        {'id': p['id'], 'nights': len(p['nights']), 'sleepHours': [round(n['sleepMinutes']/60, 2) for n in p['nights']], 'dates': [n['date'] for n in p['nights']]}
        for p in subjects]}, indent=2))


if __name__ == '__main__':
    main()
