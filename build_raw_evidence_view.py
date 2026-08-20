#!/usr/bin/env python3
"""Build a standardized raw-evidence view from DeFi provenance."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_PROVENANCE = Path("api/v1/defi/provenance.json")
DEFAULT_OUTPUT = Path("api/v1/defi/raw-evidence.json")


def collect_refs(provenance: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = list(provenance["contract_raw_refs"])
    for day in provenance["dates"].values():
        refs.extend(day["aave_raw_refs"])
        refs.extend(day["uniswap_raw_refs"])
        refs.append(day["start_boundary"]["raw_ref"])
        refs.append(day["end_boundary"]["raw_ref"])
    return refs


def build(provenance: dict[str, Any]) -> dict[str, Any]:
    records: dict[str, dict[str, Any]] = {}
    for ref in collect_refs(provenance):
        path = ref["path"]
        digest = ref["sha256"]
        source_url = ref["source_url"]
        if not path.startswith("raw/objects/"):
            raise ValueError(f"non-raw evidence path: {path}")
        if len(digest) != 64:
            raise ValueError(f"invalid SHA-256: {digest}")
        if not source_url.startswith("https://"):
            raise ValueError(f"invalid source URL: {source_url}")
        records[path] = {
            "source_evidence_path": path,
            "source_sha256": digest,
            "source_url": source_url,
        }
    return {
        "schema_version": 1,
        "record_count": len(records),
        "records": [records[path] for path in sorted(records)],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provenance", type=Path, default=DEFAULT_PROVENANCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    provenance = json.loads(args.provenance.read_text(encoding="utf-8"))
    output = build(provenance)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": output["record_count"], "output": str(args.output)}))


if __name__ == "__main__":
    main()
