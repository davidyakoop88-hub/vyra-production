// vfx-fountain-source.js — the "energy portal" at the fountain's base: core glow,
// 2-3 slowly rotating elliptical energy rings, faint upward light rays, and a
// handful of small burst sparks. Not pooled particles — this is a small fixed set of
// persistent display objects animated directly from sim time, since there's never
// more than one source per emitter and its members never spawn/despawn.
window.VFX = window.VFX || {};

VFX.FountainSource = class FountainSource {
  /**
   * @param {PIXI.Container} parent
   * @param {VFX.TextureRegistry} registry
   * @param {number} [tint]
   * @param {number} [seed] seeds the ray/spark phase offsets so a given emitter
   *   seed reproduces byte-identical source decoration too (M2 hardening item 4)
   */
  constructor(parent, registry, tint = 0xb43dff, seed = 1) {
    this.tint = tint;
    this.container = new PIXI.Container();
    parent.addChild(this.container);
    const rng = VFX.createRng(seed, 'source');

    // core glow
    const glowTex = registry.getGlowCircle('fountain-source-glow', 90);
    this.glow = new PIXI.Sprite(glowTex);
    this.glow.anchor.set(0.5);
    this.glow.tint = tint;
    this.glow.alpha = 0;
    this.glow.blendMode = PIXI.BLEND_MODES.ADD;
    this.container.addChild(this.glow);

    // 3 elliptical energy rings, baked once, tinted per-instance
    const ringTex = registry.getOrCreate('fountain-source-ring', g => {
      g.lineStyle(3, 0xffffff, 0.9);
      g.drawEllipse(90, 30, 82, 26);
    }, 180, 60);
    this.rings = [0, 1, 2].map(i => {
      const s = new PIXI.Sprite(ringTex);
      s.anchor.set(0.5);
      s.tint = tint;
      s.alpha = 0;
      s.scale.set(0.4 + i * 0.22);
      this.container.addChild(s);
      return { sprite: s, speed: 0.15 + i * 0.09, dir: i % 2 === 0 ? 1 : -1, baseScale: 0.4 + i * 0.22 };
    });

    // upward light rays — thin tapered triangles, additive
    const rayTex = registry.getOrCreate('fountain-source-ray', g => {
      g.beginFill(0xffffff, 1);
      g.moveTo(10, 120); g.lineTo(14, 0); g.lineTo(18, 0); g.lineTo(22, 120);
      g.closePath(); g.endFill();
    }, 32, 120);
    this.rays = [-1, -0.5, 0, 0.5, 1].map(offset => {
      const s = new PIXI.Sprite(rayTex);
      s.anchor.set(0.5, 1);
      s.tint = tint;
      s.alpha = 0;
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.x = offset * 22;
      this.container.addChild(s);
      return { sprite: s, phase: rng.next() * Math.PI * 2, offset };
    });

    // small burst sparks — fixed count, animated via math (not pooled spawn/despawn)
    const sparkTex = registry.getOrCreate('fountain-source-spark', g => {
      g.beginFill(0xffffff, 1);
      g.drawCircle(3, 3, 3);
      g.endFill();
    }, 6, 6);
    this.sparks = Array.from({ length: 8 }, (_, i) => {
      const s = new PIXI.Sprite(sparkTex);
      s.anchor.set(0.5);
      s.tint = tint;
      s.alpha = 0;
      this.container.addChild(s);
      return { sprite: s, angle: (i / 8) * Math.PI * 2, phase: rng.next() };
    });

    this.intensity = 0; // 0..1, driven by the entrance timeline / idle breathing
  }

  /** @param {number} t sim time seconds @param {number} intensity 0..1 external multiplier */
  update(t, intensity = 1) {
    this.intensity = intensity;
    const breathe = 0.9 + 0.1 * Math.sin(t * 1.3);
    const glowAlpha = 0.55 * intensity * breathe;
    this.glow.alpha = glowAlpha;
    this.glow.scale.set((1 + 0.06 * Math.sin(t * 1.3)) * (0.7 + 0.3 * intensity));

    for (const r of this.rings) {
      r.sprite.rotation += 0; // ellipses are drawn axis-aligned; "rotation" reads as a
      r.sprite.alpha = 0.4 * intensity;
      const pulse = 1 + 0.04 * Math.sin(t * r.speed * 4 + r.baseScale * 10);
      r.sprite.scale.set(r.baseScale * pulse, r.baseScale * pulse * 0.94);
      r.sprite.x = Math.sin(t * r.speed * r.dir) * 3;
    }

    for (const ray of this.rays) {
      const flicker = 0.5 + 0.5 * Math.sin(t * 2.2 + ray.phase * 6.28);
      ray.sprite.alpha = 0.12 * intensity * flicker;
      ray.sprite.scale.y = 0.8 + 0.3 * flicker;
    }

    for (const spark of this.sparks) {
      const cycle = (t * 0.6 + spark.phase) % 1;
      const r = cycle * 46;
      spark.sprite.x = Math.cos(spark.angle) * r;
      spark.sprite.y = Math.sin(spark.angle) * r * 0.4;
      spark.sprite.alpha = intensity * (1 - cycle) * 0.8;
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
};
