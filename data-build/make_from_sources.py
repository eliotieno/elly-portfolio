"""Build the two datasets that come from files instead of a random generator.

    py data-build/make_from_sources.py

retail.json  aggregates of the public Superstore sample workbook (no row-level data ships)
qa.geojson   the Polygon QA rule engine's output on its own synthetic fault suite
"""
import json
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "public" / "data"
# The test suite was generated inside the real programme area. Slide it north, clear of every real farm.
QA_SHIFT_LAT = 1.30
# Source files live outside the repo. Their locations are in local_paths.json, which is not committed.
PATHS = json.loads((Path(__file__).parent / "local_paths.json").read_text(encoding="utf-8"))
SUPERSTORE = Path(PATHS["superstore_workbook"])
QA = Path(PATHS["qa_fault_suite"])


def retail():
    o = pd.read_excel(SUPERSTORE, sheet_name="Orders")
    o["year"] = o["Order Date"].dt.year
    o["month"] = o["Order Date"].dt.month
    years = sorted(int(y) for y in o["year"].unique())
    regions = sorted(o["Region"].unique())
    subcats = sorted(o["Sub-Category"].unique())

    cells = (
        o.groupby(["year", "month", "Region", "Sub-Category"])[["Sales", "Profit"]].sum().round(0).astype(int).reset_index()
    )
    # Distinct counts are not additive, so they are stored once per year x region combination.
    counts = {}
    for y in [None, *years]:
        for r in [None, *regions]:
            d = o
            if y:
                d = d[d["year"] == y]
            if r:
                d = d[d["Region"] == r]
            counts[f"{y or 'all'}|{r or 'all'}"] = [int(d["Order ID"].nunique()), int(d["Customer ID"].nunique())]

    return {
        "years": years,
        "regions": regions,
        "subcats": subcats,
        # [year, month, region index, sub-category index, sales, profit]
        "cells": [
            [int(r.year), int(r.month), regions.index(r.Region), subcats.index(r._4), int(r.Sales), int(r.Profit)]
            for r in cells.itertuples()
        ],
        "counts": counts,
    }


def qa():
    src = json.loads(QA.read_text(encoding="utf-8"))
    keep = ("fg_id", "fault", "area_ha", "flags", "flag_notes", "suggested_queue")
    for f in src["features"]:
        f["properties"] = {k: f["properties"].get(k) for k in keep}
        f["geometry"]["coordinates"] = [[[round(x, 6), round(y + QA_SHIFT_LAT, 6)] for x, y in ring] for ring in f["geometry"]["coordinates"]]
    return {"type": "FeatureCollection", "features": src["features"]}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "retail.json").write_text(json.dumps(retail(), separators=(",", ":")))
    (OUT / "qa.geojson").write_text(json.dumps(qa(), separators=(",", ":")))
    for name in ("retail.json", "qa.geojson"):
        print(f"wrote {name} ({(OUT / name).stat().st_size / 1024:.0f} KB)")
