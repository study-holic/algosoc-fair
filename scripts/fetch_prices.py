"""Fetch real daily closes for game 2 (Real or Random).

For each ticker: download 10 years of adjusted daily closes with yfinance,
take 4 non-overlapping random 120-day windows, and write data/prices.json as
an array of {ticker, name, asset_class, start_date, closes}.

Closes are written exactly as yfinance returns them. Windows containing a
missing or non-positive close (e.g. WTI crude in April 2020) are skipped,
because game 2 works in log prices.

Usage:  python scripts/fetch_prices.py [--seed 2026]
"""
import argparse
import json
import math
import random
from pathlib import Path

import yfinance as yf

TICKERS = [
    ("AAPL", "Apple", "Equities"),
    ("MSFT", "Microsoft", "Equities"),
    ("TSLA", "Tesla", "Equities"),
    ("NVDA", "Nvidia", "Equities"),
    ("JPM", "JPMorgan Chase", "Equities"),
    ("KO", "Coca-Cola", "Equities"),
    ("HSBA.L", "HSBC", "Equities"),
    ("BP.L", "BP", "Equities"),
    ("VOD.L", "Vodafone", "Equities"),
    ("EURUSD=X", "EUR/USD", "FX"),
    ("GBPUSD=X", "GBP/USD", "FX"),
    ("USDJPY=X", "USD/JPY", "FX"),
    ("CL=F", "Crude oil", "Commodities"),
    ("GC=F", "Gold", "Commodities"),
    ("NG=F", "Natural gas", "Commodities"),
    ("TLT", "US Treasury bonds (20y+)", "Fixed Income"),
]
WINDOW = 120
PER_TICKER = 4
OUT = Path(__file__).resolve().parent.parent / "data" / "prices.json"


def valid(values):
    return all(v is not None and math.isfinite(v) and v > 0 for v in values)


def pick_windows(n, rng, ok):
    """Pick PER_TICKER non-overlapping start indices where ok(start) holds."""
    for _ in range(2000):
        starts = sorted(rng.sample(range(n - WINDOW + 1), PER_TICKER))
        if all(b - a >= WINDOW for a, b in zip(starts, starts[1:])) and all(ok(s) for s in starts):
            return starts
    raise RuntimeError("could not place non-overlapping windows")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = []
    for ticker, name, asset_class in TICKERS:
        df = yf.download(ticker, period="10y", interval="1d", auto_adjust=True, progress=False)
        close = df["Close"]
        if hasattr(close, "columns"):  # yfinance >= 0.2.5x returns a one-column frame
            close = close[ticker]
        close = close.dropna()
        dates = [d.strftime("%Y-%m-%d") for d in close.index]
        values = [float(v) for v in close.values]
        if len(values) < WINDOW * PER_TICKER * 2:
            raise RuntimeError(f"{ticker}: only {len(values)} closes")
        starts = pick_windows(len(values), rng, lambda s: valid(values[s:s + WINDOW]))
        for s in starts:
            out.append({
                "ticker": ticker,
                "name": name,
                "asset_class": asset_class,
                "start_date": dates[s],
                "closes": values[s:s + WINDOW],
            })
        print(f"{ticker:10s} {len(values):5d} closes {dates[0]} to {dates[-1]}  windows at {[dates[s] for s in starts]}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {len(out)} windows to {OUT}")


if __name__ == "__main__":
    main()
