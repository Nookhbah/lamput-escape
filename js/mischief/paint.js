// Painting toolkit.
//
// The previous pass drew primitives — trapezoids, rounded rects, a grid. This
// is the stuff that makes drawn art read as drawn: wobbly ink that never quite
// closes, fills that sit slightly off their outline like cheap printing, grain
// over everything, and light that comes from somewhere specific.
//
// All jitter is seeded per shape so it holds still between frames instead of
// crawling.

export const TAU = Math.PI * 2;

// deterministic per-shape noise
export function jit(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
}

// A closed hand-inked outline through points, with the ends overshooting
// slightly the way a pen does.
export function inkPath(c, pts, seed, amp) {
  const j = jit(seed);
  const n = pts.length;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const x = p[0] + j() * amp, y = p[1] + j() * amp;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

// Organic blob outline — the base shape for almost everything soft.
export function blobPts(cx, cy, rx, ry, seed, t, lobes) {
  const j = jit(seed);
  const pts = [];
  const steps = 34;
  const off = [];
  for (let i = 0; i < steps; i++) off.push(j());
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const k = 1 + off[i] * 0.06 + Math.sin(a * (lobes || 3) + t * 1.6) * 0.022;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

// Fill, then a darker outline nudged off-register. The misalignment is the
// whole trick — it reads as printed rather than vector.
export function inked(c, pts, seed, fill, line, opts) {
  opts = opts || {};
  const amp = opts.amp == null ? 1.1 : opts.amp;
  const w = opts.w == null ? 2.6 : opts.w;
  const dx = opts.dx == null ? 0.9 : opts.dx;
  const dy = opts.dy == null ? 1.1 : opts.dy;

  if (fill) {
    c.save();
    c.translate(dx, dy);
    inkPath(c, pts, seed + 7, amp * 0.7);
    c.fillStyle = fill;
    c.fill();
    c.restore();
  }
  if (line) {
    inkPath(c, pts, seed, amp);
    c.strokeStyle = line;
    c.lineWidth = w;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();
  }
}

// Shadow cast away from the key light, soft and stretched.
export function contact(c, x, y, w, h, alpha) {
  c.save();
  c.globalAlpha = alpha == null ? 0.2 : alpha;
  const g = c.createRadialGradient(x, y, 1, x, y, w);
  g.addColorStop(0, "rgba(72,58,86,.85)");
  g.addColorStop(0.6, "rgba(72,58,86,.32)");
  g.addColorStop(1, "rgba(72,58,86,0)");
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(x + w * 0.22, y, w, h || w * 0.28, 0, 0, TAU);
  c.fill();
  c.restore();
}

// A stroke that thins toward its end, like a brush lifting.
export function taper(c, pts, color, w0, w1) {
  for (let i = 0; i < pts.length - 1; i++) {
    const f = i / (pts.length - 1);
    c.strokeStyle = color;
    c.lineWidth = w0 + (w1 - w0) * f;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(pts[i][0], pts[i][1]);
    c.lineTo(pts[i + 1][0], pts[i + 1][1]);
    c.stroke();
  }
}

// ---------------------------------------------------------------- textures
let grainTile = null;
export function grain(c, w, h, alpha) {
  if (!grainTile) {
    const s = 168;
    grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = s;
    const g = grainTile.getContext("2d");
    const img = g.createImageData(s, s);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = 128 + ((seed / 2147483647) - 0.5) * 210;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  c.save();
  c.globalAlpha = alpha == null ? 0.07 : alpha;
  c.globalCompositeOperation = "overlay";
  const p = c.createPattern(grainTile, "repeat");
  c.fillStyle = p;
  c.fillRect(0, 0, w, h);
  c.restore();
}

export function vignette(c, w, h, strength) {
  const g = c.createRadialGradient(w * 0.46, h * 0.44, h * 0.28, w * 0.5, h * 0.5, h * 1.18);
  g.addColorStop(0, "rgba(40,28,52,0)");
  g.addColorStop(1, "rgba(40,28,52," + (strength == null ? 0.42 : strength) + ")");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

// Warm haze in the lit half of the frame.
export function sunHaze(c, w, h, x, alpha) {
  const g = c.createRadialGradient(x, h * 0.12, 20, x, h * 0.3, h * 1.1);
  g.addColorStop(0, "rgba(255,214,150," + (alpha || 0.5) + ")");
  g.addColorStop(1, "rgba(255,214,150,0)");
  c.save();
  c.globalCompositeOperation = "screen";
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.restore();
}
