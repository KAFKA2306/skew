# skew

This repository downloads six months of NVDA price data from Yahoo
Finance, computes the skewness of daily log returns, and produces plots
showing daily trading volume and 30‑day rolling skewness.

Run `python skew_nvda.py` to regenerate the statistics. The script saves
plots to `docs/nvda_volume.png` and `docs/nvda_skew.png`, which are
ignored in version control.

## GitHub Pagesによる公開

GitHub Actions ワークフローが依存関係をインストールし、プロットを生成し、`docs` ディレクトリを GitHub Pages にデプロイします。生成されたグラフは [GitHub Pages サイト](https://<ユーザー名>.github.io/skew/) で閲覧できます。

![NVDAの出来高](https://<ユーザー名>.github.io/skew/nvda_volume.png)
![NVDAの30日ローリング歪度](https://<ユーザー名>.github.io/skew/nvda_skew.png)
