# skew

This repository downloads six months of NVDA price data from Yahoo
Finance, computes the skewness of daily log returns, and produces plots
showing daily trading volume and 30‑day rolling skewness.

Run `python skew_nvda.py` to regenerate the statistics. The script saves
plots to `docs/nvda_volume.png` and `docs/nvda_skew.png`, which are
ignored in version control.
