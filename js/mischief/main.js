// Full-screen game loop. Drag a thing out of the shelf, drop it where it fits,
// press play. That is the entire interface — no text, no panels.

import { LEVELS, WORLD } from "./levels.js";
import { createSim, step, score, FLOOR, TICK } from "./sim.js";
import * as R from "./render.js";
import { audio, SFX } from "./audio.js";

const cv = document.getElementById("game");
const ctx = cv.getContext("2d");

const SAVE = "lamput.mischief.stars";
let best = [];
try { best = JSON.parse(localStorage.getItem(SAVE) || "[]"); } catch { /* ignore */ }
while (best.length < LEVELS.length) best.push(0);

let li = 0;
let level = LEVELS[li];
let phase = "rig";          // rig | run | done
let rig = {};
let trayItems = [];
let held = null;            // { type, x, y }
let S = null;
let t = 0, acc = 0, last = performance.now();
let result = null, resultT = 0, overSeen = 0, runT = 0;
let seen = 0;                  // events already reacted to
let shake = 0, hitStop = 0, slowmo = 0;
const bits = [];               // splash droplets and debris

function puff(x, y, n, col, up) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (up || 2.4);
    const sp = 120 + Math.random() * 260;
    bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 4, life: 0.5 + Math.random() * 0.5, max: 1, col });
  }
}

// One place where the sim's events become sound, shake and debris. Without this
// the cascade was silent and weightless.
const IMPACT = {
  spark:  { shake: 5,  stop: 0.04, slow: 0 },
  swing:  { shake: 2,  stop: 0,    slow: 0 },
  fall:   { shake: 2,  stop: 0,    slow: 0 },
  splash: { shake: 12, stop: 0.09, slow: 0.45 },
  soak:   { shake: 6,  stop: 0.05, slow: 0.3 },
  slip:   { shake: 9,  stop: 0.07, slow: 0.35 },
  shove:  { shake: 4,  stop: 0,    slow: 0 },
  hit:    { shake: 8,  stop: 0.06, slow: 0 },
  topple: { shake: 16, stop: 0.11, slow: 0.5 },
  flood:  { shake: 7,  stop: 0,    slow: 0 },
};

function reactTo(ev) {
  const sfx = SFX[ev.type];
  if (sfx && audio[sfx]) { audio[sfx](); audio.duck(); }
  const im = IMPACT[ev.type];
  if (im) {
    shake = Math.max(shake, im.shake);
    hitStop = Math.max(hitStop, im.stop);
    if (im.slow) slowmo = Math.max(slowmo, im.slow);
  }
  const d = S.docs[0];
  if (ev.type === "splash") puff(ev.data.x, FLOOR - 30, 22, "#9BD9EA");
  if (ev.type === "flood") puff(ev.data.x, FLOOR - 10, 16, "#9BD9EA");
  if (ev.type === "spark") puff(ev.data.x, FLOOR - 14, 14, "#FFE9A8");
  if (ev.type === "topple") puff(S.props.find((p) => p.toppled)?.x || 500, FLOOR - 40, 20, "#E4E9EF");
  if (ev.type === "slip" && d) puff(d.x, FLOOR, 10, "#FFF3DF");
}

const PLAY = { x: WORLD.w - 86, y: R.TRAY_Y + 78, r: 46 };

function loadLevel(i) {
  li = Math.max(0, Math.min(LEVELS.length - 1, i));
  level = LEVELS[li];
  phase = "rig";
  rig = {};
  held = null;
  result = null;
  S = null;
  seen = 0; shake = 0; hitStop = 0; slowmo = 0; bits.length = 0; overSeen = 0; runT = 0;
  const n = level.tray.length;
  trayItems = level.tray.map((type, k) => ({
    type, used: false,
    x: 150 + k * 130 - (n - 1) * 0,
  }));
}
loadLevel(0);

// ------------------------------------------------------------------ input
function toWorld(e) {
  const r = cv.getBoundingClientRect();
  const sc = Math.min(r.width / WORLD.w, r.height / WORLD.h);
  const ox = (r.width - WORLD.w * sc) / 2, oy = (r.height - WORLD.h * sc) / 2;
  return { x: (e.clientX - r.left - ox) / sc, y: (e.clientY - r.top - oy) / sc };
}

function pickUp(p) {
  // from the shelf
  for (const it of trayItems) {
    if (it.used) continue;
    if (Math.abs(p.x - it.x) < 56 && p.y > R.TRAY_Y) { held = { type: it.type }; audio.pick(); return true; }
  }
  // back off a slot
  for (const type of Object.keys(rig)) {
    const slot = level.slots.find((s) => s.id === rig[type]);
    if (!slot) continue;
    if (Math.abs(p.x - slot.x) < 50 && Math.abs(p.y - slot.y) < 60) {
      delete rig[type];
      const it = trayItems.find((i) => i.type === type);
      if (it) it.used = false;
      held = { type };
      return true;
    }
  }
  return false;
}

function drop(p) {
  if (!held) return;
  let target = null, bd = 90;
  for (const s of level.slots) {
    if (s.accepts !== held.type) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bd) { bd = d; target = s; }
  }
  if (target) {
    for (const type of Object.keys(rig)) if (rig[type] === target.id) {
      delete rig[type];
      const o = trayItems.find((i) => i.type === type); if (o) o.used = false;
    }
    rig[held.type] = target.id; audio.place();
    const it = trayItems.find((i) => i.type === held.type);
    if (it) it.used = true;
  }
  else audio.denied();
  held = null;
}

function press(p) {
  if (phase === "done") {
    if (Math.hypot(p.x - PLAY.x, p.y - PLAY.y) < PLAY.r + 14) {
      if (result.stars > 0 && li < LEVELS.length - 1) loadLevel(li + 1);
      else { phase = "rig"; result = null; S = null; }
    }
    return;
  }
  if (phase === "run") return;
  if (Math.hypot(p.x - PLAY.x, p.y - PLAY.y) < PLAY.r + 14) {
    if (Object.keys(rig).length) {
      S = createSim(level, rig, 7);
      seen = 0; bits.length = 0; overSeen = 0; runT = 0;
      phase = "run";
    }
    return;
  }
  pickUp(p);
}

cv.addEventListener("pointerdown", (e) => { e.preventDefault(); audio.init(); audio.resume(); cv.setPointerCapture(e.pointerId); const p = toWorld(e); if (held) drop(p); else press(p); });
cv.addEventListener("pointermove", (e) => { if (held) { const p = toWorld(e); held.x = p.x; held.y = p.y; } });
cv.addEventListener("pointerup", (e) => { if (held) drop(toWorld(e)); });
addEventListener("keydown", (e) => {
  if (e.key === "m" || e.key === "M") audio.toggle();
  if (e.key === "r" || e.key === "R") { const keep = { ...rig }; loadLevel(li); rig = keep; trayItems.forEach((i) => { i.used = !!rig[i.type]; }); }
  if (e.key === "ArrowRight") loadLevel(li + 1);
  if (e.key === "ArrowLeft") loadLevel(li - 1);
});

// ------------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;

  shake = Math.max(0, shake - dt * 42);
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.life -= dt;
    if (b.life <= 0) { bits.splice(i, 1); continue; }
    b.vy += 1500 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
  }

  if (phase === "run") {
    runT += dt;
    if (runT > 22) { S.over = true; }          // hard backstop, never hang
    if (hitStop > 0) { hitStop -= dt; }
    else {
      slowmo = Math.max(0, slowmo - dt);
      acc += dt * (slowmo > 0 ? 0.32 : 1);
      let g = 0;
      while (acc >= TICK && g++ < 6) { step(S); acc -= TICK; }
      while (seen < S.log.length) reactTo(S.log[seen++]);
    }
    // Wall-clock, not S.tick: step() returns early once the sim is over, so the
    // tick counter freezes and a tick-based wait here can never elapse.
    if (S.over && overSeen === 0) overSeen = t;
    if (S.over && t - overSeen > 0.7) {
      result = score(S);
      best[li] = Math.max(best[li], result.stars);
      try { localStorage.setItem(SAVE, JSON.stringify(best)); } catch { /* ignore */ }
      phase = "done"; resultT = t;
      if (result.stars > 0) audio.win(); else audio.fail();
      for (let i = 0; i < result.stars; i++) audio.star(i);
    }
  }
  // Clear a level and it moves you on by itself. Making the player hunt for a
  // second button to press was most of "the level isn't progressing".
  if (phase === "done" && result && t - resultT > (result.stars > 0 ? 1.9 : 1.6)) {
    if (result.stars > 0 && li < LEVELS.length - 1) loadLevel(li + 1);
    else { const keep = { ...rig }; loadLevel(li); rig = keep; trayItems.forEach((i) => { i.used = !!rig[i.type]; }); }
  }

  draw();
}

function draw() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const sc = Math.min(W / WORLD.w, H / WORLD.h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#231A2B"; ctx.fillRect(0, 0, W, H);
  ctx.translate((W - WORLD.w * sc) / 2, (H - WORLD.h * sc) / 2);
  ctx.scale(sc, sc);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  R.room(ctx, t);

  const sim = S || createSim(level, rig, 7);
  R.route(ctx, level, t);
  R.puddles(ctx, sim, t);
  if (phase === "rig") R.slotGhost(ctx, level, held ? held.type : null, t);

  for (const p of sim.props) R.drawProp(ctx, p, t, false);
  for (const d of sim.docs) if (!d.gone) R.doc(ctx, d, t);

  // Lamput watches from the corner, out of the way
  R.lamput(ctx, 44, FLOOR - 28, t, 1);

  for (const b of bits) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, b.life / b.max));
    ctx.fillStyle = b.col;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  R.finish(ctx);
  R.tray(ctx, trayItems, t, held ? held.type : null);
  R.levelDots(ctx, LEVELS.length, li, best);
  R.playButton(ctx, PLAY, phase === "rig" ? Object.keys(rig).length > 0 : phase === "done", t);

  if (held) R.drawProp(ctx, { type: held.type, x: held.x || 0, y: held.y || 0, swing: 0 }, t, false);

  if (phase === "done" && result) {
    ctx.save();
    ctx.fillStyle = "rgba(35,26,43,.55)";
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    const e = t - resultT;
    for (let i = 0; i < 3; i++) R.star(ctx, WORLD.w / 2 + (i - 1) * 96, WORLD.h * 0.42, 44, i < result.stars, e, i * 0.22);
    ctx.restore();
    R.playButton(ctx, PLAY, true, t);
  }
}
requestAnimationFrame(frame);
window.__m = { get sim() { return S; }, get level() { return li; }, get rig() { return rig; }, load: loadLevel, place(ty, sl) { rig[ty] = sl; const it = trayItems.find(i => i.type === ty); if (it) it.used = true; }, play() { S = createSim(level, rig, 7); phase = "run"; }, get phase() { return phase; }, get result() { return result; },
  drive(seconds) {
    const n = Math.round((seconds || 20) / TICK);
    for (let i = 0; i < n && !S.over; i++) { step(S); }
    while (seen < S.log.length) seen++;
    return { over: S.over, tick: S.tick, docs: S.docs.map(d => ({ x: Math.round(d.x), task: d.task, gone: d.gone, state: d.state })) };
  } };
