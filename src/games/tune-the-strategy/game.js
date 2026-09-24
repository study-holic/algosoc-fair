/* Game 4: Tune the Strategy. */
(function () {
  'use strict';
  /*CONFIG*/
  const CONFIG = AS.config({
    IDLE_SECONDS: 25,
    TUNE_SECONDS: 45,
    WARMUP_DAYS: 200,        // generated before day 1 so every average exists from day 1
    PAST_DAYS: 300,
    FUTURE_DAYS: 200,
    COST: 0.001,             // 0.1% of equity per position change
    FAST_MIN: 2, FAST_MAX: 50, START_FAST: 10,
    SLOW_MIN: 5, SLOW_MAX: 200, START_SLOW: 30,
    BIG_STEP: 5,             // Shift + arrow
    EXTEND_MS: 1800,
    // Same regime-switching process as game 1, rescaled to daily bars.
    PATH: {
      start: 100, sigma: 0.012, regimeMin: 40, regimeMax: 80, pTrend: 0.5,
      driftMin: 0.15, driftMax: 0.4, kappaMin: 0.02, kappaMax: 0.08,
      volMin: 0.7, volMax: 1.4, jumpProb: 0.01, jumpMin: 3, jumpMax: 6,
    },
    TEXT: {
      title: 'Tune the Strategy',
      pitch: 'Tune a trading bot on the past. Then see how it does on data it has never seen.',
      howto: [
        'The bot buys when the fast average is above the slow one, and sells short when it is below.',
        'Set both averages to make the most money on the past. <span class="k">←</span><span class="k">→</span> adjust, <span class="k">Tab</span> switches.',
        'You have 45 seconds. Then the bot runs on the next 200 days.',
      ],
      howtoMobile: [
        'The bot buys when the fast average is above the slow one, and sells short when it is below.',
        'Drag both sliders to make the most money on the past.',
        'You have 45 seconds. Then the bot runs on the next 200 days.',
      ],
      example: 'Fast <b>10</b>, slow <b>30</b>: the bot compares the last 10 days\' average price with the last 30 days\'.',
      takeaway: 'Settings that look perfect on the past often fail on new data. That is overfitting, and Week 7 teaches you to catch it.',
    },
  });
  /*END CONFIG*/

  const Ch = ASChart, M = ASMarket, fmt = AS.fmt;
  const W = CONFIG.WARMUP_DAYS, PAST = CONFIG.PAST_DAYS, FUT = CONFIG.FUTURE_DAYS, DAYS = PAST + FUT;
  let el, ctx, prices, mas, fast, slow, active, running, t0, timer, stopLoop, dirty, bt, best, stopRes;

  const html = `
    <div class="g4">
      <div class="g4-chart panel"><canvas id="g4-chart"></canvas></div>
      <div class="g4-side">
        <div class="g4-stats">
          <div class="kv"><span class="label">Past return</span><span class="v" id="g4-ret">0.0%</span></div>
          <div class="kv right"><span class="label">Time left</span><span class="v" id="g4-time">45</span></div>
          <div class="kv"><span class="label">Sharpe (return per unit of risk)</span><span class="v" id="g4-sharpe">0.00</span></div>
          <div class="kv right"><span class="label">Trades</span><span class="v" id="g4-trades">0</span></div>
        </div>
        <div class="timebar"><i id="g4-bar"></i></div>
        <div class="slider" data-s="fast">
          <div class="s-head"><span class="label">Fast average</span><span class="s-val"><b id="g4-fast">10</b> days</span></div>
          <div class="s-track"><i class="s-fill"></i><i class="s-thumb"></i></div>
          <div class="s-scale"><span>${CONFIG.FAST_MIN}</span><span>${CONFIG.FAST_MAX}</span></div>
        </div>
        <div class="slider" data-s="slow">
          <div class="s-head"><span class="label">Slow average</span><span class="s-val"><b id="g4-slow">30</b> days</span></div>
          <div class="s-track"><i class="s-fill"></i><i class="s-thumb"></i></div>
          <div class="s-scale"><span>${CONFIG.SLOW_MIN}</span><span>${CONFIG.SLOW_MAX}</span></div>
        </div>
        <div class="g4-keys muted"><span class="k">←</span><span class="k">→</span> adjust · <span class="k">Shift</span> ×5 · <span class="k">Tab</span> switch</div>
        <button class="btn primary big" id="g4-lock" tabindex="-1">LOCK IN <span class="key">Enter</span></button>
      </div>
    </div>`;

  const RANGE = { fast: [CONFIG.FAST_MIN, CONFIG.FAST_MAX], slow: [CONFIG.SLOW_MIN, CONFIG.SLOW_MAX] };

  function mount(root) {
    el = root;
    el.querySelector('#g4-lock').addEventListener('pointerdown', (e) => { e.preventDefault(); lockIn(); });
    el.querySelectorAll('.slider').forEach((s) => {
      const track = s.querySelector('.s-track');
      const which = s.dataset.s;
      const fromX = (x) => { const r = track.getBoundingClientRect(); const k = Math.min(1, Math.max(0, (x - r.left) / r.width)); const [a, b] = RANGE[which]; return Math.round(a + k * (b - a)); };
      s.addEventListener('pointerdown', (e) => {
        if (!running) return;
        e.preventDefault();
        active = which;
        s.setPointerCapture(e.pointerId);
        if (e.target.closest('.s-track')) setVal(which, fromX(e.clientX));
        const move = (ev) => setVal(which, fromX(ev.clientX));
        const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up); };
        s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
        updateHud();
      });
    });
  }

  function prepare(c) {
    ctx = c;
    const raw = M.regimePath(c.rng, W + DAYS - 1, CONFIG.PATH);
    prices = Array.from(raw);
    mas = [];
    for (let w = 2; w <= CONFIG.SLOW_MAX; w++) mas[w] = M.sma(prices, w);
    fast = CONFIG.START_FAST; slow = CONFIG.START_SLOW; active = 'fast';
    best = gridSearch();
    recompute();
    running = false;
    if (!stopLoop) stopLoop = Ch.loop(draw);
    updateHud();
  }

  // Backtest over the past only (or past + future with full = true).
  function backtest(f, s, full) {
    const r = M.dailyBacktest(prices, mas[f], mas[s], W, W + (full ? DAYS : PAST) - 1, CONFIG.COST);
    const pastRet = (r.eq[PAST - 1] - 1) * 100;
    const out = { f, s, eq: r.eq, rets: r.rets, trades: r.trades, pastRet, sharpe: M.sharpe(r.rets, 0, PAST - 1) };
    if (full) { out.futRet = (r.eq[DAYS - 1] / r.eq[PAST - 1] - 1) * 100; out.futSharpe = M.sharpe(r.rets, PAST - 1, DAYS - 1); }
    return out;
  }

  function gridSearch() {
    let top = null;
    for (let f = CONFIG.FAST_MIN; f <= CONFIG.FAST_MAX; f++) {
      for (let s = Math.max(f + 1, CONFIG.SLOW_MIN); s <= CONFIG.SLOW_MAX; s++) {
        // Inline past-only return for speed.
        const maF = mas[f], maS = mas[s];
        let e = 1, p = 0;
        for (let i = W; i < W + PAST - 1; i++) {
          const want = maF[i] > maS[i] ? 1 : -1;
          let r = 0;
          if (want !== p) { r -= CONFIG.COST; p = want; }
          e *= 1 + r + p * (prices[i + 1] / prices[i] - 1);
        }
        if (!top || e > top.e) top = { f, s, e };
      }
    }
    return backtest(top.f, top.s, true);
  }

  function setVal(which, v) {
    const [a, b] = RANGE[which];
    v = Math.max(a, Math.min(b, v));
    if (which === 'fast') {
      fast = v;
      if (slow <= fast) slow = Math.min(CONFIG.SLOW_MAX, fast + 1);
    } else {
      slow = Math.max(v, CONFIG.SLOW_MIN);
      if (fast >= slow) fast = Math.max(CONFIG.FAST_MIN, slow - 1);
      if (slow <= fast) slow = fast + 1;
    }
    recompute();
    updateHud();
  }

  function recompute() { bt = backtest(fast, slow, false); dirty = true; }

  function updateHud() {
    const $ = (id) => document.getElementById(id);
    $('g4-fast').textContent = fast;
    $('g4-slow').textContent = slow;
    const r = $('g4-ret');
    r.textContent = fmt.pct(bt.pastRet);
    r.className = 'v ' + fmt.cls(bt.pastRet);
    $('g4-sharpe').textContent = fmt.signed(bt.sharpe, 2);
    $('g4-trades').textContent = bt.trades;
    el.querySelectorAll('.slider').forEach((s) => {
      const w = s.dataset.s, [a, b] = RANGE[w], v = w === 'fast' ? fast : slow;
      const k = (v - a) / (b - a);
      s.querySelector('.s-fill').style.width = (k * 100) + '%';
      s.querySelector('.s-thumb').style.left = (k * 100) + '%';
      s.classList.toggle('active', w === active);
    });
  }

  function start() {
    running = true;
    t0 = performance.now();
    timer = setInterval(() => {
      const left = CONFIG.TUNE_SECONDS - (performance.now() - t0) / 1000;
      document.getElementById('g4-time').textContent = Math.max(0, Math.ceil(left));
      document.getElementById('g4-bar').style.width = Math.max(0, 100 * left / CONFIG.TUNE_SECONDS) + '%';
      if (left <= 0) lockIn();
    }, 50);
  }

  function onKey(e) {
    if (!running) return false;
    const k = e.key;
    if (k === 'Tab') { active = active === 'fast' ? 'slow' : 'fast'; updateHud(); dirty = true; return true; }
    if (k === 'Enter') { if (!e.repeat) lockIn(); return true; }
    const d = (k === 'ArrowRight' || k === 'ArrowUp') ? 1 : (k === 'ArrowLeft' || k === 'ArrowDown') ? -1 : 0;
    if (!d) return false;
    const step = e.shiftKey ? CONFIG.BIG_STEP : 1;
    setVal(active, (active === 'fast' ? fast : slow) + d * step);
    return true;
  }

  function lockIn() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    const you = backtest(fast, slow, true);
    const score = Math.round(you.futRet * 10) / 10;
    ctx.finish({
      score,
      scoreText: fmt.pct(you.futRet),
      subHtml: `Past: <span class="${fmt.cls(you.pastRet)}">${fmt.pct(you.pastRet)}</span> · settings ${fast}/${slow}`,
      takeaway: CONFIG.TEXT.takeaway,
      entry: { past: Math.round(you.pastRet * 10) / 10, fast, slow },
      you, best,
    });
  }

  function stop() { clearInterval(timer); running = false; }

  /* Price pane with both averages, equity pane below. reveal: 0..1 of the future shown. */
  function paint(cv, view) {
    const g = Ch.fit(cv);
    const rem = g.rem, gutter = 4.8 * rem;
    const x0 = 0.8 * rem, x1 = g.w - gutter;
    const split = g.h * 0.62;
    const top = { x0, x1, y0: 1.8 * rem, y1: split - 0.8 * rem };
    const bot = { x0, x1, y0: split + 1.8 * rem, y1: g.h - 1.8 * rem };
    const shownDays = PAST + Math.round(FUT * view.reveal);
    const narrow = x1 - x0 < 34 * rem;   // phone widths: shorter chart labels
    const xs = (d) => x0 + (x1 - x0) * d / (DAYS - 1);
    const pIdx = (d) => W + d;
    // price pane
    const [lo, hi] = Ch.pad(Ch.extent([prices], W, W + (view.reveal > 0 ? DAYS : PAST)), 0.06);
    const ys = Ch.scale(lo, hi, top.y1, top.y0);
    if (view.reveal < 1) {
      g.ctx.fillStyle = Ch.C.panel2;
      g.ctx.fillRect(xs(shownDays - 1), top.y0 - rem, x1 - xs(shownDays - 1), bot.y1 - top.y0 + 2 * rem);
      if (view.reveal === 0) Ch.text(g, narrow ? 'HIDDEN' : 'FUTURE · HIDDEN', (xs(PAST - 1) + x1) / 2, (top.y0 + bot.y1) / 2, { align: 'center', sans: true, size: 0.95, spacing: '0.22em', color: Ch.C.muted });
    }
    Ch.grid(g, top, ys, lo, hi, { count: 4, decimals: 0, gutter: gutter - 0.8 * rem });
    Ch.vline(g, xs(PAST - 1), top.y0 - rem, bot.y1 + 0.6 * rem, Ch.C.muted, [4, 4]);
    Ch.text(g, narrow ? 'PAST' : 'PAST · DAYS 1–300', xs(0), 1.1 * rem, { sans: true, size: 0.75, spacing: '0.18em' });
    Ch.text(g, narrow ? 'FUTURE' : 'FUTURE · DAYS 301–500', xs(PAST - 1) + 0.6 * rem, 1.1 * rem, { sans: true, size: 0.75, spacing: '0.18em' });
    const seriesD = (arr, n, color, width, dash) => {
      const a = new Float64Array(n); for (let d = 0; d < n; d++) a[d] = arr[pIdx(d)];
      Ch.series(g, a, 0, n, xs, ys, color, width, dash);
    };
    seriesD(prices, shownDays, Ch.C.text, 1.4);
    seriesD(mas[view.f], shownDays, view.active === 'fast' ? Ch.C.amber : Ch.C.muted, 1.6);
    seriesD(mas[view.s], shownDays, view.active === 'slow' ? Ch.C.amber : Ch.C.muted, 1.6, [6, 4]);
    // legend
    Ch.text(g, `FAST ${view.f}`, x0 + 0.3 * rem, split + 0.1 * rem, { size: 0.8, color: view.active === 'fast' ? Ch.C.amber : Ch.C.muted });
    Ch.text(g, narrow ? `SLOW ${view.s}` : `SLOW ${view.s} (dashed)`, x0 + 6.5 * rem, split + 0.1 * rem, { size: 0.8, color: view.active === 'slow' ? Ch.C.amber : Ch.C.muted });
    // equity pane (per cent)
    Ch.hline(g, x0, g.w, split + 0.6 * rem, Ch.C.line);
    const curves = view.curves;
    const eqs = curves.map((c) => { const n = Math.min(c.eq.length, shownDays); const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = (c.eq[i] - 1) * 100; return a; });
    let [elo, ehi] = Ch.pad(Ch.extent(eqs.concat([[0]])), 0.1);
    const eys = Ch.scale(elo, ehi, bot.y1, bot.y0);
    Ch.grid(g, bot, eys, elo, ehi, { count: 3, fmt: (v) => fmt.signed(v, 0) + '%', gutter: gutter - 0.8 * rem });
    Ch.hline(g, x0, x1, eys(0), Ch.C.dim);
    Ch.text(g, 'STRATEGY RETURN', x0 + 0.3 * rem, bot.y0 - 0.5 * rem, { sans: true, size: 0.75, spacing: '0.18em' });
    curves.forEach((c, i) => Ch.series(g, eqs[i], 0, eqs[i].length, xs, eys, c.color, c.width || 1.8, c.dash));
    Ch.text(g, 'DAY 1', xs(0), g.h - 0.4 * rem, { size: 0.75 });
    Ch.text(g, 'DAY 500', x1, g.h - 0.4 * rem, { size: 0.75, align: 'right' });
  }

  function draw() {
    if (!prices || document.body.dataset.screen !== 'game' || !dirty) return;
    dirty = false;
    if (!Ch.C.text) Ch.loadColors();   // colours are read below, before paint() would load them
    paint(document.getElementById('g4-chart'), { reveal: 0, f: fast, s: slow, active, curves: [{ eq: bt.eq, color: Ch.C.text }] });
  }
  // Redraw on resize too.
  window.addEventListener('resize', () => { dirty = true; });

  function renderResults(root, r) {
    const row = (name, b, cls) => `<tr class="${cls || ''}"><td class="sans">${name}</td><td class="num">${b.f}</td><td class="num">${b.s}</td><td class="num ${fmt.cls(b.pastRet)}">${fmt.pct(b.pastRet)}</td><td class="num ${fmt.cls(b.futRet)}">${fmt.pct(b.futRet)}</td></tr>`;
    root.innerHTML = `
      <div class="chartbox g4-res-chart panel"><canvas id="g4-res"></canvas></div>
      <table class="data g4-res-table">
        <thead><tr><th></th><th class="num">Fast</th><th class="num">Slow</th><th class="num">Past return</th><th class="num">Future return</th></tr></thead>
        <tbody>
          ${row('You <span class="muted">(solid)</span>', r.you)}
          ${row(AS.mobile ? 'Grid-search best <span class="muted">(dashed)</span>' : 'Best on the past, by grid search <span class="muted">(dashed)</span>', r.best)}
        </tbody>
      </table>`;
    const cv = root.querySelector('#g4-res');
    const tStart = performance.now();
    if (stopRes) stopRes();
    stopRes = Ch.loop(() => {
      const k = Math.min(1, (performance.now() - tStart) / CONFIG.EXTEND_MS);
      paint(cv, { reveal: Math.max(0.001, k), f: r.you.f, s: r.you.s, active: null, curves: [{ eq: r.best.eq, color: Ch.C.muted, dash: [6, 4], width: 1.5 }, { eq: r.you.eq, color: Ch.C.text, width: 2 }] });
      if (document.body.dataset.screen !== 'results') { stopRes(); stopRes = null; }
    });
  }
  function stopResults() { if (stopRes) { stopRes(); stopRes = null; } }

  AS.createApp({
    id: 'tune-the-strategy', number: 4, title: CONFIG.TEXT.title, pitch: CONFIG.TEXT.pitch,
    howto: CONFIG.TEXT.howto, howtoMobile: CONFIG.TEXT.howtoMobile, example: CONFIG.TEXT.example, countdown: 0,
    scoreLabel: 'Future return', config: CONFIG, gameHtml: html,
    columns: [
      { key: 'score', label: 'Future', fmt: (v) => fmt.pct(v), color: true },
      { key: 'past', label: 'Past', fmt: (v) => fmt.pct(v) },
      { key: 'fast', label: 'Settings', fmt: (v, e) => `${e.fast}/${e.slow}` },
    ],
    game: { mount, prepare, start, stop, onKey, renderResults, stopResults },
  });
})();
