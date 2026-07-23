// vfx-base-particle.js — one pooled particle: plain-data simulation state plus the
// PIXI.Sprite it drives. Instances are created once per pool slot and reset()-reused
// forever after, so this class must never allocate on the hot path (spawn/update).
window.VFX = window.VFX || {};

VFX.BaseParticle = class BaseParticle {
  constructor(texture) {
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;

    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.age = 0;
    this.life = 1;
    this.baseScale = 1;
    this.baseAlpha = 1;
    this.tint = 0xffffff;
    this.lane = 0;
    this.active = false;
  }

  /** Re-initialize an inactive instance for reuse — the pool calls this on acquire(). */
  reset({ x, y, vx = 0, vy = 0, life = 2, scale = 1, alpha = 1, tint = 0xffffff, lane = 0 }) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.age = 0;
    this.life = life;
    this.baseScale = scale;
    this.baseAlpha = alpha;
    this.tint = tint;
    this.lane = lane;
    this.active = true;

    this.sprite.tint = tint;
    this.sprite.visible = true;
    this.sprite.alpha = 0;
    this.sprite.scale.set(scale * 0.3);
    this.sprite.x = x;
    this.sprite.y = y;
  }

  get normalizedAge() { return this.life > 0 ? Math.min(1, this.age / this.life) : 1; }
  get isDead() { return this.active && this.age >= this.life; }

  /** @param {number} dt seconds, fixed-timestep */
  integrate(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /** Push simulation state to the sprite. Called after integrate() every fixed step. */
  syncSprite() {
    const t = this.normalizedAge;
    // fade in fast, hold, fade out — avoids a hard pop on spawn/despawn
    const fade = t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    this.sprite.alpha = this.baseAlpha * fade;
    const scale = this.baseScale * (0.7 + fade * 0.3);
    this.sprite.scale.set(scale);
  }

  deactivate() {
    this.active = false;
    this.sprite.visible = false;
  }

  destroy() {
    this.sprite.destroy();
  }
};
