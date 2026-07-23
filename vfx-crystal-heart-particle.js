// vfx-crystal-heart-particle.js — faceted crystal heart texture generation plus the
// pooled particle class that uses it. PIXI.Graphics has no native gradient fill, so
// the "internal gradient" is simulated with layered solid-color heart silhouettes at
// decreasing size/increasing brightness (a standard vector-art gradient-fake), baked
// to one texture per (variant, sizeCategory) pair exactly once via TextureRegistry.
window.VFX = window.VFX || {};

/** Traces a heart silhouette centered at (cx,cy) with half-scale s using two bezier curves. */
function vfxTraceHeart(g, cx, cy, s) {
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy + s * 0.1, cx - s * 1.1, cy - s * 0.9, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 1.1, cy - s * 0.9, cx + s * 1.5, cy + s * 0.1, cx, cy + s * 0.9);
}

VFX.CrystalHeartTextures = class CrystalHeartTextures {
  /**
   * @param {VFX.TextureRegistry} registry
   * @param {'violet'|'pink'|'blue'|'gold'} variant
   * @param {'TINY'|'SMALL'|'MEDIUM'|'HERO'} sizeCategory
   */
  static get(registry, variant, sizeCategory) {
    const key = `crystal-heart:${variant}:${sizeCategory}`;
    const colors = VFX.FOUNTAIN_HEART_COLORS[variant];
    const px = VFX.FOUNTAIN_SIZE_CATEGORIES[sizeCategory].max; // bake at the category's max size
    const pad = Math.round(px * 0.6); // room for outer bloom
    const box = px * 2 + pad * 2;
    const cx = box / 2, cy = box / 2;
    const s = px * 0.5;

    return registry.getOrCreate(key, g => {
      // 1. soft outer bloom — a plain circular halo behind the heart reads fine and
      //    is far cheaper than a heart-shaped blur.
      const bloomSteps = 5;
      for (let i = bloomSteps; i >= 1; i--) {
        const r = s * 1.6 * (i / bloomSteps);
        const alpha = Math.pow(1 - i / bloomSteps, 1.8) * 0.35;
        g.beginFill(colors.base, alpha);
        g.drawCircle(cx, cy, r);
        g.endFill();
      }
      // 2. base facet — darkest layer, full silhouette
      g.beginFill(colors.dark, 1);
      vfxTraceHeart(g, cx, cy, s);
      g.closePath(); g.endFill();
      // 3. mid facet — lighter core, shifted up slightly (simulates a lit face)
      g.beginFill(colors.base, 0.92);
      vfxTraceHeart(g, cx, cy - s * 0.08, s * 0.82);
      g.closePath(); g.endFill();
      // 4. upper highlight facet — bright edge near the top lobes
      g.beginFill(colors.light, 0.75);
      vfxTraceHeart(g, cx, cy - s * 0.22, s * 0.5);
      g.closePath(); g.endFill();
      // 5. central specular highlight — small bright hotspot, upper-left of center
      //    (conventional gem/glass highlight placement)
      g.beginFill(0xffffff, 0.85);
      g.drawEllipse(cx - s * 0.28, cy - s * 0.32, s * 0.16, s * 0.1);
      g.endFill();
      // 6. thin dark rim so the silhouette stays crisp against bright backgrounds
      g.lineStyle(Math.max(1, px * 0.02), colors.dark, 0.5);
      vfxTraceHeart(g, cx, cy, s);
      g.closePath();
    }, box, box);
  }
};

VFX.CrystalHeartParticle = class CrystalHeartParticle extends VFX.BaseParticle {
  constructor(texture) {
    super(texture);
    this.rotationSpeed = 0;
    this.shimmerPhase = 0;
    this.shimmerSpeed = 0;
    this.hasTrail = false;
  }

  reset(opts) {
    // swap to the cached texture for this spawn's chosen variant+size BEFORE
    // super.reset() applies tint/scale — lets the emitter pick a differently-baked
    // heart per spawn (was previously fixed at pool-prewarm time) so tint never has
    // to fake a color the baked facets don't already have (M2 hardening item 11).
    if (opts.texture) this.sprite.texture = opts.texture;
    super.reset(opts);
    this.rotationSpeed = (opts.rotationSpeed ?? 0);
    this.sprite.rotation = opts.rotation ?? 0;
    // shimmerPhase comes from the emitter's seeded "shimmer" RNG stream, not
    // Math.random() — see FountainEmitter._spawnInChannel (M2 hardening item 4).
    this.shimmerPhase = opts.shimmerPhase ?? 0;
    this.shimmerSpeed = opts.shimmerSpeed ?? 0;
    this.hasTrail = !!opts.hasTrail;
  }

  integrate(dt) {
    super.integrate(dt);
    this.sprite.rotation += this.rotationSpeed * dt;
  }

  syncSprite() {
    super.syncSprite();
    if (this.shimmerSpeed > 0) {
      const shimmer = 0.85 + 0.15 * Math.sin(this.age * this.shimmerSpeed + this.shimmerPhase);
      this.sprite.alpha *= shimmer;
    }
  }
};
