/* Game 1 simulation: how often does the 10/30 moving-average bot finish positive?
   Usage: node scripts/sim_game1.js [games=20000] */
const { makeRng } = require('../src/shared/rng.js');
const M = require('../src/shared/market.js');
const C = require('./load_config.js')('beat-the-market');

const N = +process.argv[2] || 20000;
const H = C.HISTORY_TICKS, T = C.DURATION_TICKS;
let wins = 0, sum = 0, trades = 0;
const pnls = [], ranges = [], moves = [];
for (let g = 0; g < N; g++) {
  const rng = makeRng(g + 1);
  const raw = M.regimePath(rng, H + T, C.PATH);
  const k = C.START_PRICE / raw[H];
  const p = Array.from(raw, (v) => v * k);
  const bot = M.tickBot(p, C.BOT_FAST, C.BOT_SLOW, H, H + T, C.SIZE, C.COST);
  if (bot.pnl > 0) wins++;
  sum += bot.pnl; trades += bot.trades.length; pnls.push(bot.pnl);
  let lo = Infinity, hi = -Infinity;
  for (let i = H; i <= H + T; i++) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  ranges.push(hi - lo); moves.push(Math.abs(p[H + T] - p[H]));
}
const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
const p = wins / N, se = Math.sqrt(p * (1 - p) / N);
console.log(`Game 1: ${N} simulated games, seeds 1..${N}, bot = MA ${C.BOT_FAST}/${C.BOT_SLOW}, ${C.SIZE} shares, £${C.COST} per change`);
console.log(`  bot finishes positive: ${(100 * p).toFixed(1)}% (95% CI ${(100 * (p - 1.96 * se)).toFixed(1)}-${(100 * (p + 1.96 * se)).toFixed(1)}%)  target 60-70%`);
console.log(`  bot PnL: mean £${(sum / N).toFixed(0)}, median £${q(pnls, 0.5).toFixed(0)}, 10th pct £${q(pnls, 0.1).toFixed(0)}, 90th pct £${q(pnls, 0.9).toFixed(0)}`);
console.log(`  bot trades per game: ${(trades / N).toFixed(1)}`);
console.log(`  price range over 60 s: median ${q(ranges, 0.5).toFixed(2)} (from 100), 90th pct ${q(ranges, 0.9).toFixed(2)}; start-to-end move median ${q(moves, 0.5).toFixed(2)}`);
if (p < 0.6 || p > 0.7) { console.error('  FAIL: bot win rate outside 60-70%'); process.exit(1); }
