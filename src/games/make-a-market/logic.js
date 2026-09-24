/* Game 3 rules, shared with scripts/sim_game3.js. */
(function (root) {
  'use strict';
  /* Trades against one quote. The informed trader compares its fair value with
     the quote; an uninformed customer trades with probability 1 - spread/div.
     Each trade is from the counterparty's side: 'buy' means they bought from you. */
  function tradesOnQuote(rng, bid, ask, fairValue, div) {
    const out = [];
    if (fairValue > ask) out.push({ who: 'informed', side: 'buy', price: ask });
    else if (fairValue < bid) out.push({ who: 'informed', side: 'sell', price: bid });
    else out.push({ who: 'informed', side: 'pass' });
    const spread = ask - bid;
    if (rng.next() < 1 - spread / div) {
      const side = rng.next() < 0.5 ? 'buy' : 'sell';
      out.push({ who: 'customer', side, price: side === 'buy' ? ask : bid });
    } else out.push({ who: 'customer', side: 'pass' });
    return out;
  }
  /* Your PnL on one trade once the asset settles at `total`. */
  function tradePnl(t, total) {
    if (t.side === 'buy') return t.price - total;   // you sold to them
    if (t.side === 'sell') return total - t.price;  // you bought from them
    return 0;
  }
  const api = { tradesOnQuote, tradePnl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.G3Logic = api;
})(this);
