#!/usr/bin/env python3
"""Reproducible archive growth audit using committed Git snapshot manifests.

No network access or third-party Python libraries required. This reads manifest
versions already in the local Git repository and never changes archive records.
"""
import argparse
import csv
import html
import json
import subprocess
from pathlib import Path

MILESTONES = (
    ("Rolling snapshot", "570a6084113754b622348c8c9825dc2e72ed8444"),
    ("History recovered", "0cd74d6e176d8eef849d37efebdcb00686468c59"),
    ("PURSUE source added", "55314b498092ba9582c34f1920270124f0d5570f"),
)


def parse_manifest(text):
    data = json.loads(text)
    count = data["records"]
    agencies = data["agencies"]
    if not isinstance(count, int) or count < 0:
        raise ValueError("Invalid record count")
    if not isinstance(agencies, dict) or any(
        not isinstance(value, int) or value < 0 for value in agencies.values()
    ):
        raise ValueError("Invalid agency counts")
    if sum(agencies.values()) != count:
        raise ValueError("Sum of agency counts does not equal total records")
    return {"records": count, "agencies": agencies}


def load_manifest(ref):
    process = subprocess.run(
        ["git", "show", f"{ref}:data/snapshot-manifest.json"],
        capture_output=True,
        check=True,
        text=True,
    )
    return parse_manifest(process.stdout)


def analyze(milestones, fetch=load_manifest):
    snapshots = []
    for label, ref in milestones:
        data = fetch(ref)
        snapshots.append({"stage": label, "ref": ref, **data})
    differences = []
    for previous, current in zip(snapshots, snapshots[1:]):
        agencies = sorted(set(previous["agencies"]) | set(current["agencies"]))
        differences.append({
            "from": previous["stage"], "to": current["stage"],
            "net_added": current["records"] - previous["records"],
            "agency_deltas": {
                agency: current["agencies"].get(agency, 0)
                - previous["agencies"].get(agency, 0)
                for agency in agencies
            },
        })
    return {
        "snapshots": snapshots,
        "changes": differences,
        "caveat": (
            "Archive record counts indicate observations and backfill, not "
            "government declassification dates or validated source availability."
        ),
    }


def make_svg(snapshots):
    maximum = max((item["records"] for item in snapshots), default=1) or 1
    bars = []
    for index, item in enumerate(snapshots):
        y = 67 + index * 70
        length = 460 * item["records"] / maximum
        label = html.escape(item["stage"])
        bars.append(
            f'<text x="20" y="{y + 21}" font-size="15" fill="#252525">{label}</text>'
            f'<rect x="245" y="{y}" width="{length:.1f}" height="30" rx="4" fill="#6852b3"/>'
            f'<text x="{250 + length:.1f}" y="{y + 21}" font-size="16" fill="#252525">'
            f'{item["records"]:,}</text>'
        )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="830" height="320" '
        'viewBox="0 0 830 320" role="img" aria-label="Archive record growth">'
        '<rect width="830" height="320" fill="#ffffff"/>'
        '<text x="20" y="35" font-size="23" font-weight="bold" fill="#252525">'
        'Declassified archive record growth</text>'
        + "".join(bars)
        + '<text x="20" y="296" font-size="12" fill="#555">'
        'Counts from committed snapshot manifests, not dates of government release.</text>'
        '</svg>\n'
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir", type=Path,
        default=Path("analysis/archive-quality/output"),
        help="Where to write report.json, growth.csv and growth.svg",
    )
    args = parser.parse_args()
    result = analyze(MILESTONES)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "report.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8"
    )
    with (args.output_dir / "growth.csv").open(
        "w", newline="", encoding="utf-8"
    ) as file:
        writer = csv.writer(file)
        writer.writerow(["stage", "ref", "records"])
        for snap in result["snapshots"]:
            writer.writerow([snap["stage"], snap["ref"], snap["records"]])
    (args.output_dir / "growth.svg").write_text(
        make_svg(result["snapshots"]), encoding="utf-8"
    )
    for change in result["changes"]:
        print(f'{change["from"]} -> {change["to"]}: {change["net_added"]:+d} records')
    print(f"Results: {args.output_dir}")


if __name__ == "__main__":
    main()
