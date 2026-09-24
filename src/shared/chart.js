/* Canvas chart helpers: devicePixelRatio-aware setup, scales, hairline grid,
   series and trade markers. No dependencies. */
(function (root) {
  'use strict';
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const C = {};
  function loadColors() {
    ['bg', 'panel', 'panel-2', 'line', 'line-soft', 'text', 'muted', 'dim', 'green', 'red', 'amber'].forEach((k) => { C[k.replace('-', '')] = css('--' + k); });
    C.mono = css('--mono');
    C.sans = css('--sans');
  }

  /* Size the backing store to the element's CSS size times devicePixelRatio. */
  function fit(canvas) {
    if (!C.text) loadColors();
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    return { ctx, w: r.width, h: r.height, dpr, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
  }

  function scale(d0, d1, r0, r1) {
    const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
    return (v) => r0 + (v - d0) * k;
  }

  function extent(arrs, from, to) {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrs) {
      const f = from == null ? 0 : from, t = to == null ? a.length : Math.min(to, a.length);
      for (let i = Math.max(0, f); i < t; i++) { const v = a[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
    return [lo, hi];
  }

  function pad(r, frac) { const d = (r[1] - r[0]) * frac; return [r[0] - d, r[1] + d]; }

  function niceTicks(lo, hi, n) {
    const span = hi - lo, raw = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return { ticks: out, step };
  }

  /* Snap a coordinate to the centre of a device pixel so 1px lines stay sharp. */
  function snap(v, dpr) { return (Math.floor(v * dpr) + 0.5) / dpr; }

  function hline(g, x0, x1, y, color, dash) {
    const { ctx, dpr } = g;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1 / dpr * Math.max(1, Math.round(dpr));
    if (dash) ctx.setLineDash(dash);
    const yy = snap(y, dpr);
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.restore();
  }
  function vline(g, x, y0, y1, color, dash) {
    const { ctx, dpr } = g;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1 / dpr * Math.max(1, Math.round(dpr));
    if (dash) ctx.setLineDash(dash);
    const xx = snap(x, dpr);
    ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, y1); ctx.stroke();
    ctx.restore();
  }

  /* Horizontal grid with right-aligned monospace labels in the gutter [x1, x1+gutter]. */
  function grid(g, box, ys, lo, hi, opts) {
    opts = opts || {};
    const { ctx, rem } = g;
    const t = niceTicks(lo, hi, opts.count || 5);
    const dec = opts.decimals != null ? opts.decimals : Math.max(0, -Math.floor(Math.log10(t.step) + 1e-9));
    ctx.font = `${(opts.fontRem || 0.8) * rem}px ${C.mono}`;
    ctx.fillStyle = C.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (const v of t.ticks) {
      const y = ys(v);
      if (y < box.y0 - 1 || y > box.y1 + 1) continue;
      hline(g, box.x0, box.x1, y, C.linesoft);
      if (opts.labels !== false) ctx.fillText((opts.fmt ? opts.fmt(v) : v.toFixed(dec)), box.x1 + (opts.gutter || 4 * rem), y);
    }
  }

  /* Draw a polyline for indices [from, to) of arr. */
  function series(g, arr, from, to, xs, ys, color, width, dash) {
    const { ctx } = g;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;
    for (let i = from; i < to; i++) {
      const v = arr[i];
      if (!isFinite(v)) { started = false; continue; }
      const x = xs(i), y = ys(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* Trade marker: triangle pointing up (buy) or down (sell), filled or outlined. */
  function tri(g, x, y, up, color, filled, size) {
    const { ctx } = g;
    const s = size || 0.55 * g.rem;
    const off = s * 1.1;
    const cy = up ? y + off + s * 0.5 : y - off - s * 0.5;
    ctx.save();
    ctx.beginPath();
    if (up) { ctx.moveTo(x, cy - s * 0.7); ctx.lineTo(x + s * 0.75, cy + s * 0.55); ctx.lineTo(x - s * 0.75, cy + s * 0.55); }
    else { ctx.moveTo(x, cy + s * 0.7); ctx.lineTo(x + s * 0.75, cy - s * 0.55); ctx.lineTo(x - s * 0.75, cy - s * 0.55); }
    ctx.closePath();
    if (filled) { ctx.fillStyle = color; ctx.fill(); }
    else { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  function text(g, s, x, y, opts) {
    opts = opts || {};
    const { ctx, rem } = g;
    ctx.save();
    ctx.font = `${opts.weight || ''} ${(opts.size || 0.8) * rem}px ${opts.sans ? C.sans : C.mono}`;
    ctx.fillStyle = opts.color || C.muted;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = opts.spacing;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  /* Price tag on the right axis. */
  function tag(g, s, x, y, color, bg) {
    const { ctx, rem } = g;
    ctx.save();
    ctx.font = `${0.85 * rem}px ${C.mono}`;
    const w = ctx.measureText(s).width + 0.8 * rem, h = 1.3 * rem;
    ctx.fillStyle = bg || C.text;
    ctx.fillRect(x, y - h / 2, w, h);
    ctx.fillStyle = color || C.bg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(s, x + 0.4 * rem, y + 0.5);
    ctx.restore();
  }

  /* requestAnimationFrame loop; returns a stop function. */
  function loop(fn) {
    let id = 0, alive = true, t0 = performance.now();
    function f(t) { if (!alive) return; fn(t - t0, t); if (alive) id = requestAnimationFrame(f); }
    id = requestAnimationFrame(f);
    return () => { alive = false; cancelAnimationFrame(id); };
  }

  root.ASChart = { C, loadColors, fit, scale, extent, pad, niceTicks, hline, vline, grid, series, tri, text, tag, loop };
})(this);
