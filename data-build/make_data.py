"""Generate every synthetic dataset the site ships. Seeded, so reruns give identical files.

    py data-build/make_data.py

Nothing here reads real programme data. Farms are random points scattered around public
town coordinates in western Kenya, all at least 25 km from any real programme farm (an
earlier version used towns inside the programme area and checks/leak_check.py caught 69
points within 50 m of real farms). The elevation surface is generated too.
The nursery method mirrors the real model: farm centroids as demand, any farm can host,
Tobler hiking time over elevation difference, greedy minimum set cover, redundancy pruning.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "public" / "data"
rng = np.random.default_rng(2026)

# Public town locations outside the real programme area. One generated project unit per town.
TOWNS = [
    ("Siaya", 34.288, 0.061), ("Ugunja", 34.295, 0.185), ("Mumias", 34.488, 0.335),
    ("Butere", 34.490, 0.210), ("Kakamega", 34.752, 0.283), ("Chwele", 34.600, 0.730),
    ("Bungoma", 34.560, 0.563), ("Webuye", 34.770, 0.600), ("Malava", 34.850, 0.440),
    ("Nambale", 34.250, 0.450), ("Bumala", 34.200, 0.300), ("Kimilili", 34.720, 0.780),
]
N_FARMS = 3000
LAT0 = np.radians(0.4)
MX, MY = 111_320 * np.cos(LAT0), 110_540  # metres per degree. ponytail: flat-earth projection, fine at this extent


def make_farms():
    unit = rng.integers(0, len(TOWNS), N_FARMS)
    centre = np.array([(t[1], t[2]) for t in TOWNS])[unit]
    # Two-scale scatter: villages around the town, farms around villages.
    village = rng.normal(0, 2600, (len(TOWNS), 9, 2))
    v = rng.integers(0, 9, N_FARMS)
    off = village[unit, v] + rng.normal(0, 650, (N_FARMS, 2))
    lon = centre[:, 0] + off[:, 0] / MX
    lat = centre[:, 1] + off[:, 1] / MY
    return unit, lon, lat


def elevation(x, y):
    """Generated terrain in metres. Slopes reach roughly 10 percent."""
    return 1300 + 120 * np.sin(x / 3100) + 90 * np.cos(y / 2300) + 40 * np.sin((x + y) / 900)


def walk_minutes(x, y, z):
    """Farm-to-candidate walking time matrix (rows = farms, cols = candidates)."""
    dx = x[:, None] - x[None, :]
    dy = y[:, None] - y[None, :]
    dist = np.hypot(dx, dy).astype(np.float32)
    with np.errstate(divide="ignore", invalid="ignore"):
        slope = np.where(dist > 0, (z[None, :] - z[:, None]) / dist, 0)
    speed = np.clip(6.0 * np.exp(-3.5 * np.abs(slope + 0.05)), 0.5, None)  # Tobler, km/h
    return dist, (dist / 1000 / speed * 60).astype(np.float32)


def greedy_cover(reach):
    """reach[f, c] is True when farm f can walk to candidate c in time. Returns chosen candidates."""
    uncovered = np.ones(reach.shape[0], bool)
    chosen = []
    while uncovered.any():
        gain = reach[uncovered].sum(axis=0)
        c = int(gain.argmax())
        chosen.append(c)
        uncovered &= ~reach[:, c]
    # Pruning pass: drop any site whose farms are all reachable from another chosen site.
    count = reach[:, chosen].sum(axis=1)
    for c in sorted(chosen, key=lambda c: reach[:, c].sum()):
        if (count[reach[:, c]] >= 2).all():
            chosen.remove(c)
            count -= reach[:, c]
    return chosen


def nursery(unit, lon, lat):
    x, y = lon * MX, lat * MY
    dist, minutes = walk_minutes(x, y, elevation(x, y))
    scenarios = {}
    for limit in (30, 20, 10):
        reach = minutes <= limit
        sites = greedy_cover(reach)
        assert reach[:, sites].any(axis=1).all(), "every farm must be covered"
        nearest = minutes[:, sites].argmin(axis=1)
        t = minutes[np.arange(N_FARMS), np.array(sites)[nearest]]
        d = dist[np.arange(N_FARMS), np.array(sites)[nearest]]
        assert t.max() <= limit
        scenarios[str(limit)] = {
            "sites": sites,
            "assign": nearest.tolist(),
            "stats": {
                "sites": len(sites),
                "avgMin": round(float(t.mean()), 1),
                "p90Min": round(float(np.quantile(t, 0.9)), 1),
                "avgMetres": int(round(float(d.mean()))),
                "farmsPerSite": round(N_FARMS / len(sites), 1),
                "secondOptionPct": round(float((reach[:, sites].sum(axis=1) >= 2).mean() * 100), 1),
            },
        }
        print(f"  {limit} min: {len(sites)} sites, avg {t.mean():.1f} min")
    return {
        "farms": [[round(float(a), 5), round(float(b), 5)] for a, b in zip(lon, lat)],
        "scenarios": scenarios,
    }


def kpi(unit):
    """Monthly NEST and ROOT records per unit, plus visit and recency counts. All additive across units."""
    months = [f"{y}-{m:02d}" for y in (2025, 2026) for m in range(1, 13)][:22]  # Jan 2025 to Oct 2026
    season = 1 + 0.45 * np.sin((np.arange(22) % 12 - 2) / 12 * 2 * np.pi)
    units = []
    for u, (town, *_ ) in enumerate(TOWNS):
        n = int((unit == u).sum())
        effort = rng.uniform(0.08, 0.5)  # some units simply record more
        root_rate = effort * 0.21 * season / season.mean()
        root = rng.poisson(root_rate[None, :].repeat(n, 0))  # farmer x month
        nest = rng.poisson((root_rate * 0.3)[None, :].repeat(n, 0))
        same_day = rng.binomial(np.minimum(root, nest), 0.6)  # both forms on one visit
        visits = root + nest - same_day
        any_visit = visits > 0
        visited = any_visit.any(axis=1)
        last = np.where(visited, 21 - np.argmax(any_visit[:, ::-1], axis=1), -1)  # months before Oct 2026
        age = 21 - last
        units.append({
            "name": f"Unit {u + 1:02d}",
            "farmers": n,
            "visited": int(visited.sum()),
            "nest": nest.sum(axis=0).tolist(),
            "root": root.sum(axis=0).tolist(),
            "visits": visits.sum(axis=0).tolist(),
            "recency": [
                int((visited & (age <= 1)).sum()),
                int((visited & (age > 1) & (age <= 3)).sum()),
                int((visited & (age > 3) & (age <= 6)).sum()),
                int((visited & (age > 6)).sum()),
                int((~visited).sum()),
            ],
        })
    return {"months": months, "recencyLabels": ["Under 30 days", "31 to 90", "91 to 180", "Over 180", "Never"], "units": units}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    unit, lon, lat = make_farms()
    print("nursery scenarios")
    (OUT / "nursery.json").write_text(json.dumps(nursery(unit, lon, lat), separators=(",", ":")))
    (OUT / "kpi.json").write_text(json.dumps(kpi(unit), separators=(",", ":")))
    for f in sorted(OUT.glob("*.json")):
        print(f"wrote {f.name} ({f.stat().st_size / 1024:.0f} KB)")
