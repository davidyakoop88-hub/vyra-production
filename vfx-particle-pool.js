// vfx-particle-pool.js — generic fixed-capacity object pool. Pre-allocates every
// instance up front (prewarm) so steady-state spawning never calls `new` or triggers
// GC; acquire()/release() just flip an active flag and shuffle two arrays.
window.VFX = window.VFX || {};

VFX.ParticlePool = class ParticlePool {
  /**
   * @param {() => any} factory - creates one poolable instance
   * @param {number} capacity
   */
  constructor(factory, capacity) {
    this.capacity = capacity;
    this._factory = factory;
    this._free = [];
    this._active = new Set();
    this._destroyed = false;
    for (let i = 0; i < capacity; i++) {
      let item;
      try {
        item = factory();
      } catch (err) {
        // leave the pool in a clean, fully-torn-down state rather than half-built —
        // whatever was already prewarmed gets destroyed before rethrowing.
        this.destroy();
        throw new Error(`[VFX] ParticlePool factory threw during prewarm (item ${i}/${capacity}): ${err && err.message}`);
      }
      this._free.push(item);
    }
  }

  /** @returns {any|null} an instance, or null if the pool is exhausted or destroyed */
  acquire() {
    if (this._destroyed) return null;
    const item = this._free.pop();
    if (!item) return null;
    this._active.add(item);
    return item;
  }

  release(item) {
    if (this._destroyed) return;
    if (!this._active.has(item)) return;
    this._active.delete(item);
    try {
      if (item.deactivate) item.deactivate();
    } catch (err) {
      // keep pool bookkeeping consistent even if a particle's own deactivate()
      // throws — the item still goes back to _free, it just may be visually/
      // logically dirty, which is strictly better than leaking it as "active"
      // forever or corrupting _active/_free.
      console.error('[VFX] ParticlePool: deactivate() threw during release', err);
    }
    this._free.push(item);
  }

  releaseAll() {
    for (const item of [...this._active]) this.release(item);
  }

  /** Iterates every pooled instance, active and free alike (e.g. to push a
   * property change out to instances that aren't currently in use). */
  forEachAll(fn) {
    this._active.forEach(fn);
    for (const item of this._free) fn(item);
  }

  get activeCount() { return this._active.size; }
  get freeCount() { return this._free.length; }
  get usageRatio() { return this.capacity ? this._active.size / this.capacity : 0; }

  forEachActive(fn) { this._active.forEach(fn); }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.releaseAll();
    for (const item of this._free) { if (item.destroy) item.destroy(); }
    this._free.length = 0;
    this._active.clear();
  }
};
