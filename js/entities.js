import { TILE, COLS, ROWS, isSolid, isOneWay } from "./levels.js";
import { audio } from "./audio.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const GRAVITY = 1900;
// Jump impulses. Theoretical peak is v^2/(2*GRAVITY) per hop, but a real player
// never nails the second hop exactly at the apex, so these are sized to clear a
// 200px (5-tile) floor-to-platform climb with ~45px of slack even when the
// blob-bounce is mistimed. Measured in-engine: ~139px single, ~247px double.
export const JUMP_V = -780;
export const DOUBLE_V = -740;

// ---------------------------------------------------------------- physics ---
export class Body {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.hitWall = 0;
    this.facing = 1;
    this.platform = null;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  overlaps(o) {
    return this.x < o.x + o.w && this.x + this.w > o.x &&
           this.y < o.y + o.h && this.y + this.h > o.y;
  }

  // Axis-separated tilemap collision with one-way platform support.
  move(world, dt, opts = {}) {
    const dropThrough = opts.dropThrough || false;
    this.hitWall = 0;

    // --- horizontal ---
    this.x += this.vx * dt;
    let c0 = Math.floor(this.x / TILE), c1 = Math.floor((this.x + this.w - 1) / TILE);
    let r0 = Math.floor(this.y / TILE), r1 = Math.floor((this.y + this.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!isSolid(world.tile(c, r))) continue;
        if (this.vx > 0) { this.x = c * TILE - this.w; this.hitWall = 1; }
        else if (this.vx < 0) { this.x = (c + 1) * TILE; this.hitWall = -1; }
        this.vx = 0;
      }
    }
    this.x = clamp(this.x, 0, COLS * TILE - this.w);

    // --- vertical ---
    // Resolve against the leading edge only. Checking a shrunk span here would
    // let the body sink a pixel before the floor registers, which makes
    // onGround flicker on alternate frames.
    const prevBottom = this.y + this.h;
    this.y += this.vy * dt;
    this.onGround = false;
    this.platform = null;
    c0 = Math.floor(this.x / TILE); c1 = Math.floor((this.x + this.w - 1) / TILE);
    if (this.vy >= 0) {
      const rb = Math.floor((this.y + this.h) / TILE);
      const top = rb * TILE;
      for (let c = c0; c <= c1; c++) {
        const ch = world.tile(c, rb);
        if (isSolid(ch)) {
          this.y = top - this.h; this.vy = 0; this.onGround = true;
        } else if (isOneWay(ch) && !dropThrough && prevBottom <= top + 2) {
          this.y = top - this.h; this.vy = 0; this.onGround = true;
        }
      }
    } else {
      const rt = Math.floor(this.y / TILE);
      for (let c = c0; c <= c1; c++) {
        if (isSolid(world.tile(c, rt))) { this.y = rt * TILE + TILE; this.vy = 0; }
      }
    }

    // --- moving lifts act as solid tops ---
    for (const lift of world.lifts) {
      if (this.x + this.w <= lift.x + 2 || this.x >= lift.x + lift.w - 2) continue;
      const bottom = this.y + this.h;
      if (this.vy >= 0 && prevBottom <= lift.py + 4 && bottom >= lift.y && bottom <= lift.y + lift.h) {
        this.y = lift.y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.platform = lift;
      }
    }

    if (this.y > ROWS * TILE + 200) this.dead = true;
  }

  // Tile the body is standing on.
  groundTile(world) {
    const r = Math.floor((this.y + this.h + 2) / TILE);
    const c = Math.floor((this.x + this.w / 2) / TILE);
    return world.tile(c, r);
  }
}

// ----------------------------------------------------------------- player ---
export class Player extends Body {
  constructor(x, y, abilities) {
    super(x, y, 30, 30);
    this.abilities = abilities;
    this.jumps = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.squash = 1;
    this.blink = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.dashTime = 0;
    this.dashCd = 0;
    this.dashDir = 1;
    this.invuln = 1.2;   // brief grace so a level never opens with a hit
    this.scared = 0;
    this.morphed = false;
    this.morphKind = 0;
    this.form = null;      // heavy | spring | float | key | null
    this.pounding = false;
    this.glide = false;
    this.morphProp = null;
    this.wallSlide = 0;
    this.shadowY = y + this.h;
    this.spawnX = x;
    this.spawnY = y;
  }

  respawn() {
    this.form = null; this.pounding = false; this.glide = false;
    this.x = this.spawnX; this.y = this.spawnY;
    this.vx = this.vy = 0;
    this.morphed = false; this.morphProp = null;
    this.invuln = 1.6;
    this.dashTime = 0; this.dashCd = 0;
  }

  update(dt, input, world, fx) {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 1; if (this.blinkTimer < -0.11) { this.blink = 0; this.blinkTimer = 2 + Math.random() * 3.5; } }
    this.invuln = Math.max(0, this.invuln - dt);
    this.scared = Math.max(0, this.scared - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    // ---- morphed: frozen in disguise ----
    // The morph/unmorph toggle lives in Game.updatePlay so a single keypress
    // cannot be consumed twice in one frame.
    if (this.morphed) {
      this.vx = 0; this.vy = 0;
      return;
    }

    const ground = this.groundTile(world);
    const sticky = ground === "~";
    const maxSpeed = sticky ? 130 : 272;
    const accel = this.onGround ? (sticky ? 1100 : 2400) : 1500;
    const friction = this.onGround ? (sticky ? 1500 : 2100) : 500;

    // ---- dash ----
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir * 700;
      this.vy *= 0.2;
      if (Math.random() < 0.7) {
        fx.burst(this.cx, this.cy, 1, { color: ["#ffb066", "#ff7a1a"], speed: 40, gravity: 0, size: 4, life: 0.3 });
      }
    } else {
      const dir = (input.down("right") ? 1 : 0) - (input.down("left") ? 1 : 0);
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = clamp(this.vx, -maxSpeed, maxSpeed);
        this.facing = dir;
      } else {
        const s = Math.sign(this.vx);
        this.vx -= s * friction * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }
      if (this.abilities.dash && input.pressed("dash") && this.dashCd <= 0) {
        this.dashTime = 0.17;
        this.dashCd = 0.85;
        this.dashDir = this.facing;
        audio.dash();
        fx.burst(this.cx, this.cy, 14, { color: ["#ffd08a", "#ff7a1a"], speed: 220, gravity: 0, angle: this.facing > 0 ? Math.PI : 0, spread: 1.2, life: 0.35 });
        fx.addShake(4);
      }
    }


    // ---- jump / wall cling ----
    this.coyote = this.onGround ? 0.11 : Math.max(0, this.coyote - dt);
    this.buffer = input.pressed("jump") ? 0.13 : Math.max(0, this.buffer - dt);
    if (this.onGround) this.jumps = 0;

    const clinging = this.abilities.wall && !this.onGround && this.vy > 0 &&
      ((this.hitWall === 1 && input.down("right")) || (this.hitWall === -1 && input.down("left")));
    if (clinging) {
      this.vy = Math.min(this.vy, 140);
      this.wallSlide = this.hitWall;
      if (Math.random() < 0.3) fx.burst(this.cx + this.hitWall * 14, this.cy, 1, { color: "#ffb066", speed: 30, gravity: 200, size: 3, life: 0.3 });
    } else if (this.onGround) this.wallSlide = 0;

    if (this.buffer > 0) {
      if (clinging) {
        this.vy = -660;
        this.vx = -this.hitWall * 320;
        this.facing = -this.hitWall;
        this.jumps = 1;
        this.buffer = 0;
        audio.doubleJump();
        fx.burst(this.cx + this.hitWall * 14, this.cy, 8, { color: "#ffd08a", speed: 150, angle: this.hitWall > 0 ? 0 : Math.PI, spread: 1.4, life: 0.35 });
      } else if (this.coyote > 0 || this.jumps === 0) {
        this.vy = JUMP_V * (this.form === "spring" ? 1.42 : 1);
        this.jumps = 1;
        this.coyote = 0;
        this.buffer = 0;
        this.squash = 0.78;
        audio.jump();
        fx.burst(this.cx, this.y + this.h, 7, { color: "#ffb066", speed: 110, spread: 2.2, life: 0.3, gravity: 500 });
      } else if (this.abilities.double && this.jumps === 1) {
        this.vy = DOUBLE_V * (this.form === "spring" ? 1.34 : 1);
        this.jumps = 2;
        this.buffer = 0;
        this.squash = 0.72;
        audio.doubleJump();
        fx.ring(this.cx, this.cy + 8, { color: "#ffd08a", count: 12, speed: 170, size: 3.5, life: 0.35 });
      }
    }
    // variable jump height
    if (!input.down("jump") && this.vy < -220) this.vy += 2400 * dt;

    // ---- form powers ----
    this.glide = false;
    if (this.form === "heavy") {
      if (!this.onGround && input.down("down")) this.pounding = true;
      if (this.onGround) this.pounding = false;
      this.vy += GRAVITY * (this.pounding ? 2.4 : 1.35) * dt;
      if (this.pounding) this.vy = Math.max(this.vy, 620);
    } else if (this.form === "float" && !this.onGround && this.vy > 0 && input.down("jump")) {
      // BLIMP: hold jump on the way down and you drift
      this.glide = true;
      this.vy += GRAVITY * 0.18 * dt;
      this.vy = Math.min(this.vy, 96);
      if (Math.random() < 0.2) {
        fx.burst(this.cx, this.y + this.h, 1, { color: "#CFEAF8", speed: 30, gravity: -40, size: 3, life: 0.5 });
      }
    } else {
      this.vy += GRAVITY * dt;
    }
    this.vy = Math.min(this.vy, 980);

    const wasAir = !this.onGround;
    // Belts drag whatever stands on them: added for the move, then removed so
    // it never accumulates into the blob's own momentum.
    let belt = ground === "C" ? 125 : ground === "c" ? -125 : 0;
    if (this.form === "heavy") belt = 0;              // too heavy to drag
    else if (this.form === "float") belt *= 1.7;      // barely touching the floor
    this.vx += belt;
    this.move(world, dt, { dropThrough: input.down("down") });
    this.vx -= belt;
    if (this.platform) { this.x += this.platform.dx; this.y += this.platform.dy; }

    if (this.onGround && wasAir) {
      this.squash = 1.32;
      audio.land();
      fx.burst(this.cx, this.y + this.h, 6, { color: "#c9985e", speed: 90, spread: 2.4, life: 0.25, gravity: 700 });
    }
    // squash & stretch easing
    const target = this.onGround ? 1 : clamp(1 - this.vy / 2200, 0.8, 1.25);
    this.squash += (target - this.squash) * Math.min(1, dt * 14);

    // drop shadow position
    let sy = this.y + this.h;
    for (let r = Math.floor((this.y + this.h) / TILE); r < ROWS; r++) {
      const ch = world.tile(Math.floor(this.cx / TILE), r);
      if (isSolid(ch) || isOneWay(ch)) { sy = r * TILE; break; }
      sy = ROWS * TILE;
    }
    this.shadowY = sy;
  }

  canMorph(world) {
    if (!this.abilities.morph || !this.onGround) return null;
    for (const p of world.props) {
      if (Math.abs(p.x - this.cx) < 26 && Math.abs(p.y - (this.y + this.h)) < 30) return p;
    }
    return null;
  }

  morph(prop, fx) {
    this.morphed = true;
    this.morphProp = prop;
    this.morphKind = prop.kind;
    this.x = prop.x - this.w / 2;
    this.y = prop.y - this.h;
    this.vx = this.vy = 0;
    audio.morph();
    fx.ring(prop.x, prop.y - 20, { color: "#ff9a3c", count: 16, speed: 170, life: 0.4 });
    fx.text(prop.x, prop.y - 62, "POOF!", { color: "#ffb066", size: 20 });
  }

  unmorph(fx) {
    this.morphed = false;
    audio.unmorph();
    fx.ring(this.cx, this.cy, { color: "#ffd08a", count: 14, speed: 180, life: 0.35 });
    this.morphProp = null;
    this.squash = 0.8;
  }
}

// ---------------------------------------------------------------- doctors ---
export class Doctor extends Body {
  constructor(x, y, kind, cfg) {
    super(x, y, kind === "fat" ? 34 : 26, kind === "fat" ? 60 : 74);
    this.kind = kind;
    this.y = y + (kind === "fat" ? 14 : 0); // align feet to tile
    this.state = "patrol";
    this.walkPhase = Math.random() * 6;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.alertTimer = 0;
    this.searchTimer = 0;
    this.lastSeen = null;
    this.speed = (kind === "fat" ? 96 : 134) * cfg.docSpeed;
    // Kept under the player's 272px/s top speed: a chase is scary, never unwinnable.
    this.chaseSpeed = Math.min((kind === "fat" ? 150 : 228) * cfg.docSpeed, kind === "fat" ? 196 : 248);
    this.blind = 0;
    this.range = cfg.vision * (kind === "fat" ? 0.82 : 1);
    this.cone = kind === "fat" ? 0.85 : 0.55;
    this.jumpCd = 0;
    this.noticed = 0;
    this.turnCd = 0;
  }

  resetToPost() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = this.vy = 0;
    this.state = "patrol";
    this.lastSeen = null;
    this.alertTimer = 0;
    this.searchTimer = 0;
    this.blind = 1.8; // dazed for a beat so a respawn is never an instant re-catch
  }

  canSee(player, world) {
    if (player.morphed || player.dead || this.blind > 0) return false;
    const dx = player.cx - this.cx;
    const dy = (player.cy) - (this.y + 18);
    const dist = Math.hypot(dx, dy);
    if (dist > this.range) return false;
    // very close = heard/bumped, cone does not matter
    if (dist > 52) {
      if (Math.sign(dx) !== this.facing && Math.abs(dx) > 14) return false;
      const ang = Math.abs(Math.atan2(dy, Math.abs(dx)));
      if (ang > this.cone) return false;
    }
    return world.lineClear(this.cx, this.y + 18, player.cx, player.cy);
  }

  update(dt, world, player, fx) {
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.turnCd = Math.max(0, this.turnCd - dt);
    this.noticed = Math.max(0, this.noticed - dt);
    this.blind = Math.max(0, this.blind - dt);

    const sees = this.canSee(player, world);
    if (sees) {
      if (this.state !== "chase") {
        audio.alert();
        fx.text(this.cx, this.y - 16, "!", { color: "#ff4d6d", size: 30, life: 0.8 });
        this.noticed = 0.8;
      }
      this.state = "chase";
      this.alertTimer = 2.6;
      this.lastSeen = { x: player.cx, y: player.cy };
    } else if (this.state === "chase") {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.state = "search";
        this.searchTimer = 2.4;
        fx.text(this.cx, this.y - 16, "?", { color: "#ffd84d", size: 24, life: 0.9 });
      }
    }

    let dir = 0;
    if (this.state === "chase") {
      const tx = this.lastSeen ? this.lastSeen.x : player.cx;
      dir = Math.abs(tx - this.cx) > 8 ? Math.sign(tx - this.cx) : 0;
      this.vx = dir * this.chaseSpeed;
      if (dir !== 0) this.facing = dir;
      // hop over obstacles / chase upward
      const wantJump = this.hitWall !== 0 || (this.lastSeen && this.lastSeen.y < this.y - 30 && Math.abs(tx - this.cx) < 90);
      if (this.onGround && wantJump && this.jumpCd <= 0) {
        this.vy = this.kind === "fat" ? -540 : -640;
        this.jumpCd = 0.7;
      }
    } else if (this.state === "search") {
      this.searchTimer -= dt;
      const tx = this.lastSeen ? this.lastSeen.x : this.cx;
      if (Math.abs(tx - this.cx) > 12 && this.searchTimer > 1.0) {
        dir = Math.sign(tx - this.cx);
        this.vx = dir * this.speed;
        this.facing = dir;
      } else {
        this.vx *= 0.8;
        if (this.turnCd <= 0) { this.facing *= -1; this.turnCd = 0.55; }
      }
      if (this.searchTimer <= 0) { this.state = "patrol"; this.lastSeen = null; }
    } else {
      // patrol: walk, turn at walls and ledges
      this.vx = this.facing * this.speed;
      const aheadX = this.cx + this.facing * (this.w / 2 + 6);
      const footY = this.y + this.h + 6;
      const ahead = world.solidAtPx(aheadX, this.y + this.h - 10);
      const floorAhead = world.supportAtPx(aheadX, footY);
      if ((ahead || !floorAhead) && this.turnCd <= 0 && this.onGround) {
        this.facing *= -1;
        this.turnCd = 0.3;
      }
    }

    // belts and sludge push the docs around too
    const g = this.groundTile(world);
    if (g === "~") this.vx *= 0.55;
    const belt = g === "C" ? 105 : g === "c" ? -105 : 0;

    this.vy += GRAVITY * dt;
    this.vy = Math.min(this.vy, 980);
    this.vx += belt;
    this.move(world, dt);
    this.vx -= belt;
    if (this.platform) { this.x += this.platform.dx; this.y += this.platform.dy; }
    if (this.dead) { // fell out of the world — put them back
      this.dead = false;
      this.x = this.spawnX ?? this.x;
      this.y = 40;
      this.vy = 0;
    }
    this.walkPhase += dt * (this.state === "chase" ? 15 : 8) * (Math.abs(this.vx) > 8 ? 1 : 0.15);
  }
}

// ------------------------------------------------------------------ lifts ---
export class Lift {
  constructor(x, y, axis) {
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.w = TILE * 2; this.h = 14;
    this.axis = axis;
    this.t = Math.random() * 6;
    this.range = axis === "x" ? TILE * 3.2 : TILE * 2.6;
    this.ox = x; this.oy = y;
    this.dx = 0; this.dy = 0;
  }
  update(dt) {
    this.px = this.x; this.py = this.y;
    this.t += dt * 0.8;
    if (this.axis === "x") this.x = this.ox + Math.sin(this.t) * this.range;
    else this.y = this.oy + Math.sin(this.t) * this.range;
    this.dx = this.x - this.px;
    this.dy = this.y - this.py;
  }
}

// ------------------------------------------------------------------- boss ---
// The Goo-Vac 5000: the docs finally stopped chasing on foot and built a
// machine. It cannot be hurt directly — you make it overheat by surviving its
// suction, then hit the exposed core while it cools.
const ARENA_W = COLS * TILE;

const PHASES = [
  null,
  { speed: 74,  tele: 0.95, suck: 2.0, cool: 2.9, bombCd: 999, bombs: 0 },
  { speed: 116, tele: 0.72, suck: 2.2, cool: 2.3, bombCd: 1.9, bombs: 1 },
  { speed: 158, tele: 0.55, suck: 2.4, cool: 1.9, bombCd: 1.1, bombs: 2 },
];

export class Boss {
  constructor() {
    this.w = 150;
    this.h = 86;
    this.homeY = 96;
    this.x = ARENA_W / 2 - this.w / 2;
    this.y = this.homeY;
    this.maxHp = 3;
    this.hp = this.maxHp;
    this.phase = 1;
    this.state = "intro";
    this.timer = 2.2;
    this.dir = 1;
    this.t = 0;
    this.flash = 0;
    this.charge = 0;
    this.bombs = [];
    this.zaps = [];
    this.bombCd = 2.4;
    this.dismounted = false;
    this.deathT = 0;
  }

  get cfg() { return PHASES[this.phase]; }
  get cx() { return this.x + this.w / 2; }
  get nozzleX() { return this.cx; }
  get nozzleY() { return this.y + this.h + 18; }
  get vulnerable() { return this.state === "overheat"; }
  get harmless() { return this.state === "overheat" || this.state === "hurt" || this.state === "intro" || this.dead; }
  get dead() { return this.state === "dead"; }

  coreBox() { return { x: this.cx - 29, y: this.y - 38, w: 58, h: 42 }; }

  // ---- damage ----
  takeHit(fx) {
    if (!this.vulnerable) return false;
    this.hp--;
    this.flash = 1;
    this.state = "hurt";
    this.timer = 1.1;
    audio.bossHurt();
    const core = this.coreBox();
    fx.burst(core.x + core.w / 2, core.y + core.h / 2, 30, {
      color: ["#4ee6b8", "#ffd84d", "#fff"], speed: 320, spread: Math.PI * 2, life: 0.9, size: 6,
    });
    fx.ring(core.x + core.w / 2, core.y + core.h / 2, { color: "#fff", count: 20, speed: 300, life: 0.5 });
    fx.addShake(16);
    return true;
  }

  // ---- suction: returns true when Lamput is pulled all the way in ----
  applySuction(player, dt, fx) {
    if (this.state !== "suck" || player.morphed || player.dead) return false;
    const nx = this.nozzleX, ny = this.nozzleY;
    const dx = player.cx - nx, dy = player.cy - ny;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist > 360 || dy < -10) return false;
    // cone opens straight downward
    if (Math.abs(Math.atan2(dx, Math.max(1, dy))) > 0.62) return false;
    const pull = 380 + 3400 * (1 - dist / 360);   // must clear GRAVITY to lift you
    player.vx -= (dx / dist) * pull * dt;
    player.vy -= (dy / dist) * pull * dt;
    player.scared = 0.4;
    if (Math.random() < 0.5) {
      fx.burst(player.cx, player.cy, 1, { color: "#ffd08a", speed: 20, gravity: 0, size: 3, life: 0.35 });
    }
    return dist < 44;
  }

  update(dt, world, player, fx, onPhase) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const c = this.cfg;

    // falling bolts and the puddles they leave behind
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy = Math.min(b.vy + GRAVITY * 0.55 * dt, 700);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += dt * 9;
      const landed = world.solidAtPx(b.x, b.y + 9) || b.y > ROWS * TILE;
      if (landed) {
        this.bombs.splice(i, 1);
        this.zaps.push({ x: b.x, y: Math.floor((b.y + 9) / TILE) * TILE, life: 1.5, max: 1.5 });
        audio.bossBolt();
        fx.burst(b.x, b.y, 14, { color: ["#ff4d6d", "#ffd84d"], speed: 190, spread: Math.PI, angle: -Math.PI / 2, life: 0.5 });
        fx.addShake(3);
      }
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      this.zaps[i].life -= dt;
      if (this.zaps[i].life <= 0) this.zaps.splice(i, 1);
    }

    const dropBolts = () => {
      if (!c || c.bombs === 0) return;
      this.bombCd -= dt;
      if (this.bombCd <= 0) {
        this.bombCd = c.bombCd;
        for (let i = 0; i < c.bombs; i++) {
          this.bombs.push({
            x: this.cx + (i - (c.bombs - 1) / 2) * 34,
            y: this.y + this.h,
            vx: (Math.random() - 0.5) * 70, vy: 40, spin: 0,
          });
        }
        audio.bossDrop();
      }
    };

    switch (this.state) {
      case "intro":
        this.y = this.homeY + Math.sin(this.t * 1.6) * 8;
        this.timer -= dt;
        if (this.timer <= 0) { this.state = "drift"; this.timer = 1.5; }
        break;

      case "drift": {
        this.x += this.dir * c.speed * dt;
        if (this.x < 36) { this.x = 36; this.dir = 1; }
        if (this.x + this.w > ARENA_W - 36) { this.x = ARENA_W - 36 - this.w; this.dir = -1; }
        this.y += (this.homeY + Math.sin(this.t * 1.6) * 10 - this.y) * Math.min(1, dt * 5);
        dropBolts();
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = "telegraph";
          this.timer = c.tele;
          this.charge = 0;
          audio.bossCharge();
        }
        break;
      }

      case "telegraph": {
        // line up over Lamput, then wind up with a visible charge
        const want = Math.max(36, Math.min(ARENA_W - 36 - this.w, player.cx - this.w / 2));
        this.x += (want - this.x) * Math.min(1, dt * 2.4);
        this.charge = 1 - this.timer / c.tele;
        dropBolts();
        this.timer -= dt;
        if (this.timer <= 0) { this.state = "suck"; this.timer = c.suck; audio.bossSuck(); }
        break;
      }

      case "suck": {
        // creeps toward you while sucking, slowly enough that running works
        const want = Math.max(36, Math.min(ARENA_W - 36 - this.w, player.cx - this.w / 2));
        this.x += (want - this.x) * Math.min(1, dt * 0.55);
        this.y += (250 - this.y) * Math.min(1, dt * 1.6);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = "overheat";
          this.timer = c.cool;
          audio.bossOverheat();
        }
        break;
      }

      case "overheat": {
        // sinks low with its core exposed — the only window to hit it
        this.y += (330 - this.y) * Math.min(1, dt * 3.2);
        if (Math.random() < 0.55) {
          fx.burst(this.cx + (Math.random() - 0.5) * this.w, this.y + 10, 1, {
            color: ["#ffffff", "#cfd8ff"], speed: 40, gravity: -120, size: 5, life: 0.7, drag: 0.94,
          });
        }
        this.timer -= dt;
        if (this.timer <= 0) { this.state = "drift"; this.timer = 1.3; }
        break;
      }

      case "hurt": {
        this.y += (this.homeY - this.y) * Math.min(1, dt * 2.4);
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.hp <= 0) {
            this.state = "dying";
            this.timer = 2.8;
            this.deathT = 0;
            audio.bossDie();
          } else {
            this.phase = Math.min(3, this.phase + 1);
            this.state = "drift";
            this.timer = 1.4;
            this.bombCd = this.cfg.bombCd;
            if (onPhase) onPhase(this.phase);
          }
        }
        break;
      }

      case "dying": {
        this.deathT += dt;
        this.x += Math.sin(this.deathT * 22) * 2;
        this.y += 46 * dt;
        this.timer -= dt;
        if (Math.random() < 0.55) {
          fx.burst(this.cx + (Math.random() - 0.5) * this.w, this.y + Math.random() * this.h, 5, {
            color: ["#ff7a1a", "#ffd84d", "#ff4d6d", "#fff"], speed: 260, spread: Math.PI * 2, life: 0.8, size: 6,
          });
          fx.addShake(5);
        }
        if (this.timer <= 0) {
          this.state = "dead";
          fx.burst(this.cx, this.y + this.h / 2, 60, {
            color: ["#ff7a1a", "#ffd84d", "#4ee6b8", "#fff"], speed: 460, spread: Math.PI * 2, life: 1.4, size: 8, shape: "square",
          });
          fx.addShake(24);
        }
        break;
      }
    }
  }
}
