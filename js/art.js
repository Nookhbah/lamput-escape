// Everything on screen is drawn with canvas paths — no image assets.
import { TILE } from "./levels.js";
import { jit, blobPts, inked, inkPath, taper, contact } from "./paint.js";

const TAU = Math.PI * 2;

function blobPath(ctx, cx, cy, rx, ry, wobble, t, lobes = 7) {
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const w = 1 + Math.sin(a * lobes + t * 3) * wobble + Math.cos(a * 3 - t * 2) * wobble * 0.6;
    const x = cx + Math.cos(a) * rx * w;
    const y = cy + Math.sin(a) * ry * w;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function eye(ctx, x, y, r, lookX, lookY, blink) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  if (blink > 0.5) {
    ctx.ellipse(x, y, r, r * 0.14, 0, 0, TAU);
    ctx.fillStyle = "#2b1a12";
    ctx.fill();
    return;
  }
  ctx.ellipse(x, y, r * 0.86, r, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#231018";
  ctx.beginPath();
  ctx.arc(x + lookX * r * 0.32, y + lookY * r * 0.3, r * 0.48, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x + lookX * r * 0.32 - r * 0.16, y + lookY * r * 0.3 - r * 0.18, r * 0.16, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- Lamput ---
// A soft pear silhouette, wider at the bottom, wobbling. No outline, no
// gradient, no shine — flat colour with thin darker interior lines, the way the
// reference art does it.
function blobBody(ctx, cx, cy, rx, ry, wob, t, bias) {
  ctx.beginPath();
  const steps = 52;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const widen = 1 + bias * Math.sin(a);                 // sin>0 is the bottom
    const k = 1 + Math.sin(a * 3 + t * 2.1) * wob + Math.cos(a * 5 - t * 1.7) * wob * 0.5;
    const x = cx + Math.cos(a) * rx * k * widen;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawLamput(ctx, p, t) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  if (p.morphed) { drawMorphedBlob(ctx, p, t); return; }

  const j = (p.jiggle || 0) * Math.sin(t * 24) * 0.19;
  const sq = p.squash * (1 - j);
  const rx = (p.w / 2 + 1) * (1 / sq) * (1 + j * 0.35);
  const ry = (p.h / 2 + 3) * sq;
  const face = p.facing;

  // one flat colour per form, plus a darker tone used only for thin line work
  const SKIN = {
    heavy:  { body: "#8A8FA8", line: "#5A5F78" },
    spring: { body: "#E0B23C", line: "#A87C12" },
    float:  { body: "#7FBFE0", line: "#4D8CB0" },
  };
  const sk = SKIN[p.form] || { body: "#F5821F", line: "#C4550A" };

  ctx.save();

  // soft contact shadow
  ctx.save();
  ctx.globalAlpha *= 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, p.shadowY ?? (p.y + p.h + 3), p.w * 0.44, 4.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (p.dashTime > 0) {
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = sk.body;
    for (let i = 1; i <= 3; i++) {
      blobBody(ctx, cx - p.vx * 0.012 * i, cy - p.vy * 0.012 * i, rx * (1 - i * 0.13), ry * (1 - i * 0.13), 0.05, t, 0.14);
      ctx.fill();
    }
    ctx.restore();
  }

  // little nub arms, drawn behind so they read as part of the same mass
  ctx.fillStyle = sk.body;
  for (const sgn of [-1, 1]) {
    const ax = cx + sgn * rx * 0.72, ay = cy + ry * 0.24;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(sgn * (0.5 + Math.sin(t * 2.4 + sgn) * 0.14));
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.26, ry * 0.17, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // body
  let bias = 0.16;
  let bw = rx, bh = ry;
  if (p.form === "heavy") { bias = 0.3; bw = rx * 1.12; bh = ry * 0.9; }
  else if (p.form === "spring") {
    const st = Math.max(0.9, Math.min(1.45, 1 - p.vy / 900));
    bias = 0.1; bw = rx / st * 0.94; bh = ry * st * 1.12;
  } else if (p.form === "float") { bias = -0.12; bw = rx * 1.04; bh = ry * 1.14; }

  ctx.fillStyle = sk.body;
  blobBody(ctx, cx, cy, bw, bh, 0.06 + Math.abs(p.vx) * 0.00008 + Math.abs(j) * 0.16, t * 1.4, bias);
  ctx.fill();

  // two small foot bumps so he sits on the ground rather than floating
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sgn * bw * 0.42, cy + bh * 0.88, bw * 0.3, bh * 0.2, 0, 0, TAU);
    ctx.fill();
  }

  // thin interior line work — the only detail, same family as the body colour
  ctx.strokeStyle = sk.line;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - bw * 0.52, cy + bh * 0.3);
  ctx.quadraticCurveTo(cx - bw * 0.2, cy + bh * 0.5, cx + bw * 0.04, cy + bh * 0.34);
  ctx.stroke();

  if (p.form === "spring") {
    for (let i = 0; i < 2; i++) {
      const yy = cy - bh * 0.3 + i * bh * 0.46;
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.62, yy);
      ctx.quadraticCurveTo(cx, yy + bh * 0.18, cx + bw * 0.62, yy - bh * 0.04);
      ctx.stroke();
    }
  } else if (p.form === "key") {
    const kx = cx + face * bw * 0.95, ky = cy + bh * 0.3;
    const gold = "#E0C04C", goldLo = "#A8891C";
    ctx.strokeStyle = gold;
    ctx.lineCap = "round";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(kx, ky); ctx.lineTo(kx + face * 20, ky);
    ctx.stroke();
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(kx + face * 13, ky); ctx.lineTo(kx + face * 13, ky + 8);
    ctx.moveTo(kx + face * 19, ky); ctx.lineTo(kx + face * 19, ky + 10);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc(kx - face * 4, ky, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = sk.body;
    ctx.beginPath(); ctx.arc(kx - face * 4, ky, 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = goldLo; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(kx - face * 4, ky, 7, 0, TAU); ctx.stroke();
    ctx.strokeStyle = sk.line; ctx.lineWidth = 1.8;
  }

  // the curl
  const whip = j * 22 + Math.sin(t * 3) * 3;
  ctx.strokeStyle = sk.line;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(cx + face * 3, cy - bh * 0.92);
  ctx.quadraticCurveTo(cx + face * 12 + whip, cy - bh * 1.4, cx + face * 2 + whip * 1.4, cy - bh * 1.64);
  ctx.stroke();

  // big eyes, close together, high on the body
  const er = Math.min(bw, bh) * 0.44;
  const ex = er * 0.86, ey = -bh * 0.2 + j * bh * 0.4;
  const lookX = face * 0.55 + Math.max(-1, Math.min(1, p.vx / 260)) * 0.35;
  const lookY = Math.max(-1, Math.min(1, p.vy / 420));
  for (const sgn of [-1, 1]) {
    const x = cx + sgn * ex, y = cy + ey;
    if (p.blink > 0.5) {
      ctx.strokeStyle = "#2b1a12"; ctx.lineWidth = er * 0.26;
      ctx.beginPath();
      ctx.moveTo(x - er * 0.62, y); ctx.quadraticCurveTo(x, y - er * 0.34, x + er * 0.62, y);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.ellipse(x, y, er * 0.88, er, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#231018";
    ctx.beginPath();
    ctx.arc(x + lookX * er * 0.3, y + lookY * er * 0.26, er * 0.42, 0, TAU);
    ctx.fill();
  }

  // mouth
  ctx.strokeStyle = "#8a4406";
  ctx.lineWidth = 2.2;
  const my = cy + bh * 0.4;
  if (p.scared > 0) {
    ctx.fillStyle = "#8a4406";
    ctx.beginPath(); ctx.ellipse(cx, my, bw * 0.17, bh * 0.16, 0, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.26, my - bh * 0.06);
    ctx.quadraticCurveTo(cx, my + bh * 0.16, cx + bw * 0.26, my - bh * 0.07);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMorphedBlob(ctx, p, t) {
  const cx = p.x + p.w / 2;
  const base = p.y + p.h;
  const wob = Math.sin(t * 2) * 1.2;
  drawProp(ctx, cx, base, p.morphKind ?? 0, t, true);
  // one guilty eye peeks out
  if (Math.sin(t * 1.3) > 0.55) {
    eye(ctx, cx + 5, base - 34 + wob, 5, p.facing, 0, 0);
  }
}

// ------------------------------------------------------------ morph props ---
export function drawProp(ctx, cx, baseY, kind, t, morphed = false) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 2, 22, 6, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (kind % 3 === 0) {
    // potted plant
    ctx.fillStyle = "#b5532c";
    ctx.beginPath();
    ctx.moveTo(cx - 13, baseY - 18); ctx.lineTo(cx + 13, baseY - 18);
    ctx.lineTo(cx + 9, baseY); ctx.lineTo(cx - 9, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d1663a";
    ctx.fillRect(cx - 14, baseY - 22, 28, 6);
    ctx.fillStyle = morphed ? "#ff9a3c" : "#3fa86b";
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(cx, baseY - 22);
      ctx.rotate(i * 0.7 + Math.sin(t * 1.6 + i) * 0.06);
      ctx.beginPath();
      ctx.ellipse(0, -14, 7, 16, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  } else if (kind % 3 === 1) {
    // trash bin
    ctx.fillStyle = morphed ? "#ff8a2e" : "#5c7d9e";
    ctx.beginPath();
    ctx.moveTo(cx - 13, baseY - 30); ctx.lineTo(cx + 13, baseY - 30);
    ctx.lineTo(cx + 10, baseY); ctx.lineTo(cx - 10, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = morphed ? "#ffb066" : "#7b9dc0";
    roundRect(ctx, cx - 15, baseY - 36, 30, 8, 3); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 6, baseY - 26); ctx.lineTo(cx + i * 5, baseY - 5);
      ctx.stroke();
    }
  } else {
    // fire extinguisher
    ctx.fillStyle = morphed ? "#ff7a1a" : "#d8384a";
    roundRect(ctx, cx - 9, baseY - 32, 18, 32, 7); ctx.fill();
    ctx.fillStyle = "#2b2b3a";
    ctx.fillRect(cx - 4, baseY - 39, 8, 8);
    ctx.fillStyle = "#c9c9d6";
    roundRect(ctx, cx - 11, baseY - 43, 10, 5, 2); ctx.fill();

  }
  ctx.restore();
}

// --------------------------------------------------------------- doctors ---
export function drawSkinny(ctx, d, t) {
  const cx = d.x + d.w / 2;
  const by = d.y + d.h;
  const f = d.facing;
  const bob = Math.sin(d.walkPhase) * 2.4;
  const panic = d.state === "chase";

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(cx, by + 2, 16, 5, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#2f3550";
  ctx.lineWidth = 5; ctx.lineCap = "round";
  const stride = Math.sin(d.walkPhase) * (panic ? 11 : 6);
  ctx.beginPath();
  ctx.moveTo(cx - 4, by - 22); ctx.lineTo(cx - 4 + stride, by);
  ctx.moveTo(cx + 4, by - 22); ctx.lineTo(cx + 4 - stride, by);
  ctx.stroke();

  ctx.fillStyle = "#f2f4ff";
  ctx.beginPath();
  ctx.moveTo(cx - 12, by - 52 + bob);
  ctx.lineTo(cx + 12, by - 52 + bob);
  ctx.lineTo(cx + 14, by - 20);
  ctx.lineTo(cx - 14, by - 20);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#b9c0dd"; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, by - 50 + bob); ctx.lineTo(cx, by - 21);
  ctx.stroke();

  ctx.strokeStyle = "#f2f4ff"; ctx.lineWidth = 5;
  const reach = panic ? 16 : 8;
  ctx.beginPath();
  ctx.moveTo(cx - 10, by - 46 + bob);
  ctx.lineTo(cx - 10 + f * reach, by - (panic ? 50 : 30) + bob - stride * 0.4);
  ctx.moveTo(cx + 10, by - 46 + bob);
  ctx.lineTo(cx + 10 + f * reach, by - (panic ? 46 : 32) + bob + stride * 0.4);
  ctx.stroke();

  ctx.strokeStyle = "#e8c9a5"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx, by - 56 + bob); ctx.lineTo(cx, by - 50 + bob); ctx.stroke();
  ctx.fillStyle = "#f0cfa8";
  ctx.beginPath();
  ctx.ellipse(cx + f * 2, by - 68 + bob, 12, 14, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#3a2c25"; ctx.lineWidth = 2.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + f * 2 + i * 6, by - 80 + bob);
    ctx.lineTo(cx + f * 2 + i * 7, by - 87 + bob);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2b2f45"; ctx.lineWidth = 2;
  ctx.fillStyle = panic ? "#ffe7a8" : "#cfe6ff";
  ctx.beginPath(); ctx.arc(cx + f * 2 - 5, by - 70 + bob, 5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx + f * 2 + 6, by - 70 + bob, 5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + f * 2 - 0.5, by - 70 + bob); ctx.lineTo(cx + f * 2 + 1, by - 70 + bob); ctx.stroke();
  ctx.fillStyle = "#1a1a26";
  ctx.beginPath(); ctx.arc(cx + f * 2 - 5 + f * 2, by - 70 + bob, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + f * 2 + 6 + f * 2, by - 70 + bob, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = "#e0b184";
  ctx.beginPath(); ctx.ellipse(cx + f * 11, by - 65 + bob, 4, 3, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawFat(ctx, d, t) {
  const cx = d.x + d.w / 2;
  const by = d.y + d.h;
  const f = d.facing;
  const bob = Math.sin(d.walkPhase) * 2;
  const panic = d.state === "chase";

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(cx, by + 2, 21, 6, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#2f3550"; ctx.lineWidth = 6; ctx.lineCap = "round";
  const stride = Math.sin(d.walkPhase) * (panic ? 9 : 5);
  ctx.beginPath();
  ctx.moveTo(cx - 6, by - 16); ctx.lineTo(cx - 6 + stride, by);
  ctx.moveTo(cx + 6, by - 16); ctx.lineTo(cx + 6 - stride, by);
  ctx.stroke();

  ctx.fillStyle = "#f2f4ff";
  ctx.beginPath();
  ctx.ellipse(cx, by - 32 + bob, 20, 19, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#b9c0dd"; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, by - 50 + bob); ctx.lineTo(cx, by - 14 + bob); ctx.stroke();

  ctx.strokeStyle = "#f2f4ff"; ctx.lineWidth = 7;
  const reach = panic ? 14 : 6;
  ctx.beginPath();
  ctx.moveTo(cx - 16, by - 36 + bob); ctx.lineTo(cx - 16 + f * reach, by - (panic ? 42 : 22) + bob);
  ctx.moveTo(cx + 16, by - 36 + bob); ctx.lineTo(cx + 16 + f * reach, by - (panic ? 40 : 24) + bob);
  ctx.stroke();

  ctx.fillStyle = "#f0cfa8";
  ctx.beginPath(); ctx.arc(cx + f * 2, by - 58 + bob, 14, 0, TAU); ctx.fill();
  ctx.fillStyle = "#4ec1c8";
  ctx.beginPath();
  ctx.arc(cx + f * 2, by - 62 + bob, 14, Math.PI, TAU);
  ctx.fill();
  ctx.fillRect(cx + f * 2 - 14, by - 63 + bob, 28, 3);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(cx + f * 2 - 5, by - 60 + bob, 4.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + f * 2 + 5, by - 60 + bob, 4.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1a1a26";
  ctx.beginPath(); ctx.arc(cx + f * 2 - 5 + f * 1.8, by - 60 + bob, 2.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + f * 2 + 5 + f * 1.8, by - 60 + bob, 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = "#4a3428";
  ctx.beginPath();
  ctx.ellipse(cx + f * 2 - 5, by - 51 + bob, 6, 3.4, -0.3, 0, TAU);
  ctx.ellipse(cx + f * 2 + 5, by - 51 + bob, 6, 3.4, 0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------ world bits ---
export function drawGoo(ctx, g, t) {
  const bob = Math.sin(t * 3 + g.phase) * 4;
  const cx = g.x, cy = g.y + bob;
  ctx.save();
  blobPath(ctx, cx, cy, 9.5, 9.5, 0.035, t + g.phase, 4);
  ctx.fillStyle = "#4ee6b8";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1fa47c";
  ctx.stroke();
  ctx.fillStyle = "#b8f5e0";
  ctx.beginPath(); ctx.arc(cx - 3, cy - 3.5, 2.6, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawExit(ctx, e, t, open) {
  const x = e.x, y = e.y;
  ctx.save();
  ctx.fillStyle = open ? "#2b1d4d" : "#251a38";
  roundRect(ctx, x - 20, y - 56, 40, 56, 8);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = open ? "#4ee6b8" : "#4a3a6b";
  ctx.stroke();
  if (open) {
    ctx.fillStyle = "#4ee6b8";
    roundRect(ctx, x - 16, y - 52, 32, 52, 6); ctx.fill();
    ctx.fillStyle = "#d9fff4";
    ctx.font = '800 13px "Baloo 2", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("EXIT", x, y - 62);
  } else {
    ctx.fillStyle = "#6b5a92";
    ctx.font = '800 12px "Baloo 2", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("LOCKED", x, y - 62);
    // padlock
    ctx.strokeStyle = "#6b5a92"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y - 34, 7, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = "#6b5a92";
    roundRect(ctx, x - 9, y - 34, 18, 14, 3); ctx.fill();
  }
  ctx.textAlign = "left";
  ctx.restore();
}

// Flat warning spikes, the way a puzzle platformer draws a hazard: clean
// triangles on a base strip. No arcs, no glow, no animation.
export function drawTrap(ctx, x, y, t) {
  const base = y + TILE;
  ctx.save();
  ctx.fillStyle = "#8E2F44";
  ctx.fillRect(x, base - 6, TILE, 6);
  ctx.fillStyle = "#E2415C";
  const n = 3, w = TILE / n;
  for (let i = 0; i < n; i++) {
    const bx = x + i * w;
    ctx.beginPath();
    ctx.moveTo(bx + 1, base - 5);
    ctx.lineTo(bx + w / 2, base - 5 - 18);
    ctx.lineTo(bx + w - 1, base - 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawLaserNode(ctx, x, y, on) {
  ctx.save();
  ctx.fillStyle = "#3b2a5c";
  roundRect(ctx, x + 8, y + 2, TILE - 16, 16, 4); ctx.fill();
  ctx.fillStyle = on ? "#ff4d6d" : "#4a3a6b";
  ctx.beginPath(); ctx.arc(x + TILE / 2, y + 16, 5, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawLaserBeam(ctx, x, y1, y2, t) {
  ctx.save();
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(x - 3, y1, 6, y2 - y1);
  ctx.fillStyle = "#ff8fa3";
  ctx.fillRect(x - 1, y1, 2, y2 - y1);
  ctx.restore();
}

export function drawLift(ctx, p) {
  // the rail: shows where this lift travels, and which way
  if (p.range) {
    const horiz = p.axis === "x";
    const cx = p.ox + p.w / 2, cy = p.oy + p.h / 2;
    const a = horiz ? { x: cx - p.range, y: cy } : { x: cx, y: cy - p.range };
    const b = horiz ? { x: cx + p.range, y: cy } : { x: cx, y: cy + p.range };
    ctx.save();
    ctx.strokeStyle = "rgba(157,127,220,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(157,127,220,0.55)";
    for (const [end, dir] of [[a, -1], [b, 1]]) {
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(end.x + dir * 8, end.y);
        ctx.lineTo(end.x, end.y - 6); ctx.lineTo(end.x, end.y + 6);
      } else {
        ctx.moveTo(end.x, end.y + dir * 8);
        ctx.lineTo(end.x - 6, end.y); ctx.lineTo(end.x + 6, end.y);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#6d4fa8";
  roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
  ctx.fillStyle = "#8f73cc";
  ctx.fillRect(p.x + 4, p.y + 3, p.w - 8, 3);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 4; i++) ctx.fillRect(p.x + 8 + i * 18, p.y + 10, 10, 4);
  ctx.restore();
}

export function drawPad(c, pad, t, tint) {
  const x = pad.x, base = pad.y;
  const bob = Math.sin(t * 3 + x) * 2.5;
  c.save();

  // base plate
  c.fillStyle = "#2c1f4a";
  roundRect(c, x - 22, base - 9, 44, 9, 3); c.fill();
  c.fillStyle = "#463370";
  roundRect(c, x - 22, base - 11, 44, 4, 2); c.fill();

  if (pad.taken) {   // you are carrying it — the pedestal is bare
    c.globalAlpha = 0.5;
    c.strokeStyle = tint;
    c.lineWidth = 2;
    c.setLineDash([5, 5]);
    c.beginPath(); c.ellipse(x, base - 16, 15, 6, 0, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.restore();
    return;
  }

  if (pad.form === "spring") {
    // a coil drawn as stacked rings, lit on one side, with a cap plate
    const squash = 0.68 + Math.abs(Math.sin(t * 2.4)) * 0.42;
    const h = 36 * squash;
    const rings = 5;
    for (let i = rings - 1; i >= 0; i--) {
      const f = i / (rings - 1);
      const yy = base - 12 - f * h;
      const rw = 15 - f * 1.5;
      c.save();
      c.strokeStyle = "rgba(58,42,54,.85)";
      c.lineWidth = 6.5;
      c.beginPath(); c.ellipse(x, yy, rw, 5.2, 0, 0, TAU); c.stroke();
      c.strokeStyle = tint;
      c.lineWidth = 4.4;
      c.beginPath(); c.ellipse(x, yy, rw, 5.2, 0, 0, TAU); c.stroke();
      c.restore();
    }
    inked(c, [[x - 17, base - 20 - h], [x + 17, base - 21 - h], [x + 16, base - 13 - h], [x - 16, base - 12 - h]],
      301, "#F3E3C4", "#3A2A36", { w: 2.4, amp: 0.7 });
    const ay = base - 40 - h + Math.sin(t * 4) * 4;
    c.globalAlpha = 0.9;
    inked(c, [[x, ay - 15], [x + 11, ay - 1], [x + 4.5, ay - 1], [x + 4.5, ay + 12],
              [x - 4.5, ay + 12], [x - 4.5, ay - 1], [x - 11, ay - 1]], 302, tint, "#3A2A36", { w: 2.2, amp: 0.6 });
    c.globalAlpha = 1;
  } else if (pad.form === "heavy") {
    // an anvil
    c.fillStyle = tint;
    c.beginPath();
    c.moveTo(x - 20, base - 34 + bob); c.lineTo(x + 20, base - 34 + bob);
    c.lineTo(x + 13, base - 24 + bob); c.lineTo(x + 8, base - 24 + bob);
    c.lineTo(x + 11, base - 13 + bob); c.lineTo(x - 11, base - 13 + bob);
    c.lineTo(x - 8, base - 24 + bob); c.lineTo(x - 13, base - 24 + bob);
    c.closePath(); c.fill();
    c.strokeStyle = "rgba(20,10,40,.55)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = "rgba(255,255,255,.3)";
    c.fillRect(x - 17, base - 32 + bob, 28, 3);
    // little down arrows
    c.fillStyle = tint; c.globalAlpha = 0.7;
    for (let i = -1; i <= 1; i++) {
      const ay = base - 46 + bob + Math.sin(t * 5 + i) * 3;
      c.beginPath();
      c.moveTo(x + i * 13, ay + 7); c.lineTo(x + i * 13 - 5, ay); c.lineTo(x + i * 13 + 5, ay);
      c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  } else if (pad.form === "float") {
    // a balloon on a string
    const fy = base - 44 + Math.sin(t * 1.6) * 5;
    c.strokeStyle = "rgba(230,230,255,.6)"; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, base - 11);
    c.quadraticCurveTo(x + 6, base - 26, x, fy + 16);
    c.stroke();
    c.fillStyle = tint;
    c.beginPath(); c.ellipse(x, fy, 16, 19, 0, 0, TAU); c.fill();
    c.strokeStyle = "rgba(20,10,40,.4)"; c.lineWidth = 2; c.stroke();
    c.fillStyle = tint;
    c.beginPath();
    c.moveTo(x - 4, fy + 18); c.lineTo(x + 4, fy + 18); c.lineTo(x, fy + 24);
    c.closePath(); c.fill();
    c.fillStyle = "rgba(255,255,255,.7)";
    c.beginPath(); c.ellipse(x - 5, fy - 7, 4.5, 6, -0.4, 0, TAU); c.fill();
  } else {
    // a key
    const ky = base - 30 + bob;
    c.strokeStyle = tint; c.lineWidth = 6; c.lineCap = "round";
    c.beginPath(); c.moveTo(x, ky - 4); c.lineTo(x, ky + 18); c.stroke();
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(x, ky + 8); c.lineTo(x + 9, ky + 8);
    c.moveTo(x, ky + 15); c.lineTo(x + 7, ky + 15); c.stroke();
    c.fillStyle = tint;
    c.beginPath(); c.arc(x, ky - 12, 10, 0, TAU); c.fill();
    c.fillStyle = "#2c1f4a";
    c.beginPath(); c.arc(x, ky - 12, 4.4, 0, TAU); c.fill();
  }
  c.restore();
}

export function drawCracked(c, x, y, t) {
  c.fillStyle = "#4a3775";
  c.fillRect(x, y, TILE, TILE);
  c.fillStyle = "#5a4585";
  c.fillRect(x + 2, y + 2, TILE - 4, TILE - 6);
  c.strokeStyle = "rgba(20,10,40,.75)";
  c.lineWidth = 2.2; c.lineCap = "round";
  const seed = (x * 7 + y) % 5;
  c.beginPath();
  c.moveTo(x + 4, y + 6 + seed); c.lineTo(x + 15, y + 20); c.lineTo(x + 9, y + 34);
  c.moveTo(x + 15, y + 20); c.lineTo(x + 28, y + 14);
  c.moveTo(x + 28, y + 14); c.lineTo(x + 36, y + 30);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,.07)";
  c.fillRect(x + 2, y + 2, TILE - 4, 3);
}

export function drawGate(c, x, y, t) {
  c.fillStyle = "#4a3a6b";
  roundRect(c, x + 5, y, TILE - 10, TILE, 4); c.fill();
  c.fillStyle = "#6b5a92";
  roundRect(c, x + 8, y + 3, TILE - 16, TILE - 6, 3); c.fill();
  c.fillStyle = "#E0C04C";
  c.beginPath(); c.arc(x + TILE / 2, y + TILE / 2, 4.5, 0, TAU); c.fill();
}

export function drawUpdraft(c, x, y, t) {
  c.save();
  const g = c.createLinearGradient(0, y + TILE, 0, y);
  g.addColorStop(0, "rgba(127,191,224,0.22)");
  g.addColorStop(1, "rgba(127,191,224,0.02)");
  c.fillStyle = g;
  c.fillRect(x + 4, y, TILE - 8, TILE);
  c.strokeStyle = "rgba(207,234,248,.5)";
  c.lineWidth = 2; c.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.9 + i * 0.5 + x * 0.01) % 1);
    const yy = y + TILE - p * TILE;
    c.globalAlpha = Math.sin(p * Math.PI) * 0.8;
    c.beginPath();
    c.moveTo(x + 12 + i * 12, yy + 7);
    c.lineTo(x + 16 + i * 12, yy);
    c.lineTo(x + 20 + i * 12, yy + 7);
    c.stroke();
  }
  c.restore();
}
