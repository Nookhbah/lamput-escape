// Flies an actual jump through the real Player physics and reports where you
// land. Written because the reachability checker's ESTIMATE said a jump was
// possible and the engine disagreed — an estimate is not a test.

import { LEVELS, TILE, COLS, ROWS, isSolid, isOneWay } from "../js/levels.js";
import { Player } from "../js/entities.js";

const noop = () => {};
const fx = { burst: noop, ring: noop, text: noop, addShake: noop };

function makeWorld(def) {
  const rows = def.grid.map((r) => r.split(""));
  const raw = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? "#" : rows[r][c]);
  const tile = (c, r) => {
    const ch = raw(c, r);
    return "PEo H12-|L^ASBKU".includes(ch) && ch !== "#" ? "." : ch;
  };
  return {
    rows, tile, lifts: [], props: [],
    solidAtPx: (x, y) => isSolid(tile(Math.floor(x / TILE), Math.floor(y / TILE))),
    supportAtPx: (x, y) => {
      const ch = tile(Math.floor(x / TILE), Math.floor(y / TILE));
      return isSolid(ch) || isOneWay(ch);
    },
  };
}

function input(held, hitOnce) {
  const hit = new Set(hitOnce || []);
  return {
    down: (k) => held.has(k),
    pressed: (k) => hit.has(k),
    clear: () => hit.clear(),
  };
}

// Jump from (col,row) with `form`, holding `dir`, second hop after `delay`.
export function fly(def, col, row, form, dir, delay) {
  const world = makeWorld(def);
  const p = new Player(col * TILE + 5, row * TILE - 30, { double: true, morph: true, dash: true, wall: true });
  p.form = form;
  p.invuln = 0;
  const STEP = 1 / 120;
  const held = new Set();
  if (dir) held.add(dir);

  const settle = input(held);
  for (let i = 0; i < 30; i++) p.update(STEP, settle, world, fx);
  const y0 = p.y;

  let peak = p.y, t = 0;
  held.add("jump");
  let inp = input(held, ["jump"]);
  p.update(STEP, inp, world, fx); inp.clear();
  for (let i = 0; i < Math.round(delay / STEP); i++) { p.update(STEP, inp, world, fx); peak = Math.min(peak, p.y); t += STEP; }
  inp = input(held, ["jump"]);
  p.update(STEP, inp, world, fx); inp.clear();
  for (let i = 0; i < 400; i++) {
    p.update(STEP, inp, world, fx);
    peak = Math.min(peak, p.y);
    t += STEP;
    if (p.onGround && t > 0.4) break;
  }
  return { climb: Math.round(y0 - peak), peakY: Math.round(peak), landY: Math.round(p.y), landCol: Math.round(p.cx / TILE), grounded: p.onGround };
}

// --- report ---
const name = process.argv[2];
if (name) {
  const def = LEVELS.find((l) => l.name === name);
  if (!def) { console.log("no level named " + name); process.exit(1); }
  console.log(def.name);
  def.grid.forEach((r, i) => console.log(String(i).padStart(2) + " " + r));
  const pads = [];
  def.grid.forEach((r, ri) => [...r].forEach((ch, ci) => { if ("ASBK".includes(ch)) pads.push({ ci, ri, ch }); }));
  const FORM = { A: "heavy", S: "spring", B: "float", K: "key" };
  console.log("");
  for (const pad of pads) {
    for (const dir of [null, "left", "right"]) {
      for (const delay of [0.15, 0.3, 0.45]) {
        const r = fly(def, pad.ci, pad.ri + 1, FORM[pad.ch], dir, delay);
        console.log(`pad ${pad.ch}@(${pad.ci},${pad.ri})  dir=${String(dir).padEnd(5)} hop@${delay}s  climb ${String(r.climb).padStart(3)}px  lands row ${String(Math.round(r.landY / TILE)).padStart(2)} col ${String(r.landCol).padStart(2)}`);
      }
    }
  }
}
