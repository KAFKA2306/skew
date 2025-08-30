"""Compute and plot NVDA volume and skewness.

This script downloads six months of daily NVDA price data from Yahoo
Finance, computes the skewness of the daily log returns, and produces
two plots:

1. Daily trading volume.
2. 30-day rolling skewness of log returns.

The resulting images are saved in the ``docs`` directory as
``nvda_volume.png`` and ``nvda_skew.png``.

Run this file directly to regenerate the statistics and plots.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import yfinance as yf

PERIOD = "6mo"


def compute_data(period: str = PERIOD) -> pd.DataFrame:
    """Download NVDA data and compute log returns.

    Returns a DataFrame with ``log_return`` and ``rolling_skew`` columns.
    """

    data = yf.download("NVDA", period=period, interval="1d")
    data["log_return"] = np.log(data["Close"]).diff()
    data["rolling_skew"] = data["log_return"].rolling(window=30).skew()
    return data


def save_plots(data: pd.DataFrame) -> None:
    """Create and save volume and skew plots."""

    docs = Path("docs")
    docs.mkdir(exist_ok=True)

    plt.figure(figsize=(10, 4))
    data["Volume"].plot(title="NVDA Daily Volume - Last 6 Months")
    plt.tight_layout()
    plt.savefig(docs / "nvda_volume.png")

    plt.figure(figsize=(10, 4))
    data["rolling_skew"].dropna().plot(
        title="NVDA 30-Day Rolling Skew - Last 6 Months",
    )
    plt.tight_layout()
    plt.savefig(docs / "nvda_skew.png")


def compute_skew(data: pd.DataFrame | None = None, period: str = PERIOD) -> float:
    """Return skewness of NVDA log returns.

    If ``data`` is ``None``, fresh data for ``period`` is downloaded.
    """

    if data is None:
        data = compute_data(period)
    return data["log_return"].dropna().skew()


if __name__ == "__main__":
    df = compute_data()
    save_plots(df)
    skew = compute_skew(df)
    print(f"NVDA daily log return skewness over the last six months: {skew}")

