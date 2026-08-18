# AGENTS.md

## Repository responsibility

This repository owns finalized Ethereum DeFi primary evidence for Aave V3 and Uniswap V3. Do not reintroduce the former stock/skewness/Tauri product surface.

## Source hierarchy

1. Ethereum mainnet finalized block/log evidence
2. Official Aave and Uniswap deployment/address repositories
3. Derived daily views regenerated from stored raw evidence

Aggregator TVL/volume, third-party indexed event APIs, guessed backfills, and silent fallbacks are not canonical inputs.

## Implementation constraints

- Python standard library only unless a dependency is strictly necessary for evidence correctness.
- Unknown contract/event/schema states fail closed.
- Preserve chain ID, block number, block hash, transaction/log provenance where available.
- Keep protocol asset amounts in native units unless a primary price source is explicitly added; never relabel token deltas as USD volume.
- Contract migrations/upgrades append history instead of mutating old evidence.
- Delete obsolete duplicate paths rather than maintain compatibility with the removed Tauri/React/Rust prototype.

## Required checks

```bash
python -m py_compile defi.py test_defi.py
python -m unittest -v test_defi
```

Production evidence additionally requires the `DeFi evidence` GitHub Actions workflow to pass live collection, provenance audit, and offline deterministic rebuild.
