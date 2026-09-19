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
export function drawLamput(ctx, p, t) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  if (p.morphed) { drawMorphedBlob(ctx, p, t); return; }

  // A landing leaves him wobbling, and the wobble decays — that is what makes
  // him read as goo rather than a ball with a face.
  const j = (p.jiggle || 0) * Math.sin(t * 24) * 0.19;
  const sq = p.squash * (1 - j);
  const rx = (p.w / 2 + 3) * (1 / sq) * (1 + j * 0.5);
  const ry = (p.h / 2 + 3) * sq;
  const face = p.facing;
  const flash = p.invuln > 0 && Math.floor(t * 18) % 2;

  const SKIN = {
    heavy:  { hi: "#cfc6e4", mid: "#8A8FA8", lo: "#4d5169", edge: "rgba(35,30,60,0.6)" },
    spring: { hi: "#ffe08a", mid: "#E0B23C", lo: "#9c6c15", edge: "rgba(110,70,0,0.55)" },
    float:  { hi: "#e2f4ff", mid: "#7FBFE0", lo: "#41769b", edge: "rgba(20,60,90,0.55)" },
    key:    { hi: "#fff0a8", mid: "#E0C04C", lo: "#9c7f14", edge: "rgba(110,85,0,0.55)" },
  };
  const sk = SKIN[p.form] || { hi: "#ffa54d", mid: "#ff7a1a", lo: "#e2560b", edge: "rgba(120,44,0,0.55)" };

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, p.shadowY ?? (p.y + p.h + 3), p.w * 0.45, 5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (p.dashTime > 0) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = sk.hi;
    for (let i = 1; i <= 3; i++) {
      blobPath(ctx, cx - p.vx * 0.012 * i, cy - p.vy * 0.012 * i, rx * (1 - i * 0.12), ry * (1 - i * 0.12), 0.05, t);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }


  // body shape follows the form
  if (p.form === "heavy") {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.2, cy - ry * 0.55);
    ctx.lineTo(cx + rx * 1.2, cy - ry * 0.55);
    ctx.lineTo(cx + rx * 0.72, cy - ry * 0.05);
    ctx.lineTo(cx + rx * 0.95, cy + ry);
    ctx.lineTo(cx - rx * 0.95, cy + ry);
    ctx.lineTo(cx - rx * 0.72, cy - ry * 0.05);
    ctx.closePath();
  } else if (p.form === "spring") {
    const st = Math.max(0.88, Math.min(1.5, 1 - p.vy / 880));
    blobPath(ctx, cx, cy, rx * (1 / st) * 0.9, ry * st * 1.16, 0.07 + Math.abs(j) * 0.18, t * 1.5);
  } else if (p.form === "float") {
    blobPath(ctx, cx, cy - ry * 0.16, rx * 1.03, ry * 1.16, 0.05 + Math.abs(j) * 0.15, t * 0.9);
  } else {
    blobPath(ctx, cx, cy, rx, ry, 0.07 + Math.abs(p.vx) * 0.0001 + Math.abs(j) * 0.2, t * 1.5);
  }
  // flat fill, one flat shade on the lower half. No gradient, no shine.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = flash ? "#ffffff" : sk.mid;
  ctx.fillRect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
  if (!flash) {
    ctx.fillStyle = sk.lo;
    ctx.fillRect(cx - rx * 2, cy + ry * 0.28, rx * 4, ry * 2);
  }
  ctx.restore();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = sk.edge;
  ctx.stroke();

  if (p.form === "spring") {
    ctx.strokeStyle = "rgba(110,70,0,0.4)"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const yy = cy - ry * 0.5 + i * ry * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.72, yy);
      ctx.quadraticCurveTo(cx, yy + ry * 0.2, cx + rx * 0.72, yy - ry * 0.05);
      ctx.stroke();
    }
  } else if (p.form === "heavy") {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(cx - rx * 1.0, cy - ry * 0.48, rx * 1.7, 3);
  } else if (p.form === "float") {
    ctx.fillStyle = sk.lo;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + ry * 0.92); ctx.lineTo(cx + 4, cy + ry * 0.92);
    ctx.lineTo(cx, cy + ry * 1.28); ctx.closePath(); ctx.fill();
  } else if (p.form === "key") {
    ctx.strokeStyle = sk.lo; ctx.lineWidth = 4.5; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + rx * 0.5, cy + ry * 0.45); ctx.lineTo(cx + rx * 1.5, cy + ry * 0.45);
    ctx.moveTo(cx + rx * 1.2, cy + ry * 0.45); ctx.lineTo(cx + rx * 1.2, cy + ry * 0.95);
    ctx.moveTo(cx + rx * 1.5, cy + ry * 0.45); ctx.lineTo(cx + rx * 1.5, cy + ry * 1.0);
    ctx.stroke();
  }

  const ex = rx * 0.34, ey = -ry * 0.16 + j * ry * 0.5, er = Math.min(rx, ry) * 0.31;
  const lookX = face * 0.6 + Math.max(-1, Math.min(1, p.vx / 260)) * 0.4;
  const lookY = Math.max(-1, Math.min(1, p.vy / 400));
  eye(ctx, cx - ex, cy + ey, er, lookX, lookY, p.blink);
  eye(ctx, cx + ex, cy + ey, er, lookX, lookY, p.blink);

  ctx.strokeStyle = "#7a2a05";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const my = cy + ry * 0.42;
  if (p.scared > 0) {
    ctx.ellipse(cx, my, rx * 0.2, ry * 0.18, 0, 0, TAU);
    ctx.fillStyle = "#5b1d05";
    ctx.fill();
  } else {
    ctx.arc(cx, my - ry * 0.2, rx * 0.34, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  ctx.strokeStyle = sk.lo;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const whip = j * 26 + Math.sin(t * 3.2) * 3;
  ctx.moveTo(cx + face * 3, cy - ry * 0.95);
  ctx.quadraticCurveTo(cx + face * 12 + whip, cy - ry * 1.45, cx + face * 2 + whip * 1.4, cy - ry * 1.7);
  ctx.stroke();
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

export function drawTrap(ctx, x, y, t) {
  ctx.save();
  ctx.fillStyle = "#3a2350";
  ctx.fillRect(x, y + TILE - 10, TILE, 10);
  const spark = 0.5 + Math.sin(t * 9 + x * 0.1) * 0.5;
  ctx.strokeStyle = `rgba(255,90,140,${0.55 + spark * 0.45})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const sx = x + 5 + i * 10;
    ctx.beginPath();
    ctx.moveTo(sx, y + TILE - 10);
    ctx.lineTo(sx + 4, y + TILE - 18 - spark * 4);
    ctx.lineTo(sx - 2, y + TILE - 24 - spark * 5);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,120,160,${0.2 + spark * 0.2})`;
  ctx.fillRect(x, y + TILE - 26, TILE, 16);
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
  ctx.save();
  ctx.fillStyle = "#6d4fa8";
  roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
  ctx.fillStyle = "#8f73cc";
  ctx.fillRect(p.x + 4, p.y + 3, p.w - 8, 3);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 4; i++) ctx.fillRect(p.x + 8 + i * 18, p.y + 10, 10, 4);
  ctx.restore();
}

// ------------------------------------------------------------------- boss ---
export function drawBoss(ctx, b, t) {
  if (b.dead) return;
  const cx = b.cx, y = b.y;
  const hot = b.vulnerable;
  const flash = b.flash > 0 && Math.floor(t * 30) % 2;

  ctx.save();
  if (b.state === "dying") {
    ctx.translate(Math.sin(t * 40) * 3, 0);
    ctx.globalAlpha = 0.85;
  }

  // hover shadow on the floor
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, 522, b.w * 0.42, 9, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = b.state === "dying" ? 0.85 : 1;

  // ---- suction hose + nozzle ----
  const nx = b.nozzleX, ny = b.nozzleY;
  ctx.strokeStyle = "#4a4470";
  ctx.lineWidth = 15;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, y + b.h - 10);
  ctx.quadraticCurveTo(cx + Math.sin(t * 2) * 8, y + b.h + 6, nx, ny - 6);
  ctx.stroke();
  ctx.strokeStyle = "#5f588c";
  ctx.lineWidth = 9;
  ctx.stroke();

  ctx.fillStyle = hot ? "#5a5480" : "#7a6fb0";
  ctx.beginPath();
  ctx.moveTo(nx - 20, ny + 16);
  ctx.lineTo(nx + 20, ny + 16);
  ctx.lineTo(nx + 10, ny - 6);
  ctx.lineTo(nx - 10, ny - 6);
  ctx.closePath();
  ctx.fill();

  // ---- charging / sucking funnel ----
  if (b.state === "telegraph") {
    const r = 34 + b.charge * 26;
    ctx.globalAlpha = 0.35 + b.charge * 0.5;
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(nx, ny + 12, r * (1 - b.charge * 0.55), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (b.state === "suck") {
    const reach = 360;
    const spread = Math.tan(0.62) * reach;
    const g = ctx.createLinearGradient(nx, ny, nx, ny + reach);
    g.addColorStop(0, "rgba(120,220,255,0.42)");
    g.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(nx - 12, ny + 10);
    ctx.lineTo(nx + 12, ny + 10);
    ctx.lineTo(nx + spread, ny + reach);
    ctx.lineTo(nx - spread, ny + reach);
    ctx.closePath();
    ctx.fill();
    // inrushing streaks
    ctx.strokeStyle = "rgba(200,245,255,0.6)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const p = ((t * 1.7 + i / 9) % 1);
      const d = reach * (1 - p);
      const off = (i / 9 - 0.5) * 2 * Math.tan(0.62) * d;
      ctx.globalAlpha = p * 0.8;
      ctx.beginPath();
      ctx.moveTo(nx + off, ny + d);
      ctx.lineTo(nx + off * 0.78, ny + d - 22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- chassis ----
  ctx.fillStyle = flash ? "#ffffff" : hot ? "#6b4a5e" : "#4a4470";
  roundRect(ctx, b.x, y, b.w, b.h, 16);
  ctx.fill();
  ctx.strokeStyle = flash ? "#fff" : "#2e2a4a";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = flash ? "#ffffff" : hot ? "#8a5f73" : "#5f588c";
  roundRect(ctx, b.x + 8, y + 7, b.w - 16, b.h * 0.42, 11);
  ctx.fill();

  // rivets
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(b.x + 18 + i * 23, y + b.h - 12, 3, 0, TAU);
    ctx.fill();
  }

  // hover jets
  ctx.fillStyle = hot ? "#ff8a5a" : "#7fe6ff";
  for (const sx of [b.x + 24, b.x + b.w - 24]) {
    ctx.globalAlpha = 0.55 + Math.sin(t * 14 + sx) * 0.25;
    ctx.beginPath();
    ctx.moveTo(sx - 9, y + b.h);
    ctx.lineTo(sx + 9, y + b.h);
    ctx.lineTo(sx, y + b.h + 20 + Math.sin(t * 18 + sx) * 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // warning lamp
  const lampOn = b.state === "telegraph" || b.state === "suck";
  ctx.fillStyle = lampOn && Math.floor(t * 9) % 2 ? "#ff4d6d" : "#5a3050";
  ctx.beginPath();
  ctx.arc(b.x + b.w - 18, y + 16, 6, 0, TAU);
  ctx.fill();

  // ---- the specimen jar / core on top ----
  const core = b.coreBox();
  const ccx = core.x + core.w / 2, ccy = core.y + core.h / 2;
  // mounting struts
  ctx.strokeStyle = "#2e2a4a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ccx - 18, core.y + core.h); ctx.lineTo(ccx - 12, y + 4);
  ctx.moveTo(ccx + 18, core.y + core.h); ctx.lineTo(ccx + 12, y + 4);
  ctx.stroke();

  if (hot) {
    // shielding retracts and the core glows — the window to strike
    const pulse = 0.6 + Math.sin(t * 12) * 0.4;
    ctx.globalAlpha = 0.5 * pulse;
    const halo = ctx.createRadialGradient(ccx, ccy, 4, ccx, ccy, 56);
    halo.addColorStop(0, "rgba(255,90,60,0.95)");
    halo.addColorStop(1, "rgba(255,90,60,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(ccx, ccy, 56, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#3a2350";
    roundRect(ctx, core.x - 4, core.y - 4, core.w + 8, core.h + 8, 10); ctx.fill();
    const cg = ctx.createRadialGradient(ccx - 6, ccy - 8, 2, ccx, ccy, core.w * 0.7);
    cg.addColorStop(0, "#fff3c4");
    cg.addColorStop(0.45, "#ff9a3c");
    cg.addColorStop(1, "#d8384a");
    ctx.fillStyle = cg;
    roundRect(ctx, core.x, core.y, core.w, core.h, 8); ctx.fill();
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // heat bars
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(core.x + 8, core.y + 8 + i * 11, (core.w - 16) * pulse, 4);
    }
    ctx.fillStyle = "#fff";
    ctx.font = '800 11px "Baloo 2", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("HIT ME", ccx, core.y - 12);
    ctx.textAlign = "left";
  } else {
    // armoured: a sealed jar with a captured goo sloshing inside
    ctx.fillStyle = "#3a3560";
    roundRect(ctx, core.x - 5, core.y - 5, core.w + 10, core.h + 10, 11); ctx.fill();
    ctx.fillStyle = "rgba(180,230,255,0.3)";
    roundRect(ctx, core.x, core.y, core.w, core.h, 8); ctx.fill();
    ctx.strokeStyle = "#6f68a8";
    ctx.lineWidth = 2.5;
    roundRect(ctx, core.x, core.y, core.w, core.h, 8); ctx.stroke();
    ctx.fillStyle = "#4ee6b8";
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(ccx + Math.sin(t * 2.2) * 6, core.y + core.h - 12, 15, 9, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#8f88c8";
    ctx.fillRect(core.x + 6, core.y - 9, core.w - 12, 7);
  }

  // ---- the two docs riding along ----
  if (!b.dismounted) {
    const panic = hot || b.state === "dying";
    // Fat Doc at the wheel
    const fx0 = b.x + 34, fy0 = y + 26;
    ctx.fillStyle = "#f0cfa8";
    ctx.beginPath(); ctx.arc(fx0, fy0, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = "#4ec1c8";
    ctx.beginPath(); ctx.arc(fx0, fy0 - 3, 13, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(fx0 - 4, fy0 - 1, 4, 0, TAU); ctx.arc(fx0 + 5, fy0 - 1, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1a1a26";
    ctx.beginPath();
    ctx.arc(fx0 - 4, fy0 - 1 + (panic ? -1.5 : 0), 2, 0, TAU);
    ctx.arc(fx0 + 5, fy0 - 1 + (panic ? -1.5 : 0), 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#4a3428";
    ctx.beginPath();
    ctx.ellipse(fx0 - 4, fy0 + 7, 5.5, 3, -0.3, 0, TAU);
    ctx.ellipse(fx0 + 5, fy0 + 7, 5.5, 3, 0.3, 0, TAU);
    ctx.fill();

    // Skinny Doc working the hose
    const sx0 = b.x + b.w - 36, sy0 = y + 24;
    ctx.fillStyle = "#f0cfa8";
    ctx.beginPath(); ctx.ellipse(sx0, sy0, 11, 13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#3a2c25"; ctx.lineWidth = 2.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(sx0 + i * 5, sy0 - 12); ctx.lineTo(sx0 + i * 6, sy0 - 19);
      ctx.stroke();
    }
    ctx.strokeStyle = "#2b2f45"; ctx.lineWidth = 2;
    ctx.fillStyle = panic ? "#ffe7a8" : "#cfe6ff";
    ctx.beginPath(); ctx.arc(sx0 - 5, sy0 - 1, 4.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx0 + 6, sy0 - 1, 4.6, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1a1a26";
    ctx.beginPath(); ctx.arc(sx0 - 5, sy0 - 1, 2, 0, TAU); ctx.arc(sx0 + 6, sy0 - 1, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e0b184";
    ctx.beginPath(); ctx.ellipse(sx0 + 10, sy0 + 4, 3.5, 2.6, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawBolt(ctx, b, t) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin);
  ctx.fillStyle = "#3a2350";
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#ff4d6d";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
  ctx.fillStyle = Math.floor(t * 14) % 2 ? "#ffd84d" : "#ff4d6d";
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawZap(ctx, z, t) {
  const a = Math.min(1, z.life / z.max * 1.8);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = "#ff8fa3";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    const sx = z.x - 18 + i * 9;
    ctx.beginPath();
    ctx.moveTo(sx, z.y + TILE);
    ctx.lineTo(sx + 5, z.y + TILE - 10 - Math.sin(t * 20 + i) * 5);
    ctx.lineTo(sx - 2, z.y + TILE - 22 - Math.cos(t * 17 + i) * 5);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,120,160,0.28)";
  ctx.fillRect(z.x - 22, z.y + TILE - 22, 44, 22);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ------------------------------------------------------- morph pads & tiles
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
