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
from datetime import date, timedelta
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


# Program KPI demo. Dates are fixed so the page never goes stale.
AS_OF = date(2026, 9, 30)
SEASON_START = date(2026, 3, 2)  # a Monday
SIGN_START = date(2026, 8, 11)
REGIONS = ["North", "Central", "South"]
STATUSES = ["Active", "Reinstated", "Presumed inactive", "Confirmed inactive", "Deceased", "Unclassified"]
CHALLENGES = ["No rain", "Seedlings not ready", "Labour shortage", "Pests or disease", "Livestock damage", "Land not prepared"]
BUCKETS = ["Under 2 weeks", "2 to 4 weeks", "1 to 2 months", "2 to 3 months", "3 to 6 months", "6 months or more"]
BUCKET_DAYS = [14, 28, 60, 90, 180]


def kpi(unit):
    """Per-unit counts behind four report pages. Every figure is additive, so the page can sum any set of units."""
    n_weeks = (AS_OF - SEASON_START).days // 7 + 1
    n_days = (AS_OF - SIGN_START).days + 1
    week = np.arange(n_weeks)
    workday = np.array([(SIGN_START + timedelta(int(d))).weekday() < 4 for d in range(n_days)])  # Monday to Thursday
    units = []
    for u in range(len(TOWNS)):
        n = int((unit == u).sum())
        effort = rng.uniform(0.25, 1.0)  # some units simply visit and record more
        status = rng.choice(6, n, p=[0.79, 0.04, 0.09, 0.05, 0.02, 0.01])
        base = status < 2  # Active or Reinstated: the population every other page counts against
        nb = int(base.sum())

        # Visits. NEST (nursery) visits come early in the season, ROOT (outplanting) visits later.
        p_nest = effort * 0.035 * np.exp(-week / 9)
        p_root = effort * 0.05 / (1 + np.exp(-(week - 10) / 3))
        nest = rng.random((nb, n_weeks)) < p_nest
        root = rng.random((nb, n_weeks)) < p_root
        any_visit = nest | root  # one visit day per farmer per week, however many forms were filled in
        days = any_visit.sum(axis=1)
        visited = days > 0
        weeks_back = np.argmax(any_visit[:, ::-1], axis=1)  # 0 means visited in the latest week
        since = np.where(visited, weeks_back * 7 + rng.integers(0, 7, nb), 9999)  # days since the last visit
        had_nest, had_root = nest.any(axis=1), root.any(axis=1)

        # Outplanting, read from each farmer's latest ROOT record.
        last_root = np.where(had_root, n_weeks - 1 - np.argmax(root[:, ::-1], axis=1), -1)
        finished = had_root & (rng.random(nb) < (last_root / n_weeks) ** 2)
        started = had_root & ~finished & (rng.random(nb) < 0.8)
        complete = np.where(finished, 100, np.where(started, rng.uniform(10, 90, nb), 0))
        trees = np.where(finished, rng.integers(600, 2500, nb), np.where(started, rng.integers(50, 800, nb), 0))
        root_visits = int(root.sum())
        flagged = rng.random((root_visits, len(CHALLENGES))) < np.array([0.16, 0.12, 0.09, 0.07, 0.05, 0.04])

        # Contracts. Signing happens at a handful of events per unit, on working days.
        events = np.sort(rng.choice(np.flatnonzero(workday), rng.integers(5, 10), replace=False))
        signs = rng.random(nb) < rng.uniform(0.35, 0.92)
        sign_day = rng.choice(events, nb, p=rng.dirichlet(np.ones(len(events)) * 2))
        signed_daily = np.bincount(sign_day[signs], minlength=n_days)
        n_signed = int(signs.sum())
        exceptions = rng.binomial(n_signed, [0.015, 0.02, 0.03, 0.025, 0.06, 0.01])

        # Presumed inactive review. Open cases sit in stages 1 to 3; reinstated and confirmed cases are resolved.
        n_pi = int((status == 2).sum())
        open_stage = rng.choice(3, n_pi, p=[0.5, 0.2, 0.3])
        waiting = rng.exponential(55, n_pi)
        took = rng.exponential(40, int(((status == 1) | (status == 3)).sum()))
        bucket = lambda d: np.bincount(np.searchsorted(BUCKET_DAYS, d, side="right"), minlength=6).tolist()

        units.append({
            "name": f"Unit {u + 1:02d}",
            "region": REGIONS[u // 4],
            "base": nb,
            "status": np.bincount(status, minlength=6).tolist(),
            "seen": [int((since < d).sum()) for d in (7, 28, 90)],
            "mix": [int((had_nest & ~had_root).sum()), int((had_root & ~had_nest).sum()), int((had_nest & had_root).sum()), int((~visited).sum())],
            "visitDays": int(days.sum()),
            "freq": [int((days == 1).sum()), int((days == 2).sum()), int((days >= 3).sum())],
            "nestW": nest.sum(axis=0).tolist(),
            "rootW": root.sum(axis=0).tolist(),
            "stage": [int((had_root & ~started & ~finished).sum()), int(started.sum()), int(finished.sum()), int((~had_root).sum())],
            "trees": int(trees.sum()),
            "completeSum": int(round(float(complete[had_root].sum()))),
            "rootVisits": root_visits,
            "challenge": flagged.sum(axis=0).tolist(),
            "signedD": signed_daily.tolist(),
            "exceptions": exceptions.tolist(),
            "pipe": [*np.bincount(open_stage, minlength=3).tolist(), int((status == 1).sum()), int((status == 3).sum())],
            "spell": [bucket(waiting), bucket(took)],
        })
        b = units[-1]
        assert sum(b["mix"]) == nb and sum(b["stage"]) == nb and sum(b["signedD"]) == n_signed <= nb
        assert sum(b["freq"]) == nb - b["mix"][3] and sum(b["pipe"][:3]) == b["status"][2]
        assert b["seen"][0] <= b["seen"][1] <= b["seen"][2] <= nb - b["mix"][3]
    return {
        "asOf": AS_OF.isoformat(),
        "seasonStart": SEASON_START.isoformat(),
        "signStart": SIGN_START.isoformat(),
        "regions": REGIONS,
        "statuses": STATUSES,
        "challenges": CHALLENGES,
        "buckets": BUCKETS,
        "units": units,
    }


# Nursery stock demo: a weekly log with the reporting habits the dashboard was built to expose.
CTN_FIRST = date(2026, 3, 6)  # a Friday; every report is filed against the Friday of its week
CTN_WEEKS = 31
NURSERIES = ["Nursery A", "Nursery B", "Nursery C", "Nursery D", "Nursery E"]
SPECIES = ["Avocado", "Lemon", "Mango", "Orange"]
STAGES = [  # label, live stock?
    ("0 Seed received", 1), ("1 Planted", 1), ("2 Seedling below 30cm", 1), ("3 Ready to graft", 1),
    ("4 Grafted, healing", 1), ("5 Grafted, sprouting", 1), ("6 Ready to distribute", 1),
    ("7 Distributed", 0), ("X Damaged or disposed", 0),
]
# Chance each nursery files a fresh count, copies last week's report, or files nothing.
HABITS = [(0.92, 0.06, 0.02), (0.6, 0.35, 0.05), (0.75, 0.1, 0.15), (0.85, 0.1, 0.05), (0.7, 0.25, 0.05)]


def ctn():
    """reports[nursery][week] is None (nothing filed) or a flat species x stage list of quantities."""
    advance = np.array([0.5, 0.35, 0.15, 0.0, 0.3, 0.25])  # weekly share moving up from stages 0 to 5
    reports = []
    for n, habit in enumerate(HABITS):
        stock = np.zeros((len(SPECIES), 9), int)
        stock[:, 0] = rng.integers(2000, 6000, len(SPECIES))
        filed, last = [], None
        for w in range(CTN_WEEKS):
            rate = advance.copy()
            rate[3] = 0.3 if 12 <= w <= 18 else 0.0  # grafting happens in one stretch of the season
            moved = rng.binomial(stock[:, :6], rate)
            stock[:, :6] -= moved
            stock[:, 1:7] += moved
            lost = rng.binomial(stock[:, :7], [0.005, 0.01, 0.008, 0.003, 0.02, 0.005, 0.003])
            stock[:, :7] -= lost
            stock[:, 8] += lost.sum(axis=1)
            if w >= 22 and w % 3 == 1:  # distribution days
                out = rng.binomial(stock[:, 6], 0.6)
                stock[:, 6] -= out
                stock[:, 7] += out
            if n == 2 and w == 20:  # stock that leaves the log with nothing recorded against it
                stock[:, :7] -= rng.binomial(stock[:, :7], 0.35)
            kind = rng.choice(3, p=habit)
            if w == 11:
                kind = 2  # one week nobody reported
            if w >= CTN_WEEKS - 3:
                kind = [0, 0 if w < CTN_WEEKS - 1 else 1, 0 if w < CTN_WEEKS - 1 else 2, 0, 1][n]
            if kind == 0 or last is None:
                last = stock.ravel().tolist()
            filed.append(None if kind == 2 else last)
        assert all(f is None or min(f) >= 0 for f in filed) and filed[11] is None
        reports.append(filed)
    assert reports[4][-1] == reports[4][-3] and reports[2][-1] is None
    weeks = [(CTN_FIRST + timedelta(7 * w)).isoformat() for w in range(CTN_WEEKS)]
    return {"weeks": weeks, "nurseries": NURSERIES, "species": SPECIES, "stages": STAGES, "reports": reports}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    unit, lon, lat = make_farms()
    print("nursery scenarios")
    (OUT / "nursery.json").write_text(json.dumps(nursery(unit, lon, lat), separators=(",", ":")))
    (OUT / "kpi.json").write_text(json.dumps(kpi(unit), separators=(",", ":")))
    (OUT / "ctn.json").write_text(json.dumps(ctn(), separators=(",", ":")))
    for f in sorted(OUT.glob("*.json")):
        print(f"wrote {f.name} ({f.stat().st_size / 1024:.0f} KB)")
