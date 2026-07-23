// vfx-rng.js — small deterministic PRNG utilities for the VFX engine. Reuses the
// same mulberry32 algorithm vfx-flow-field.js already uses for noise, exposed here
// as a reusable stream so callers (FountainEmitter) can keep multiple independent,
// reproducible random sequences — one per concern (spawn timing, lane choice,
// texture variant, size, rotation, shimmer phase, trail eligibility) — instead of
// sharing Math.random(), which is neither seeded nor independently reproducible
// per concern.
window.VFX = window.VFX || {};

VFX.Rng = class Rng {
  /** @param {number} seed unsigned 32-bit seed */
  constructor(seed) {
    this._state = (seed >>> 0) || 1;
  }

  /** @returns {number} in [0, 1) */
  next() {
    let a = this._state;
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this._state = a;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns {number} in [min, max) */
  range(min, max) { return min + (max - min) * this.next(); }

  /** @returns {number} integer in [min, max] inclusive */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  /** @returns {boolean} true with probability p */
  chance(p) { return this.next() < p; }

  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  /** @param {[any, number][]} weightedPairs value/weight pairs, weights need not sum to 1 */
  weightedPick(weightedPairs) {
    let total = 0;
    for (const [, w] of weightedPairs) total += w;
    let r = this.next() * total, acc = 0;
    for (const [value, w] of weightedPairs) { acc += w; if (r <= acc) return value; }
    return weightedPairs[weightedPairs.length - 1][0];
  }
};

/**
 * Derives an independent 32-bit sub-seed from a base seed + a string label, so
 * multiple named RNG streams from the same base seed never share state or
 * accidentally correlate (e.g. the "lane" and "size" streams stay independent
 * even though both derive from the same emitter.seed).
 * @param {number} baseSeed
 * @param {string} label
 */
VFX.hashSeed = function (baseSeed, label) {
  let h = (baseSeed >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** @param {number} baseSeed @param {string} [label] @returns {VFX.Rng} */
VFX.createRng = function (baseSeed, label) {
  return new VFX.Rng(label ? VFX.hashSeed(baseSeed, label) : baseSeed);
};
