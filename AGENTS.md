# AGENTS.md

## Repository responsibility

This repository owns finalized Ethereum DeFi primary evidence for Aave V3 and Uniswap V3. Do not reintroduce the former stock/skewness/Tauri product surface.

## Source hierarchy

1. Ethereum mainnet finalized block/log evidence
2. Official Aave and Uniswap deployment/address repositories
3. Derived daily views regenerated from stored raw evidence

Aggregator TVL/volume, third-party indexed event APIs, guessed backfills, and silent fallbacks are not canonical inputs.

## Autonomous execution

1. Re-read current `main`, README, open Issues/PRs, raw evidence/manifests, workflows, tests and public outputs before choosing work.
2. Continue one existing canonical workline for the same outcome before creating another collector, evidence store, RPC fallback, branch or Issue.
3. Prefer new verified finalized-chain evidence, provenance/rebuild correctness, protocol identity/semantic fixes, public read-back, then simplification that removes recurring manual work.
4. Keep deterministic PR verification independent of unstable live RPC where possible. Live acquisition still requires explicit runtime evidence when live collection is the requested outcome.
5. Stop at the fixed point. Do not add protocols, metrics, wrappers or dashboards solely to increase activity or coverage counts.
6. If the external RPC condition has not changed, do not repeatedly churn a blocked live-collection workline.

Other finance repositories should reference this repository's versioned DeFi artifacts instead of maintaining duplicate Aave/Uniswap facts or collectors. Do not execute swaps, approvals, deposits, borrows, repayments, liquidations, wallet operations, trades, or account actions. An unavailable or rate-limited endpoint is a blocker, not permission to fabricate or silently change authority.

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

Production evidence additionally requires the `DeFi evidence` GitHub Actions workflow to pass live collection, provenance audit, and offline deterministic rebuild. A check or runtime layer that did not run is not PASS.

## Completion report

Report verified evidence/capability Before -> After, canonical raw/hash evidence, Issue/PR/commit/check/public evidence when applicable, duplicate/manual work removed, and the remaining verified blocker.