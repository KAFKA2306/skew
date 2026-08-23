#!/usr/bin/env python3
"""Build compact standardized evidence views from DeFi provenance."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_PROVENANCE = Path("api/v1/defi/provenance.json")
DEFAULT_OUTPUT = Path("api/v1/defi/raw-evidence.json")
DEFAULT_LOCATORS = Path("api/v1/defi/evidence-locators.json")


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


def compact_ref(ref: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_evidence_path": ref["path"],
        "source_sha256": ref["sha256"],
        "source_url": ref["source_url"],
    }


def build_locators(provenance: dict[str, Any]) -> dict[str, Any]:
    records = []
    for date, day in sorted(provenance["dates"].items()):
        start = day["start_boundary"]
        end = day["end_boundary"]
        records.append(
            {
                "date": date,
                "from_block": day["from_block"],
                "to_block": day["to_block"],
                "start_boundary": {
                    "block_number": start["block_number"],
                    "block_hash": start["block_hash"],
                    "block_timestamp": start["block_timestamp"],
                    "raw_ref": compact_ref(start["raw_ref"]),
                },
                "end_boundary": {
                    "block_number": end["block_number"],
                    "block_hash": end["block_hash"],
                    "block_timestamp": end["block_timestamp"],
                    "raw_ref": compact_ref(end["raw_ref"]),
                },
                "aave": {
                    "log_count": day["aave_log_count"],
                    "raw_refs": [compact_ref(ref) for ref in day["aave_raw_refs"]],
                },
                "uniswap": {
                    "log_count": day["uniswap_log_count"],
                    "raw_refs": [compact_ref(ref) for ref in day["uniswap_raw_refs"]],
                },
            }
        )
    return {
        "schema_version": 1,
        "chain_id": provenance["chain_id"],
        "record_count": len(records),
        "records": records,
        "contract_history": provenance["contract_history"],
        "rule": "Each record identifies the finalized UTC-day block range, boundary block hashes, and content-addressed raw JSON-RPC evidence required to reproduce that day.",
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provenance", type=Path, default=DEFAULT_PROVENANCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--locators-output", type=Path, default=DEFAULT_LOCATORS)
    args = parser.parse_args()
    provenance = json.loads(args.provenance.read_text(encoding="utf-8"))
    raw_view = build(provenance)
    locators = build_locators(provenance)
    write_json(args.output, raw_view)
    write_json(args.locators_output, locators)
    print(json.dumps({"records": raw_view["record_count"], "days": locators["record_count"], "output": str(args.output), "locators": str(args.locators_output)}))


if __name__ == "__main__":
    main()
