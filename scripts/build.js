#!/usr/bin/env node
/* Build both targets from src/:
   dist/  laptop kiosk build: four self-contained files for file:// with wifi off.
          Inlines shared CSS/JS, game code, the logo, a Linktree QR code and (game 2) data/prices.json.
   docs/  phone build for GitHub Pages: the same games with the phone shell (src/shared/mobile.js)
          and phone CSS (src/mobile/mobile.css + src/games/<game>/mobile.css), a landing page,
          and a printable stall QR (qr.html, qr.png, qr.svg) pointing at MOBILE_SITE_URL.
   Settings live in site.config.js.  Usage: npm run build */
'use strict';
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { MOBILE_SITE_URL, JOIN_URL } = require('../site.config.js');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));

const GAMES = [
  { out: '1-beat-the-market.html', dir: 'beat-the-market', title: 'Beat the Market', shared: ['rng', 'market', 'chart', 'core'] },
  { out: '2-real-or-random.html', dir: 'real-or-random', title: 'Real or Random', shared: ['rng', 'chart', 'core'], prices: true },
  { out: '3-make-a-market.html', dir: 'make-a-market', title: 'Make a Market', shared: ['rng', 'chart', 'core'], extra: ['logic.js'] },
  { out: '4-tune-the-strategy.html', dir: 'tune-the-strategy', title: 'Tune the Strategy', shared: ['rng', 'market', 'chart', 'core'] },
];

// Inline <script> content must not contain "</script" or "<!--".
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeCss = (s) => s.replace(/<\/style/gi, '<\\/style');

// Guard: pages may not load anything from outside themselves. Plain <a> links to
// the allowed URLs (the Linktree) are the only external references permitted.
function guard(name, html, allowedLinks) {
  let h = html;
  for (const u of allowedLinks || []) h = h.split(`href="${u}"`).join('href="#"');
  const ext = h.match(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|@import|fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/gi);
  if (ext) throw new Error(`${name}: external reference found: ${ext.join(', ')}`);
}

function write(dir, name, content) {
  const out = path.join(ROOT, dir, name);
  fs.writeFileSync(out, content);
  console.log(`${(dir + '/' + name).padEnd(34)} ${(fs.statSync(out).size / 1024).toFixed(1).padStart(7)} KB`);
}

function gameJs(g, target, assets, prices) {
  const gdir = path.join('src', 'games', g.dir);
  let js = `window.ASSETS = ${JSON.stringify(assets)};\n`;
  if (target === 'mobile') js += `window.AS_TARGET = 'mobile';\nwindow.AS_LINKS = ${JSON.stringify({ join: JOIN_URL })};\n`;
  if (g.prices) js += `window.PRICES = ${JSON.stringify(prices)};\n`;
  const shared = target === 'mobile' ? g.shared.concat('mobile') : g.shared;
  for (const s of shared) js += `\n/* ---- shared/${s}.js ---- */\n` + read('src', 'shared', s + '.js');
  for (const f of (g.extra || []).concat('game.js')) js += `\n/* ---- games/${g.dir}/${f} ---- */\n` + read(gdir, f);
  return js;
}

function gameCss(g, target) {
  const gdir = path.join('src', 'games', g.dir);
  let css = read('src', 'shared', 'base.css') + '\n' + (exists(gdir, 'game.css') ? read(gdir, 'game.css') : '');
  if (target === 'mobile') css += '\n' + read('src', 'mobile', 'mobile.css') + '\n' + (exists(gdir, 'mobile.css') ? read(gdir, 'mobile.css') : '');
  return css;
}

async function main() {
  const logo = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'logo.webp')).toString('base64');
  const prices = JSON.parse(read('data', 'prices.json'));
  if (!Array.isArray(prices) || prices.length < 10) throw new Error('data/prices.json needs at least 10 windows; run scripts/fetch_prices.py');
  const template = read('src', 'shared', 'template.html');
  const page = (g, target, assets) => template
    .replace('/*TITLE*/', () => g.title)
    .replace('/*CSS*/', () => safeCss(gameCss(g, target)))
    .replace('/*SCRIPTS*/', () => safeJs(gameJs(g, target, assets, prices)));

  // ---- laptop build: dist/ ----
  // Dark modules on a light ground scan most reliably; the quiet zone is part of the image.
  const joinSvg = await QRCode.toString(JOIN_URL, { type: 'svg', errorCorrectionLevel: 'M', margin: 3, color: { dark: '#1e2429', light: '#e6e6e6' } });
  const joinQr = 'data:image/svg+xml;base64,' + Buffer.from(joinSvg).toString('base64');
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  for (const g of GAMES) {
    const html = page(g, 'laptop', { logo, qr: joinQr });
    guard(g.out, html);
    write('dist', g.out, html);
  }

  // ---- phone build: docs/ (GitHub Pages) ----
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  const mobileCss = safeCss(read('src', 'shared', 'base.css') + '\n' + read('src', 'mobile', 'mobile.css'));
  for (const g of GAMES) {
    const html = page(g, 'mobile', { logo });
    guard('docs/' + g.out, html);
    write('docs', g.out, html);
  }
  const landing = read('src', 'mobile', 'landing.html')
    .replace('/*CSS*/', () => mobileCss)
    .replace('/*LOGO*/', () => logo)
    .replace('/*JOIN_URL*/', () => JOIN_URL);
  guard('docs/index.html', landing, [JOIN_URL]);
  write('docs', 'index.html', landing);

  // Stall QR: black on white for the most reliable scanning, in three forms.
  const qrOpts = { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } };
  const siteSvg = await QRCode.toString(MOBILE_SITE_URL, Object.assign({ type: 'svg' }, qrOpts));
  write('docs', 'qr.svg', siteSvg);
  await QRCode.toFile(path.join(ROOT, 'docs', 'qr.png'), MOBILE_SITE_URL, Object.assign({ width: 1200 }, qrOpts));
  console.log(`${'docs/qr.png'.padEnd(34)} ${(fs.statSync(path.join(ROOT, 'docs', 'qr.png')).size / 1024).toFixed(1).padStart(7)} KB`);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const qrPage = read('src', 'mobile', 'qr.html')
    .replace('/*LOGO*/', () => logo)
    .replace('/*QR_SVG*/', () => siteSvg.replace(/<\?xml[^>]*>/, ''))
    .replace('/*URL*/', () => esc(MOBILE_SITE_URL));
  guard('docs/qr.html', qrPage);
  write('docs', 'qr.html', qrPage);
  fs.writeFileSync(path.join(ROOT, 'docs', '.nojekyll'), '');

  console.log(`Laptop QR (results screen) encodes ${JOIN_URL}`);
  console.log(`Stall QR (docs/qr.*) encodes      ${MOBILE_SITE_URL}`);
  if (/USERNAME|REPOSITORY/.test(MOBILE_SITE_URL)) {
    console.warn('\n  WARNING: MOBILE_SITE_URL is still the placeholder. Set it in site.config.js and rebuild,\n  or the stall QR code will not work.\n');
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
