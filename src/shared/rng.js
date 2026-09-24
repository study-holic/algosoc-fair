/* Seedable PRNG (mulberry32) with Gaussian draws. Works in the browser and in Node. */
(function (root) {
  'use strict';
  function makeRng(seed) {
    let s = seed >>> 0;
    let spare = null;
    function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u, v, r;
      do { u = next() * 2 - 1; v = next() * 2 - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
      const m = Math.sqrt(-2 * Math.log(r) / r);
      spare = v * m;
      return u * m;
    }
    return {
      seed: seed >>> 0,
      next,
      normal,
      uniform: (a, b) => a + (b - a) * next(),
      int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      sign: () => (next() < 0.5 ? -1 : 1),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
    };
  }
  function newSeed() {
    return ((Date.now() % 1e9) ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  }
  const api = { makeRng, newSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ASRng = api;
})(this);
