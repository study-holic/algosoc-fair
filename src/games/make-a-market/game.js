/* Game 3: Make a Market. */
(function () {
  'use strict';
  /*CONFIG*/
  const CONFIG = AS.config({
    IDLE_SECONDS: 25,
    ROUNDS: 3,
    QUOTE_SECONDS: 8,        // each quote auto-submits after this
    START_MID: 10.5,
    START_SPREAD: 2,
    STEP: 0.5,               // Up/Down move the mid by this
    SPREAD_STEP: 1,          // Left/Right change the spread by this (each side moves 0.5)
    SPREAD_MIN: 1,
    SPREAD_MAX: 6,
    MID_MIN: 3,
    MID_MAX: 18,
    CUSTOMER_DIV: 7,         // customer trades with probability 1 - spread / 7
    INFORMED_Q1_ADD: 7,      // informed fair value, quote 1: one die + 7
    INFORMED_Q2_ADD: 3.5,    // quote 2: two dice + 3.5
    TRADES_PAUSE_MS: 2600,   // time to read the trades before the next step
    SETTLE_MS: 6000,         // settlement screen, or press Space
    TEXT: {
      title: 'Make a Market',
      pitch: 'Quote a price. Someone who knows more than you will trade against it.',
      howto: [
        'Three dice are rolled face down. At the end they pay their total: 3 to 18, 10.5 on average.',
        'Bid: the price you buy at. Ask: the price you sell at. <span class="k">↑</span><span class="k">↓</span> move both, <span class="k">←</span><span class="k">→</span> narrow or widen.',
        'A trader who has seen one die, and a customer who has not, may trade with you.',
      ],
      howtoMobile: [
        'Three dice are rolled face down. At the end they pay their total: 3 to 18, 10.5 on average.',
        'Bid: the price you buy at. Ask: the price you sell at. Use the buttons to move and size your quote.',
        'A trader who has seen one die, and a customer who has not, may trade with you.',
      ],
      example: 'You quote <b>9.5 / 11.5</b>. The trader sees a 6 and buys from you at 11.5. The dice total 14, so you lose <b class="neg">2.5</b>.',
      takeaway: 'Tight quotes earn from customers and lose to traders who know more. That is adverse selection, and it is how market makers think.',
    },
  });
  /*END CONFIG*/

  const L = G3Logic, fmt = AS.fmt;
  const WHO = { informed: 'Informed trader', customer: 'Customer' };
  const f1 = (v) => v.toFixed(1);
  let el, ctx, rng, round, quote, dice, mid, spread, trades, phase, t0, timer, pause, totalPnl, roundsOut;

  const html = `
    <div class="g3">
      <div class="g3-left">
        <div class="g3-info">
          <div class="kv"><span class="label">Round</span><span class="v" id="g3-round">1/3</span></div>
          <div class="kv"><span class="label">Quote</span><span class="v" id="g3-quote">1/2</span></div>
          <div class="kv right"><span class="label">Total PnL</span><span class="v" id="g3-total">0.0</span></div>
        </div>
        <div class="g3-dice" id="g3-dice"></div>
        <div class="g3-ev mono" id="g3-ev"></div>
        <div class="g3-quotebox">
          <div class="g3-q"><span class="label">Bid · you buy</span><span class="g3-px" id="g3-bid">9.5</span></div>
          <div class="g3-q"><span class="label">Ask · you sell</span><span class="g3-px" id="g3-ask">11.5</span></div>
          <div class="g3-q small"><span class="label">Spread</span><span class="g3-px" id="g3-spread">2.0</span></div>
        </div>
        <div class="g3-controls">
          <button class="btn" data-a="up" tabindex="-1">Up <span class="key">↑</span></button>
          <button class="btn" data-a="down" tabindex="-1">Down <span class="key">↓</span></button>
          <button class="btn" data-a="narrow" tabindex="-1">Narrow <span class="key">←</span></button>
          <button class="btn" data-a="widen" tabindex="-1">Widen <span class="key">→</span></button>
          <button class="btn primary" data-a="submit" tabindex="-1" id="g3-submit">Submit <span class="key">Enter</span></button>
        </div>
        <div class="timebar"><i id="g3-bar"></i></div>
        <div class="g3-who">
          <div><span class="label">Informed trader</span>Has seen the dice marked <i>trader saw</i>. Trades only when your price is wrong.</div>
          <div><span class="label">Customer</span>Knows nothing. Trades less often when your spread is wide.</div>
        </div>
      </div>
      <div class="g3-right panel">
        <div class="label">Trades this round</div>
        <div class="g3-log" id="g3-log"></div>
        <div class="g3-foot" id="g3-foot"></div>
      </div>
    </div>`;

  function mount(root) {
    el = root;
    el.querySelectorAll('.g3-controls .btn').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); act(b.dataset.a); }));
  }

  function prepare(c) {
    ctx = c; rng = c.rng;
    round = 0; totalPnl = 0; roundsOut = [];
    mid = CONFIG.START_MID; spread = CONFIG.START_SPREAD;
    phase = 'idle';
    newRound();
  }

  function start() { beginQuote(); }

  function newRound() {
    dice = [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)];
    quote = 0; trades = [];
    renderDice([false, false, false]);
    document.getElementById('g3-log').innerHTML = '';
    document.getElementById('g3-foot').innerHTML = '';
    updateHud();
  }

  const bid = () => mid - spread / 2;
  const ask = () => mid + spread / 2;

  function pips(n) {
    const on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n];
    let h = '';
    for (let i = 0; i < 9; i++) h += `<i class="${on.includes(i) ? 'on' : ''}"></i>`;
    return `<div class="pips">${h}</div>`;
  }
  // shown: which dice the player can see. Die 0 is the informed trader's; die 1 is revealed after quote 1.
  function renderDice(shown) {
    const seen = quote === 0 ? [true, false, false] : [true, true, false];
    const settled = shown.every(Boolean);
    document.getElementById('g3-dice').innerHTML = dice.map((d, i) => `
      <div class="die-wrap">
        <div class="die ${shown[i] ? 'up' : ''}">${shown[i] ? pips(d) : '<span>?</span>'}</div>
        <div class="die-cap">${i === 1 && shown[1] && !settled ? 'Revealed' : seen[i] || (settled && i < 2) ? 'Trader saw' : ''}</div>
      </div>`).join('');
  }

  function updateHud() {
    const $ = (id) => document.getElementById(id);
    $('g3-round').textContent = `${round + 1}/${CONFIG.ROUNDS}`;
    $('g3-quote').textContent = `${quote + 1}/2`;
    $('g3-bid').textContent = f1(bid());
    $('g3-ask').textContent = f1(ask());
    $('g3-spread').textContent = f1(spread);
    const t = $('g3-total');
    t.textContent = fmt.signed(totalPnl, 1);
    t.className = 'v ' + fmt.cls(totalPnl);
    const S = dice[0] + dice[1] + dice[2], d = dice[1];
    $('g3-ev').innerHTML = phase === 'settle'
      ? `All dice revealed. Total: <b>${S}</b>`
      : AS.mobile   // shorter lines for narrow phone screens
        ? (quote === 0 ? 'Nothing known yet. Expected total <b>10.5</b>' : `One die is ${d}. Expected total <b>${f1(d + 7)}</b>`)
        : (quote === 0 ? 'You know nothing yet. Expected total: <b>10.5</b>' : `You know one die: ${d}. Expected total: ${d} + 7 = <b>${f1(d + 7)}</b>`);
    el.classList.toggle('quoting', phase === 'quote');
  }

  function beginQuote() {
    phase = 'quote';
    t0 = performance.now();
    clearInterval(timer);
    timer = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      document.getElementById('g3-bar').style.width = Math.max(0, 100 * (1 - t / CONFIG.QUOTE_SECONDS)) + '%';
      if (t >= CONFIG.QUOTE_SECONDS) submit();
    }, 30);
    updateHud();
  }

  function act(a) {
    if (phase === 'settle' && (a === 'submit')) { nextRound(); return; }
    if (phase !== 'quote') return;
    const s = CONFIG.STEP;
    if (a === 'up') mid = Math.min(CONFIG.MID_MAX, mid + s);
    if (a === 'down') mid = Math.max(CONFIG.MID_MIN, mid - s);
    if (a === 'narrow') spread = Math.max(CONFIG.SPREAD_MIN, spread - CONFIG.SPREAD_STEP);
    if (a === 'widen') spread = Math.min(CONFIG.SPREAD_MAX, spread + CONFIG.SPREAD_STEP);
    if (a === 'submit') { submit(); return; }
    updateHud();
  }

  function logLine(t, q) {
    if (t.side === 'pass') return `<div class="ln muted"><span class="q">Q${q}</span><span>${WHO[t.who]} passes</span></div>`;
    const cls = t.who === 'informed' ? 'inf' : '';
    return `<div class="ln ${cls}"><span class="q">Q${q}</span><span>${WHO[t.who]} ${t.side}s 1 at <b>${f1(t.price)}</b></span></div>`;
  }

  function submit() {
    if (phase !== 'quote') return;
    phase = 'show';
    clearInterval(timer);
    document.getElementById('g3-bar').style.width = '0%';
    const fv = quote === 0 ? dice[0] + CONFIG.INFORMED_Q1_ADD : dice[0] + dice[1] + CONFIG.INFORMED_Q2_ADD;
    const tr = L.tradesOnQuote(rng, bid(), ask(), fv, CONFIG.CUSTOMER_DIV);
    tr.forEach((t) => { t.q = quote + 1; trades.push(t); });
    document.getElementById('g3-log').insertAdjacentHTML('beforeend', tr.map((t) => logLine(t, quote + 1)).join(''));
    updateFoot();
    updateHud();
    pause = setTimeout(() => {
      if (quote === 0) {
        quote = 1;
        renderDice([false, true, false]);
        beginQuote();
      } else settle();
    }, CONFIG.TRADES_PAUSE_MS);
  }

  function position() {
    return trades.reduce((p, t) => p + (t.side === 'buy' ? -1 : t.side === 'sell' ? 1 : 0), 0);
  }
  function updateFoot() {
    const p = position();
    document.getElementById('g3-foot').innerHTML = `<span class="label">Your position</span> <span class="mono">${p > 0 ? 'long ' + p : p < 0 ? 'short ' + -p : 'flat'}</span>`;
  }

  function settle() {
    phase = 'settle';
    const S = dice[0] + dice[1] + dice[2];
    renderDice([true, true, true]);
    let pnl = 0, lines = '';
    for (const t of trades) {
      if (t.side === 'pass') continue;
      const v = L.tradePnl(t, S);
      pnl += v;
      const you = t.side === 'buy' ? `you sold at ${f1(t.price)}` : `you bought at ${f1(t.price)}`;
      lines += `<div class="ln"><span class="q">Q${t.q}</span><span>${WHO[t.who]}: ${you}</span><span class="r ${fmt.cls(v)}">${fmt.signed(v, 1)}</span></div>`;
    }
    if (!lines) lines = '<div class="ln muted">No trades this round.</div>';
    totalPnl += pnl;
    roundsOut.push({ dice: dice.slice(), total: S, pnl, trades: trades.filter((t) => t.side !== 'pass').length, informed: trades.filter((t) => t.who === 'informed' && t.side !== 'pass').length });
    document.getElementById('g3-log').innerHTML = `
      <div class="ln settle"><span>Dice: ${dice.join(' + ')} = <b>${S}</b>. Every trade settles at ${S}.</span></div>${lines}
      <div class="ln sum"><span>Round PnL</span><span class="r ${fmt.cls(pnl)}">${fmt.signed(pnl, 1)}</span></div>`;
    document.getElementById('g3-foot').innerHTML = `<span class="label">${round + 1 < CONFIG.ROUNDS ? 'Next round' : 'Results'}</span> <span class="mono muted">${AS.mobile ? 'Tap Continue' : 'Space or Enter'}</span>`;
    document.getElementById('g3-submit').innerHTML = 'Continue <span class="key">Enter</span>';
    updateHud();
    pause = setTimeout(nextRound, CONFIG.SETTLE_MS);
  }

  function nextRound() {
    if (phase !== 'settle') return;
    clearTimeout(pause);
    document.getElementById('g3-submit').innerHTML = 'Submit <span class="key">Enter</span>';
    round++;
    if (round >= CONFIG.ROUNDS) return end();
    newRound();
    mid = CONFIG.START_MID;
    beginQuote();
  }

  function onKey(e) {
    const k = e.key;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'narrow', ArrowRight: 'widen', Enter: 'submit', ' ': 'submit' };
    if (!map[k]) return false;
    if (e.repeat && (map[k] === 'submit')) return true;
    act(map[k]);
    return true;
  }

  function end() {
    phase = 'done';
    const score = Math.round(totalPnl * 10) / 10;
    ctx.finish({
      score,
      scoreText: fmt.signed(score, 1),
      subHtml: 'PnL over 3 rounds',
      takeaway: CONFIG.TEXT.takeaway,
      entry: {},
      rounds: roundsOut.slice(),
    });
  }

  function stop() { clearInterval(timer); clearTimeout(pause); phase = 'done'; }

  function renderResults(root, r) {
    const rows = r.rounds.map((x, i) => `<tr><td class="num rank">${i + 1}</td><td class="num">${x.dice.join(' + ')} = ${x.total}</td><td class="num">${x.trades}</td><td class="num">${x.informed}</td><td class="num ${fmt.cls(x.pnl)}">${fmt.signed(x.pnl, 1)}</td></tr>`).join('');
    root.innerHTML = `
      <div class="label" style="margin-bottom:0.6rem">Your rounds</div>
      <table class="data">
        <thead><tr><th class="num">Round</th><th class="num">Dice</th><th class="num">Trades</th><th class="num">With the informed trader</th><th class="num">PnL</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="g3-lesson">
        <div class="label">What happened</div>
        <p>Customers trade at random, so on average they pay you half the spread.</p>
        <p>The informed trader only trades when your price is wrong, so every trade with it tends to lose.</p>
        <p>A wider spread loses less to the trader but scares customers away. Market makers balance the two.</p>
      </div>`;
  }

  AS.createApp({
    id: 'make-a-market', number: 3, title: CONFIG.TEXT.title, pitch: CONFIG.TEXT.pitch,
    howto: CONFIG.TEXT.howto, howtoMobile: CONFIG.TEXT.howtoMobile, example: CONFIG.TEXT.example, countdown: 0,
    scoreLabel: 'Your PnL', config: CONFIG, gameHtml: html,
    columns: [{ key: 'score', label: 'PnL', fmt: (v) => fmt.signed(v, 1), color: true }],
    game: { mount, prepare, start, stop, onKey, renderResults },
  });
})();
