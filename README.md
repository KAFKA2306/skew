# skew

[![Creator Export Quality](https://github.com/KAFKA2306/skew/actions/workflows/creator-export-quality.yml/badge.svg)](https://github.com/KAFKA2306/skew/actions/workflows/creator-export-quality.yml)

Yahoo Finance の価格系列を取得・解析する Tauri デスクトップアプリです。

現行 UI は銘柄・期間・intervalを指定して価格系列を取得し、終値、SMA5、SMA20をチャート表示します。日次平均リターン、日次標準偏差、年率Sharpeも計算し、結果をCSVまたはYAMLへ保存できます。

- Frontend: React + TypeScript
- Desktop runtime: Tauri / Rust
- Price source: Yahoo Finance
- Analysis: daily mean return, daily standard deviation, annualized Sharpe, SMA5, SMA20
- Export: CSV / YAML

実装の中心は `src/App.tsx` と `src-tauri/` です。
