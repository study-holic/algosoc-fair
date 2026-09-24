/* Game 4 check: how does the grid-search best-on-past setting do on the future?
   Usage: node scripts/sim_game4.js [games=300] */
const { makeRng } = require('../src/shared/rng.js');
const M = require('../src/shared/market.js');
const C = require('./load_config.js')('tune-the-strategy');
const N = +process.argv[2] || 300;
const W = C.WARMUP_DAYS, PAST = C.PAST_DAYS, DAYS = PAST + C.FUTURE_DAYS;
let worse = 0, futNeg = 0, sumPast = 0, sumFut = 0, sumDef = 0;
for (let g = 0; g < N; g++) {
  const p = Array.from(M.regimePath(makeRng(g + 1), W + DAYS - 1, C.PATH));
  const mas = []; for (let w = 2; w <= C.SLOW_MAX; w++) mas[w] = M.sma(p, w);
  let best = null;
  for (let f = C.FAST_MIN; f <= C.FAST_MAX; f++) for (let s = Math.max(f + 1, C.SLOW_MIN); s <= C.SLOW_MAX; s++) {
    const r = M.dailyBacktest(p, mas[f], mas[s], W, W + PAST - 1, C.COST);
    const e = r.eq[PAST - 1]; if (!best || e > best.e) best = { f, s, e };
  }
  const full = M.dailyBacktest(p, mas[best.f], mas[best.s], W, W + DAYS - 1, C.COST);
  const past = (full.eq[PAST - 1] - 1) * 100, fut = (full.eq[DAYS - 1] / full.eq[PAST - 1] - 1) * 100;
  const def = M.dailyBacktest(p, mas[C.START_FAST], mas[C.START_SLOW], W, W + DAYS - 1, C.COST);
  sumPast += past; sumFut += fut; sumDef += (def.eq[DAYS - 1] / def.eq[PAST - 1] - 1) * 100;
  if (fut / 200 < past / 300) worse++; if (fut < 0) futNeg++;
}
console.log(`Game 4: ${N} simulated series. Grid-search best on the past:`);
console.log(`  mean past return ${sumPast / N >= 0 ? '+' : ''}${(sumPast / N).toFixed(1)}% over 300 days; mean future return ${(sumFut / N).toFixed(1)}% over 200 days`);
console.log(`  future worse than past (per day): ${(100 * worse / N).toFixed(0)}% of games; future negative: ${(100 * futNeg / N).toFixed(0)}%`);
console.log(`  default 10/30 settings, mean future return: ${(sumDef / N).toFixed(1)}%`);
