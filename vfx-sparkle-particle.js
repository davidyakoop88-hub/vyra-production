// vfx-sparkle-particle.js — four cached sparkle textures (soft dot, four-point star,
// tiny flare, dust) plus the pooled particle class driving them. Kept deliberately
// simple/cheap relative to crystal hearts — sparkles exist to support the fountain
// shape, not to be its own focal point.
window.VFX = window.VFX || {};

VFX.SparkleTextures = class SparkleTextures {
  static softDot(registry, tintKey = 'white') {
    return registry.getOrCreate(`sparkle-dot:${tintKey}`, g => {
      const r = 12;
      for (let i = 4; i >= 1; i--) {
        g.beginFill(0xffffff, Math.pow(1 - i / 4, 1.5) * 0.85);
        g.drawCircle(r, r, r * (i / 4));
        g.endFill();
      }
    }, 24, 24);
  }

  static fourPointStar(registry) {
    return registry.getOrCreate('sparkle-star', g => {
      const cx = 20, cy = 20, outer = 18, inner = 4;
      g.beginFill(0xffffff, 1);
      g.moveTo(cx, cy - outer);
      g.quadraticCurveTo(cx + inner * 0.4, cy - inner * 0.4, cx + outer, cy);
      g.quadraticCurveTo(cx + inner * 0.4, cy + inner * 0.4, cx, cy + outer);
      g.quadraticCurveTo(cx - inner * 0.4, cy + inner * 0.4, cx - outer, cy);
      g.quadraticCurveTo(cx - inner * 0.4, cy - inner * 0.4, cx, cy - outer);
      g.endFill();
      g.beginFill(0xffffff, 0.35);
      g.drawCircle(cx, cy, inner * 1.8);
      g.endFill();
    }, 40, 40);
  }

  static tinyFlare(registry) {
    return registry.getOrCreate('sparkle-flare', g => {
      const cx = 24, cy = 6;
      g.beginFill(0xffffff, 0.9);
      g.drawEllipse(cx, cy, 24, 2.2);
      g.endFill();
      g.beginFill(0xffffff, 1);
      g.drawCircle(cx, cy, 3.5);
      g.endFill();
    }, 48, 12);
  }

  static dust(registry) {
    return registry.getOrCreate('sparkle-dust', g => {
      g.beginFill(0xffffff, 0.8);
      g.drawCircle(4, 4, 4);
      g.endFill();
    }, 8, 8);
  }

  /** @param {'dot'|'star'|'flare'|'dust'} kind */
  static get(registry, kind) {
    switch (kind) {
      case 'star': return SparkleTextures.fourPointStar(registry);
      case 'flare': return SparkleTextures.tinyFlare(registry);
      case 'dust': return SparkleTextures.dust(registry);
      default: return SparkleTextures.softDot(registry);
    }
  }
};

VFX.SparkleParticle = class SparkleParticle extends VFX.BaseParticle {
  constructor(texture) {
    super(texture);
    this.rotationSpeed = 0;
    this.kind = 'dot';
  }

  reset(opts) {
    super.reset(opts);
    this.kind = opts.kind || 'dot';
    this.rotationSpeed = opts.rotationSpeed ?? 0;
    // rotation comes from the emitter's seeded "rotation" RNG stream, not
    // Math.random() (M2 hardening item 4) — matches CrystalHeartParticle.reset.
    this.sprite.rotation = opts.rotation ?? 0;
    this.sprite.blendMode = opts.additive ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
  }

  integrate(dt) {
    super.integrate(dt);
    this.sprite.rotation += this.rotationSpeed * dt;
  }
};
