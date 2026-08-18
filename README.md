# DeFi Primary Evidence

[![DeFi evidence](https://github.com/KAFKA2306/skew/actions/workflows/defi-evidence.yml/badge.svg)](https://github.com/KAFKA2306/skew/actions/workflows/defi-evidence.yml)

Ethereum上のDeFi activityを、**canonical contractのfinalized raw logsから再生成できるdataset**として保存するrepositoryです。旧skewness/Tauri株価UIは正準責務から削除し、`api/v1/defi/` を正準成果物にします。

## 正準data

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

各日についてevent countと関与reserve addressを保持します。reserveごとにdecimals/asset identityが異なるため、異なるassetのamountを1つの「volume」へ合算しません。

## Uniswap V3

Uniswap公式deployment registryのEthereum `UniswapV3Factory` を起点に、USDC/WETH 0.3% poolをfactory `getPool()`からruntime解決します。pool addressを第三者indexから取得しません。

Swap logから次を日次集計します。

- swap count
- gross token0 delta
- gross token1 delta
- token0/token1 identity・decimals
- fee tier

`gross_token0` / `gross_token1` はraw token amountであり、USD volumeとは呼びません。

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

contract stateはfinalized blockでbytecode hashまで確認し、address/code fingerprintが変わった場合だけ`contract-history.json`へappendします。migrationやupgradeを暗黙に同一contractとして扱いません。

## 集計しないもの

DefiLlama等のaggregator TVL/volumeを正準値として保存しません。raw protocol logから直接観測できないTVL・USD換算・APR・revenue等を推測で補完しません。

## 実行

標準ライブラリのみです。

```bash
python defi.py
```

保存済みraw evidenceから再生成:

```bash
python defi.py --offline
```

テスト:

```bash
python -m unittest -v test_defi
```

Tracking issue: https://github.com/KAFKA2306/skew/issues/11
