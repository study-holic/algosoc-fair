// Fair-day checks for the four dist files. Run with: npm test
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.resolve(__dirname, '..', 'dist');
const SHOTS = path.resolve(__dirname, 'screenshots');
const VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];

const screen = (page) => page.evaluate(() => document.body.dataset.screen);
const waitScreen = (page, name, timeout) => page.waitForFunction((n) => document.body.dataset.screen === n, name, { timeout: timeout || 30000 });

/* Keyboard-only play-throughs. `mid` is called once while the game is on screen. */
const GAMES = [
  {
    file: '1-beat-the-market.html', id: 'beat-the-market',
    fast: { TICK_MS: 10, COUNTDOWN_STEP_MS: 50, REPLAY_MS: 200 },
    shot: { TICK_MS: 40, COUNTDOWN_STEP_MS: 50, REPLAY_MS: 200 },
    async play(page, mid) {
      const keys = ['ArrowUp', 'ArrowDown', ' ', 'ArrowDown', 'ArrowUp'];
      let i = 0, didMid = false;
      while ((await screen(page)) === 'game') {
        await page.keyboard.press(keys[i++ % keys.length]);
        await page.waitForTimeout(i < 4 ? 400 : 150);
        if (mid && !didMid && i === 4) { didMid = true; await mid(); }
      }
    },
  },
  {
    file: '2-real-or-random.html', id: 'real-or-random',
    fast: { COUNTDOWN_STEP_MS: 50, VERDICT_MS: 150 },
    shot: { COUNTDOWN_STEP_MS: 50, VERDICT_MS: 150 },
    async play(page, mid) {
      await page.waitForTimeout(400);
      if (mid) await mid();
      let i = 0;
      while ((await screen(page)) === 'game') {
        await page.keyboard.press(i++ % 3 ? 'ArrowLeft' : 'ArrowRight');
        await page.waitForTimeout(250);
      }
    },
  },
  {
    file: '3-make-a-market.html', id: 'make-a-market',
    fast: { TRADES_PAUSE_MS: 150, SETTLE_MS: 300 },
    shot: { TRADES_PAUSE_MS: 1500, SETTLE_MS: 300 },
    async play(page, mid) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      if (mid) { await page.waitForTimeout(1600); await page.keyboard.press('ArrowUp'); await mid(); }
      while ((await screen(page)) === 'game') {
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
    },
  },
  {
    file: '4-tune-the-strategy.html', id: 'tune-the-strategy',
    fast: {}, shot: {},
    async play(page, mid) {
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(100);
      if (mid) await mid();
      await page.keyboard.press('Enter');
    },
  },
];

/* Open a dist file with the network blocked; collect stray requests and console errors. */
async function open(page, g, overrides, opts) {
  opts = opts || {};
  const url = pathToFileURL(path.join(DIST, g.file)).href;
  const bad = [], errors = [];
  await page.context().setOffline(true);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('data:') || u.split('?')[0] === url || (opts.allowBlob && u.startsWith('blob:'))) return route.continue();
    bad.push(u);
    return route.abort();
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!(u.startsWith('data:') || u.split('?')[0] === url || (opts.allowBlob && u.startsWith('blob:')))) bad.push(u);
  });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((o) => { window.__AS_OVERRIDES = o; }, overrides || {});
  await page.goto(url);
  await waitScreen(page, 'attract');
  return { url, bad, errors };
}

async function startByKeyboard(page) {
  await page.keyboard.press('Space');
  await waitScreen(page, 'howto');
  await page.keyboard.press('Space');
  await waitScreen(page, 'game');
}

/* No screen may scroll: document and every active screen must fit the viewport. */
async function expectNoScroll(page, label) {
  const m = await page.evaluate(() => {
    const d = document.scrollingElement;
    const s = document.querySelector('.screen.active');
    const over = [];
    document.querySelectorAll('.screen.active *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1)) over.push(el.tagName + '.' + el.className + ' ' + Math.round(r.bottom) + '/' + Math.round(r.right));
    });
    return { dh: d.scrollHeight - innerHeight, dw: d.scrollWidth - innerWidth, sh: s.scrollHeight - s.clientHeight, sw: s.scrollWidth - s.clientWidth, over: over.slice(0, 5) };
  });
  expect(m, `${label}: layout overflows ${JSON.stringify(m)}`).toEqual({ dh: 0, dw: 0, sh: 0, sw: 0, over: [] });
}

for (const g of GAMES) {
  test.describe(g.file, () => {
    test('offline, no console errors, full keyboard game, score survives reload', async ({ page }) => {
      const env = await open(page, g, g.fast);
      await startByKeyboard(page);
      await g.play(page);
      await waitScreen(page, 'results', 90000);
      const scoreText = (await page.locator('#res-score').innerText()).trim();
      await expect(page.locator('#nick')).toBeFocused();
      await page.keyboard.type('Tester 1!@#xyzLONGNAME');   // filtered to letters, digits, spaces; max 12
      await expect(page.locator('#nick')).toHaveValue('Tester 1xyzL');
      await page.keyboard.press('Enter');
      await expect(page.locator('#nick-msg')).toHaveText('Saved as Tester 1xyzL.');
      await page.reload();
      await waitScreen(page, 'attract');
      const row = page.locator('#lb-table tbody tr', { hasText: 'Tester 1xyzL' });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(scoreText);
      expect(env.bad, 'network requests').toEqual([]);
      expect(env.errors, 'console errors').toEqual([]);
    });

    test('profanity is refused and blank saves as anon', async ({ page }) => {
      const env = await open(page, g, g.fast);
      await startByKeyboard(page);
      await g.play(page);
      await waitScreen(page, 'results', 90000);
      await page.keyboard.type('sh1t head');
      await page.keyboard.press('Enter');
      await expect(page.locator('#nick-msg')).toHaveText('Pick another name.');
      await page.locator('#nick').fill('');
      await page.keyboard.press('Enter');
      await expect(page.locator('#nick-msg')).toHaveText('Saved as anon.');
      await page.keyboard.press('Space');
      await waitScreen(page, 'attract');
      await expect(page.locator('#lb-table tbody tr.me')).toContainText('anon');
      expect(env.errors).toEqual([]);
    });

    test('abandoned mid-game returns to attract after idle timeout', async ({ page }) => {
      const env = await open(page, g, { IDLE_SECONDS: 3, COUNTDOWN_STEP_MS: 100 });
      await startByKeyboard(page);
      await page.waitForTimeout(800);
      expect(await screen(page)).toBe('game');
      await waitScreen(page, 'attract', 6000);
      await page.waitForTimeout(1500);
      expect(await screen(page)).toBe('attract');   // the abandoned game did not resurface
      expect(await page.evaluate(() => ASApp.lb.count())).toBe(0);   // nothing saved mid-game
      expect(env.errors).toEqual([]);
    });

    test('unsubmitted score is saved as anon on idle', async ({ page }) => {
      const env = await open(page, g, Object.assign({}, g.fast, { IDLE_SECONDS: 4 }));
      await startByKeyboard(page);
      await g.play(page);
      await waitScreen(page, 'results', 90000);
      await waitScreen(page, 'attract', 8000);
      const all = await page.evaluate(() => ASApp.lb.all());
      expect(all.length).toBe(1);
      expect(all[0].name).toBe('anon');
      expect(env.errors).toEqual([]);
    });

    test('200 leaderboard entries still render without scrolling', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[0]);
      const env = await open(page, g, {});
      await page.evaluate((id) => {
        const e = [];
        for (let i = 0; i < 200; i++) e.push({ id: 'x' + i, name: 'Player ' + String(i).padStart(3, '0') + 'WW', score: Math.round((Math.sin(i) * 5000) * 10) / 10, bot: -1234.56, correct: 10, past: -123.4, fast: 50, slow: 200, t: Date.now() + i });
        localStorage.setItem('uom-algosoc.fair.' + id + '.leaderboard.v1', JSON.stringify(e));
      }, g.id);
      await page.reload();
      await waitScreen(page, 'attract');
      await expect(page.locator('#lb-table tbody tr')).toHaveCount(10);
      await expect(page.locator('#lb-count')).toHaveText('200 players');
      await expectNoScroll(page, 'attract with 200 entries');
      await page.setViewportSize(VIEWPORTS[1]);
      await expectNoScroll(page, 'attract with 200 entries, 1080p');
      expect(env.errors).toEqual([]);
    });

    test('admin shortcuts: export and clear', async ({ page }) => {
      const env = await open(page, g, g.fast, { allowBlob: true });
      await startByKeyboard(page);
      await g.play(page);
      await waitScreen(page, 'results', 90000);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await waitScreen(page, 'attract');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+Shift+E')]);
      const body = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
      expect(body.entries.length).toBe(1);
      page.once('dialog', (d) => d.dismiss());
      await page.keyboard.press('Control+Shift+R');
      expect(await page.evaluate(() => ASApp.lb.count())).toBe(1);
      page.once('dialog', (d) => d.accept());
      await page.keyboard.press('Control+Shift+R');
      expect(await page.evaluate(() => ASApp.lb.count())).toBe(0);
      await expect(page.locator('#lb-table tbody tr.empty')).toHaveCount(10);
      expect(env.errors).toEqual([]);
    });

    for (const vp of VIEWPORTS) {
      test(`screenshots ${vp.width}x${vp.height}`, async ({ page }) => {
        await page.setViewportSize(vp);
        const env = await open(page, g, g.shot);
        // A few earlier scores so the board looks lived-in.
        await page.evaluate((id) => {
          const names = ['maya', 'jk', 'anon', 'tom w', 'priya', 'anon', 'ollie'];
          const e = names.map((n, i) => ({ id: 's' + i, name: n, score: [412.5, 188, 96.2, 40, 12.4, -30, -155][i] / (id === 'make-a-market' ? 40 : id === 'tune-the-strategy' ? 8 : 1), bot: [120, -80, 210, 55, -12, 90, 140][i], correct: [9, 8, 8, 7, 6, 5, 4][i], past: [31.2, 55.4, 12.0, 80.1, 5.5, 22.2, 64.3][i], fast: [8, 3, 12, 2, 20, 5, 4][i], slow: [40, 9, 60, 7, 90, 30, 11][i], t: i }));
          if (id === 'real-or-random') e.forEach((x, i) => { x.score = [1180, 1044, 920, 781, 640, 512, 330][i]; });
          localStorage.setItem('uom-algosoc.fair.' + id + '.leaderboard.v1', JSON.stringify(e));
        }, g.id);
        await page.reload();
        await waitScreen(page, 'attract');
        await page.waitForTimeout(300);
        const tag = `${g.file.replace('.html', '')}-${vp.width}x${vp.height}`;
        await expectNoScroll(page, 'attract');
        await page.screenshot({ path: path.join(SHOTS, `${tag}-1-attract.png`) });
        await page.keyboard.press('Space');
        await waitScreen(page, 'howto');
        await page.waitForTimeout(200);
        await expectNoScroll(page, 'howto');
        await page.screenshot({ path: path.join(SHOTS, `${tag}-2-howto.png`) });
        await page.keyboard.press('Space');
        await waitScreen(page, 'game');
        await page.waitForTimeout(g.id === 'beat-the-market' ? 300 : 100);
        await g.play(page, async () => {
          await page.waitForTimeout(g.id === 'beat-the-market' ? 1500 : 150);
          await expectNoScroll(page, 'game');
          await page.screenshot({ path: path.join(SHOTS, `${tag}-3-game.png`) });
        });
        await waitScreen(page, 'results', 90000);
        await page.waitForTimeout(g.id === 'tune-the-strategy' ? 2200 : 500);
        await expectNoScroll(page, 'results');
        await page.keyboard.type('priya');
        await page.screenshot({ path: path.join(SHOTS, `${tag}-4-results.png`) });
        expect(env.bad).toEqual([]);
        expect(env.errors).toEqual([]);
      });
    }
  });
}
