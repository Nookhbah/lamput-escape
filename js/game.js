import { LEVELS, TILE, COLS, ROWS, isSolid, isOneWay, FORMS, PAD_FORM } from "./levels.js";
import { Player, Doctor, Lift, Boss } from "./entities.js";
import { Fx } from "./fx.js";
import { audio } from "./audio.js";
import * as art from "./art.js";

const W = COLS * TILE;
const H = ROWS * TILE;
const TAU = Math.PI * 2;
const STORE_KEY = "lamput.save.v1";
const SPAWN_GRACE = 1.8;   // seconds the docs stay oblivious after a (re)spawn

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function roundRect2(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Rendered on the title screen and the pause panel, so the controls are always
// one keypress away instead of living only in the page footer.
const CONTROLS = [
  [["\u25c0", "\u25b6"], "Move"],
  [["SPACE"], "Jump \u00b7 twice to blob-bounce"],
  [["SHIFT"], "Morph into a prop"],
  [["X"], "Goo dash"],
  [["\u25bc"], "Drop through a platform"],
  [["P"], "Pause"],
  [["M"], "Sound on / off"],
  [["R"], "Restart ward"],
];

function keyCap(ctx, x, y, label) {
  ctx.font = '800 12px "Baloo 2", sans-serif';
  const w = Math.max(25, ctx.measureText(label).width + 14);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect2(ctx, x, y - 15, w, 21, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ffd84d";
  ctx.textAlign = "center";
  ctx.fillText(label, x + w / 2, y);
  ctx.textAlign = "left";
  return w;
}

function drawControls(ctx, left, right, top, rowGap = 27) {
  const half = Math.ceil(CONTROLS.length / 2);
  CONTROLS.forEach(([keys, desc], i) => {
    const col = i < half ? left : right;
    const y = top + (i % half) * rowGap;
    let x = col;
    for (const k of keys) {
      x += keyCap(ctx, x, y, k) + 5;
    }
    ctx.font = '700 13px Nunito, sans-serif';
    ctx.fillStyle = "#d7cbf0";
    ctx.fillText(desc, x + 4, y);
  });
}

function abilitiesFor(levelIndex) {
  return {
    double: true,
    morph: levelIndex >= 1,
    dash: levelIndex >= 3,
    wall: levelIndex >= 5,
  };
}

// ------------------------------------------------------------------ world ---
class World {
  constructor(def) {
    this.def = def;
    this.rows = def.grid.map((r) => r.split(""));
    this.props = [];
    this.goos = [];
    this.lifts = [];
    this.lasers = [];
    this.traps = [];
    this.pads = [];
    this.updrafts = [];
    this.docSpawns = [];
    this.spawn = { x: TILE, y: TILE };
    this.exit = { x: W - TILE, y: H - TILE };

    let propKind = 0;
    let gooId = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = this.rows[r][c];
        const px = c * TILE, py = r * TILE;
        switch (ch) {
          case "P":
            this.spawn = { x: px + 5, y: py + TILE - 30 };
            this.rows[r][c] = ".";
            break;
          case "E":
            this.exit = { x: px + TILE / 2, y: py + TILE };
            this.rows[r][c] = ".";
            break;
          case "o":
            this.goos.push({ id: gooId++, x: px + TILE / 2, y: py + TILE / 2, phase: Math.random() * 6, taken: false });
            this.rows[r][c] = ".";
            break;
          case "H":
            this.props.push({ x: px + TILE / 2, y: py + TILE, kind: propKind++ });
            this.rows[r][c] = ".";
            break;
          case "1":
          case "2":
            this.docSpawns.push({ x: px + 4, y: py + TILE - (ch === "1" ? 74 : 74), kind: ch === "1" ? "skinny" : "fat" });
            this.rows[r][c] = ".";
            break;
          case "-":
            this.lifts.push(new Lift(px - TILE / 2, py + 20, "x"));
            this.rows[r][c] = ".";
            break;
          case "|":
            this.lifts.push(new Lift(px - TILE / 2, py + 20, "y"));
            this.rows[r][c] = ".";
            break;
          case "L":
            this.lasers.push({ x: px + TILE / 2, y: py, phase: (px / TILE) * 0.37 });
            this.rows[r][c] = ".";
            break;
          case "^":
            this.traps.push({ x: px, y: py });
            break;
          case "A": case "S": case "B": case "K":
            this.pads.push({ x: px + TILE / 2, y: py + TILE, form: PAD_FORM[ch], taken: false });
            this.rows[r][c] = ".";
            break;
          case "U":
            this.updrafts.push({ x: px, y: py });
            this.rows[r][c] = ".";
            break;
        }
      }
    }
    this.totalGoo = this.goos.length;
  }

  tile(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return "#";
    const ch = this.rows[r][c];
    return ch === "^" ? "." : ch;
  }

  solidAtPx(x, y) { return isSolid(this.tile(Math.floor(x / TILE), Math.floor(y / TILE))); }

  supportAtPx(x, y) {
    const ch = this.tile(Math.floor(x / TILE), Math.floor(y / TILE));
    return isSolid(ch) || isOneWay(ch);
  }

  lineClear(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(dist / 10);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAtPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  laserBeam(l, time) {
    const on = ((time + l.phase) % 2.5) < 1.35;
    let end = H;
    for (let r = Math.floor(l.y / TILE) + 1; r < ROWS; r++) {
      if (isSolid(this.tile(Math.floor(l.x / TILE), r))) { end = r * TILE; break; }
    }
    return { on, top: l.y + 18, bottom: end };
  }
}

// ------------------------------------------------------------------- game ---
export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.fx = new Fx();
    this.time = 0;
    this.state = "title";
    this.levelIndex = 0;
    this.menuIndex = 0;   // set from the save below
    this.score = 0;
    this.runScore = 0;
    this.lives = 3;
    this.stateTimer = 0;
    this.save = this.load();
    this.menuIndex = Math.min(this.save.ward, LEVELS.length - 1);
    this.dark = document.createElement("canvas");
    this.dark.width = W; this.dark.height = H;
    this.dctx = this.dark.getContext("2d");
    this.caughtReason = "";
    this.stars = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.8 + 0.4, s: Math.random() * 0.6 + 0.2,
    }));
  }

  load() {
    const blank = { best: 0, unlocked: 0, ward: 0, score: 0, lives: 3 };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return { ...blank, ...JSON.parse(raw) };
    } catch { /* storage may be unavailable */ }
    return blank;
  }

  // True when the selected ward is exactly where the saved run left off.
  canResume() {
    return this.save.ward > 0 && this.menuIndex === this.save.ward;
  }

  persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------- level setup ---
  startLevel(i, freshRun = false) {
    this.levelIndex = i;
    const def = LEVELS[i];
    this.world = new World(def);
    this.abilities = abilitiesFor(i);
    this.player = new Player(this.world.spawn.x, this.world.spawn.y, this.abilities);
    this.docs = this.world.docSpawns.map((s) => {
      const d = new Doctor(s.x, s.y, s.kind, { docSpeed: def.docSpeed ?? 1, vision: def.vision ?? 240 });
      d.spawnX = d.x;
      d.spawnY = d.y;
      // Start every doc looking away from Lamput and briefly oblivious, so a
      // ward can never open with a doc already staring at the spawn.
      d.facing = d.cx < this.player.cx ? -1 : 1;
      d.blind = SPAWN_GRACE;
      return d;
    });
    this.boss = def.boss ? new Boss() : null;
    this.levelTime = 0;
    this.caughtThisLevel = false;
    this.levelScoreStart = this.runScore;
    if (freshRun) { this.runScore = 0; this.levelScoreStart = 0; this.lives = 3; }
    this.fx.reset();
    this.state = "intro";
    this.stateTimer = 2.6;
    audio.tense = false;
  }

  // The hatch waits on every orb, and on the boss when there is one.
  exitOpen() {
    if (this.boss && !this.boss.dead) return false;
    return this.world.goos.every((g) => g.taken);
  }

  retryLevel() {
    this.runScore = this.levelScoreStart;
    this.startLevel(this.levelIndex);
  }

  // --------------------------------------------------------------- update ---
  update(dt) {
    this.time += dt;
    this.fx.update(dt);
    const inp = this.input;

    if (inp.pressed("mute")) {
      const m = audio.toggleMute();
      this.fx.text(W / 2, 60, m ? "SOUND OFF" : "SOUND ON", { color: "#9d7fdc", size: 18 });
    }

    switch (this.state) {
      case "title": this.updateTitle(dt); break;
      case "intro":
        this.stateTimer -= dt;
        if (this.stateTimer <= 0 || inp.pressed("start") || inp.pressed("jump")) {
          this.state = "play";
          audio.startMusic();
        }
        break;
      case "play": this.updatePlay(dt); break;
      case "pause":
        if (inp.pressed("pause") || inp.pressed("start")) { this.state = "play"; audio.ui(); }
        if (inp.pressed("retry")) { audio.ui(); this.retryLevel(); }
        break;
      case "caught":
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.lives > 0) {
            this.player.respawn();
            this.docs.forEach((d) => d.resetToPost());
            if (this.boss && !this.boss.dead) {
              this.boss.state = "drift";
              this.boss.timer = 1.8;
              this.boss.bombs.length = 0;
              this.boss.zaps.length = 0;
            }
            this.state = "play";
          } else {
            this.state = "gameover";
            this.stateTimer = 0;
            audio.stopMusic();
          }
        }
        break;
      case "clear":
        this.stateTimer -= dt;
        if (this.stateTimer <= 0 && (inp.pressed("start") || inp.pressed("jump"))) {
          if (this.levelIndex + 1 < LEVELS.length) this.startLevel(this.levelIndex + 1);
          else {
            this.state = "victory";
            this.save.best = Math.max(this.save.best, this.runScore);
            this.persist();
            audio.stopMusic();
            audio.win();
          }
        }
        break;
      case "gameover":
        if (inp.pressed("start") || inp.pressed("jump")) { audio.ui(); this.retryLevel(); }
        if (inp.pressed("retry")) { audio.ui(); this.state = "title"; this.menuIndex = Math.min(this.save.unlocked, LEVELS.length - 1); }
        break;
      case "victory":
        if (inp.pressed("start") || inp.pressed("jump")) { this.state = "title"; this.menuIndex = 0; }
        break;
    }
    this.input.endFrame();
  }

  updateTitle(dt) {
    const inp = this.input;
    const maxPick = Math.min(this.save.unlocked, LEVELS.length - 1);
    if (inp.pressed("left") && this.menuIndex > 0) { this.menuIndex--; audio.ui(); }
    if (inp.pressed("right") && this.menuIndex < maxPick) { this.menuIndex++; audio.ui(); }
    if (inp.pressed("start") || inp.pressed("jump")) {
      audio.init(); audio.resume(); audio.ui();
      const resume = this.canResume();
      this.startLevel(this.menuIndex, true);
      if (resume) {
        // carry the saved run forward instead of restarting the score
        this.runScore = this.save.score;
        this.levelScoreStart = this.save.score;
        this.lives = this.save.lives;
      }
    }
  }

  updatePlay(dt) {
    const inp = this.input;
    const p = this.player;
    const world = this.world;
    this.levelTime += dt;

    if (inp.pressed("pause")) { this.state = "pause"; audio.ui(); return; }
    if (inp.pressed("retry")) { this.retryLevel(); return; }

    // morph toggle
    if (inp.pressed("morph")) {
      if (p.morphed) {
        p.unmorph(this.fx);
      } else {
        const prop = p.canMorph(world);
        if (prop) this.fx.addShake(2), p.morph(prop, this.fx);
        else if (this.abilities.morph) {
          this.fx.text(p.cx, p.y - 14, "no prop!", { color: "#9d7fdc", size: 15, life: 0.7 });
        }
      }
    }

    world.lifts.forEach((l) => l.update(dt));
    p.update(dt, inp, world, this.fx);

    // A boss catch ends the frame: letting the rest of updatePlay run could
    // trigger a second onCaught and cost two lives at once.
    if (this.boss && this.updateBoss(dt, p)) return;

    this.docs.forEach((d) => d.update(dt, world, p, this.fx));

    // keep them out of each other — two docs merged into one blob looks broken
    for (let i = 0; i < this.docs.length; i++) {
      for (let k = i + 1; k < this.docs.length; k++) {
        const a = this.docs[i], b = this.docs[k];
        if (Math.abs(a.y - b.y) > 40) continue;
        const gap = Math.abs(a.cx - b.cx), want = (a.w + b.w) / 2 + 6;
        if (gap >= want) continue;
        const push = (want - gap) / 2;
        const dir = Math.sign(a.cx - b.cx) || 1;
        a.x += dir * push;
        b.x -= dir * push;
      }
    }

    const chasing = this.docs.some((d) => d.state === "chase");
    audio.tense = chasing;
    p.scared = chasing && !p.morphed ? 0.3 : p.scared;

    // goo pickup
    for (const g of world.goos) {
      if (g.taken) continue;
      if (Math.hypot(g.x - p.cx, g.y - p.cy) < 26 && !p.morphed) {
        g.taken = true;
        const collected = world.goos.filter((x) => x.taken).length;
        this.runScore += 150;
        audio.collect(collected - 1);
        this.fx.ring(g.x, g.y, { color: "#4ee6b8", count: 14, speed: 180, life: 0.4 });
        this.fx.burst(g.x, g.y, 10, { color: ["#4ee6b8", "#d6fff3"], speed: 160, gravity: 240, life: 0.5 });
        this.fx.text(g.x, g.y - 12, "+150", { color: "#4ee6b8", size: 18 });
        if (collected === world.totalGoo) {
          audio.door();
          this.fx.text(world.exit.x, world.exit.y - 90, "HATCH OPEN!", { color: "#4ee6b8", size: 22, life: 1.6 });
          this.fx.screenFlash("#4ee6b8", 0.3);
        }
      }
    }

    // ---- morph pads: you carry exactly one form, so the route is the puzzle ----
    for (const pad of world.pads) {
      if (p.morphed || pad.taken || p.form === pad.form) continue;
      if (Math.abs(pad.x - p.cx) < 26 && Math.abs(pad.y - (p.y + p.h)) < 34) {
        const old = p.form;
        if (p.formPad) p.formPad.taken = false;   // what you were holding goes back
        pad.taken = true;
        p.formPad = pad;
        p.form = pad.form;
        audio.morph();
        this.fx.ring(pad.x, pad.y - 22, { color: FORMS[pad.form].tint, count: 8, speed: 110, size: 3, life: 0.3 });
        this.fx.text(pad.x, pad.y - 108, FORMS[pad.form].label, { color: FORMS[pad.form].tint, size: 20, life: 1.4 });
        if (old) this.fx.text(pad.x, pad.y - 134, "dropped " + FORMS[old].label, { color: "#9d7fdc", size: 14, life: 1.2 });
      }
    }

    // ---- updraft vents: only the blimp rides them ----
    for (const u of world.updrafts) {
      if (p.cx > u.x - 4 && p.cx < u.x + TILE + 4 && p.y + p.h > u.y && p.y < u.y + TILE) {
        // a steady lift, not an acceleration — 1500 was weaker than gravity so
        // the blimp still sank inside the vent
        if (p.form === "float") p.vy = -235;
        if (Math.random() < 0.25) {
          this.fx.burst(u.x + TILE / 2 + (Math.random() - 0.5) * 20, u.y + TILE, 1,
            { color: "#CFEAF8", speed: 40, gravity: -260, size: 3, life: 0.6 });
        }
      }
    }

    // ---- anvil pound smashes cracked floor ----
    if (p.form === "heavy" && p.pounding) {
      const r0 = Math.floor((p.y + p.h + 2) / TILE);
      for (let c = Math.floor(p.x / TILE); c <= Math.floor((p.x + p.w - 1) / TILE); c++) {
        if (world.tile(c, r0) === "X") {
          world.rows[r0][c] = ".";
          audio.caught();
          this.fx.addShake(12);
          this.fx.burst(c * TILE + TILE / 2, r0 * TILE, 18,
            { color: ["#8A8FA8", "#C9C4D6", "#6b5a92"], speed: 240, spread: TAU, life: 0.7, size: 5, shape: "square" });
        }
      }
    }

    // ---- key opens one gate, then it is spent ----
    if (p.form === "key") {
      const c = Math.floor((p.cx + p.facing * 20) / TILE);
      const r0 = Math.floor(p.cy / TILE);
      if (world.tile(c, r0) === "G") {
        for (let rr = 0; rr < ROWS; rr++) if (world.rows[rr][c] === "G") {
          world.rows[rr][c] = ".";
          this.fx.burst(c * TILE + TILE / 2, rr * TILE + TILE / 2, 6,
            { color: "#E0C04C", speed: 160, spread: TAU, life: 0.6, size: 4 });
        }
        p.form = null;
        p.formPad = null;                        // spent — the pedestal stays empty
        audio.door();
        this.fx.addShake(8);
        this.fx.text(c * TILE, p.cy - 40, "UNLOCKED", { color: "#E0C04C", size: 22, life: 1.4 });
      }
    }

    const allGoo = this.exitOpen();

    // hazards
    if (!p.morphed && p.invuln <= 0) {
      for (const tr of world.traps) {
        if (p.x + p.w > tr.x + 4 && p.x < tr.x + TILE - 4 &&
            p.y + p.h > tr.y + TILE - 26 && p.y < tr.y + TILE) {
          this.onCaught("ZAPPED BY A NET!");
          return;
        }
      }
      for (const l of world.lasers) {
        const b = world.laserBeam(l, this.time);
        if (!b.on) continue;
        if (p.x + p.w > l.x - 7 && p.x < l.x + 7 && p.y + p.h > b.top && p.y < b.bottom) {
          this.onCaught("SLICED BY A BEAM!");
          return;
        }
      }
      for (const d of this.docs) {
        if (p.overlaps(d)) {
          this.onCaught(d.kind === "fat" ? "FAT DOC GOT YOU!" : "SKINNY DOC GOT YOU!");
          return;
        }
      }
      if (this.boss) {
        for (const b of this.boss.bombs) {
          if (Math.hypot(b.x - p.cx, b.y - p.cy) < 22) { this.onCaught("ZAPPED BY A BOLT!"); return; }
        }
        for (const z of this.boss.zaps) {
          if (Math.abs(z.x - p.cx) < 26 && p.y + p.h > z.y + TILE - 24 && p.y < z.y + TILE) {
            this.onCaught("ZAPPED BY A BOLT!"); return;
          }
        }
        if (!this.boss.harmless && p.overlaps(this.boss)) { this.onCaught("THE GOO-VAC RAMMED YOU!"); return; }
      }
    }

    if (p.dead) { this.onCaught("LOST IN THE VOID!"); return; }

    // exit
    const ex = world.exit;
    if (allGoo && !p.morphed && Math.abs(p.cx - ex.x) < 26 && Math.abs(p.y + p.h - ex.y) < 44) {
      this.onLevelClear();
    }
  }

  updateBoss(dt, p) {
    const b = this.boss;
    const wasDead = b.dead;

    b.update(dt, this.world, p, this.fx, (phase) => this.onBossPhase(phase));

    // suction drags you toward the nozzle unless you are morphed (too heavy)
    if (b.applySuction(p, dt, this.fx) && p.invuln <= 0) {
      this.onCaught("SUCKED INTO THE JAR!");
      return true;
    }

    // land on the exposed core to damage it
    if (b.vulnerable && !p.morphed) {
      const core = b.coreBox();
      if (p.x + p.w > core.x && p.x < core.x + core.w &&
          p.y + p.h > core.y && p.y < core.y + core.h) {
        if (b.takeHit(this.fx)) {
          this.runScore += 750;
          this.fx.text(core.x + core.w / 2, core.y - 20, "+750", { color: "#ffd84d", size: 24, life: 1.2 });
          this.fx.screenFlash("#ffd84d", 0.3);
          p.vy = -560;            // bounce off the hit
          p.jumps = 1;
          p.squash = 0.7;
        }
      }
    }

    if (b.dead && !wasDead) this.onBossDefeated();
    return false;
  }

  onBossPhase(phase) {
    this.fx.screenFlash("#ff4d6d", 0.35);
    this.fx.addShake(12);
    audio.alert();
    if (phase === 2) {
      this.fx.text(W / 2, 150, "PHASE 2 — BOLTS!", { color: "#ff4d6d", size: 30, life: 1.8 });
    } else if (phase === 3 && !this.boss.dismounted) {
      // final phase: the docs bail out and chase on foot again
      this.boss.dismounted = true;
      this.fx.text(W / 2, 150, "PHASE 3 — THEY'RE OUT!", { color: "#ff4d6d", size: 30, life: 1.8 });
      const def = LEVELS[this.levelIndex];
      for (const [i, kind] of ["skinny", "fat"].entries()) {
        const d = new Doctor(this.boss.x + 20 + i * 90, this.boss.y + 40, kind,
          { docSpeed: def.docSpeed ?? 1, vision: def.vision ?? 240 });
        d.spawnX = d.x;
        d.spawnY = H - TILE - d.h;
        d.blind = 1.4;
        this.docs.push(d);
        this.fx.burst(d.cx, d.cy, 12, { color: "#f2f4ff", speed: 180, spread: TAU, life: 0.6 });
      }
    }
  }

  onBossDefeated() {
    audio.win();
    this.runScore += 1500;
    this.fx.text(W / 2, H / 2 - 40, "GOO-VAC DESTROYED!", { color: "#4ee6b8", size: 38, life: 2.4 });
    this.fx.text(W / 2, H / 2 + 4, "+1500", { color: "#ffd84d", size: 26, life: 2.4 });
    this.fx.screenFlash("#fff", 0.5);
    this.fx.addShake(22);
    // the docs give up and wander off
    this.docs.forEach((d) => { d.blind = 9999; d.state = "patrol"; d.lastSeen = null; });
  }

  onCaught(reason) {
    this.lives--;
    if (this.save.ward === this.levelIndex) {
      this.save.lives = Math.max(1, this.lives);
      this.persist();
    }
    this.caughtThisLevel = true;
    this.caughtReason = reason;
    this.runScore = Math.max(0, this.runScore - 100);
    this.state = "caught";
    this.stateTimer = 1.5;
    audio.caught();
    this.fx.addShake(18);
    this.fx.screenFlash("#ff4d6d", 0.35);
    this.fx.burst(this.player.cx, this.player.cy, 26, {
      color: ["#ff7a1a", "#ffb066", "#e2560b"], speed: 260, spread: TAU, life: 0.8, size: 6,
    });
    this.player.scared = 1;
  }

  onLevelClear() {
    const def = LEVELS[this.levelIndex];
    const par = def.par ?? 60;
    this.timeBonus = Math.max(0, Math.round((par - this.levelTime) * 10));
    this.cleanBonus = this.caughtThisLevel ? 0 : 400;
    this.clearBonus = 500 + this.timeBonus + this.cleanBonus;
    this.runScore += this.clearBonus;
    this.state = "clear";
    this.stateTimer = 0.7;
    audio.stopMusic();
    audio.win();
    this.fx.screenFlash("#4ee6b8", 0.4);
    this.fx.burst(this.world.exit.x, this.world.exit.y - 28, 40, {
      color: ["#4ee6b8", "#ffd84d", "#ff7a1a", "#fff"], speed: 320, spread: TAU, life: 1.1, size: 6, shape: "square",
    });
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(this.levelIndex + 1, LEVELS.length - 1));
    this.save.best = Math.max(this.save.best, this.runScore);
    // Checkpoint the run so closing the tab mid-game costs nothing.
    if (this.levelIndex + 1 < LEVELS.length) {
      this.save.ward = this.levelIndex + 1;
      this.save.score = this.runScore;
      this.save.lives = this.lives;
    } else {
      this.save.ward = 0; this.save.score = 0; this.save.lives = 3;
    }
    this.persist();
  }

  // ----------------------------------------------------------------- draw ---
  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(this.fx.shakeX, this.fx.shakeY);

    if (this.state === "title") { this.drawTitle(ctx); ctx.restore(); return; }

    this.drawBackground(ctx);
    this.drawTiles(ctx);

    for (const l of this.world.lasers) {
      const b = this.world.laserBeam(l, this.time);
      art.drawLaserNode(ctx, l.x - TILE / 2, l.y, b.on);
      if (b.on) art.drawLaserBeam(ctx, l.x, b.top, b.bottom, this.time);
    }
    for (const u of this.world.updrafts) art.drawUpdraft(ctx, u.x, u.y, this.time);
    for (const pad of this.world.pads) art.drawPad(ctx, pad, this.time, FORMS[pad.form].tint);
    for (const lift of this.world.lifts) art.drawLift(ctx, lift);
    for (const pr of this.world.props) {
      if (this.player.morphed && this.player.morphProp === pr) continue;
      art.drawProp(ctx, pr.x, pr.y, pr.kind, this.time);
    }

    if (this.boss) {
      art.drawBoss(ctx, this.boss, this.time);
      for (const z of this.boss.zaps) art.drawZap(ctx, z, this.time);
      for (const bo of this.boss.bombs) art.drawBolt(ctx, bo, this.time);
    }

    const allGoo = this.exitOpen();
    art.drawExit(ctx, this.world.exit, this.time, allGoo);
    for (const g of this.world.goos) if (!g.taken) art.drawGoo(ctx, g, this.time);

    this.drawVisionCones(ctx);
    for (const d of this.docs) (d.kind === "fat" ? art.drawFat : art.drawSkinny)(ctx, d, this.time);

    art.drawLamput(ctx, this.player, this.time);

    this.fx.drawParticles(ctx);

    if (LEVELS[this.levelIndex].dark) this.drawDarkness(ctx);

    this.drawMorphPrompt(ctx);
    this.fx.drawTexts(ctx);
    this.fx.drawFlash(ctx, W, H);
    ctx.restore();

    this.drawHud(ctx);
    if (this.state === "intro") this.drawIntro(ctx);
    if (this.state === "pause") this.drawPause(ctx);
    if (this.state === "caught") this.drawCaught(ctx);
    if (this.state === "clear") this.drawClear(ctx);
    if (this.state === "gameover") this.drawGameOver(ctx);
    if (this.state === "victory") this.drawVictory(ctx);
  }

  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#241640");
    g.addColorStop(0.6, "#1b0f30");
    g.addColorStop(1, "#140a24");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // ward tiling
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += TILE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += TILE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // floating dust
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (const s of this.stars) {
      const y = (s.y + this.time * 14 * s.s) % H;
      ctx.globalAlpha = 0.1 + s.s * 0.2;
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // pipes along the back wall
    ctx.strokeStyle = "rgba(120,90,190,0.18)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 70); ctx.lineTo(W * 0.32, 70);
    ctx.quadraticCurveTo(W * 0.4, 70, W * 0.4, 130);
    ctx.lineTo(W * 0.4, 210);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W, 150); ctx.lineTo(W * 0.72, 150);
    ctx.quadraticCurveTo(W * 0.66, 150, W * 0.66, 96);
    ctx.stroke();
  }

  drawTiles(ctx) {
    const w = this.world;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = w.rows[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === "#") {
          ctx.fillStyle = "#3a2a5e";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#4a3775";
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 6);
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(x + 2, y + 2, TILE - 4, 3);
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(x + 2, y + TILE - 8, TILE - 4, 4);
        } else if (ch === "=") {
          ctx.fillStyle = "#6a4fa0";
          ctx.fillRect(x, y, TILE, 12);
          ctx.fillStyle = "#8f73cc";
          ctx.fillRect(x, y, TILE, 4);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(x, y + 12, TILE, 3);
        } else if (ch === "~") {
          const wob = Math.sin(this.time * 2 + c) * 2;
          ctx.fillStyle = "#1f6b4f";
          ctx.fillRect(x, y + 6, TILE, TILE - 6);
          ctx.fillStyle = "#2e9c72";
          ctx.beginPath();
          ctx.moveTo(x, y + 10 + wob);
          ctx.quadraticCurveTo(x + TILE / 2, y + 2 + wob, x + TILE, y + 10 - wob);
          ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x, y + TILE);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(210,255,235,0.25)";
          ctx.beginPath(); ctx.arc(x + 12 + (c % 3) * 6, y + 22, 3, 0, TAU); ctx.fill();
        } else if (ch === "C" || ch === "c") {
          const dir = ch === "C" ? 1 : -1;
          ctx.fillStyle = "#2f2b48";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#4b466f";
          ctx.fillRect(x, y, TILE, 14);
          ctx.fillStyle = "#ffd84d";
          const off = ((this.time * 90 * dir) % 20 + 20) % 20;
          for (let i = -1; i < 3; i++) {
            const ax = x + off + i * 20;
            ctx.beginPath();
            ctx.moveTo(ax, y + 4); ctx.lineTo(ax + 7, y + 7); ctx.lineTo(ax, y + 10);
            ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(x, y + 14, TILE, TILE - 14);
          ctx.fillStyle = "#3b3659";
          for (let i = 0; i < 2; i++) {
            ctx.beginPath(); ctx.arc(x + 10 + i * 20, y + 26, 7, 0, TAU); ctx.fill();
          }
        } else if (ch === "^") {
          art.drawTrap(ctx, x, y, this.time);
        } else if (ch === "X") {
          art.drawCracked(ctx, x, y, this.time);
        } else if (ch === "G") {
          art.drawGate(ctx, x, y, this.time);
        }
      }
    }
  }

  drawVisionCones(ctx) {
    const dark = LEVELS[this.levelIndex].dark;
    for (const d of this.docs) {
      const ex = d.cx + d.facing * 8;
      const ey = d.y + 18;
      const color = d.state === "chase" ? "255,77,109" : d.state === "search" ? "255,216,77" : "150,180,255";
      const alpha = (dark ? 0.24 : 0.07) * (d.blind > 0 ? 0.4 : 1);
      ctx.save();
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      const base = d.facing > 0 ? 0 : Math.PI;
      ctx.arc(ex, ey, d.range, base - d.cone, base + d.cone);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (d.noticed > 0) {
        ctx.save();
        ctx.globalAlpha = d.noticed;
        ctx.strokeStyle = "#ff4d6d";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(d.cx, d.y - 4, 16 + (1 - d.noticed) * 22, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawDarkness(ctx) {
    const d = this.dctx;
    d.globalCompositeOperation = "source-over";
    d.fillStyle = "rgba(6,3,14,0.9)";
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = "destination-out";

    const p = this.player;
    const glow = d.createRadialGradient(p.cx, p.cy, 6, p.cx, p.cy, p.morphed ? 60 : 120);
    glow.addColorStop(0, "rgba(0,0,0,1)");
    glow.addColorStop(0.55, "rgba(0,0,0,0.75)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    d.fillStyle = glow;
    d.beginPath(); d.arc(p.cx, p.cy, p.morphed ? 60 : 120, 0, TAU); d.fill();

    for (const doc of this.docs) {
      const ex = doc.cx + doc.facing * 8, ey = doc.y + 18;
      // a soft halo so you can always see who is holding the torch
      const hg = d.createRadialGradient(doc.cx, doc.cy, 4, doc.cx, doc.cy, 62);
      hg.addColorStop(0, "rgba(0,0,0,0.85)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = hg;
      d.beginPath(); d.arc(doc.cx, doc.cy, 62, 0, TAU); d.fill();

      const tg = d.createRadialGradient(ex, ey, 8, ex, ey, doc.range);
      tg.addColorStop(0, "rgba(0,0,0,1)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = tg;
      d.beginPath();
      d.moveTo(ex, ey);
      const base = doc.facing > 0 ? 0 : Math.PI;
      d.arc(ex, ey, doc.range, base - doc.cone, base + doc.cone);
      d.closePath(); d.fill();
    }
    for (const g of this.world.goos) {
      if (g.taken) continue;
      const gg = d.createRadialGradient(g.x, g.y, 2, g.x, g.y, 44);
      gg.addColorStop(0, "rgba(0,0,0,0.95)");
      gg.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = gg;
      d.beginPath(); d.arc(g.x, g.y, 44, 0, TAU); d.fill();
    }
    d.globalCompositeOperation = "source-over";
    ctx.drawImage(this.dark, 0, 0);
  }

  drawMorphPrompt(ctx) {
    if (this.state !== "play" || this.player.morphed) return;
    const prop = this.player.canMorph(this.world);
    if (!prop) return;
    const bob = Math.sin(this.time * 6) * 3;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = '800 14px "Baloo 2", sans-serif';
    ctx.fillStyle = "#4ee6b8";
    ctx.strokeStyle = "rgba(10,5,20,0.8)";
    ctx.lineWidth = 4;
    ctx.strokeText("SHIFT to morph", prop.x, prop.y - 58 + bob);
    ctx.fillText("SHIFT to morph", prop.x, prop.y - 58 + bob);
    ctx.restore();
  }

  // ------------------------------------------------------------------ hud ---
  drawHud(ctx) {
    const lvl = LEVELS[this.levelIndex];
    const got = this.world.goos.filter((g) => g.taken).length;
    ctx.save();
    ctx.fillStyle = "rgba(12,6,24,0.55)";
    ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 43, W, 1);

    ctx.font = '800 17px "Baloo 2", sans-serif';
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(`${this.levelIndex + 1}/${LEVELS.length}`, 14, 28);
    ctx.fillStyle = "#f3ecff";
    ctx.fillText(lvl.name, 52, 28);

    // goo counter
    let gx = 300;
    for (let i = 0; i < this.world.totalGoo; i++) {
      ctx.beginPath();
      ctx.arc(gx + i * 17, 22, 6, 0, TAU);
      ctx.fillStyle = i < got ? "#4ee6b8" : "rgba(78,230,184,0.22)";
      ctx.fill();
    }
    gx += this.world.totalGoo * 17 + 14;

    // lives
    ctx.font = '800 15px "Baloo 2", sans-serif';
    ctx.fillStyle = "#ff7a1a";
    for (let i = 0; i < this.lives; i++) {
      ctx.beginPath(); ctx.arc(gx + i * 20, 22, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(gx + i * 20 - 3, 20, 2.4, 0, TAU); ctx.arc(gx + i * 20 + 3, 20, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ff7a1a";
    }

    // the form you are carrying — the thing the level is actually about
    if (this.player.form) {
      const f = FORMS[this.player.form];
      ctx.fillStyle = f.tint;
      ctx.globalAlpha = 0.9;
      roundRect2(ctx, W / 2 - 62, 8, 124, 28, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1b1030";
      ctx.font = '800 15px "Baloo 2", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(f.label, W / 2, 28);
      ctx.textAlign = "left";
    }

    // abilities
    const ab = [
      ["DASH", this.abilities.dash, this.player.dashCd <= 0],
      ["MORPH", this.abilities.morph, true],
      ["CLING", this.abilities.wall, true],
    ];
    let ax = W - 330;
    ctx.font = '800 11px "Baloo 2", sans-serif';
    for (const [label, owned, ready] of ab) {
      if (!owned) { ax += 58; continue; }
      ctx.fillStyle = ready ? "rgba(78,230,184,0.22)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(ax, 10, 52, 24);
      ctx.fillStyle = ready ? "#4ee6b8" : "#6b5a92";
      ctx.textAlign = "center";
      ctx.fillText(label, ax + 26, 26);
      ctx.textAlign = "left";
      ax += 58;
    }

    ctx.textAlign = "right";
    ctx.font = '800 17px "Baloo 2", sans-serif';
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(String(this.runScore).padStart(6, "0"), W - 14, 28);
    ctx.textAlign = "left";

    // boss health bar
    if (this.boss && !this.boss.dead) {
      const b = this.boss;
      const bw = 300, bx = W / 2 - bw / 2, by = 58;
      ctx.fillStyle = "rgba(12,6,24,0.7)";
      roundRect2(ctx, bx - 4, by - 4, bw + 8, 22, 6); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(bx, by, bw, 14);
      const frac = Math.max(0, b.hp / b.maxHp);
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, "#ff4d6d");
      grad.addColorStop(1, "#ffd84d");
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw * frac, 14);
      for (let i = 1; i < b.maxHp; i++) {
        ctx.fillStyle = "rgba(12,6,24,0.85)";
        ctx.fillRect(bx + (bw / b.maxHp) * i - 1, by, 3, 14);
      }
      ctx.font = '800 12px "Baloo 2", sans-serif';
      ctx.textAlign = "center";
      ctx.fillStyle = b.vulnerable ? "#ffd84d" : "#f3ecff";
      ctx.fillText(b.vulnerable ? "CORE EXPOSED — HIT IT!" : `THE GOO-VAC 5000   ·   PHASE ${b.phase}`, W / 2, by + 34);
      ctx.textAlign = "left";
    }

    // par timer bar
    const par = lvl.par ?? 60;
    const frac = clamp(this.levelTime / par, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, 44, W, 3);
    ctx.fillStyle = frac < 1 ? "#4ee6b8" : "#ff4d6d";
    ctx.fillRect(0, 44, W * (1 - frac), 3);
    ctx.restore();
  }

  // -------------------------------------------------------------- overlays --
  panel(ctx, h = 250) {
    ctx.fillStyle = "rgba(10,5,22,0.82)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(36,20,70,0.96)";
    const y = H / 2 - h / 2;
    ctx.fillRect(60, y, W - 120, h);
    ctx.strokeStyle = "#6a4fa0";
    ctx.lineWidth = 3;
    ctx.strokeRect(60, y, W - 120, h);
    return y;
  }

  center(ctx, text, y, size, color, weight = 800) {
    ctx.textAlign = "center";
    ctx.font = `${weight} ${size}px "Baloo 2", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = "left";
  }

  drawTitle(ctx) {
    this.drawBackground(ctx);
    const t = this.time;

    // hero blob
    const bob = Math.sin(t * 1.8) * 7;
    const hero = {
      x: W / 2 - 33, y: 40 + bob, w: 66, h: 66, vx: 0, vy: 0, facing: 1,
      squash: 1 + Math.sin(t * 3) * 0.05, blink: 0, dashTime: 0, invuln: 0,
      scared: 0, morphed: false, shadowY: 118,
    };
    art.drawLamput(ctx, hero, t);

    // docs peeking in from the edges
    const peekL = { x: 46 + Math.sin(t * 0.9) * 14, y: 372, w: 26, h: 74, facing: 1, walkPhase: t * 5, state: "patrol" };
    const peekR = { x: W - 92 - Math.cos(t * 0.8) * 14, y: 386, w: 34, h: 60, facing: -1, walkPhase: t * 4, state: "patrol" };
    art.drawSkinny(ctx, peekL, t);
    art.drawFat(ctx, peekR, t);

    this.center(ctx, "LAMPUT", 176, 58, "#ff7a1a");
    this.center(ctx, "ESCAPE THE DOCS", 204, 20, "#4ee6b8");
    this.center(ctx, "Grab every goo orb to unlock the hatch, then get out \u2014 without being caught.", 234, 14, "#d7cbf0", 700);

    // ---- how to play ----
    const px = 150, py = 252, pw = W - 300, ph = 168;
    ctx.fillStyle = "rgba(18,9,36,0.62)";
    roundRect2(ctx, px, py, pw, ph, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(106,79,160,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    this.center(ctx, "HOW TO PLAY", py + 26, 15, "#9d7fdc");
    drawControls(ctx, px + 26, px + pw / 2 + 12, py + 58);

    ctx.font = '700 12px Nunito, sans-serif';
    ctx.fillStyle = "#9d7fdc";
    ctx.textAlign = "center";
    ctx.fillText("Docs only see inside their cone \u2014 break their line of sight, or morph and they walk right past.", W / 2, py + ph - 12);
    ctx.textAlign = "left";

    // ---- ward select ----
    const lvl = LEVELS[this.menuIndex];
    const unlocked = Math.min(this.save.unlocked, LEVELS.length - 1);
    const resume = this.canResume();
    this.center(ctx, `\u25c0   WARD ${this.menuIndex + 1} \u00b7 ${lvl.name}   \u25b6`, 456, 21,
      unlocked > 0 ? "#f3ecff" : "#6b5a92");
    this.center(ctx, resume
      ? `continuing your run \u00b7 ${this.save.score} pts \u00b7 ${this.save.lives} lives`
      : `unlocked: ${unlocked + 1} of ${LEVELS.length}   \u00b7   best score: ${this.save.best}`,
      481, 13, resume ? "#4ee6b8" : "#9d7fdc");

    const pulse = 0.6 + Math.sin(t * 4) * 0.4;
    ctx.save();
    ctx.globalAlpha = pulse;
    this.center(ctx, resume ? "PRESS  ENTER  TO  CONTINUE" : "PRESS  ENTER  TO ESCAPE", 526, 25, "#ffd84d");
    ctx.restore();
  }

  drawIntro(ctx) {
    const lvl = LEVELS[this.levelIndex];
    const a = clamp(this.stateTimer / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    const y = this.panel(ctx, 220);
    this.center(ctx, `LEVEL ${this.levelIndex + 1}`, y + 52, 22, "#9d7fdc");
    this.center(ctx, lvl.name.toUpperCase(), y + 92, 40, "#ff7a1a");
    if (lvl.unlock) this.center(ctx, lvl.unlock, y + 126, 17, "#4ee6b8");
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = '400 15px Nunito, sans-serif';
    ctx.fillStyle = "#d7cbf0";
    ctx.fillText(lvl.hint, W / 2, y + 162);
    ctx.restore();
    this.center(ctx, "press ENTER to begin", y + 196, 14, "#6b5a92");
    ctx.restore();
  }

  drawPause(ctx) {
    const y = this.panel(ctx, 310);
    this.center(ctx, "PAUSED", y + 54, 40, "#ffd84d");
    drawControls(ctx, 128, W / 2 + 26, y + 104);
    this.center(ctx, "P or ENTER to resume", y + 272, 16, "#d7cbf0");
  }

  drawCaught(ctx) {
    ctx.save();
    ctx.globalAlpha = clamp((1.5 - this.stateTimer) * 2, 0, 1) * 0.9;
    this.center(ctx, this.caughtReason, H / 2 - 10, 40, "#ff4d6d");
    this.center(ctx, this.lives > 0 ? `${this.lives} ${this.lives === 1 ? "life" : "lives"} left` : "out of lives…", H / 2 + 28, 20, "#f3ecff");
    ctx.restore();
  }

  drawClear(ctx) {
    const y = this.panel(ctx, 280);
    this.center(ctx, "ESCAPED!", y + 64, 50, "#4ee6b8");
    this.center(ctx, `level clear  +500`, y + 108, 19, "#f3ecff");
    this.center(ctx, `time bonus  +${this.timeBonus}`, y + 138, 19, "#ffd84d");
    this.center(ctx, this.cleanBonus ? `never caught  +400` : `caught at least once  +0`, y + 168, 19,
      this.cleanBonus ? "#4ee6b8" : "#6b5a92");
    this.center(ctx, `SCORE  ${this.runScore}`, y + 212, 28, "#ff7a1a");
    const pulse = 0.5 + Math.sin(this.time * 5) * 0.5;
    ctx.save();
    ctx.globalAlpha = pulse;
    this.center(ctx, this.levelIndex + 1 < LEVELS.length ? "ENTER for the next ward" : "ENTER to finish", y + 252, 17, "#9d7fdc");
    ctx.restore();
  }

  drawGameOver(ctx) {
    const y = this.panel(ctx, 230);
    this.center(ctx, "CAPTURED", y + 74, 52, "#ff4d6d");
    this.center(ctx, "The docs bottled you up. Again?", y + 116, 19, "#f3ecff");
    this.center(ctx, `score ${this.runScore}   ·   best ${this.save.best}`, y + 148, 17, "#ffd84d");
    this.center(ctx, "ENTER to retry level   ·   R for the title screen", y + 190, 16, "#9d7fdc");
  }

  drawVictory(ctx) {
    const y = this.panel(ctx, 260);
    this.center(ctx, "FREE AT LAST!", y + 74, 48, "#4ee6b8");
    this.center(ctx, "Lamput oozed out of every ward in the lab.", y + 116, 19, "#f3ecff");
    this.center(ctx, `FINAL SCORE  ${this.runScore}`, y + 160, 32, "#ff7a1a");
    this.center(ctx, `best ever  ${this.save.best}`, y + 194, 17, "#ffd84d");
    this.center(ctx, "ENTER for the title screen", y + 230, 16, "#9d7fdc");
    if (Math.random() < 0.3) {
      this.fx.burst(Math.random() * W, H, 3, {
        color: ["#4ee6b8", "#ffd84d", "#ff7a1a", "#fff"],
        speed: 420, angle: -Math.PI / 2, spread: 1.2, life: 1.6, gravity: 320, shape: "square",
      });
    }
  }
}
