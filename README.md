# DeFi Primary Evidence

[![DeFi evidence](https://github.com/KAFKA2306/DeFi/actions/workflows/defi-evidence.yml/badge.svg)](https://github.com/KAFKA2306/DeFi/actions/workflows/defi-evidence.yml)
[![Deploy Pages](https://github.com/KAFKA2306/DeFi/actions/workflows/pages.yml/badge.svg)](https://github.com/KAFKA2306/DeFi/actions/workflows/pages.yml)

Ethereum上のDeFi activityを、**canonical contractのfinalized raw logsから再生成できるdataset**として保存します。`api/v1/defi/` が正準成果物です。

## Public dashboard

- Daily entry point: https://kafka2306.github.io/DeFi/
- latest complete UTC dayのAave event count / LiquidationCall count / Uniswap swap count
- previous complete dayとprior 7-day averageとの同一定義比較
- 30 complete-day history
- contract identityとcanonical data contractへの直接link

Pagesは`daily.json / index.json / contracts.json`だけをsmall public projectionとして使い、巨大なraw/provenance/event ledgerを複製しません。TVL、USD volume、APR、revenue、独自stress scoreは推測しません。

## Canonical data

- [dataset index](api/v1/defi/index.json)
- [daily cross-protocol view](api/v1/defi/daily.json)
- [Aave V3 daily events](api/v1/defi/aave-daily.json)
- [Uniswap V3 daily swaps](api/v1/defi/uniswap-daily.json)
- [contract registry / history](api/v1/defi/contracts.json)
- [raw provenance](api/v1/defi/provenance.json)

`DeFi evidence` workflowが毎日Ethereum mainnetのfinalized dataを取得し、raw JSON-RPC responseをSHA-256で固定した後、Aave/Uniswapのdaily viewを生成します。CIでは保存済みraw evidenceだけからAPIを再生成し、live生成物との差分がないことを検証します。

## Aave V3

Aave公式address bookのEthereum `POOL_ADDRESSES_PROVIDER` と `POOL` を正準identityとして使い、providerの`getPool()`結果もfinalized blockで照合します。

対象event:

- Supply
- Withdraw
- Borrow
- Repay
- LiquidationCall

各日についてevent countと関与reserve addressを保持します。reserveごとにdecimals/asset identityが異なるため、異なるassetのamountを1つのvolumeへ合算しません。

## Uniswap V3

Uniswap公式deployment registryのEthereum `UniswapV3Factory` を起点に、USDC/WETH 0.3% poolをfactory `getPool()`からruntime解決します。

Swap logから次を日次集計します。

- swap count
- gross token0 delta
- gross token1 delta
- token0/token1 identity・decimals
- fee tier

`gross_token0` / `gross_token1` はraw token amountであり、USD volumeではありません。

## Provenance contract

```text
Aave / Uniswap official registry
  +
Ethereum finalized JSON-RPC
  ↓
data/defi/raw/objects/<sha256>.json
  ↓
data/defi/evidence-index.json
  ↓
api/v1/defi/*.json|csv
```

各dayはUTC complete dayです。日付境界をEthereum block timestampから解決し、`from_block / to_block / block_hash` とraw `eth_getLogs` responseを保持します。current partial dayは公開しません。

contract stateはfinalized blockでbytecode hashまで確認し、address/code fingerprintが変わった場合だけhistoryへappendします。migrationやupgradeを暗黙に同一contractとして扱いません。

## Verification

```bash
python defi.py
python defi.py --offline
python -m unittest -v test_defi
```

- `DeFi evidence` は一次chain evidenceとoffline rebuildを検証します。
- `Deploy Pages` はPRでcomplete-day semanticsとdashboard JSを検証し、mainではsmall public projectionをdeployしてexact commit SHAとlatest canonical dayを照合します。

Tracking issue: https://github.com/KAFKA2306/DeFi/issues/17
