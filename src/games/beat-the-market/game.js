/* Game 1: Beat the Market. */
(function () {
  'use strict';
  /*CONFIG*/
  const CONFIG = AS.config({
    IDLE_SECONDS: 25,
    COUNTDOWN_SECONDS: 3,
    TICK_MS: 200,            // 5 ticks per second
    DURATION_TICKS: 300,     // 60 seconds
    VISIBLE_TICKS: 120,
    HISTORY_TICKS: 120,      // drawn before the start so the chart is full from the first second
    START_PRICE: 100,
    SIZE: 100,               // shares per position
    COST: 2,                 // pounds per position change
    BOT_FAST: 10,
    BOT_SLOW: 30,
    REPLAY_MS: 2500,
    // Price process (per tick, log returns). Tuned with scripts/sim_game1.js.
    PATH: {
      start: 1, sigma: 0.0012, regimeMin: 40, regimeMax: 80, pTrend: 0.5,
      driftMin: 0.15, driftMax: 0.4, kappaMin: 0.02, kappaMax: 0.08,
      volMin: 0.7, volMax: 1.4, jumpProb: 0.01, jumpMin: 3, jumpMax: 6,
    },
    TEXT: {
      title: 'Beat the Market',
      pitch: '60 seconds. Buy low, sell high. Then see if you beat the bot.',
      howto: [
        '<b>BUY</b> <span class="k">↑</span> to go long: you gain when the price rises.',
        '<b>SELL</b> <span class="k">↓</span> to go short: you gain when it falls. <b>FLAT</b> <span class="k">Space</span> closes.',
        'Each change costs £2. A trading bot plays the same chart.',
      ],
      howtoMobile: [
        'Tap <b>BUY</b> to go long: you gain when the price rises.',
        'Tap <b>SELL</b> to go short: you gain when it falls. <b>FLAT</b> closes.',
        'Each change costs £2. A trading bot plays the same chart.',
      ],
      example: 'Buy at <b>100.00</b>, the price rises to <b>101.50</b>: 100 shares × £1.50 = <b class="pos">+£150</b>, less £2 = <b class="pos">+£148</b>.',
      takeawayBot: 'The bot follows one rule: two moving averages. You build it in Week 3.',
      takeawayPlayer: 'You beat a moving-average bot. Come and build one that beats you.',
    },
  });
  /*END CONFIG*/

  const Ch = ASChart, M = ASMarket, fmt = AS.fmt;
  const H = CONFIG.HISTORY_TICKS, N = CONFIG.DURATION_TICKS;
  const POS_NAME = { '1': 'LONG', '0': 'FLAT', '-1': 'SHORT' };

  let el, ctx, prices, tick, pos, pnl, trades, entryPrice, timer, stopLoop, yLo, yHi, running, stopReplay, bot;

  const html = `
    <div class="g1">
      <div class="stats">
        <div class="kv"><span class="label">Position</span><span class="v" id="g1-pos">FLAT</span></div>
        <div class="kv"><span class="label">Your PnL</span><span class="v" id="g1-pnl">£0.00</span></div>
        <div class="kv"><span class="label">Price</span><span class="v" id="g1-px">100.00</span></div>
        <div class="kv right"><span class="label">Time left</span><span class="v" id="g1-time">60.0</span></div>
      </div>
      <div class="timebar"><i id="g1-bar"></i></div>
      <div class="chartbox" id="g1-chartbox"><canvas id="g1-chart"></canvas></div>
      <div class="actions">
        <button class="btn big buy" data-p="1" tabindex="-1">BUY <span class="key">↑</span></button>
        <button class="btn big flat" data-p="0" tabindex="-1">FLAT <span class="key">Space</span></button>
        <button class="btn big sell" data-p="-1" tabindex="-1">SELL <span class="key">↓</span></button>
      </div>
    </div>`;

  function mount(root) {
    el = root;
    el.querySelectorAll('.actions .btn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (running) setPos(+b.dataset.p); });
    });
  }

  function prepare(c) {
    ctx = c;
    const rng = c.rng;
    const raw = M.regimePath(rng, H + N, CONFIG.PATH);
    const k = CONFIG.START_PRICE / raw[H];
    prices = Array.from(raw, (v) => v * k);
    bot = M.tickBot(prices, CONFIG.BOT_FAST, CONFIG.BOT_SLOW, H, H + N, CONFIG.SIZE, CONFIG.COST);
    tick = H; pos = 0; pnl = 0; trades = []; entryPrice = null; running = false;
    yLo = yHi = null;
    updateHud();
    if (!stopLoop) stopLoop = Ch.loop(draw);
  }

  function start() {
    running = true;
    const t0 = performance.now();
    timer = setInterval(() => {
      const due = Math.min(N, Math.floor((performance.now() - t0) / CONFIG.TICK_MS));
      while (tick - H < due) {
        pnl += pos * CONFIG.SIZE * (prices[tick + 1] - prices[tick]);
        tick++;
      }
      updateHud();
      if (tick - H >= N) end();
    }, Math.min(50, CONFIG.TICK_MS / 2));
  }

  function setPos(p) {
    if (p === pos) return;
    trades.push({ i: tick, price: prices[tick], side: p > pos ? 'buy' : 'sell', pos: p });
    pos = p;
    pnl -= CONFIG.COST;
    entryPrice = p === 0 ? null : prices[tick];
    updateHud();
  }

  function onKey(e) {
    if (!running || e.repeat) return e.key === ' ' || e.key.startsWith('Arrow');
    if (e.key === 'ArrowUp') { setPos(1); return true; }
    if (e.key === 'ArrowDown') { setPos(-1); return true; }
    if (e.key === ' ') { setPos(0); return true; }
    return false;
  }

  function updateHud() {
    const $ = (id) => document.getElementById(id);
    const pe = $('g1-pos');
    pe.textContent = POS_NAME[pos] + (pos ? ' 100' : '');
    pe.className = 'v ' + (pos > 0 ? 'pos' : pos < 0 ? 'neg' : '');
    const pn = $('g1-pnl');
    pn.textContent = fmt.money(pnl);
    pn.className = 'v ' + fmt.cls(pnl);
    $('g1-px').textContent = prices[tick].toFixed(2);
    const left = (N - (tick - H)) * CONFIG.TICK_MS / 1000;
    $('g1-time').textContent = left.toFixed(1);
    $('g1-bar').style.width = (100 * (N - (tick - H)) / N) + '%';
    el.querySelectorAll('.actions .btn').forEach((b) => b.classList.toggle('on', +b.dataset.p === pos));
  }

  function end() {
    clearInterval(timer);
    running = false;
    const won = pnl > bot.pnl;
    ctx.finish({
      score: Math.round(pnl * 100) / 100,
      scoreText: fmt.money(pnl),
      subHtml: `Bot: <span class="${fmt.cls(bot.pnl)}">${fmt.money(bot.pnl)}</span>`,
      takeaway: won ? CONFIG.TEXT.takeawayPlayer : CONFIG.TEXT.takeawayBot,
      entry: { bot: Math.round(bot.pnl * 100) / 100 },
      prices, trades: trades.slice(), bot, won, pnl,
    });
  }

  function stop() {
    clearInterval(timer);
    running = false;
  }

  /* Live chart: most recent VISIBLE_TICKS ticks, y-range eased towards target. */
  function draw() {
    if (!prices || document.body.dataset.screen !== 'game') return;
    const cv = document.getElementById('g1-chart');
    const g = Ch.fit(cv);
    const rem = g.rem, gutter = 5.2 * rem;
    const box = { x0: 0, x1: g.w - gutter, y0: 1.2 * rem, y1: g.h - 1.6 * rem };
    const from = tick - CONFIG.VISIBLE_TICKS + 1, to = tick + 1;
    let [lo, hi] = Ch.pad(Ch.extent([prices], from, to), 0.12);
    const mid = (lo + hi) / 2, half = Math.max((hi - lo) / 2, 0.6);
    lo = mid - half; hi = mid + half;
    if (yLo == null) { yLo = lo; yHi = hi; }
    yLo += (lo - yLo) * 0.15; yHi += (hi - yHi) * 0.15;
    const xs = Ch.scale(from, tick, box.x0 + 0.5 * rem, box.x1 - 1.2 * rem);
    const ys = Ch.scale(yLo, yHi, box.y1, box.y0);
    Ch.grid(g, box, ys, yLo, yHi, { count: 6, decimals: 2, gutter: gutter - 0.6 * rem, fontRem: 0.85 });
    Ch.vline(g, box.x1, box.y0 - rem, box.y1 + rem, Ch.C.line);
    if (entryPrice != null) Ch.hline(g, box.x0, box.x1, ys(entryPrice), pos > 0 ? Ch.C.green : Ch.C.red, [6, 5]);
    Ch.series(g, prices, Math.max(0, from), to, xs, ys, Ch.C.text, 2);
    for (const t of trades) if (t.i >= from) Ch.tri(g, xs(t.i), ys(t.price), t.side === 'buy', t.side === 'buy' ? Ch.C.green : Ch.C.red, true);
    const p = prices[tick];
    Ch.tag(g, p.toFixed(2), box.x1 + 0.2 * rem, ys(p), Ch.C.bg, Ch.C.text);
    Ch.text(g, 'LAST 24 SECONDS', box.x0 + 0.5 * rem, g.h - 0.3 * rem, { size: 0.7, sans: true, spacing: '0.18em' });
  }

  /* ---------- results ---------- */
  function legendTri(up, color, filled) {
    const pts = up ? '6,1 11,10 1,10' : '6,11 11,2 1,2';
    return `<svg width="0.8rem" height="0.8rem" viewBox="0 0 12 12" style="vertical-align:-0.05rem"><polygon points="${pts}" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.5"/></svg>`;
  }

  function renderResults(root, r) {
    const cost = (n) => fmt.money(-n * CONFIG.COST);
    const C = Ch.C.text ? Ch.C : (Ch.loadColors(), Ch.C);
    root.innerHTML = `
      <div class="label" style="margin-bottom:0.6rem">${r.won ? 'You beat the bot' : 'The bot won this one'}</div>
      <table class="data g1-vs">
        <thead><tr><th></th><th class="num">PnL</th><th class="num">Trades</th><th class="num">Costs</th></tr></thead>
        <tbody>
          <tr><td>You</td><td class="num ${fmt.cls(r.pnl)}">${fmt.money(r.pnl)}</td><td class="num">${r.trades.length}</td><td class="num">${cost(r.trades.length)}</td></tr>
          <tr><td>Bot: moving averages ${CONFIG.BOT_FAST}/${CONFIG.BOT_SLOW}</td><td class="num ${fmt.cls(r.bot.pnl)}">${fmt.money(r.bot.pnl)}</td><td class="num">${r.bot.trades.length}</td><td class="num">${cost(r.bot.trades.length)}</td></tr>
        </tbody>
      </table>
      <div class="replay-head">
        <span class="label">Replay: the full 60 seconds</span>
        <span class="legend">${legendTri(true, C.green, true)} ${legendTri(false, C.red, true)} you &nbsp; ${legendTri(true, C.green, false)} ${legendTri(false, C.red, false)} bot</span>
      </div>
      <div class="chartbox" style="flex:1"><canvas id="g1-replay"></canvas></div>`;
    const cv = root.querySelector('#g1-replay');
    const t0 = performance.now();
    if (stopReplay) stopReplay();
    stopReplay = Ch.loop(() => {
      const k = Math.min(1, (performance.now() - t0) / CONFIG.REPLAY_MS);
      const g = Ch.fit(cv);
      const rem = g.rem, gutter = 4.6 * rem;
      const box = { x0: 0, x1: g.w - gutter, y0: 1.6 * rem, y1: g.h - 1.6 * rem };
      const end = H + Math.round(N * k);
      const [lo, hi] = Ch.pad(Ch.extent([r.prices], H, H + N + 1), 0.1);
      const xs = Ch.scale(H, H + N, box.x0 + 0.5 * rem, box.x1 - 0.8 * rem);
      const ys = Ch.scale(lo, hi, box.y1, box.y0);
      Ch.grid(g, box, ys, lo, hi, { count: 5, decimals: 2, gutter: gutter - 0.6 * rem });
      Ch.vline(g, box.x1, box.y0 - rem, box.y1 + rem, Ch.C.line);
      Ch.series(g, r.prices, H, end + 1, xs, ys, Ch.C.text, 1.6);
      for (const t of r.bot.trades) if (t.i <= end) Ch.tri(g, xs(t.i), ys(t.price), t.side === 'buy', t.side === 'buy' ? Ch.C.green : Ch.C.red, false, 0.5 * rem);
      for (const t of r.trades) if (t.i <= end) Ch.tri(g, xs(t.i), ys(t.price), t.side === 'buy', t.side === 'buy' ? Ch.C.green : Ch.C.red, true, 0.5 * rem);
      for (let s = 0; s <= 60; s += 15) Ch.text(g, s + 's', xs(H + s * 5), g.h - 0.2 * rem, { align: s === 0 ? 'left' : s === 60 ? 'right' : 'center', size: 0.75 });
      if (k >= 1 && document.body.dataset.screen !== 'results') { stopReplay(); stopReplay = null; }
    });
  }
  function stopResults() { if (stopReplay) { stopReplay(); stopReplay = null; } }

  AS.createApp({
    id: 'beat-the-market', number: 1, title: CONFIG.TEXT.title, pitch: CONFIG.TEXT.pitch,
    howto: CONFIG.TEXT.howto, howtoMobile: CONFIG.TEXT.howtoMobile, example: CONFIG.TEXT.example, countdown: CONFIG.COUNTDOWN_SECONDS,
    scoreLabel: 'Your PnL', config: CONFIG, gameHtml: html,
    columns: [
      { key: 'score', label: 'PnL', fmt: (v) => fmt.money(v), color: true },
      { key: 'bot', label: 'Bot PnL', fmt: (v) => fmt.money(v), color: true },
    ],
    game: { mount, prepare, start, stop, onKey, renderResults, stopResults },
  });
})();
