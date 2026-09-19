// Full-screen painting. No instruction text anywhere — everything the player
// needs is an affordance: a shelf of things you can obviously pick up, slots
// that light up only when what you are holding fits, a dotted line showing
// where he walks, and one big play button.

import { WORLD, FLOOR, TRAIT } from "./sim.js";
import { TAU, jit, blobPts, inked, inkPath, contact, taper, grain, vignette } from "./paint.js";

export const TRAY_Y = 508;

export const C = {
  sun: "#F6CDA1", mid: "#E0A87E", cool: "#AC7A68",
  brickHi: "#CD8266", brickLo: "#8E4837",
  floorHi: "#DDB88E", floorLo: "#A87B58",
  ink: "#3A2A36", orange: "#F5821F", orangeHi: "#FFC079", orangeLo: "#C2530A",
  teal: "#7FC4C4", tealLo: "#4E9695", coat: "#FFFBF2", coatLo: "#D8CFC4",
  water: "#9BD9EA", waterLo: "#5FA9C4", leaf: "#6FAE6B", leafLo: "#4A7F50",
  metal: "#B9C2CE", metalLo: "#7C8795", good: "#5BB98B", gold: "#FFC93C",
  tray: "#8E5C48", trayHi: "#A9705A",
};

let wall = null;
function buildWall() {
  wall = document.createElement("canvas");
  wall.width = WORLD.w; wall.height = FLOOR + 4;
  const c = wall.getContext("2d");
  const g = c.createLinearGradient(0, 0, WORLD.w * 0.8, FLOOR);
  g.addColorStop(0, C.sun); g.addColorStop(0.55, C.mid); g.addColorStop(1, C.cool);
  c.fillStyle = g; c.fillRect(0, 0, WORLD.w, FLOOR);
  const j = jit(21), bh = 28, bw = 66;
  for (let row = 0, y = 26; y < FLOOR; y += bh, row++) {
    const off = row % 2 ? 0 : bw / 2;
    for (let x = -bw; x < WORLD.w + bw; x += bw) {
      if (j() > 0.4) continue;
      const bx = x + off + j() * 2, by = y + j() * 1.6;
      c.save();
      c.globalAlpha = 0.15 + Math.abs(j()) * 0.15;
      c.fillStyle = j() > 0 ? C.brickHi : C.brickLo;
      inkPath(c, [[bx + 2, by + 2], [bx + bw - 4, by + 1], [bx + bw - 3, by + bh - 5], [bx + 1, by + bh - 4]], (row * 31 + x) | 0, 1.4);
      c.fill(); c.restore();
    }
  }
}

export function room(c, t) {
  if (!wall) buildWall();
  c.drawImage(wall, 0, 0);

  // floor
  const g = c.createLinearGradient(0, FLOOR, 0, TRAY_Y);
  g.addColorStop(0, C.floorHi); g.addColorStop(1, C.floorLo);
  c.fillStyle = g; c.fillRect(0, FLOOR, WORLD.w, TRAY_Y - FLOOR);
  c.save(); c.globalAlpha = 0.12; c.strokeStyle = C.ink; c.lineWidth = 1.4;
  for (let i = -12; i <= 12; i++) {
    c.beginPath(); c.moveTo(WORLD.w * 0.45 + i * 52, FLOOR);
    c.lineTo(WORLD.w * 0.45 + i * 165, TRAY_Y); c.stroke();
  }
  c.restore();
  c.fillStyle = "#8E5C48"; c.fillRect(0, FLOOR - 6, WORLD.w, 8);

  // light from the left
  c.save(); c.globalCompositeOperation = "screen";
  const s = c.createLinearGradient(0, 0, WORLD.w * 0.6, FLOOR);
  s.addColorStop(0, "rgba(255,226,170,.42)"); s.addColorStop(1, "rgba(255,226,170,0)");
  c.fillStyle = s; c.fillRect(0, 0, WORLD.w, FLOOR);
  c.restore();
}

export function finish(c) {
  vignette(c, WORLD.w, WORLD.h, 0.34);
  grain(c, WORLD.w, WORLD.h, 0.07);
}

// ------------------------------------------------------------------- props
export function drawProp(c, p, t, ghost) {
  const x = p.x, y = p.y;
  const seed = (p.type.charCodeAt(0) * 17 + Math.round(x)) | 0;
  c.save();
  if (ghost) c.globalAlpha = 0.34;

  if (p.type === "hook") {
    taper(c, [[x, 0], [x, y - 4]], C.ink, 3.4, 3);
    c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); c.arc(x, y + 4, 9, Math.PI * 1.15, Math.PI * 2.1); c.stroke();
  } else if (p.type === "bucket") {
    if (y >= FLOOR - 10) contact(c, x, y + 3, 30, 9);
    inked(c, [[x - 23, y - 40], [x + 23, y - 41], [x + 17, y + 1], [x - 17, y]], seed, C.teal, C.ink, { w: 2.8 });
    c.save(); c.globalAlpha = ghost ? 0.2 : 0.3;
    inkPath(c, [[x + 7, y - 40], [x + 22, y - 41], [x + 17, y + 1], [x + 5, y]], seed + 2, 1);
    c.fillStyle = C.tealLo; c.fill(); c.restore();
    inked(c, [[x - 25, y - 45], [x + 25, y - 46], [x + 24, y - 38], [x - 24, y - 37]], seed + 4, C.tealLo, C.ink, { w: 2.2 });
    c.strokeStyle = C.ink; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(x - 21, y - 43);
    c.quadraticCurveTo(x, y - 66 + Math.sin(t * 2) * 1.5, x + 21, y - 43); c.stroke();
  } else if (p.type === "plant") {
    contact(c, x, y + 3, 28, 9);
    inked(c, [[x - 20, y - 26], [x + 20, y - 27], [x + 14, y + 1], [x - 14, y]], seed, "#B4614A", C.ink, { w: 2.8 });
    inked(c, [[x - 23, y - 33], [x + 23, y - 34], [x + 22, y - 24], [x - 22, y - 23]], seed + 5, "#CD8266", C.ink, { w: 2.2 });
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.42 + Math.sin(t * 1.3 + i * 1.7) * 0.07, len = 27 + (i % 2 ? 6 : 0);
      c.save(); c.translate(x, y - 32); c.rotate(a);
      inked(c, blobPts(0, -len, 9, len * 0.72, seed + i * 13, t, 3), seed + i * 13, i % 2 ? C.leaf : C.leafLo, C.ink, { w: 2.2, amp: 1.3 });
      c.restore();
    }
  } else if (p.type === "cable") {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push([x - 80 + f * 160, y - 5 + Math.sin(f * 5.2 + 1) * 9]); }
    taper(c, pts, C.ink, 7, 5);
    taper(c, pts.map(([px, py]) => [px, py - 1.6]), "#6E5A66", 3.4, 2.4);
    const spark = Math.sin(t * 7) > 0.88;
    c.fillStyle = spark ? "#FFE9A8" : "#D8A93A";
    c.beginPath(); c.arc(x + 80, y - 7, spark ? 8 : 5.5, 0, TAU); c.fill();
    c.strokeStyle = C.ink; c.lineWidth = 2; c.stroke();
  } else if (p.type === "lamp") {
    const sw = Math.sin(t * 8.5) * 0.4 * (p.swing || 0) + Math.sin(t * 0.8) * 0.03;
    const hx = x + Math.sin(sw) * 46, hy = y;
    taper(c, [[x, 0], [x + Math.sin(sw) * 16, y * 0.4], [hx, hy - 6]], C.ink, 3.4, 2.6);
    inked(c, [[hx - 31, hy], [hx + 31, hy - 1], [hx + 18, hy + 28], [hx - 18, hy + 29]], 71, "#5A6273", C.ink, { w: 2.8 });
    c.save(); c.globalCompositeOperation = "screen";
    const lg = c.createRadialGradient(hx, hy + 32, 4, hx, hy + 32, 150);
    lg.addColorStop(0, "rgba(255,226,160,.5)"); lg.addColorStop(1, "rgba(255,226,160,0)");
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(hx - 18, hy + 28); c.lineTo(hx + 18, hy + 28);
    c.lineTo(hx + 96, FLOOR); c.lineTo(hx - 96, FLOOR); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = "#FFE9B0";
    c.beginPath(); c.ellipse(hx, hy + 28, 14, 6, 0, 0, TAU); c.fill();
  } else if (p.type === "cooler") {
    contact(c, x, y + 3, 32, 10);
    c.save();
    if (p.toppled) { c.translate(x, y); c.rotate(-1.28); c.translate(-x, -y); }
    inked(c, [[x - 24, y - 76], [x + 24, y - 78], [x + 21, y], [x - 21, y + 1]], seed, "#E4E9EF", C.ink, { w: 2.8 });
    inked(c, [[x - 20, y - 112], [x + 20, y - 114], [x + 22, y - 76], [x - 22, y - 74]], seed + 6, C.water, C.ink, { w: 2.6 });
    inked(c, [[x - 13, y - 42], [x + 13, y - 43], [x + 12, y - 31], [x - 12, y - 30]], seed + 9, C.metal, C.ink, { w: 2 });
    c.restore();
  } else if (p.type === "trolley") {
    contact(c, x, y + 3, 34, 10);
    inked(c, [[x - 31, y - 52], [x + 31, y - 54], [x + 30, y - 43], [x - 30, y - 41]], seed, C.metal, C.ink, { w: 2.6 });
    inked(c, [[x - 29, y - 27], [x + 29, y - 29], [x + 28, y - 18], [x - 28, y - 16]], seed + 2, C.metal, C.ink, { w: 2.6 });
    c.strokeStyle = C.ink; c.lineWidth = 3.4; c.lineCap = "round";
    c.beginPath();
    c.moveTo(x - 25, y - 48); c.lineTo(x - 24, y - 8);
    c.moveTo(x + 25, y - 50); c.lineTo(x + 26, y - 8); c.stroke();
    for (const wx of [x - 22, x + 23]) inked(c, blobPts(wx, y - 5, 7, 6.4, seed + wx, t, 3), seed + wx, "#4A4450", C.ink, { w: 2 });
  }
  c.restore();
}

// ------------------------------------------------------------- characters
function eye(c, x, y, r, look, shut, seed) {
  if (shut) {
    c.strokeStyle = C.ink; c.lineWidth = r * 0.3; c.lineCap = "round";
    c.beginPath(); c.moveTo(x - r * 0.7, y + r * 0.1);
    c.quadraticCurveTo(x, y - r * 0.45, x + r * 0.7, y + r * 0.1); c.stroke();
    return;
  }
  inked(c, blobPts(x, y, r, r * 1.08, seed, 0, 3), seed, "#FFFDF6", C.ink, { w: 2.2, amp: 0.7, dx: 0.4, dy: 0.5 });
  const px = x + look * r * 0.34, py = y + r * 0.12;
  c.fillStyle = C.ink; c.beginPath(); c.arc(px, py, r * 0.46, 0, TAU); c.fill();
  c.fillStyle = "rgba(255,255,255,.95)";
  c.beginPath(); c.arc(px - r * 0.17, py - r * 0.2, r * 0.17, 0, TAU); c.fill();
}

export function doc(c, d, t) {
  const x = d.x, y = FLOOR;
  const walking = d.state === "walk" && d.stun <= 0;
  const panic = d.stun > 0;
  const f = d.facing;
  const step = walking ? Math.sin(t * 8.5) : 0;
  const by = y - (walking ? Math.abs(Math.sin(t * 8.5)) * 5 : Math.sin(t * 2.2) * 1.6);

  contact(c, x, y + 3, 30, 10);
  for (const [ox, sw] of [[-6, step * 9], [6, -step * 9]]) {
    taper(c, [[x + ox, by - 20], [x + ox + sw * 0.5, by - 8], [x + ox + sw, y]], C.tealLo, 5.4, 4.2);
    inked(c, [[x + ox + sw - 8, y - 5], [x + ox + sw + 9, y - 6], [x + ox + sw + 8, y + 2], [x + ox + sw - 8, y + 2]], (x + ox) | 0, C.tealLo, C.ink, { w: 2, amp: 0.8 });
  }
  const cw = 23;
  const coat = [[x - cw + 3, by - 54], [x + cw - 3, by - 55], [x + cw + 3, by - 22], [x + cw - 6, by - 14], [x - cw + 6, by - 13], [x - cw - 3, by - 21]];
  inked(c, coat, 31, C.coat, C.ink, { w: 3, amp: 1.5 });
  const reach = panic ? -62 : (d.state === "acting" ? -50 : -26);
  for (const s of [-1, 1]) {
    taper(c, [[x + s * (cw - 4), by - 46], [x + s * (cw + 4) + f * 6, by - 36], [x + s * (cw - 2) + f * 15, by + reach + 14]], C.tealLo, 5, 4);
    inked(c, blobPts(x + s * (cw - 2) + f * 16, by + reach + 16, 5.4, 5, 61 + s, t, 3), 61 + s, C.teal, C.ink, { w: 2, amp: 0.7 });
  }
  const hy = by - 70;
  inked(c, blobPts(x + f * 2, hy, 20, 20.5, 41, t, 3), 41, C.teal, C.ink, { w: 3, amp: 1.2 });
  eye(c, x + f * 2 - 7.5, hy - 2, 9.8, f * 0.6, panic, 51);
  eye(c, x + f * 2 + 8, hy - 2.5, 9.4, f * 0.6, panic, 52);
  for (const s of [-1, 1]) inked(c, blobPts(x + f * 2 + s * 6, hy + 11, 7, 3.6, 81 + s, t, 3), 81 + s, "#5A4032", null, { amp: 0.9 });

  if (d.soaked > 0) {
    c.save(); c.globalAlpha = Math.min(0.5, d.soaked);
    inkPath(c, coat, 31, 1.5); c.fillStyle = C.waterLo; c.fill(); c.restore();
  }
  if (panic) {
    c.strokeStyle = "#C6503F"; c.lineWidth = 3; c.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const a = t * 6 + i * 1.6, sx = x + Math.cos(a) * 44, sy = hy - 28 + Math.sin(a) * 15;
      c.beginPath(); c.moveTo(sx - 4, sy - 4); c.lineTo(sx + 4, sy + 4);
      c.moveTo(sx + 4, sy - 4); c.lineTo(sx - 4, sy + 4); c.stroke();
    }
  }
}

export function lamput(c, x, y, t, look) {
  const r = 27;
  contact(c, x, y + r + 2, r * 1.2, 9);
  const pts = blobPts(x, y, r, r, 3, t, 3);
  inked(c, pts, 3, C.orange, C.ink, { w: 3, amp: 1.3 });
  c.save(); inkPath(c, pts, 3, 1.3); c.clip();
  const g = c.createRadialGradient(x - r * 0.42, y - r * 0.5, 2, x, y, r * 1.7);
  g.addColorStop(0, C.orangeHi); g.addColorStop(0.5, C.orange); g.addColorStop(1, C.orangeLo);
  c.fillStyle = g; c.fillRect(x - r * 2, y - r * 2, r * 4, r * 4); c.restore();
  taper(c, [[x + 2, y - r * 0.92], [x + 7, y - r * 1.3], [x + 1, y - r * 1.6]], C.orangeLo, 4.4, 2);
  eye(c, x - r * 0.34, y - r * 0.16, 12.5, look || 0, false, 11);
  eye(c, x + r * 0.36, y - r * 0.17, 13, look || 0, false, 12);
  c.strokeStyle = C.ink; c.lineWidth = 2.4; c.lineCap = "round";
  c.beginPath(); c.moveTo(x - 9, y + r * 0.26);
  c.quadraticCurveTo(x, y + r * 0.52, x + 9, y + r * 0.24); c.stroke();
}

export function puddles(c, S, t) {
  for (const p of S.puddles) {
    const seed = (p.x * 3) | 0;
    c.save(); c.globalAlpha = 0.66;
    inked(c, blobPts(p.x, FLOOR + 12, p.r * 0.52, 11, seed, t * 0.5, 4), seed, C.water, "rgba(58,42,54,.3)", { w: 1.8, amp: 1.5 });
    c.restore();
  }
}

// ------------------------------------------------------------------- shell
// His route: a dotted line with a footprint at each stop. No words.
export function route(c, level, t) {
  const y = FLOOR + 30;
  c.save();
  c.strokeStyle = "rgba(58,42,54,.3)"; c.lineWidth = 3;
  c.setLineDash([4, 10]); c.lineCap = "round";
  c.beginPath(); c.moveTo(level.docStart, y);
  for (const st of level.route) c.lineTo(st.x, y);
  c.stroke(); c.setLineDash([]);
  for (const st of level.route) {
    if (st.act === "leave") continue;
    const pulse = 1 + Math.sin(t * 3.4) * 0.09;
    c.save(); c.translate(st.x, y); c.scale(pulse, pulse);
    inked(c, blobPts(0, 0, 11, 8, 300 + st.x, 0, 3), 300 + st.x, "#FFF3DF", C.ink, { w: 2.2, amp: 0.8 });
    c.fillStyle = C.ink;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-4 + i * 4, -3.5, 1.4, 0, TAU); c.fill(); }
    c.restore();
  }
  c.restore();
}

export function slotGhost(c, level, dragType, t) {
  if (!dragType) return;
  for (const s of level.slots) {
    if (s.accepts !== dragType) continue;
    c.save();
    c.globalAlpha = 0.5 + Math.sin(t * 6) * 0.22;
    c.setLineDash([10, 8]); c.lineWidth = 3.5; c.strokeStyle = C.good;
    c.beginPath();
    if (s.y < FLOOR - 40) c.roundRect ? c.roundRect(s.x - 34, s.y - 12, 68, 54, 12) : c.rect(s.x - 34, s.y - 12, 68, 54);
    else c.ellipse(s.x, s.y + 5, 42, 15, 0, 0, TAU);
    c.stroke();
    c.restore();
    c.save(); c.globalAlpha = 0.26;
    drawProp(c, { type: dragType, x: s.x, y: s.y, swing: 0 }, t, true);
    c.restore();
  }
}

export function tray(c, items, t, held) {
  c.fillStyle = C.tray;
  c.fillRect(0, TRAY_Y, WORLD.w, WORLD.h - TRAY_Y);
  c.fillStyle = C.trayHi;
  c.fillRect(0, TRAY_Y, WORLD.w, 7);
  c.save(); c.globalAlpha = 0.16; c.fillStyle = "#000";
  c.fillRect(0, TRAY_Y + 7, WORLD.w, 10); c.restore();

  items.forEach((it) => {
    if (it.used || it.type === held) return;
    c.save();
    c.globalAlpha = 0.25; c.fillStyle = "#000";
    c.beginPath(); c.ellipse(it.x, TRAY_Y + 86, 40, 11, 0, 0, TAU); c.fill();
    c.restore();
    const bob = Math.sin(t * 2 + it.x) * 3;
    drawProp(c, { type: it.type, x: it.x, y: TRAY_Y + 82 + bob, swing: 0 }, t, false);
  });
}

export function playButton(c, box, enabled, t) {
  const pulse = enabled ? 1 + Math.sin(t * 3.2) * 0.04 : 1;
  c.save();
  c.translate(box.x, box.y); c.scale(pulse, pulse);
  inked(c, blobPts(0, 0, box.r, box.r, 900, 0, 3), 900, enabled ? C.good : "#6B6270", C.ink, { w: 4, amp: 1.4 });
  c.fillStyle = enabled ? "#FFFFFF" : "#A79FAC";
  c.beginPath();
  c.moveTo(-box.r * 0.28, -box.r * 0.42);
  c.lineTo(box.r * 0.46, 0);
  c.lineTo(-box.r * 0.28, box.r * 0.42);
  c.closePath(); c.fill();
  c.restore();
}

export function star(c, x, y, r, filled, t, delay) {
  const pop = Math.max(0, Math.min(1, (t - delay) * 4));
  if (pop <= 0) return;
  const s = r * (filled ? (0.6 + pop * 0.4 + Math.sin(pop * Math.PI) * 0.25) : 1);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? s * 0.46 : s;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  inked(c, pts, 950 + x, filled ? C.gold : "rgba(255,255,255,.18)", C.ink, { w: 3, amp: 1 });
}

export function levelDots(c, n, current, best) {
  const w = 22, total = n * w;
  const x0 = WORLD.w / 2 - total / 2 + w / 2;
  for (let i = 0; i < n; i++) {
    const done = best[i] > 0;
    c.save();
    c.globalAlpha = i === current ? 1 : 0.5;
    inked(c, blobPts(x0 + i * w, 34, 7, 7, 970 + i, 0, 3), 970 + i,
      i === current ? C.orange : (done ? C.gold : "rgba(255,255,255,.25)"), C.ink, { w: 2, amp: 0.6 });
    c.restore();
  }
}
