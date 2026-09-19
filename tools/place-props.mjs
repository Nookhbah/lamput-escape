// Puts every disguise prop somewhere it actually does something.
//
// A hiding spot only earns its place if a doctor walks past it. This works out
// each doctor's patrol span (the contiguous floor it paces, bounded by walls
// and ledges), then seats one prop inside each span, away from the turn points
// so the doc reliably passes it in both directions.

import { readFileSync, writeFileSync } from "node:fs";
import { LEVELS, ROWS, COLS, isSolid, isOneWay } from "../js/levels.js";

const SPECIAL = "PE12ASBKGXU^~Cc=#-|Lo";

function analyse(grid) {
  const rows = grid.map((r) => r.split(""));
  const raw = (c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? "#" : rows[r][c]);
  const tile = (c, r) => {
    const ch = raw(c, r);
    return "PEo H12-|L^ASBKU".includes(ch) && ch !== "#" ? "." : ch;
  };
  const stand = (c, r) => isSolid(tile(c, r)) || isOneWay(tile(c, r));
  const blocked = (c, r) => isSolid(tile(c, r));

  const spans = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== "1" && ch !== "2") return;
    let L = c, R = c;
    while (!blocked(L - 1, r) && stand(L - 1, r + 1)) L--;
    while (!blocked(R + 1, r) && stand(R + 1, r + 1)) R++;
    spans.push({ r, L, R, doc: c });
  }));
  return { rows, spans, raw };
}

export function replace(grid) {
  const { rows, spans, raw } = analyse(grid);
  if (!spans.length) return null;                      // boss arena: no docs to dodge

  // lift the old props out
  const props = [];
  rows.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === "H") { props.push(1); rows[r][c] = "."; }
  }));
  if (!props.length) return null;

  // Share the props out across the spans, then spread them evenly WITHIN each
  // span. Two props on one span must not both land on the same third.
  const groups = spans.map(() => []);
  props.forEach((_, i) => groups[i % spans.length].push(i));

  const placed = [];
  const free = (c, r) => raw(c, r) === "." && rows[r][c] === ".";
  groups.forEach((members, si) => {
    const span = spans[si];
    const width = span.R - span.L;
    members.forEach((_, j) => {
      const frac = (j + 1) / (members.length + 1);
      const ideal = span.L + Math.round(width * frac);
      let put = null;
      for (let off = 0; off <= width && put === null; off++) {
        for (const c of [ideal - off, ideal + off]) {
          if (c < span.L + 1 || c > span.R - 1) continue;   // not jammed against a wall
          if (Math.abs(c - span.doc) < 2) continue;         // not on his toes
          if (placed.some((p) => p.r === span.r && Math.abs(p.c - c) < 5)) continue;
          if (!free(c, span.r)) continue;
          put = { c, r: span.r };
          break;
        }
      }
      // a span too narrow to hold it? put it on one of the others rather than
      // dropping the prop entirely
      if (!put) {
        for (const alt of spans) {
          if (alt === span) continue;
          const w2 = alt.R - alt.L;
          for (let off = 0; off <= w2 && !put; off++) {
            for (const c of [alt.L + Math.round(w2 / 2) - off, alt.L + Math.round(w2 / 2) + off]) {
              if (c < alt.L + 1 || c > alt.R - 1) continue;
              if (Math.abs(c - alt.doc) < 2) continue;
              if (placed.some((q) => q.r === alt.r && Math.abs(q.c - c) < 5)) continue;
              if (!free(c, alt.r)) continue;
              put = { c, r: alt.r };
              break;
            }
          }
          if (put) break;
        }
      }
      if (put) { rows[put.r][put.c] = "H"; placed.push(put); }
      else console.log("   (no room anywhere for one prop)");
    });
  });
  return { grid: rows.map((r) => r.join("")), placed, spans };
}

// ---- rewrite the level file ----
const path = new URL("../js/levels.js", import.meta.url);
let src = readFileSync(path, "utf8");
let changed = 0;

for (const def of LEVELS) {
  const out = replace(def.grid);
  if (!out) continue;
  const same = out.grid.every((r, i) => r === def.grid[i]);
  if (same) { console.log(`= ${def.name}: already well placed`); continue; }
  const before = def.grid.map((r) => `      "${r}",`).join("\n");
  const after = out.grid.map((r) => `      "${r}",`).join("\n");
  if (!src.includes(before)) { console.log(`! ${def.name}: could not locate grid`); continue; }
  src = src.replace(before, after);
  changed++;
  console.log(`+ ${def.name}: props -> ${out.placed.map((p) => `(${p.c},${p.r})`).join(" ")}  ` +
    `[doc spans ${out.spans.map((s) => `${s.L}-${s.R}@r${s.r}`).join(", ")}]`);
}
writeFileSync(path, src);
console.log(`\n${changed} level(s) rewritten`);
