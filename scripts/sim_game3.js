/* Game 3 simulation: expected score of quoting strategies over a 3-round game.
   Strategy "centred, spread s": quote 1 at 10.5 +/- s/2; quote 2 at (revealed die + 7) +/- s/2.
   Usage: node scripts/sim_game3.js [games=200000] */
const { makeRng } = require('../src/shared/rng.js');
const L = require('../src/games/make-a-market/logic.js');
const C = require('./load_config.js')('make-a-market');

const N = +process.argv[2] || 200000;
function play(rng, spread, centreQ2) {
  let total = 0;
  for (let r = 0; r < C.ROUNDS; r++) {
    const d = [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)];
    const S = d[0] + d[1] + d[2];
    const quotes = [
      { mid: C.START_MID, fv: d[0] + C.INFORMED_Q1_ADD },
      { mid: centreQ2 ? d[1] + 7 : C.START_MID, fv: d[0] + d[1] + C.INFORMED_Q2_ADD },
    ];
    for (const q of quotes) {
      for (const t of L.tradesOnQuote(rng, q.mid - spread / 2, q.mid + spread / 2, q.fv, C.CUSTOMER_DIV)) total += L.tradePnl(t, S);
    }
  }
  return total;
}
console.log(`Game 3: ${N} simulated games of ${C.ROUNDS} rounds per strategy`);
console.log('  strategy                           mean score   std err   P(score > 0)');
const results = {};
for (const centre of [true, false]) {
  for (let s = C.SPREAD_MIN; s <= C.SPREAD_MAX; s += C.SPREAD_STEP) {
    const rng = makeRng(1000 + s * 10 + (centre ? 1 : 0));
    let sum = 0, sq = 0, pos = 0;
    for (let g = 0; g < N; g++) { const v = play(rng, s, centre); sum += v; sq += v * v; if (v > 0) pos++; }
    const m = sum / N, sd = Math.sqrt(sq / N - m * m);
    if (centre) results[s] = m;
    const name = `${centre ? 'centred on EV' : 'fixed at 10.5 '}, spread ${s}`;
    console.log(`  ${name.padEnd(34)} ${m.toFixed(3).padStart(10)} ${(sd / Math.sqrt(N)).toFixed(3).padStart(9)} ${(100 * pos / N).toFixed(1).padStart(12)}%`);
  }
}
const sensible = [3, 4].map((s) => results[s]);
const ok = sensible.every((m) => m > 0) && Math.min(...sensible) > results[C.SPREAD_MIN] && Math.min(...sensible) > results[C.SPREAD_MAX];
console.log(`  check: centred spreads 3 and 4 positive, and beat spread ${C.SPREAD_MIN} and ${C.SPREAD_MAX}: ${ok ? 'PASS' : 'FAIL'}`);
if (!ok) process.exit(1);
