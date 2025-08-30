# skew

This repository downloads six months of NVDA price data from Yahoo
Finance, computes the skewness of daily log returns, and produces plots
showing daily trading volume and 30‑day rolling skewness.

Run `python skew_nvda.py` to regenerate the statistics. The script saves
plots to `docs/nvda_volume.png` and `docs/nvda_skew.png`, which are
ignored in version control.

A GitHub Actions workflow builds these charts and publishes the `docs`
directory to GitHub Pages. After enabling Pages, visit
`https://<YOUR_GITHUB_USERNAME>.github.io/skew/` to view the latest plots.

![NVDA trading volume](https://<YOUR_GITHUB_USERNAME>.github.io/skew/nvda_volume.png)
![NVDA 30-day rolling skew](https://<YOUR_GITHUB_USERNAME>.github.io/skew/nvda_skew.png)

