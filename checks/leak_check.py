"""Fail if anything real has leaked into what the site publishes.

    py checks/leak_check.py        (run after `npm run build`, on Elly's computer only)

1. No coordinate in public/data may sit within 50 m of a real farm centroid.
2. No real farmer ID, farmer name or group name may appear anywhere in dist/.
The real file never leaves the Drive; this script only reads it.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "data-build" / "local_paths.json"  # not committed
REAL = Path(json.loads(LOCAL.read_text(encoding="utf-8"))["real_farm_csv"]) if LOCAL.exists() else Path("local_paths.json missing")
LIMIT_M = 50


def published_points():
    pts = [tuple(p) for p in json.loads((ROOT / "public/data/nursery.json").read_text())["farms"]]
    for f in json.loads((ROOT / "public/data/qa.geojson").read_text())["features"]:
        pts += [tuple(p) for ring in f["geometry"]["coordinates"] for p in ring]
    return np.array(pts)


def main():
    if not REAL.exists():
        sys.exit(f"SKIPPED, not passed: real farm file not found at {REAL}")
    real = pd.read_csv(REAL, encoding="latin-1")
    failures = []

    pub = published_points()
    rx, ry = real["lon"].to_numpy() * 111_320, real["lat"].to_numpy() * 110_540
    closest = np.full(len(pub), np.inf)
    for i in range(0, len(pub), 500):  # chunked so the distance matrix stays small
        px, py = pub[i:i + 500, 0] * 111_320, pub[i:i + 500, 1] * 110_540
        closest[i:i + 500] = np.hypot(px[:, None] - rx[None, :], py[:, None] - ry[None, :]).min(axis=1)
    near = int((closest < LIMIT_M).sum())
    print(f"{len(pub)} published points against {len(real)} real farms: closest pair {closest.min():.0f} m, {near} within {LIMIT_M} m")
    if near:
        failures.append(f"{near} published points within {LIMIT_M} m of a real farm")

    # selected_f = farmer name, selected_1 = FG id, selected_l = local group name
    needles = set()
    for col in ("selected_f", "selected_1", "selected_l"):
        needles |= {str(v).strip().lower() for v in real[col].dropna() if len(str(v).strip()) >= 8}
    hits = set()
    files = [p for p in (ROOT / "dist").rglob("*") if p.suffix in {".html", ".json", ".geojson", ".js", ".css", ".txt", ".xml"}]
    if not files:
        sys.exit("SKIPPED, not passed: dist/ is empty, run `npm run build` first")
    for p in files:
        text = p.read_text(encoding="utf-8", errors="ignore").lower()
        hits |= {n for n in needles if n in text}
    print(f"{len(needles)} real names and IDs searched in {len(files)} built files: {len(hits)} found")
    if hits:
        failures.append(f"real identifiers in dist/: {sorted(hits)[:5]}")

    if failures:
        sys.exit("LEAK CHECK FAILED\n" + "\n".join(failures))
    print("leak check passed")


if __name__ == "__main__":
    main()
