// vfx-types.js — shared constants and JSDoc typedefs for the VYRA VFX engine.
// No TypeScript in this codebase, so "types" here means runtime enums plus
// JSDoc typedefs (editor hinting only, erased at runtime, no build step needed).
window.VFX = window.VFX || {};

/** @enum {string} */
VFX.QualityMode = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ULTRA: 'ultra',
  AUTO: 'auto'
});

/** Per-quality tuning: particle cap, resolution scale, update-skip (1 = every tick). */
VFX.QUALITY_PRESETS = Object.freeze({
  [VFX.QualityMode.LOW]: { maxParticles: 80, resolutionScale: .75, tickSkip: 2 },
  [VFX.QualityMode.MEDIUM]: { maxParticles: 200, resolutionScale: 1, tickSkip: 1 },
  [VFX.QualityMode.HIGH]: { maxParticles: 400, resolutionScale: 1, tickSkip: 1 },
  [VFX.QualityMode.ULTRA]: { maxParticles: 800, resolutionScale: Math.min(2, window.devicePixelRatio || 1), tickSkip: 1 }
});

/** Fixed-timestep simulation rate, in Hz. */
VFX.FIXED_HZ = 60;
VFX.FIXED_DT = 1 / VFX.FIXED_HZ;

/**
 * @typedef {Object} VfxVec2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} VfxSpawnConfig
 * @property {number} [lane] - index into a FlowField's lanes, omit for random lane
 * @property {number} [life] - seconds
 * @property {number} [scale]
 * @property {number} [alpha]
 * @property {number} [tint] - 0xRRGGBB
 */

/**
 * @typedef {Object} VfxEngineOptions
 * @property {HTMLElement} mountEl - element the transparent canvas is appended to
 * @property {VFX.QualityMode} [quality]
 * @property {boolean} [debug]
 */

window.VFX.__typesLoaded = true;
