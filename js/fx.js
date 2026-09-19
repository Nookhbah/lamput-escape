// Particles, screen shake, floating text, and screen-space flashes.

const TAU = Math.PI * 2;

export class Fx {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = null;
  }

  reset() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = null;
  }

  burst(x, y, count, opts = {}) {
    const {
      color = "#ff7a1a", speed = 160, spread = TAU, angle = -Math.PI / 2,
      size = 5, life = 0.55, gravity = 620, shape = "circle", drag = 0.88,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7),
        max: life,
        r: size * (0.5 + Math.random()),
        color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
        gravity, shape, drag,
        rot: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  ring(x, y, opts = {}) {
    const { color = "#4ee6b8", count = 14, speed = 210, size = 4, life = 0.4 } = opts;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life, max: life, r: size, color,
        gravity: 0, shape: "circle", drag: 0.86,
        rot: 0, spin: 0,
      });
    }
  }

  text(x, y, str, opts = {}) {
    const { color = "#ffd84d", size = 22, life = 1.1, vy = -52 } = opts;
    this.texts.push({ x, y, str, color, size, life, max: life, vy });
  }

  addShake(amount) {
    this.shake = Math.min(26, this.shake + amount);
  }

  screenFlash(color, life = 0.25) {
    this.flash = { color, life, max: life };
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 46);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shakeX = this.shakeY = 0;
    }
    if (this.flash) {
      this.flash.life -= dt;
      if (this.flash.life <= 0) this.flash = null;
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === "square") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    ctx.textAlign = "center";
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.max * 1.6);
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size}px "Baloo 2", sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(20,10,40,0.85)";
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  drawFlash(ctx, w, h) {
    if (!this.flash) return;
    ctx.globalAlpha = (this.flash.life / this.flash.max) * 0.55;
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
