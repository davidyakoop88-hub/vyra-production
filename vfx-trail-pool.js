// vfx-trail-pool.js — short tapered trails for a percentage of hearts. Each Trail
// owns exactly one pooled PIXI.Graphics object for its entire lifetime, plus a
// FIXED-SIZE typed-array ring buffer of recent positions (capacity sized to Ultra's
// trailLength ceiling, same pattern channel pools already use for particle counts —
// see FountainEmitter._trailCapacity). The trail is cleared + redrawn (not
// recreated) every fixed tick as one continuous tapered polyline. This is NOT one
// Graphics object per segment per frame — it's one Graphics object per *trail*,
// reused, and pushPoint()/redraw() never allocate or splice (M2 hardening item 9).
//
// Performance tradeoff (documented, not hidden): PIXI.Graphics objects aren't part of
// ParticleContainer's batched rendering, so each active trail is its own WebGL draw
// call — trail count contributes linearly to draw-call count, unlike hearts/sparkles
// which batch into one draw call per container regardless of count. This is exactly
// why trail length AND trail eligibility (only some hearts get one) are both quality-
// gated: Low disables trails entirely, Ultra allows the longest/most.
window.VFX = window.VFX || {};

VFX.Trail = class Trail {
  /** @param {number} ringCapacity fixed ring-buffer size — the ceiling any quality
   * level could ever request (Ultra's trailLength); never reallocated after this. */
  constructor(ringCapacity) {
    this.graphics = new PIXI.Graphics();
    this.capacity = ringCapacity;
    this.maxPoints = ringCapacity; // current *drawn* window, <=capacity, quality-adjustable
    this._buf = new Float32Array(ringCapacity * 2); // ring buffer, x,y interleaved
    this._head = 0;  // total points ever pushed (wraps via modulo on write)
    this._count = 0; // valid points currently held, capped at capacity
    this.active = false;
    this.color = 0xffffff;
    this.baseAlpha = 0.55;
    this.baseWidth = 4;
  }

  reset({ color = 0xffffff, alpha = 0.55, width = 4 } = {}) {
    this._head = 0;
    this._count = 0;
    this.color = color;
    this.baseAlpha = alpha;
    this.baseWidth = width;
    this.active = true;
    this.graphics.visible = true;
    this.graphics.clear();
  }

  pushPoint(x, y) {
    const slot = this._head % this.capacity;
    this._buf[slot * 2] = x;
    this._buf[slot * 2 + 1] = y;
    this._head++;
    if (this._count < this.capacity) this._count++;
  }

  /** Adjusts how many of the most-recent points are drawn (<=capacity). Ring-buffer
   * storage means "trimming" needs no data movement — redraw() just reads a smaller
   * window (M2 hardening item 7). */
  setMaxPoints(n) {
    this.maxPoints = Math.max(2, Math.min(n, this.capacity));
  }

  redraw() {
    const n = Math.min(this.maxPoints, this._count);
    const g = this.graphics;
    g.clear();
    if (n < 2) return;
    const cap = this.capacity, head = this._head, buf = this._buf;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1); // 0 = oldest visible, 1 = newest (nearest the heart)
      const prevOffset = n - i;
      const currOffset = n - i - 1;
      const prevIdx = ((head - 1 - prevOffset) % cap + cap) % cap;
      const currIdx = ((head - 1 - currOffset) % cap + cap) % cap;
      const alpha = this.baseAlpha * t * t;
      const width = Math.max(0.5, this.baseWidth * (0.25 + 0.75 * t));
      g.lineStyle(width, this.color, alpha);
      g.moveTo(buf[prevIdx * 2], buf[prevIdx * 2 + 1]);
      g.lineTo(buf[currIdx * 2], buf[currIdx * 2 + 1]);
    }
  }

  deactivate() {
    this.active = false;
    this.graphics.visible = false;
    this.graphics.clear();
    this._head = 0;
    this._count = 0;
  }

  destroy() { this.graphics.destroy(); }
};

VFX.TrailPool = class TrailPool {
  /**
   * @param {PIXI.Container} container - trails layer, inserted at the correct render-order slot
   * @param {number} initialMaxPoints - trail length to start at; quality-dependent
   * @param {number} capacity - pool item count (how many trails can be active at once)
   */
  constructor(container, initialMaxPoints, capacity) {
    this.container = container;
    // each Trail's ring buffer is sized to the absolute ceiling (Ultra's
    // trailLength) so later quality changes can only ever *shrink* the drawn
    // window (setMaxPoints), never need to grow storage — same "size pools for
    // the ceiling, cap the active window" pattern FountainEmitter's channel pools
    // already use for particle counts.
    this._ringCapacity = VFX.FOUNTAIN_QUALITY_BUDGETS.ultra.trailLength;
    this.maxPoints = Math.min(initialMaxPoints, this._ringCapacity);
    this._droppedSpawnCount = 0;
    this.pool = new VFX.ParticlePool(() => {
      const trail = new VFX.Trail(this._ringCapacity);
      trail.setMaxPoints(this.maxPoints);
      container.addChild(trail.graphics);
      trail.graphics.visible = false;
      return trail;
    }, capacity);
  }

  /** Propagates a trail-length quality change to every pooled Trail — active AND
   * free — so an already-in-flight trail immediately conforms instead of only
   * newly-acquired ones picking up the new length (M2 hardening item 7). */
  setMaxPoints(n) {
    this.maxPoints = Math.min(n, this._ringCapacity);
    this.pool.forEachAll(t => t.setMaxPoints(this.maxPoints));
  }

  acquire(opts) {
    const trail = this.pool.acquire();
    if (!trail) { this._droppedSpawnCount++; return null; }
    trail.reset(opts);
    return trail;
  }

  release(trail) { if (trail) this.pool.release(trail); }

  redrawAll() { this.pool.forEachActive(t => t.redraw()); }

  get activeCount() { return this.pool.activeCount; }
  get capacity() { return this.pool.capacity; }
  get droppedSpawnCount() { return this._droppedSpawnCount; }

  destroy() { this.pool.destroy(); }
};
