/* Shared runtime for the fair games: screen flow, leaderboard, idle timer,
   nickname entry, admin shortcuts, results panel. Depends on ASRng and ASChart. */
(function (root) {
  'use strict';

  /* ---------- config, formatting ---------- */
  function config(defaults) {
    // Test hook: window.__AS_OVERRIDES is merged over a game's CONFIG.
    return Object.assign({}, defaults, root.__AS_OVERRIDES || {});
  }
  const MINUS = '−';
  const fmt = {
    signed(v, dp) { dp = dp == null ? 2 : dp; const s = Math.abs(v).toFixed(dp); return (v > 0.0000001 && +s !== 0 ? '+' : v < -0.0000001 && +s !== 0 ? MINUS : '') + s; },
    money(v, dp) { dp = dp == null ? 2 : dp; const s = Math.abs(v).toFixed(dp); const z = +s === 0; return (z ? '' : v > 0 ? '+' : MINUS) + '£' + s; },
    pct(v, dp) { return fmt.signed(v, dp == null ? 1 : dp) + '%'; },
    cls(v) { return v > 0.0000001 ? 'pos' : v < -0.0000001 ? 'neg' : ''; },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- storage with in-memory fallback ---------- */
  const mem = {};
  const store = {
    get(k) {
      if (Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
      try { return root.localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) { mem[k] = v; try { root.localStorage.setItem(k, v); } catch (e) { /* memory only */ } },
  };

  /* ---------- leaderboard ---------- */
  function Leaderboard(key, maxEntries) {
    let entries = [];
    try {
      const raw = JSON.parse(store.get(key) || '[]');
      if (Array.isArray(raw)) entries = raw.filter((e) => e && typeof e.score === 'number' && isFinite(e.score) && typeof e.name === 'string');
    } catch (e) { entries = []; }
    const cmp = (a, b) => b.score - a.score || a.t - b.t;
    const save = () => { entries.sort(cmp); if (entries.length > maxEntries) entries.length = maxEntries; store.set(key, JSON.stringify(entries)); };
    return {
      key,
      add(e) { e.id = e.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); e.t = e.t || Date.now(); entries.push(e); save(); return e.id; },
      rename(id, name) { const e = entries.find((x) => x.id === id); if (e) { e.name = name; save(); } },
      rankOf(id) { entries.sort(cmp); const i = entries.findIndex((x) => x.id === id); return i < 0 ? null : i + 1; },
      top(n) { entries.sort(cmp); return entries.slice(0, n); },
      count() { return entries.length; },
      all() { entries.sort(cmp); return entries.slice(); },
      clear() { entries = []; save(); },
    };
  }

  /* ---------- nickname ---------- */
  const NAME_MAX = 12;
  const cleanName = (s) => String(s || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, NAME_MAX);
  // Basic filter. Substring list catches compounds; word list avoids blocking innocent words.
  const BAD_SUB = ['fuck', 'fuk', 'fck', 'cunt', 'nigg', 'nigga', 'shit', 'wank', 'twat', 'bitch', 'whore', 'slut', 'retard', 'spastic', 'bellend', 'tosser', 'dildo', 'jizz', 'porn', 'penis', 'vagina', 'hitler', 'nazi', 'faggot', 'pussy', 'asshole', 'arsehole', 'bollock', 'nonce', 'kkk', 'cock', 'wanker', 'motherf', 'paedo', 'pedo', 'rapist'];
  const BAD_WORD = ['cum', 'sex', 'fag', 'fags', 'arse', 'ass', 'dick', 'dicks', 'tits', 'boob', 'boobs', 'piss', 'prick', 'knob', 'coon', 'paki', 'spic', 'wog', 'kike', 'chink', 'rape', 'dyke', 'tranny', 'homo', 'nob', 'git', 'slag', 'minge', 'poof'];
  function isProfane(name) {
    const lower = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
    const words = lower.split(' ').filter(Boolean);
    const joined = words.join('');
    const collapsed = joined.replace(/(.)\1+/g, '$1');
    if (BAD_SUB.some((b) => joined.includes(b) || collapsed.includes(b))) return true;
    const cands = new Set(words.concat([joined], words.map((w) => w.replace(/(.)\1+/g, '$1'))));
    return BAD_WORD.some((b) => cands.has(b));
  }

  /* ---------- app shell ---------- */
  /* spec: { id, number, total, title, pitch, howto: [3 lines], example: html,
             columns: [{key,label,fmt}], scoreLabel, countdown, game, gameHtml? }
     game: { mount(el, app), start(ctx), stop(), onKey(e) -> bool,
             renderResults(el, result), stopResults() } */
  function createApp(spec) {
    // The phone build (docs/) bundles mobile.js and sets AS_TARGET; the laptop path below is unchanged.
    if (root.AS_TARGET === 'mobile') return root.AS.createMobileApp(spec);
    const CFG = spec.config;
    const A = root.ASSETS || {};
    const lb = Leaderboard('uom-algosoc.fair.' + spec.id + '.leaderboard.v1', CFG.LEADERBOARD_MAX || 1000);
    const $ = (sel, el) => (el || document).querySelector(sel);
    const OTHERS = [['1', 'Beat the Market'], ['2', 'Real or Random'], ['3', 'Make a Market'], ['4', 'Tune the Strategy']];

    const app = { spec, config: CFG, lb, state: 'attract', lastId: null, seed: 0 };
    root.ASApp = app;

    // --- DOM ---
    const others = OTHERS.filter((o) => o[0] !== String(spec.number)).map((o) => `<b>${esc(o[1])}</b>`).join(' · ');
    document.getElementById('app').innerHTML = `
      <header class="topbar">
        <div class="brand"><div class="logo-crop logo-mark"><img alt="" src="${A.logo || ''}"></div><span class="label">UoM Algorithmic Trading Society</span></div>
        <span class="sep"></span>
        <span class="label" style="color:var(--text)">${esc(spec.title)}</span>
        <div class="status" id="status"></div>
      </header>
      <main class="screens">
        <section class="screen attract" id="scr-attract">
          <div class="left">
            <div class="logo-crop"><img alt="UoM Algorithmic Trading Society" src="${A.logo || ''}"></div>
            <div class="label">Game ${spec.number}/${spec.total || 4}</div>
            <h1>${esc(spec.title)}</h1>
            <p class="pitch">${esc(spec.pitch)}</p>
            <button class="btn primary cta" id="btn-play">Click or press Space to play</button>
            <div class="others">Also on this stall: ${others}</div>
          </div>
          <div class="right">
            <div class="lb-title"><span class="label">This laptop · top 10</span><span class="label" id="lb-count"></span></div>
            <table class="data" id="lb-table"></table>
          </div>
          <div class="ticker"><canvas id="ticker"></canvas></div>
        </section>
        <section class="screen howto" id="scr-howto">
          <div class="box panel">
            <div class="label">How to play</div>
            <h2>${esc(spec.title)}</h2>
            <ol>${spec.howto.map((l) => `<li>${l}</li>`).join('')}</ol>
            <div class="example"><span class="label">Example</span>${spec.example}</div>
            <button class="btn primary cta" id="btn-start">Click or press Space to start</button>
          </div>
        </section>
        <section class="screen game" id="scr-game"></section>
        <section class="screen results" id="scr-results">
          <div class="detail" id="res-detail"></div>
          <div class="side">
            <div>
              <div class="label">${esc(spec.scoreLabel || 'Your score')}</div>
              <div class="score-big" id="res-score"></div>
              <div class="muted mono" id="res-sub" style="margin-top:0.4rem;font-size:1.1rem"></div>
            </div>
            <div class="rank-line" id="res-rank"></div>
            <div>
              <div class="nick" id="nick-row">
                <input id="nick" maxlength="${NAME_MAX}" placeholder="nickname" autocomplete="off" spellcheck="false" aria-label="Nickname">
                <button class="btn primary" id="btn-save">Save <span class="key">Enter</span></button>
              </div>
              <div class="nick" id="next-row" hidden><button class="btn primary" id="btn-next" style="flex:1">Next player <span class="key">Space</span></button></div>
              <div class="nick-msg" id="nick-msg">Letters and numbers, max ${NAME_MAX}. Blank saves as anon.</div>
            </div>
            <div class="takeaway" id="res-takeaway"></div>
            <div class="qr">
              <img alt="QR code" src="${A.qr || ''}">
              <div class="cap"><span class="label">Join UoM AlgoSoc</span>Scan to join: WhatsApp, Instagram and free membership</div>
            </div>
            <div class="seed" id="res-seed"></div>
          </div>
        </section>
      </main>`;
    const screens = { attract: $('#scr-attract'), howto: $('#scr-howto'), game: $('#scr-game'), results: $('#scr-results') };
    const statusEl = $('#status');
    app.statusEl = statusEl;
    if (spec.gameHtml) screens.game.innerHTML = spec.gameHtml;
    spec.game.mount(screens.game, app);

    // --- screen switching ---
    let lastSwitch = 0;
    function show(name) {
      app.state = name;
      lastSwitch = performance.now();
      document.body.dataset.screen = name;
      for (const k in screens) screens[k].classList.toggle('active', k === name);
      if (name !== 'game') statusEl.innerHTML = '';
    }

    // --- attract ---
    function renderBoard() {
      const rows = lb.top(10);
      const cols = spec.columns;
      let h = `<thead><tr><th class="num">#</th><th>Nickname</th>${cols.map((c) => `<th class="num">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>`;
      for (let i = 0; i < 10; i++) {
        const e = rows[i];
        if (!e) { h += `<tr class="empty"><td class="num rank">${i + 1}</td><td class="name">—</td>${cols.map(() => '<td class="num">—</td>').join('')}</tr>`; continue; }
        h += `<tr class="${e.id === app.lastId ? 'me' : ''}"><td class="num rank">${i + 1}</td><td class="name">${esc(e.name)}</td>${cols.map((c) => { const v = e[c.key]; const f = c.fmt ? c.fmt(v, e) : esc(v); const cl = c.color ? fmt.cls(v) : ''; return `<td class="num ${cl}">${f}</td>`; }).join('')}</tr>`;
      }
      $('#lb-table').innerHTML = h + '</tbody>';
      $('#lb-count').textContent = lb.count() ? lb.count() + (lb.count() === 1 ? ' player' : ' players') : '';
    }
    let stopTicker = null;
    function startTicker() {
      const Ch = root.ASChart;
      const rng = root.ASRng.makeRng(root.ASRng.newSeed());
      const N = 240, pts = [];
      let v = 0, d = 0;
      const step = () => { d = 0.97 * d + 0.03 * rng.normal(); v += 0.35 * rng.normal() + 0.8 * d; pts.push(v); if (pts.length > N + 2) pts.shift(); };
      for (let i = 0; i < N + 2; i++) step();
      let acc = 0, last = 0;
      const cv = $('#ticker');
      stopTicker = Ch.loop((t) => {
        acc += t - last; last = t;
        while (acc > 250) { step(); acc -= 250; }
        const g = Ch.fit(cv);
        const frac = acc / 250;
        const [lo, hi] = Ch.pad(Ch.extent([pts]), 0.15);
        const xs = (i) => g.w * ((i - frac) / (N - 1));
        const ys = Ch.scale(lo, hi, g.h - 6, 6);
        Ch.series(g, pts, 0, pts.length, xs, ys, Ch.C.dim, 1.5);
      });
    }
    function goAttract() {
      if (app.state === 'game') spec.game.stop();
      if (app.state === 'results' && spec.game.stopResults) spec.game.stopResults();
      if (app.state === 'results' && !saved) saveName('anon');
      clearCountdown();
      renderBoard();
      show('attract');
      if (!stopTicker) startTicker();
      $('#btn-play').focus({ preventScroll: true });
    }
    app.goAttract = goAttract;

    function goHowto() {
      if (stopTicker) { stopTicker(); stopTicker = null; }
      show('howto');
      $('#btn-start').focus({ preventScroll: true });
    }

    // --- game ---
    let cdTimer = 0, cdEl = null;
    function clearCountdown() { clearInterval(cdTimer); cdTimer = 0; if (cdEl) { cdEl.remove(); cdEl = null; } }
    function startGame() {
      show('game');
      const urlSeed = new URLSearchParams(root.location.search).get('seed');
      app.seed = urlSeed != null && /^\d+$/.test(urlSeed) ? (+urlSeed >>> 0) : root.ASRng.newSeed();
      const ctx = { seed: app.seed, rng: root.ASRng.makeRng(app.seed), config: CFG, finish, status: (html) => { statusEl.innerHTML = html; } };
      if (spec.game.prepare) spec.game.prepare(ctx);
      const n = spec.countdown || 0;
      if (!n) { spec.game.start(ctx); return; }
      let k = n;
      cdEl = document.createElement('div');
      cdEl.className = 'countdown';
      cdEl.innerHTML = `<span>${k}</span>`;
      screens.game.appendChild(cdEl);
      cdTimer = setInterval(() => {
        k--;
        if (k <= 0) { clearCountdown(); if (app.state === 'game') spec.game.start(ctx); }
        else cdEl.firstChild.textContent = k;
      }, CFG.COUNTDOWN_STEP_MS || 700);
    }

    // --- results ---
    let saved = true, curId = null;
    function finish(result) {
      if (app.state !== 'game') return;
      const entry = Object.assign({ name: 'anon', score: result.score, seed: app.seed }, result.entry || {});
      curId = lb.add(entry);
      app.lastId = curId;
      saved = false;
      const rank = lb.rankOf(curId);
      $('#res-score').innerHTML = `<span class="${result.scoreClass != null ? result.scoreClass : fmt.cls(result.score)}">${esc(result.scoreText)}</span>`;
      $('#res-sub').innerHTML = result.subHtml || '';
      const rl = $('#res-rank');
      const beaten = lb.count() > 1;
      if (rank === 1 && beaten) { rl.textContent = 'New high score!'; rl.className = 'rank-line hi'; }
      else if (rank <= 10) { rl.textContent = `Rank ${rank} of ${lb.count()}. You made the top 10.`; rl.className = 'rank-line hi'; }
      else { rl.textContent = `Rank ${rank} of ${lb.count()}.`; rl.className = 'rank-line'; }
      $('#res-takeaway').textContent = result.takeaway;
      $('#res-seed').textContent = 'seed ' + app.seed;
      $('#nick').value = '';
      $('#nick-row').hidden = false; $('#next-row').hidden = true;
      $('#nick-msg').textContent = `Letters and numbers, max ${NAME_MAX}. Blank saves as anon.`;
      $('#nick-msg').className = 'nick-msg';
      show('results');
      spec.game.renderResults($('#res-detail'), result);
      setTimeout(() => { if (app.state === 'results' && !saved) $('#nick').focus({ preventScroll: true }); }, 0);
    }
    function saveName(name) {
      if (saved) return true;
      name = cleanName(name).trim();
      if (!name) name = 'anon';
      if (isProfane(name)) {
        $('#nick-msg').textContent = 'Pick another name.';
        $('#nick-msg').className = 'nick-msg neg';
        return false;
      }
      lb.rename(curId, name);
      saved = true;
      $('#nick-row').hidden = true; $('#next-row').hidden = false;
      $('#nick-msg').textContent = `Saved as ${name}.`;
      $('#nick-msg').className = 'nick-msg';
      $('#btn-next').focus({ preventScroll: true });
      return true;
    }
    app.saveName = saveName;

    const nick = $('#nick');
    nick.addEventListener('input', () => {
      const c = cleanName(nick.value);
      if (c !== nick.value) nick.value = c;
    });
    $('#btn-save').addEventListener('click', () => saveName(nick.value));
    $('#btn-next').addEventListener('click', goAttract);
    $('#btn-play').addEventListener('click', (e) => { e.stopPropagation(); if (app.state === 'attract') goHowto(); });
    $('#btn-start').addEventListener('click', (e) => { e.stopPropagation(); if (app.state === 'howto') startGame(); });
    screens.attract.addEventListener('click', () => { if (app.state === 'attract' && performance.now() - lastSwitch > 250) goHowto(); });
    screens.howto.addEventListener('click', () => { if (app.state === 'howto' && performance.now() - lastSwitch > 250) startGame(); });
    screens.results.addEventListener('pointerup', (e) => { if (app.state === 'results' && !saved && !e.target.closest('button')) nick.focus({ preventScroll: true }); });

    // --- admin ---
    function exportBoard() {
      const data = JSON.stringify({ game: spec.id, title: spec.title, exported: new Date().toISOString(), entries: lb.all() }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `algosoc-${spec.id}-leaderboard-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    app.exportBoard = exportBoard;

    // --- input routing ---
    let lastInput = performance.now(), lastPtr = null;
    const touch = () => { lastInput = performance.now(); };
    app.touch = touch;
    root.addEventListener('keydown', (e) => {
      const k = e.key;
      if (e.ctrlKey && e.shiftKey && (k === 'R' || k === 'r')) {
        e.preventDefault();
        if (root.confirm(`Clear the ${spec.title} leaderboard? This cannot be undone.`)) { lb.clear(); app.lastId = null; renderBoard(); }
        return;
      }
      if (e.ctrlKey && e.shiftKey && (k === 'E' || k === 'e')) { e.preventDefault(); exportBoard(); return; }
      touch();
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const go = k === ' ' || k === 'Enter';
      if (app.state === 'attract') { if (go) { e.preventDefault(); if (!e.repeat) goHowto(); } return; }
      if (app.state === 'howto') { if (go) { e.preventDefault(); if (!e.repeat) startGame(); } if (k === 'Escape') goAttract(); return; }
      if (app.state === 'game') {
        if (k === 'Escape') { goAttract(); return; }
        if (cdEl) { if ([' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault(); return; }
        if (spec.game.onKey(e) || [' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
        return;
      }
      if (app.state === 'results') {
        if (!saved) {
          if (k === 'Enter') { e.preventDefault(); saveName(nick.value); }
          else if (k === 'Escape') { e.preventDefault(); saveName('anon'); }
          else if (document.activeElement !== nick && k.length === 1) nick.focus({ preventScroll: true });
          return;
        }
        if ((go || k === 'Escape') && !e.repeat) { e.preventDefault(); goAttract(); }
      }
    }, true);
    root.addEventListener('pointerdown', touch, true);
    root.addEventListener('wheel', touch, { passive: true, capture: true });
    root.addEventListener('pointermove', (e) => {
      if (lastPtr && Math.abs(e.clientX - lastPtr[0]) + Math.abs(e.clientY - lastPtr[1]) > 6) touch();
      lastPtr = [e.clientX, e.clientY];
    }, true);
    setInterval(() => {
      if (app.state !== 'attract' && performance.now() - lastInput > (CFG.IDLE_SECONDS || 25) * 1000) goAttract();
    }, 250);

    goAttract();
    return app;
  }

  root.AS = { config, fmt, esc, store, Leaderboard, cleanName, isProfane, createApp, mobile: root.AS_TARGET === 'mobile' };
})(this);
