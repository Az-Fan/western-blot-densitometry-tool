from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "py_vendor"))

import numpy as np
import tifffile

IMAGE = ROOT / "validation" / "test.tif"
IMAGEJ = ROOT / "validation" / "imagej_raw.csv"
OUTPUT = ROOT / "validation" / "raw_comparison.csv"


def main() -> None:
    array = tifffile.imread(IMAGE)
    imagej_rows = list(csv.DictReader(IMAGEJ.open(encoding="utf-8")))
    report = []
    for row in imagej_rows:
        x, y, w, h = (int(row[k]) for k in ("x", "y", "w", "h"))
        roi = array[y : y + h, x : x + w].astype(np.float64)
        ours_area = int(roi.size)
        ours_mean = float(roi.mean())
        ours_raw = float(roi.sum(dtype=np.float64))
        ij_raw = float(row["raw_int_den"])
        report.append(
            {
                "lane": row["lane"],
                "area_imagej": row["area"],
                "area_ours": ours_area,
                "mean_imagej": row["mean"],
                "mean_ours": f"{ours_mean:.12f}",
                "raw_imagej": f"{ij_raw:.3f}",
                "raw_ours": f"{ours_raw:.3f}",
                "absolute_diff": f"{ours_raw - ij_raw:.6f}",
                "relative_diff_percent": f"{(ours_raw - ij_raw) / ij_raw * 100:.12f}",
            }
        )
    with OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=report[0].keys())
        writer.writeheader()
        writer.writerows(report)
    max_abs = max(abs(float(r["absolute_diff"])) for r in report)
    max_pct = max(abs(float(r["relative_diff_percent"])) for r in report)
    print(f"Compared {len(report)} ROIs; max absolute difference={max_abs:g}; max relative difference={max_pct:g}%")


if __name__ == "__main__":
    main()
