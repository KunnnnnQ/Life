"""Validate every node in the knowledge base.

Usage:
    python scripts/validate.py            # schema + graph checks (offline)
    python scripts/validate.py --online   # also check each DOI against Crossref
    python scripts/validate.py --strict   # treat warnings as errors
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from kblib import Report, check_graph, load_nodes

sys.stdout.reconfigure(encoding="utf-8")


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def check_dois(nodes: dict[str, dict], report: Report) -> None:
    for nid, node in nodes.items():
        if node["type"] != "source" or not node["citation"].get("doi"):
            continue
        cit, where = node["citation"], node["_path"]
        url = "https://api.crossref.org/works/" + urllib.parse.quote(cit["doi"], safe="")
        req = urllib.request.Request(url, headers={"User-Agent": "mood-capsule-kb-validator/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                meta = json.load(resp)["message"]
        except urllib.error.HTTPError as e:
            report.err(where, f"DOI {cit['doi']} not found on Crossref (HTTP {e.code})")
            continue
        except Exception as e:  # network trouble is not the contributor's fault
            report.warn(where, f"could not reach Crossref for {cit['doi']}: {e}")
            continue
        remote_title = (meta.get("title") or [""])[0]
        # Crossref sometimes drops or adds a subtitle, so also compare main titles.
        ratio = max(
            difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()
            for a in (remote_title, remote_title.split(":")[0])
            for b in (cit["title"], cit["title"].split(":")[0])
        )
        if ratio < 0.85:
            report.err(where, f"title mismatch with Crossref ({ratio:.2f}): '{remote_title}'")
        # Online-first and print issue years often differ; accept any year Crossref records.
        years = set()
        for key in ("published-print", "published-online", "issued", "published"):
            parts = (meta.get(key) or {}).get("date-parts") or [[None]]
            if parts[0] and parts[0][0]:
                years.add(parts[0][0])
        issue_parts = ((meta.get("journal-issue") or {}).get("published-print") or {}).get("date-parts") or [[None]]
        if issue_parts[0] and issue_parts[0][0]:
            years.add(issue_parts[0][0])
        if years and cit["year"] not in years:
            report.err(where, f"year {cit['year']} but Crossref says {sorted(years)}")
        first = (meta.get("author") or [{}])[0].get("family", "")
        if first and _norm(first) not in _norm(cit["authors"][0]):
            report.err(where, f"first author '{cit['authors'][0]}' but Crossref says '{first}'")
        time.sleep(0.2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--online", action="store_true", help="verify DOIs against Crossref")
    ap.add_argument("--strict", action="store_true", help="fail on warnings too")
    args = ap.parse_args()

    report = Report()
    nodes = load_nodes(report)
    check_graph(nodes, report)
    if args.online:
        check_dois(nodes, report)

    counts: dict[str, int] = {}
    for n in nodes.values():
        counts[n["type"]] = counts.get(n["type"], 0) + 1
    print("nodes: " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) + f" (total {len(nodes)})")
    for w in report.warnings:
        print(f"WARN  {w}")
    for e in report.errors:
        print(f"ERROR {e}")
    failed = bool(report.errors) or (args.strict and bool(report.warnings))
    print(f"\n{len(report.errors)} error(s), {len(report.warnings)} warning(s) -> {'FAIL' if failed else 'OK'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
