#!/usr/bin/env python3
"""Collect finalized Ethereum logs for canonical Aave V3 and Uniswap V3 contracts."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

RPC_URL = os.environ.get("ETH_RPC_URL")
CONTRACTS = {
    "aave-v3-pool": {
        "protocol": "Aave",
        "version": "V3",
        "address": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
        "source": "https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3Ethereum.sol",
    },
    "uniswap-v3-factory": {
        "protocol": "Uniswap",
        "version": "V3",
        "address": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
        "source": "https://github.com/Uniswap/v3-periphery/blob/main/deploys.md",
    },
}


def rpc(method: str, params: list[object]) -> object:
    if not RPC_URL:
        raise RuntimeError("ETH_RPC_URL is required")
    body = json.dumps({"jsonrpc": "2.0", "id": method, "method": method, "params": params}).encode()
    request = Request(RPC_URL, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=60) as response:
        payload = json.loads(response.read())
    if payload.get("error"):
        raise RuntimeError(f"{method}: {payload['error']}")
    return payload["result"]


def finalized_height() -> int:
    block = rpc("eth_getBlockByNumber", ["finalized", False])
    if not block or not block.get("number"):
        raise RuntimeError("RPC endpoint did not return a finalized block")
    return int(block["number"], 16)


def normalize_log(protocol_id: str, log: dict[str, object]) -> dict[str, object]:
    contract = CONTRACTS[protocol_id]
    return {
        "protocol_id": protocol_id,
        "protocol": contract["protocol"],
        "version": contract["version"],
        "contract_address": contract["address"],
        "block_number": int(str(log["blockNumber"]), 16),
        "block_hash": log["blockHash"],
        "transaction_hash": log["transactionHash"],
        "transaction_index": int(str(log["transactionIndex"]), 16),
        "log_index": int(str(log["logIndex"]), 16),
        "topics": log.get("topics", []),
        "data": log.get("data"),
        "removed": bool(log.get("removed", False)),
    }


def collect(from_block: int, to_block: int) -> dict[str, object]:
    finalized = finalized_height()
    if from_block < 0 or to_block < from_block:
        raise ValueError("invalid block range")
    if to_block > finalized:
        raise ValueError(f"to_block {to_block} exceeds finalized height {finalized}")

    observations: list[dict[str, object]] = []
    for protocol_id, contract in CONTRACTS.items():
        logs = rpc("eth_getLogs", [{
            "address": contract["address"],
            "fromBlock": hex(from_block),
            "toBlock": hex(to_block),
        }])
        observations.extend(normalize_log(protocol_id, log) for log in logs)

    return {
        "schema_version": 1,
        "chain": "ethereum-mainnet",
        "chain_id": 1,
        "finalized_height_at_collection": finalized,
        "from_block": from_block,
        "to_block": to_block,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "contracts": CONTRACTS,
        "logs": observations,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-block", type=int, required=True)
    parser.add_argument("--to-block", type=int, required=True)
    parser.add_argument("--output", type=Path, default=Path("output/defi-logs.json"))
    args = parser.parse_args()
    result = collect(args.from_block, args.to_block)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {len(result['logs'])} finalized logs -> {args.output}")


if __name__ == "__main__":
    main()
