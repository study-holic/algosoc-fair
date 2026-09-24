/* Regime-switching price process and moving-average crossover maths.
   Used by game 1 (ticks), game 4 (daily bars) and the simulation scripts. */
(function (root) {
  'use strict';

  /* Log-price random walk that switches between trending and mean-reverting
     regimes, with occasional small jumps. Returns n+1 prices starting at P.start.
     P: { start, sigma, regimeMin, regimeMax, pTrend, driftMin, driftMax,
          kappaMin, kappaMax, volMin, volMax, jumpProb, jumpMin, jumpMax } */
  function regimePath(rng, n, P) {
    const out = new Float64Array(n + 1);
    out[0] = P.start;
    let x = 0, left = 0, trend = false, drift = 0, vol = P.sigma, anchor = 0, kappa = 0;
    for (let i = 1; i <= n; i++) {
      if (left <= 0) {
        left = rng.int(P.regimeMin, P.regimeMax);
        trend = rng.next() < P.pTrend;
        drift = rng.sign() * rng.uniform(P.driftMin, P.driftMax) * P.sigma;
        vol = P.sigma * rng.uniform(P.volMin, P.volMax);
        kappa = rng.uniform(P.kappaMin, P.kappaMax);
        anchor = x;
      }
      left--;
      let dx = vol * rng.normal();
      dx += trend ? drift : kappa * (anchor - x);
      if (rng.next() < P.jumpProb) dx += rng.sign() * P.sigma * rng.uniform(P.jumpMin, P.jumpMax);
      x += dx;
      out[i] = P.start * Math.exp(x);
    }
    return out;
  }

  /* Simple moving average; entries before index w-1 are NaN. */
  function sma(p, w) {
    const out = new Float64Array(p.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      s += p[i];
      if (i >= w) s -= p[i - w];
      if (i >= w - 1) out[i] = s / w;
    }
    return out;
  }

  /* Crossover signal at index i: +1 when fast MA > slow MA, else -1. */
  function signalAt(maF, maS, i) {
    return maF[i] > maS[i] ? 1 : -1;
  }

  /* Game 1 bot: holds +/-size shares from tick `from` to tick `to`, deciding at
     each tick from the MAs up to and including it. Returns pnl and its trades. */
  function tickBot(prices, fast, slow, from, to, size, cost) {
    const maF = sma(prices, fast), maS = sma(prices, slow);
    let pos = 0, pnl = 0;
    const trades = [];
    for (let i = from; i < to; i++) {
      const want = signalAt(maF, maS, i);
      if (want !== pos) {
        trades.push({ i, price: prices[i], side: want > pos ? 'buy' : 'sell', pos: want });
        pos = want;
        pnl -= cost;
      }
      pnl += pos * size * (prices[i + 1] - prices[i]);
    }
    return { pnl, trades };
  }

  /* Daily backtest for game 4. Position decided at the close of day t earns the
     return from t to t+1. Each position change costs `cost` as a fraction of equity.
     Returns equity (length to-from+1, starting at 1), daily returns and trade count. */
  function dailyBacktest(prices, maF, maS, from, to, cost) {
    const n = to - from;
    const eq = new Float64Array(n + 1);
    const rets = new Float64Array(n);
    const pos = new Int8Array(n + 1);
    let e = 1, p = 0, trades = 0;
    eq[0] = 1;
    for (let k = 0; k < n; k++) {
      const i = from + k;
      const want = signalAt(maF, maS, i);
      let r = 0;
      if (want !== p) { r -= cost; trades++; p = want; }
      pos[k] = p;
      r += p * (prices[i + 1] / prices[i] - 1);
      e *= 1 + r;
      rets[k] = r;
      eq[k + 1] = e;
    }
    pos[n] = p;
    return { eq, rets, trades, pos };
  }

  /* Annualised Sharpe ratio of daily returns (no risk-free rate). */
  function sharpe(rets, from, to) {
    from = from || 0; to = to == null ? rets.length : to;
    const n = to - from;
    if (n < 2) return 0;
    let m = 0;
    for (let i = from; i < to; i++) m += rets[i];
    m /= n;
    let v = 0;
    for (let i = from; i < to; i++) v += (rets[i] - m) * (rets[i] - m);
    const sd = Math.sqrt(v / (n - 1));
    return sd > 0 ? (m / sd) * Math.sqrt(252) : 0;
  }

  const api = { regimePath, sma, signalAt, tickBot, dailyBacktest, sharpe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ASMarket = api;
})(this);
