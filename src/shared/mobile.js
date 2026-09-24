/* Phone shell for the GitHub Pages build (docs/). Bundled only when AS_TARGET = 'mobile'.
   Differences from the laptop shell in core.js:
   - no attract screen, leaderboard, nickname entry or idle reset: phones are personal devices
   - every game gets a fresh random seed; ?seed= is ignored and the seed is never shown
   - the results screen stays up until the player acts, shows the finish time, and tells the
     player to show it to a committee member (the paper sheet is the official leaderboard) */
(function (root) {
  'use strict';
  const AS = root.AS, esc = AS.esc;
  const LINKS = root.AS_LINKS || {};

  function createMobileApp(spec) {
    const CFG = spec.config;
    const A = root.ASSETS || {};
    const $ = (sel) => document.querySelector(sel);
    const app = { spec, config: CFG, state: 'howto', seed: 0, mobile: true };
    root.ASApp = app;
    document.body.classList.add('m');

    const howto = spec.howtoMobile || spec.howto;
    document.getElementById('app').innerHTML = `
      <header class="topbar">
        <a class="brand" href="index.html" aria-label="All games"><div class="logo-crop logo-mark"><img alt="" src="${A.logo || ''}"></div></a>
        <span class="label m-title">${esc(spec.title)}</span>
        <a class="m-back" href="index.html" id="btn-back">All games</a>
      </header>
      <main class="screens">
        <section class="screen howto" id="scr-howto">
          <div class="box">
            <div class="label">How to play · about a minute</div>
            <h2>${esc(spec.title)}</h2>
            <ol>${howto.map((l) => `<li>${l}</li>`).join('')}</ol>
            <div class="example"><span class="label">Example</span>${spec.example}</div>
            <button class="btn primary big m-start" id="btn-start">Start</button>
          </div>
        </section>
        <section class="screen game" id="scr-game"></section>
        <section class="screen results" id="scr-results">
          <div class="m-card">
            <div class="label m-game">${esc(spec.title)}</div>
            <div class="label">${esc(spec.scoreLabel || 'Your score')}</div>
            <div class="score-big" id="res-score"></div>
            <div class="mono muted m-sub" id="res-sub"></div>
            <div class="m-finished mono" id="res-time"></div>
          </div>
          <div class="m-prize" id="res-prize">Want to enter the official prize leaderboard? Show this screen to an AlgoSoc committee member.</div>
          <div class="m-actions">
            <button class="btn primary big" id="btn-again">Play again</button>
            <a class="btn big" href="index.html" id="btn-home">All games</a>
          </div>
          <div class="takeaway" id="res-takeaway"></div>
          <a class="btn big m-join" id="btn-join" href="${esc(LINKS.join || '')}" target="_blank" rel="noopener noreferrer">Follow / join AlgoSoc</a>
          <div class="detail" id="res-detail"></div>
        </section>
      </main>`;
    const screens = { howto: $('#scr-howto'), game: $('#scr-game'), results: $('#scr-results') };
    if (spec.gameHtml) screens.game.innerHTML = spec.gameHtml;
    spec.game.mount(screens.game, app);

    function show(name) {
      app.state = name;
      document.body.dataset.screen = name;
      for (const k in screens) screens[k].classList.toggle('active', k === name);
      screens[name].scrollTop = 0;
    }

    let cdTimer = 0, cdEl = null;
    function clearCountdown() { clearInterval(cdTimer); cdTimer = 0; if (cdEl) { cdEl.remove(); cdEl = null; } }
    function startGame() {
      if (spec.game.stopResults) spec.game.stopResults();
      clearCountdown();
      show('game');
      // Always a fresh seed: prize scores must not be replayable from the URL.
      app.seed = root.ASRng.newSeed();
      const ctx = { seed: app.seed, rng: root.ASRng.makeRng(app.seed), config: CFG, finish, status: () => {} };
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

    function finish(result) {
      if (app.state !== 'game') return;
      $('#res-score').innerHTML = `<span class="${result.scoreClass != null ? result.scoreClass : AS.fmt.cls(result.score)}">${esc(result.scoreText)}</span>`;
      $('#res-sub').innerHTML = result.subHtml || '';
      $('#res-time').textContent = 'Finished at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      $('#res-takeaway').textContent = result.takeaway;
      show('results');
      spec.game.renderResults($('#res-detail'), result);
    }

    $('#btn-start').addEventListener('click', () => { if (app.state === 'howto') startGame(); });
    $('#btn-again').addEventListener('click', () => { if (app.state === 'results') startGame(); });

    // Keyboard stays optional: Enter/Space start, arrows etc. go to the game.
    root.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key;
      if (app.state === 'howto' && (k === ' ' || k === 'Enter') && !e.repeat && document.activeElement.tagName !== 'A') { e.preventDefault(); startGame(); return; }
      if (app.state === 'game') {
        if (cdEl) return;
        if (spec.game.onKey(e) || [' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      }
    }, true);

    show('howto');
    return app;
  }

  AS.createMobileApp = createMobileApp;
})(this);
