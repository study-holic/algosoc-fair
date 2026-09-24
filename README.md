# UoM AlgoSoc: Freshers' Fair games

Four short trading games, built two ways from the same source:

| Folder | What it is | Where it runs |
|---|---|---|
| `dist/` | **Laptop build.** Four self-contained kiosk files with a keyboard/mouse layout, a local "This laptop" leaderboard and a 25 s idle reset. No network access at all. | The stall laptops, opened from disk (`file://`) with wifi off. |
| `docs/` | **Phone build.** The same four games with phone layouts and touch controls, plus a landing page and a printable stall QR. No leaderboard, no idle reset, no data collected. | GitHub Pages, reached by scanning the stall QR. |

Neither build has an online leaderboard, database, backend or analytics. **The official prize leaderboard is the paper sheet at the stall.** Phone players show their result screen to a committee member, who writes the score down.

| Game | Laptop file | Phone file |
|---|---|---|
| Beat the Market | `dist/1-beat-the-market.html` | `docs/1-beat-the-market.html` |
| Real or Random | `dist/2-real-or-random.html` | `docs/2-real-or-random.html` |
| Make a Market | `dist/3-make-a-market.html` | `docs/3-make-a-market.html` |
| Tune the Strategy | `dist/4-tune-the-strategy.html` | `docs/4-tune-the-strategy.html` |

## 1. Build

```sh
npm install        # once: qrcode (build) and @playwright/test (tests)
npm run build      # writes dist/ AND docs/
```

`npm run build` prints a warning while `MOBILE_SITE_URL` is still the placeholder (see section 5).

## 2. Test

```sh
npm test           # builds, then runs tests/fair.spec.js (laptop) and tests/mobile.spec.js (phone)
npm run sim        # game simulations (1, 3 and 4)
```

Tests run in the Microsoft Edge already installed on Windows. To use Chrome instead, set `PW_CHANNEL=chrome`.
Screenshots are written to `tests/screenshots/`: the laptop ones are `1-…` to `4-…`, the phone ones start with `mobile-`.

## 3. What `dist/` is for

The main stall setup: four laptops, one game each, fully offline. Open the file in Chrome or Edge and press F11.
- Scores are saved in that laptop's browser (localStorage). The on-screen list is headed "This laptop · top 10"; it is a fun display, not the prize list.
- Any screen returns to the attract screen after 25 s without input. An unnamed score is saved as "anon".
- Hidden admin shortcuts: **Ctrl+Shift+R** clears the leaderboard (after a confirm dialog); **Ctrl+Shift+E** downloads it as JSON.
- `?seed=<number>` on the URL replays a game exactly (for debugging). The seed is shown in small print on the results screen.

## 4. What `docs/` is for

Overflow and casual play on people's own phones.
- `docs/index.html` is the game menu. Each game page is self-contained (all code, data and the logo are inlined).
- Touch controls throughout, with portrait layouts for 360–412 px wide phones and side-by-side layouts in landscape.
- The results screen stays up until the player taps something. It shows the game, score, "Finished at HH:MM", the prize-leaderboard instruction, **Play again**, **All games** and a **Follow / join AlgoSoc** link.
- Every game gets a fresh random seed. `?seed=` is ignored and the seed is never shown, so a prize score can't be replayed from a URL.
- There is no leaderboard, nickname entry or storage of any kind in the phone build.

## 5. Configure `MOBILE_SITE_URL`

Edit **`site.config.js`** in the project root:

```js
MOBILE_SITE_URL: process.env.MOBILE_SITE_URL || 'https://USERNAME.github.io/REPOSITORY/',
```

Replace it with your real GitHub Pages address (it must end in `/`), then run `npm run build`. It is only used for the stall QR code.
You can also set it for one build: `MOBILE_SITE_URL=https://example.github.io/fair/ npm run build`.
`JOIN_URL` (the Linktree) is in the same file.

## 6. Enable GitHub Pages

The project needs its own GitHub repository (this folder is not currently one).

1. Create an empty **public** repository on GitHub, e.g. `algosoc-fair`.
2. In this folder:
   ```sh
   git init -b main
   git add .
   git commit -m "Fair games"
   git remote add origin https://github.com/USERNAME/algosoc-fair.git
   git push -u origin main
   ```
3. On GitHub: repository **Settings → Pages**.
4. Under **Build and deployment**, set **Source: Deploy from a branch**.
5. Branch: **`main`**, folder: **`/docs`**, then **Save**.
6. Wait a minute or two, then open `https://USERNAME.github.io/algosoc-fair/`.
7. Put that address in `site.config.js`, run `npm run build`, then commit and push again so the QR files match.

`docs/.nojekyll` is included so GitHub serves the files exactly as built.

## 7. The stall QR code

The build writes three copies, all pointing to `MOBILE_SITE_URL`:
- `docs/qr.html`: a printable A4 sign (logo, "SCAN TO PLAY", QR, the URL, "No download required"). Open it in a browser and print it; the print version switches to black on white.
- `docs/qr.png`: 1200 × 1200 px, for slides, posters or a spare laptop screen.
- `docs/qr.svg`: vector, for any size.

Scan the printed sign with your own phone before you leave for the fair.

## 8. Test on a real phone before the fair

On at least one iPhone (Safari) and one Android phone (Chrome), using **mobile data, not wifi**:
1. Scan the printed QR. The "Try a game" menu opens.
2. Play each game to the end by tapping only. For Tune the Strategy, drag both sliders.
3. On the results screen, check the score, "Finished at" (the current time) and the committee message are all visible without scrolling.
4. Wait 30 seconds. The result must still be there.
5. Tap **Play again**, then **All games**.
6. Tap **Follow / join AlgoSoc**. The Linktree opens in a new tab.
7. Turn the phone sideways during a game: all controls must still be reachable.

## Layout

```
site.config.js               MOBILE_SITE_URL and JOIN_URL
src/shared/                  base.css, template.html, rng.js, market.js, chart.js,
                             core.js (laptop shell), mobile.js (phone shell, docs/ only)
src/games/<name>/game.js     one game; its CONFIG block is at the top
src/games/<name>/game.css    laptop layout
src/games/<name>/mobile.css  phone layout (docs/ only)
src/mobile/                  mobile.css (shared phone layer), landing.html, qr.html
scripts/build.js             builds dist/ and docs/
scripts/fetch_prices.py      yfinance download → data/prices.json (needs internet)
scripts/sim_game*.js         simulations; they read CONFIG from the game source
tests/fair.spec.js           laptop tests
tests/mobile.spec.js         phone tests
```

Durations, costs, timeouts and on-screen text are in the `CONFIG` object at the top of each `src/games/*/game.js`, and apply to both builds. After changing anything, run `npm run build`.
