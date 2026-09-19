// Reachability check for every level.
//
// Builds a graph of standable surfaces, floods it from Lamput's spawn using a
// conservative jump envelope derived from the real physics constants, then
// asserts every orb, prop and the exit sit inside that flood. Catches the
// "orb parked on a platform nobody can climb to" class of bug.

import { readFileSync } from "node:fs";
import { LEVELS, TILE, COLS, ROWS, isSolid, isOneWay } from "../js/levels.js";

// --- pull the real constants out of entities.js so this can't drift ---
const src = readFileSync(new URL("../js/entities.js", import.meta.url), "utf8");
const num = (re) => Number(src.match(re)[1]);
const GRAVITY = num(/GRAVITY = (\d+)/);
const JUMP_V = Math.abs(num(/JUMP_V = -(\d+)/));
const DOUBLE_V = Math.abs(num(/DOUBLE_V = -(\d+)/));
const SPEED = num(/maxSpeed = sticky \? \d+ : (\d+)/);

const rise = (v) => (v * v) / (2 * GRAVITY);
const MAX_RISE = rise(JUMP_V) + rise(DOUBLE_V);
// Budget the WORST case, not the best. Measured in-engine: a double jump with
// the second hop pressed early climbs 214px against a 304px theoretical peak,
// so credit 70%. Anything above that passes the checker and still fails for a
// player who does not time the bounce perfectly.
const SAFE_RISE = MAX_RISE * 0.70;

// How far you can move horizontally while climbing `dy`. Climbing high eats the
// airtime, so the reach shrinks as dy approaches the ceiling.
// A level that hands out a morph form is meant to be traversed with it, so the
// envelope has to account for the form or the checker condemns the very jumps
// the level was designed around. Measured in-engine: spring is ~2.1x the normal
// peak, the blimp roughly doubles horizontal range on the way down.
function reach(dy, boost) {
  boost = boost || { rise: 1, glide: 1 };
  const ceiling = SAFE_RISE * boost.rise;
  if (dy > ceiling) return -1;
  if (dy < 0) return (200 + Math.min(320, -dy) * 0.7) * boost.glide;
  const t = 1 - dy / ceiling;
  return (40 + t * (SPEED * 0.95)) * boost.glide;
}

function boostFor(def) {
  const all = def.grid.join("");
  return {
    rise: all.includes("S") ? 2.0 : 1,
    glide: all.includes("B") ? 1.9 : 1,
  };
}

function analyse(def) {
  const boost = boostFor(def);
  const rows = def.grid.map((r) => r.split(""));
  const raw = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? "#" : rows[r][c]);
  const tile = (c, r) => { const ch = raw(c, r); return "PEo H12-|L^ASBKU".includes(ch) && ch !== "#" ? "." : ch; };
  const stand = (c, r) => isSolid(tile(c, r)) || isOneWay(tile(c, r));

  // every tile-top you can stand on
  const surfaces = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!stand(c, r)) continue;
      if (isSolid(tile(c, r - 1))) continue;   // buried
      surfaces.push({ id: surfaces.length, x: c * TILE + TILE / 2, y: r * TILE, c, r });
    }
  }

  // Lifts are standable too, anywhere along their sweep. Geometry mirrors the
  // Lift constructor and the World parser in game.js.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = raw(c, r);
      if (ch !== "-" && ch !== "|") continue;
      const ox = c * TILE - TILE / 2, oy = r * TILE + 20;
      const range = ch === "-" ? TILE * 3.2 : TILE * 2.6;
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const o = (i / steps) * 2 * range - range;
        surfaces.push({
          id: surfaces.length,
          x: ox + TILE + (ch === "-" ? o : 0),
          y: oy + (ch === "|" ? o : 0),
          lift: true,
        });
      }
    }
  }

  // locate the things that must be reachable
  let spawn = null, exit = null;
  const orbs = [], props = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = raw(c, r);
      const x = c * TILE + TILE / 2;
      if (ch === "P") spawn = { x, y: r * TILE + TILE };
      else if (ch === "E") exit = { x, y: r * TILE + TILE, what: "exit" };
      else if (ch === "o") orbs.push({ x, y: r * TILE + TILE / 2, what: `orb(${c},${r})` });
      else if (ch === "H") props.push({ x, y: r * TILE + TILE, what: `prop(${c},${r})` });
    }
  }

  // flood the surface graph from the spawn's footing
  const start = surfaces.filter((s) => Math.abs(s.x - spawn.x) < TILE && s.y >= spawn.y - 4 && s.y <= spawn.y + TILE);
  const seen = new Set(start.map((s) => s.id));
  const queue = [...start];
  while (queue.length) {
    const a = queue.shift();
    for (const b of surfaces) {
      if (seen.has(b.id)) continue;
      const dy = a.y - b.y;                  // positive = b is higher
      const r = reach(dy, boost);
      if (r < 0) continue;
      if (Math.abs(b.x - a.x) > r) continue;
      seen.add(b.id);
      queue.push(b);
    }
  }
  const reached = surfaces.filter((s) => seen.has(s.id));

  // can a target be touched from any reached surface?
  const canTouch = (t, vertPad = 0) =>
    reached.some((s) => {
      const dy = s.y - t.y + vertPad;
      const r = reach(dy, boost);
      return r >= 0 && Math.abs(t.x - s.x) <= r;
    });

  const unreachable = [];
  const unfair = [];
  for (const t of [...orbs, ...props, exit]) if (!canTouch(t)) unreachable.push(t.what);

  // A hiding spot is only a hiding spot if a doctor walks past it. Props
  // stranded on ledges nobody patrols are decoration pretending to be a
  // mechanic.
  const spans = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = raw(c, r);
      if (ch !== "1" && ch !== "2") continue;
      let L = c, R = c;
      while (!isSolid(tile(L - 1, r)) && stand(L - 1, r + 1)) L--;
      while (!isSolid(tile(R + 1, r)) && stand(R + 1, r + 1)) R++;
      spans.push({ r, L, R });
    }
  }
  if (spans.length) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (raw(c, r) !== "H") continue;
        if (!spans.some((s) => s.r === r && c >= s.L && c <= s.R)) {
          unfair.push(`prop at (${c},${r}) sits where no doctor patrols`);
        }
      }
    }
  }

  // Anything you stand on must have something under it. Props and pads hanging
  // in mid-air look broken, and no amount of art fixes a floating object.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = raw(c, r);
      if (!"HASBK".includes(ch)) continue;
      if (!stand(c, r + 1)) unfair.push(`${ch} at (${c},${r}) floats in mid-air`);
    }
  }

  // Reachable is not the same as fair: an orb you can only grab by dropping
  // onto a zap-net is a trap, not a pickup.
  for (const o of orbs) {
    const c = Math.floor(o.x / TILE);
    for (let rr = Math.floor(o.y / TILE) + 1; rr < ROWS; rr++) {
      const ch = raw(c, rr);
      if (ch === "^") { unfair.push(`${o.what} drops onto a zap-net`); break; }
      if (stand(c, rr)) break;
    }
  }
  return { surfaces: surfaces.length, reached: reached.length, orbs: orbs.length, unreachable, unfair };
}

let failed = 0;
console.log(`physics: jump ${JUMP_V} / double ${DOUBLE_V} / gravity ${GRAVITY}`);
console.log(`peak climb ${MAX_RISE.toFixed(0)}px (budgeting ${SAFE_RISE.toFixed(0)}px), run speed ${SPEED}\n`);
for (const [i, def] of LEVELS.entries()) {
  const r = analyse(def);
  const problems = [...r.unreachable.map((u) => `unreachable ${u}`), ...r.unfair];
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  L${String(i + 1).padStart(2)}  ${def.name.padEnd(20)}` +
    `surfaces ${String(r.reached).padStart(3)}/${String(r.surfaces).padEnd(3)} orbs ${r.orbs}` +
    (ok ? "" : `   ${problems.join("; ")}`)
  );
}
console.log(failed ? `\n${failed} level(s) have unreachable or unfair pickups` : "\nevery orb, prop and exit is reachable, and every orb has a safe landing");
process.exit(failed ? 1 : 0);
