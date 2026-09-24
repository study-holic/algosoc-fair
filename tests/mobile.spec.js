// Phone build checks (docs/). Touch only: no test in this file uses the keyboard.
// Run with: npm test   (or: npx playwright test tests/mobile.spec.js)
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { JOIN_URL } = require('../site.config.js');

const DOCS = path.resolve(__dirname, '..', 'docs');
const DOCS_URL = pathToFileURL(DOCS).href + '/';
const SHOTS = path.resolve(__dirname, 'screenshots');
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 412, height: 915 }];

const screen = (page) => page.evaluate(() => document.body.dataset.screen);
const waitScreen = (page, name, timeout) => page.waitForFunction((n) => document.body.dataset.screen === n, name, { timeout: timeout || 30000 });

/* Real touch drag through the DevTools protocol, so the sliders see pointerType "touch". */
async function touchDrag(page, x0, y, x1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

const GAMES = [
  {
    file: '1-beat-the-market.html', n: 1, title: 'Beat the Market',
    fast: { TICK_MS: 20, COUNTDOWN_STEP_MS: 50, REPLAY_MS: 200 },
    controls: ['.actions .btn[data-p="1"]', '.actions .btn[data-p="0"]', '.actions .btn[data-p="-1"]'],
    async play(page, mid) {
      const seq = ['1', '-1', '0', '-1', '1'];
      let i = 0;
      await page.waitForTimeout(300);
      while ((await screen(page)) === 'game') {
        await page.locator(`.actions .btn[data-p="${seq[i++ % seq.length]}"]`).tap({ timeout: 2000 }).catch(() => {});
        if (i === 3 && mid) await mid();
        await page.waitForTimeout(250);
      }
    },
  },
  {
    file: '2-real-or-random.html', n: 2, title: 'Real or Random',
    fast: { COUNTDOWN_STEP_MS: 50, VERDICT_MS: 150 },
    controls: ['.g2-card[data-side="0"]', '.g2-card[data-side="1"]'],
    async play(page, mid) {
      await page.waitForTimeout(400);
      if (mid) await mid();
      let i = 0;
      while ((await screen(page)) === 'game') {
        await page.locator(`.g2-card[data-side="${i++ % 3 ? 0 : 1}"]`).tap({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    },
  },
  {
    file: '3-make-a-market.html', n: 3, title: 'Make a Market',
    fast: { TRADES_PAUSE_MS: 400, SETTLE_MS: 800 },
    controls: ['[data-a="up"]', '[data-a="down"]', '[data-a="narrow"]', '[data-a="widen"]', '#g3-submit'],
    async play(page, mid) {
      const tap = (sel) => page.locator(sel).tap({ timeout: 2000 }).catch(() => {});
      await tap('[data-a="widen"]');
      await tap('[data-a="widen"]');
      await tap('[data-a="down"]');
      await tap('#g3-submit');
      if (mid) { await page.waitForTimeout(900); await tap('[data-a="up"]'); await mid(); }
      while ((await screen(page)) === 'game') {
        await tap('[data-a="up"]');
        await tap('#g3-submit');
        await page.waitForTimeout(300);
      }
    },
  },
  {
    file: '4-tune-the-strategy.html', n: 4, title: 'Tune the Strategy',
    fast: {},
    controls: ['.slider[data-s="fast"] .s-track', '.slider[data-s="slow"] .s-track', '#g4-lock'],
    async play(page, mid) {
      const fastTrack = await page.locator('.slider[data-s="fast"] .s-track').boundingBox();
      const before = await page.locator('#g4-fast').innerText();
      await touchDrag(page, fastTrack.x + 5, fastTrack.y + fastTrack.height / 2, fastTrack.x + fastTrack.width * 0.4);
      const after = await page.locator('#g4-fast').innerText();
      expect(after, 'touch drag moves the fast slider').not.toBe(before);
      expect(+after).toBeGreaterThan(15);
      const slow = await page.locator('.slider[data-s="slow"] .s-track').boundingBox();
      await page.touchscreen.tap(slow.x + slow.width * 0.6, slow.y + slow.height / 2);
      expect(+(await page.locator('#g4-slow').innerText())).toBeGreaterThan(100);
      await page.waitForTimeout(100);
      if (mid) await mid();
      await page.locator('#g4-lock').tap();
    },
  },
];

/* Collect stray requests and console errors. Only docs/ files and data: URIs may load. */
function watch(page) {
  const bad = [], errors = [];
  page.on('request', (r) => { const u = r.url(); if (!(u.startsWith('data:') || u.startsWith(DOCS_URL))) bad.push(u); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { bad, errors };
}

async function setup(page, overrides) {
  await page.context().setOffline(true);
  await page.route('**/*', (route) => { const u = route.request().url(); return (u.startsWith('data:') || u.startsWith(DOCS_URL)) ? route.continue() : route.abort(); });
  await page.addInitScript((o) => { window.__AS_OVERRIDES = o; }, overrides || {});
  return watch(page);
}

/* No horizontal overflow anywhere; on the game screen nothing may sit outside the viewport. */
async function expectFits(page, label, strictVertical) {
  const m = await page.evaluate((strict) => {
    const d = document.scrollingElement;
    const s = document.querySelector('.screen.active') || document.body;
    const out = [];
    s.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden]') || el.closest('.logo-crop')) return;   // logo image is clipped by its box
      if (r.right > innerWidth + 1 || r.left < -1 || (strict && r.bottom > innerHeight + 1)) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}-${Math.round(r.right)} x ${Math.round(r.bottom)}`);
    });
    return { dw: d.scrollWidth - innerWidth, sw: s.scrollWidth - s.clientWidth, over: out.slice(0, 5) };
  }, strictVertical);
  expect(m, `${label}: ${JSON.stringify(m)}`).toEqual({ dw: 0, sw: 0, over: [] });
}

async function inViewport(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  const vp = page.viewportSize();
  expect(b, `${sel} visible`).not.toBeNull();
  expect(b.y + b.height, `${sel} bottom on screen`).toBeLessThanOrEqual(vp.height + 1);
  expect(b.x + b.width, `${sel} right on screen`).toBeLessThanOrEqual(vp.width + 1);
  expect(Math.min(b.width, b.height), `${sel} touch target >= 44px`).toBeGreaterThanOrEqual(44);
}

for (const vp of VIEWPORTS) {
  test.describe(`phone ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

    test('landing page', async ({ page }) => {
      const env = await setup(page);
      await page.goto(DOCS_URL + 'index.html');
      await expect(page.getByText('Try a game')).toBeVisible();
      await expect(page.getByText('UoM Algorithmic')).toBeVisible();
      await expect(page.getByText('Each game takes about a minute.')).toBeVisible();
      const cards = page.locator('a.game');
      await expect(cards).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        await expect(cards.nth(i)).toHaveAttribute('href', GAMES[i].file);
        const b = await cards.nth(i).boundingBox();
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      const join = page.locator('#join');
      await expect(join).toHaveAttribute('href', JOIN_URL);
      await expect(join).toHaveAttribute('target', '_blank');
      await expect(join).toHaveAttribute('rel', /noopener/);
      await expectFits(page, 'landing', false);
      await page.screenshot({ path: path.join(SHOTS, `mobile-${vp.width}x${vp.height}-0-landing.png`), fullPage: true });
      expect(env.bad).toEqual([]);
      expect(env.errors).toEqual([]);
    });

    for (const g of GAMES) {
      test(`${g.file}: landing → touch play-through → results → play again → all games`, async ({ page }) => {
        const env = await setup(page, g.fast);
        await page.goto(DOCS_URL + 'index.html');
        await page.locator(`a.game[href="${g.file}"]`).tap();
        await waitScreen(page, 'howto');
        expect(page.url()).toContain(g.file);
        await expectFits(page, 'howto', false);
        const tag = `mobile-${vp.width}x${vp.height}-${g.file.replace('.html', '')}`;
        await page.screenshot({ path: path.join(SHOTS, `${tag}-1-howto.png`) });
        await inViewport(page, '#btn-start');
        await page.locator('#btn-start').tap();
        await waitScreen(page, 'game');
        await g.play(page, async () => {
          await page.waitForTimeout(g.n === 1 ? 700 : 150);
          await expectFits(page, 'game', true);
          for (const c of g.controls) await inViewport(page, c);
          await page.screenshot({ path: path.join(SHOTS, `${tag}-2-game.png`) });
        });
        await waitScreen(page, 'results', 90000);
        await page.waitForTimeout(g.n === 4 ? 2000 : 400);
        // What the committee member needs to see.
        await expect(page.locator('#res-score')).not.toBeEmpty();
        await expect(page.locator('.m-game')).toHaveText(g.title);
        await expect(page.locator('#res-time')).toHaveText(/^Finished at \d\d:\d\d$/);
        await expect(page.locator('#res-prize')).toHaveText('Want to enter the official prize leaderboard? Show this screen to an AlgoSoc committee member.');
        for (const sel of ['#res-score', '#res-time', '#res-prize', '#btn-again']) {
          const b = await page.locator(sel).boundingBox();
          expect(b.y + b.height, `${sel} visible without scrolling`).toBeLessThanOrEqual(vp.height);
        }
        const text = await page.evaluate(() => document.body.innerText);
        expect(text.toLowerCase()).not.toContain('seed');
        expect(text).not.toMatch(/nickname|leaderboard\s*\n.*top 10/i);
        await expect(page.locator('#nick, #lb-table')).toHaveCount(0);
        const join = page.locator('#btn-join');
        await expect(join).toHaveAttribute('href', JOIN_URL);
        await expect(join).toHaveAttribute('target', '_blank');
        await expect(join).toHaveAttribute('rel', /noopener/);
        await expectFits(page, 'results', false);
        await page.screenshot({ path: path.join(SHOTS, `${tag}-3-results.png`) });
        await page.evaluate(() => { const s = document.querySelector('.screen.active'); s.scrollTop = s.scrollHeight; });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(SHOTS, `${tag}-4-results-scrolled.png`) });
        await page.evaluate(() => { document.querySelector('.screen.active').scrollTop = 0; });
        // PLAY AGAIN starts a fresh game.
        await page.locator('#btn-again').tap();
        await waitScreen(page, 'game');
        // ALL GAMES returns to the landing page.
        await page.locator('#btn-back').tap();
        await page.waitForURL(/index\.html$/);
        await expect(page.locator('a.game')).toHaveCount(4);
        expect(env.bad, 'network requests').toEqual([]);
        expect(env.errors, 'console errors').toEqual([]);
      });

      test(`${g.file}: result stays up past the old 25 s idle timeout; ?seed= ignored`, async ({ page }) => {
        test.setTimeout(150000);
        // IDLE_SECONDS is set low on purpose: the phone build must ignore it entirely.
        const env = await setup(page, Object.assign({ IDLE_SECONDS: 2 }, g.fast));
        await page.goto(DOCS_URL + g.file + '?seed=12345');
        await waitScreen(page, 'howto');
        await page.locator('#btn-start').tap();
        await waitScreen(page, 'game');
        expect(await page.evaluate(() => ASApp.seed)).not.toBe(12345);
        await g.play(page);
        await waitScreen(page, 'results', 90000);
        const score = await page.locator('#res-score').innerText();
        await page.waitForTimeout(27000);
        expect(await screen(page)).toBe('results');
        await expect(page.locator('#res-score')).toHaveText(score);
        await expect(page.locator('#res-prize')).toBeVisible();
        expect(env.bad).toEqual([]);
        expect(env.errors).toEqual([]);
      });
    }

    test('?seed= does not reproduce a game (game 4: same settings, two loads)', async ({ page }) => {
      const env = await setup(page);
      const results = [];
      for (let i = 0; i < 2; i++) {
        await page.goto(DOCS_URL + '4-tune-the-strategy.html?seed=12345');
        await page.locator('#btn-start').tap();
        await waitScreen(page, 'game');
        results.push(await page.evaluate(() => ASApp.seed));
        await page.locator('#g4-lock').tap();   // default 10/30 settings: result depends only on the series
        await waitScreen(page, 'results');
        results.push(await page.locator('#res-sub').innerText());
      }
      expect(results[0]).not.toBe(12345);
      expect(results[2]).not.toBe(12345);
      expect(results[0]).not.toBe(results[2]);
      expect(results[1]).not.toBe(results[3]);   // different past return, so a different market
      expect(env.errors).toEqual([]);
    });
  });
}

test.describe('phone landscape 844x390', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  for (const g of GAMES) {
    test(`${g.file}: controls reachable in landscape`, async ({ page }) => {
      const env = await setup(page, { COUNTDOWN_STEP_MS: 50 });
      await page.goto(DOCS_URL + g.file);
      await page.locator('#btn-start').tap();
      await waitScreen(page, 'game');
      await page.waitForTimeout(300);
      await expectFits(page, 'landscape game', true);
      for (const c of g.controls) await inViewport(page, c);
      await page.screenshot({ path: path.join(SHOTS, `mobile-844x390-${g.file.replace('.html', '')}-landscape.png`) });
      expect(env.errors).toEqual([]);
    });
  }
});

test('stall QR outputs exist and qr.html renders', async ({ page }) => {
  for (const f of ['qr.png', 'qr.svg', 'qr.html', 'index.html', '.nojekyll']) expect(fs.existsSync(path.join(DOCS, f)), f).toBe(true);
  const env = await setup(page);
  await page.goto(DOCS_URL + 'qr.html');
  await expect(page.getByText('SCAN TO PLAY')).toBeVisible();
  await expect(page.getByText('No download required')).toBeVisible();
  await expect(page.locator('.qr svg')).toHaveCount(1);
  const { MOBILE_SITE_URL } = require('../site.config.js');
  await expect(page.locator('.url')).toHaveText(MOBILE_SITE_URL);
  await page.setViewportSize({ width: 800, height: 1130 });
  await page.screenshot({ path: path.join(SHOTS, 'mobile-qr-sign.png') });
  expect(env.bad).toEqual([]);
  expect(env.errors).toEqual([]);
});

test('phone build contains no online leaderboard or storage calls', () => {
  for (const f of fs.readdirSync(DOCS).filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(DOCS, f), 'utf8');
    expect(html, f).not.toMatch(/supabase|firebase|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|googletagmanager|analytics/i);
  }
});
