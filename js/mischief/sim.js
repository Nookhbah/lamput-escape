// Deterministic, level-driven mischief sim.
//
// Fixed timestep, seeded RNG, no wall-clock: the same rig replays identically,
// which is what makes instant retry (and later, rewind) possible.
//
// Interactions are authored against TRAITS, never against specific objects, so
// one rule covers every wet thing and every live thing.

import { WORLD, FLOOR } from "./levels.js";

export const TICK = 1 / 60;
export { WORLD, FLOOR };

export const TRAIT = {
  bucket:  ["WET", "LOOSE"],
  plant:   ["THIRSTY"],
  cable:   ["LIVE"],
  lamp:    ["HANGS"],
  hook:    ["HANGS", "WOBBLY"],
  cooler:  ["TALL", "WET"],
  trolley: ["ROLLS"],
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const has = (p, tr) => !!p && (TRAIT[p.type] || []).indexOf(tr) >= 0;

export function createSim(level, rig, seed) {
  const props = [];
  for (const f of level.fixed) {
    props.push({ ...f, id: f.type + "@" + f.x, fixed: true, swing: 0, toppled: false, vx: 0 });
  }
  for (const type of Object.keys(rig)) {
    const slotId = rig[type];
    if (!slotId) continue;
    const slot = level.slots.find((s) => s.id === slotId);
    if (!slot) continue;
    props.push({ id: type, type, x: slot.x, y: slot.y, slot: slotId, vx: 0, swing: 0, toppled: false });
  }

  const docs = [{
    id: 0, x: level.docStart, facing: 1, task: 0, timer: 0, state: "walk",
    stun: 0, soaked: 0, gone: false, route: level.route,
  }];
  if (level.route2) {
    docs.push({
      id: 1, x: level.doc2Start, facing: -1, task: 0, timer: 0, state: "walk",
      stun: 0, soaked: 0, gone: false, route: level.route2,
    });
  }

  return {
    rng: mulberry32(seed >>> 0),
    level, tick: 0, props, docs,
    puddles: [], queue: [], log: [], nextId: 1,
    over: false, overAt: 0,
  };
}

export const prop = (S, id) => S.props.find((p) => p.id === id);
const byTrait = (S, tr) => S.props.filter((p) => has(p, tr));

function schedule(S, type, data, delay, parent) {
  S.queue.push({
    id: S.nextId++, at: S.tick + Math.round(delay / TICK),
    type, data: data || {}, parent: parent == null ? null : parent,
  });
}

// --------------------------------------------------------------- rule table
function react(S, ev) {
  const D = ev.data, id = ev.id;
  switch (ev.type) {
    case "water": {
      const plant = S.props.find((p) => has(p, "THIRSTY"));
      if (!plant) break;
      const live = byTrait(S, "LIVE").find((w) => Math.abs(w.x - plant.x) < 54);
      if (live) schedule(S, "spark", { x: plant.x }, 0.5, id);
      break;
    }
    case "spark": {
      const hang = byTrait(S, "HANGS").find((h) => Math.abs(h.x - D.x) < 95);
      if (hang) { hang.swing = 1; schedule(S, "swing", { x: hang.x }, 0.34, id); }
      break;
    }
    case "jostle": {
      // he stops under something flimsy; it does not stay balanced
      const wob = byTrait(S, "WOBBLY").find((h) => Math.abs(h.x - D.x) < 50);
      if (!wob) break;
      const loose = byTrait(S, "LOOSE").find((l) => Math.abs(l.x - wob.x) < 50 && l.y < FLOOR - 40);
      if (loose) schedule(S, "fall", { who: loose.id, x: loose.x }, 0.34, id);
      break;
    }
    case "swing": {
      const loose = byTrait(S, "LOOSE").find((l) => Math.abs(l.x - D.x) < 64 && l.y < FLOOR - 40);
      if (loose) schedule(S, "fall", { who: loose.id, x: loose.x }, 0.3, id);
      break;
    }
    case "fall": {
      const it = prop(S, D.who);
      if (!it) break;
      it.y = FLOOR; it.x += 28;
      const under = S.docs.find((d) => !d.gone && Math.abs(d.x - D.x) < 54);
      schedule(S, "splash", { x: D.x, doc: under ? under.id : null }, 0.2, id);
      break;
    }
    case "splash": {
      S.puddles.push({ x: D.x, r: 66 });
      if (D.doc != null) {
        const d = S.docs[D.doc];
        d.soaked = 1; d.stun = 1.2;
        schedule(S, "soak", {}, 0.08, id);
      }
      break;
    }
    case "soak": break;
    case "slip": {
      const d = S.docs[D.doc];
      d.stun = 1.2;
      const roll = byTrait(S, "ROLLS").find((r) => Math.abs(r.x - d.x) < 200);
      if (roll) schedule(S, "shove", { who: roll.id, dir: Math.sign(roll.x - d.x) || 1 }, 0.2, id);
      break;
    }
    case "shove": {
      const r = prop(S, D.who);
      if (r) r.vx = 300 * D.dir;
      break;
    }
    case "hit": {
      const tall = prop(S, D.what);
      if (tall && !tall.toppled) schedule(S, "topple", { what: D.what }, 0.14, id);
      break;
    }
    case "topple": {
      const tall = prop(S, D.what);
      if (!tall) break;
      tall.toppled = true;
      if (has(tall, "WET")) schedule(S, "flood", { x: tall.x }, 0.3, id);
      break;
    }
    case "flood": {
      S.puddles.push({ x: D.x - 62, r: 92 });
      S.puddles.push({ x: D.x + 62, r: 92 });
      break;
    }
  }
}

// ----------------------------------------------------------------- stepping
export function step(S) {
  if (S.over) return;
  S.tick++;

  for (let i = S.queue.length - 1; i >= 0; i--) {
    if (S.queue[i].at <= S.tick) {
      const ev = S.queue.splice(i, 1)[0];
      S.log.push(ev);
      if (ev.type !== "jostle") S.lastEventTick = S.tick;
      react(S, ev);
    }
  }

  for (const r of byTrait(S, "ROLLS")) {
    if (!r.vx) continue;
    r.x += r.vx * TICK;
    r.vx *= 0.982;
    if (Math.abs(r.vx) < 12) r.vx = 0;
    for (const tall of byTrait(S, "TALL")) {
      if (!tall.toppled && Math.abs(r.x - tall.x) < 48) {
        r.vx = 0;
        schedule(S, "hit", { what: tall.id }, 0, null);
      }
    }
    if (r.x < 40 || r.x > WORLD.w - 40) r.vx = 0;
  }

  for (const p of S.props) if (p.swing > 0) p.swing = Math.max(0, p.swing - TICK * 0.5);

  let allGone = true;
  for (const d of S.docs) {
    if (d.soaked > 0) d.soaked = Math.max(0, d.soaked - TICK * 0.1);
    if (d.gone) continue;
    allGone = false;
    if (d.stun > 0) { d.stun -= TICK; continue; }

    const t = d.route[d.task];
    if (!t) { d.gone = true; continue; }

    if (Math.abs(t.x - d.x) > 3 && d.state !== "acting") {
      d.facing = t.x < d.x ? -1 : 1;
      d.state = "walk";
      d.x += Math.sign(t.x - d.x) * Math.min(Math.abs(t.x - d.x), 232 * TICK);
      for (const p of S.puddles) {
        if (!p.used && Math.abs(d.x - p.x) < p.r * 0.45) {
          p.used = true;
          schedule(S, "slip", { doc: d.id }, 0, null);
          break;
        }
      }
      continue;
    }
    if (t.act === "leave") { d.gone = true; continue; }
    if (d.state !== "acting") {
      d.state = "acting";
      d.timer = 0;
      if (t.act === "water") schedule(S, "water", {}, 0, null);
      schedule(S, "jostle", { x: d.x }, 0.25, null);
    }
    d.timer += TICK;
    if (d.timer >= (t.dur || 1)) {
      d.timer = 0; d.task++; d.state = "walk";
    }
  }
  // The round is over when the gag has finished, not when he has walked off
  // screen. Waiting for his commute was most of the dead air.
  // Only once every doctor has finished his actual work — otherwise this cuts
  // the cascade off halfway, because the queue empties between links.
  const onLastLeg = S.docs.every((d) => d.gone || d.task >= d.route.length - 1);
  // A puddle nobody has stepped in yet is a trap that has not gone off, so the
  // round is not over no matter how quiet it looks.
  const armed = S.puddles.some((p) => !p.used) && S.docs.some((d) => !d.gone);
  const quiet = S.queue.length === 0 && S.log.length > 0 && onLastLeg && !armed &&
                S.tick - (S.lastEventTick || 0) > 66 &&
                !S.docs.some((d) => d.stun > 0) &&
                !S.props.some((p) => p.vx);
  if ((allGone || quiet) && !S.over) { S.over = true; S.overAt = S.tick; }
}

// ------------------------------------------------------------------ scoring
const SCORED = ["spark", "swing", "fall", "splash", "soak", "slip", "shove", "hit", "topple", "flood"];

export function score(S) {
  const chain = S.log.filter((e) => SCORED.indexOf(e.type) >= 0).length;
  const par = S.level.par;
  let stars = 0;
  for (let i = 0; i < par.length; i++) if (chain >= par[i]) stars = i + 1;
  return { chain, stars, soaked: S.log.some((e) => e.type === "soak") };
}
