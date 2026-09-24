/* Game 2: Real or Random. */
(function () {
  'use strict';
  /*CONFIG*/
  const CONFIG = AS.config({
    IDLE_SECONDS: 25,
    COUNTDOWN_SECONDS: 3,
    ROUNDS: 10,
    ROUND_SECONDS: 6,
    VERDICT_MS: 1200,
    POINTS_CORRECT: 100,
    SPEED_BONUS_MAX: 50,     // scales linearly from 50 at 0 s to 0 at ROUND_SECONDS
    TEXT: {
      title: 'Real or Random',
      pitch: 'One chart is a real market. One is random. Can you tell?',
      howto: [
        'Two charts appear. One is 120 days of a real market, the other is random.',
        'Pick the real one: click it, or press <span class="k">←</span> or <span class="k">→</span>.',
        '10 rounds, 6 seconds each. Faster correct answers score more.',
      ],
      howtoMobile: [
        'Two charts appear. One is 120 days of a real market, the other is random.',
        'Tap the one you think is real.',
        '10 rounds, 6 seconds each. Faster correct answers score more.',
      ],
      example: 'Real prices move in bursts: quiet weeks, then sudden jumps. A correct answer in 2 seconds scores <b>100 + 33 = 133</b>.',
      prompt: 'Which one is real?',
      randomName: 'Random walk',
      timeout: 'Too slow',
      takeaway: 'Real prices have fat tails and volatility that clusters. Week 2 teaches you to measure both.',
    },
  });
  /*END CONFIG*/

  const Ch = ASChart, fmt = AS.fmt;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ukDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

  let el, ctx, rounds, idx, score, correct, phase, roundStart, timer, stopLoop, history;

  const html = `
    <div class="g2">
      <div class="g2-head">
        <div class="kv"><span class="label">Round</span><span class="v" id="g2-round">1/10</span></div>
        <div class="g2-prompt" id="g2-prompt">${CONFIG.TEXT.prompt}</div>
        <div class="kv right"><span class="label">Score</span><span class="v" id="g2-score">0</span></div>
      </div>
      <div class="timebar"><i id="g2-bar"></i></div>
      <div class="g2-pair">
        <div class="g2-card" data-side="0">
          <div class="chartbox"><canvas></canvas></div>
          <div class="g2-cap"><span class="g2-name"></span><span class="g2-meta"></span></div>
          <div class="g2-key"><span class="k">←</span> Left</div>
        </div>
        <div class="g2-card" data-side="1">
          <div class="chartbox"><canvas></canvas></div>
          <div class="g2-cap"><span class="g2-name"></span><span class="g2-meta"></span></div>
          <div class="g2-key">Right <span class="k">→</span></div>
        </div>
      </div>
      <div class="g2-verdict" id="g2-verdict">&nbsp;</div>
    </div>`;

  function mount(root) {
    el = root;
    el.querySelectorAll('.g2-card').forEach((c) => c.addEventListener('pointerdown', (e) => { e.preventDefault(); answer(+c.dataset.side); }));
  }

  function logReturnsSd(closes) {
    const r = [];
    for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    return Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / (r.length - 1));
  }

  function prepare(c) {
    ctx = c;
    const rng = c.rng;
    const P = window.PRICES;
    const order = rng.shuffle(P.map((_, i) => i)).slice(0, CONFIG.ROUNDS);
    rounds = order.map((i) => {
      const real = P[i].closes;
      const sd = logReturnsSd(real);
      const fake = [real[0]];
      let x = Math.log(real[0]);
      for (let t = 1; t < real.length; t++) { x += sd * rng.normal(); fake.push(Math.exp(x)); }
      const realSide = rng.next() < 0.5 ? 0 : 1;
      return { meta: P[i], realSide, series: realSide === 0 ? [real, fake] : [fake, real] };
    });
    idx = 0; score = 0; correct = 0; history = []; phase = 'wait';
    setRound();
    if (!stopLoop) stopLoop = Ch.loop(draw);
  }

  function start() { beginRound(); }

  function setRound() {
    const r = rounds[idx];
    document.getElementById('g2-round').textContent = `${idx + 1}/${CONFIG.ROUNDS}`;
    document.getElementById('g2-score').textContent = score;
    const v = document.getElementById('g2-verdict');
    v.innerHTML = '&nbsp;'; v.className = 'g2-verdict';
    document.getElementById('g2-bar').style.width = '100%';
    el.querySelectorAll('.g2-card').forEach((c) => { c.className = 'g2-card'; c.querySelector('.g2-name').textContent = ''; c.querySelector('.g2-meta').textContent = ''; });
    r.shown = true;
  }

  function beginRound() {
    phase = 'ask';
    roundStart = performance.now();
    clearInterval(timer);
    timer = setInterval(() => {
      const t = (performance.now() - roundStart) / 1000;
      document.getElementById('g2-bar').style.width = Math.max(0, 100 * (1 - t / CONFIG.ROUND_SECONDS)) + '%';
      if (t >= CONFIG.ROUND_SECONDS) answer(null);
    }, 30);
  }

  function answer(side) {
    if (phase !== 'ask') return;
    phase = 'verdict';
    clearInterval(timer);
    const r = rounds[idx];
    const t = Math.min(CONFIG.ROUND_SECONDS, (performance.now() - roundStart) / 1000);
    const ok = side === r.realSide;
    const bonus = ok ? Math.round(CONFIG.SPEED_BONUS_MAX * Math.max(0, 1 - t / CONFIG.ROUND_SECONDS)) : 0;
    const pts = ok ? CONFIG.POINTS_CORRECT + bonus : 0;
    score += pts; if (ok) correct++;
    history.push({ meta: r.meta, ok, timeout: side === null, pts, t });
    document.getElementById('g2-score').textContent = score;
    const cards = el.querySelectorAll('.g2-card');
    cards.forEach((c, i) => {
      const isReal = i === r.realSide;
      c.querySelector('.g2-name').textContent = isReal ? r.meta.name : CONFIG.TEXT.randomName;
      c.querySelector('.g2-meta').textContent = isReal ? `${r.meta.asset_class} · from ${ukDate(r.meta.start_date)}` : 'Generated with the same volatility';
      c.classList.add(isReal ? 'is-real' : 'is-fake');
      if (i === side) c.classList.add(ok ? 'chose-ok' : 'chose-bad');
    });
    const v = document.getElementById('g2-verdict');
    if (side === null) { v.textContent = `${CONFIG.TEXT.timeout}. The real one was ${r.meta.name}.`; v.className = 'g2-verdict neg'; }
    else if (ok) { v.textContent = `Correct · +${CONFIG.POINTS_CORRECT} · +${bonus} speed`; v.className = 'g2-verdict pos'; }
    else { v.textContent = `Wrong. The real one was ${r.meta.name}.`; v.className = 'g2-verdict neg'; }
    timer = setTimeout(next, CONFIG.VERDICT_MS);
  }

  function next() {
    idx++;
    if (idx >= CONFIG.ROUNDS) return end();
    setRound();
    beginRound();
  }

  function onKey(e) {
    if (e.repeat) return true;
    if (e.key === 'ArrowLeft') { answer(0); return true; }
    if (e.key === 'ArrowRight') { answer(1); return true; }
    return false;
  }

  function end() {
    phase = 'done';
    ctx.finish({
      score,
      scoreText: String(score),
      scoreClass: '',
      subHtml: `${correct}/${CONFIG.ROUNDS} correct`,
      takeaway: CONFIG.TEXT.takeaway,
      entry: { correct },
      history: history.slice(),
    });
  }

  function stop() { clearInterval(timer); clearTimeout(timer); phase = 'done'; }

  function draw() {
    if (!rounds || document.body.dataset.screen !== 'game') return;
    const r = rounds[idx];
    if (!r) return;
    el.querySelectorAll('.g2-card canvas').forEach((cv, i) => {
      const s = r.series[i];
      const g = Ch.fit(cv);
      const rem = g.rem;
      const box = { x0: 0.8 * rem, x1: g.w - 0.8 * rem, y0: 0.8 * rem, y1: g.h - 0.8 * rem };
      const [lo, hi] = Ch.pad(Ch.extent([s]), 0.06);
      const xs = Ch.scale(0, s.length - 1, box.x0, box.x1);
      const ys = Ch.scale(lo, hi, box.y1, box.y0);
      Ch.grid(g, box, ys, lo, hi, { count: 5, labels: false });
      Ch.series(g, s, 0, s.length, xs, ys, Ch.C.text, 1.8);
    });
  }

  function renderResults(root, r) {
    let rows = '';
    r.history.forEach((h, i) => {
      const verdict = h.ok ? '<span class="pos">correct</span>' : h.timeout ? '<span class="neg">too slow</span>' : '<span class="neg">wrong</span>';
      rows += `<tr><td class="num rank">${i + 1}</td><td class="sans">${AS.esc(h.meta.name)}</td><td class="sans muted">${h.meta.asset_class}</td><td class="num">${ukDate(h.meta.start_date)}</td><td class="num">${verdict}</td><td class="num">${h.ok ? h.t.toFixed(1) + 's' : '—'}</td><td class="num">${h.pts}</td></tr>`;
    });
    root.innerHTML = `
      <div class="label" style="margin-bottom:0.6rem">The real charts you saw</div>
      <table class="data g2-res">
        <thead><tr><th class="num">#</th><th>Market</th><th>Class</th><th class="num">Start</th><th class="num">Answer</th><th class="num">Time</th><th class="num">Points</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="g2-note muted">Every real chart is 120 trading days of daily closes. Each random chart had the same start price and daily volatility.</div>`;
  }

  AS.createApp({
    id: 'real-or-random', number: 2, title: CONFIG.TEXT.title, pitch: CONFIG.TEXT.pitch,
    howto: CONFIG.TEXT.howto, howtoMobile: CONFIG.TEXT.howtoMobile, example: CONFIG.TEXT.example, countdown: CONFIG.COUNTDOWN_SECONDS,
    scoreLabel: 'Your score', config: CONFIG, gameHtml: html,
    columns: [
      { key: 'score', label: 'Score', fmt: (v) => String(v) },
      { key: 'correct', label: 'Correct', fmt: (v) => `${v}/10` },
    ],
    game: { mount, prepare, start, stop, onKey, renderResults },
  });
})();
