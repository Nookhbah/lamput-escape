// Levels teach by construction, not by text. Each one adds exactly one idea,
// and level 1 is impossible to get wrong.
//
// x positions are in world units (WORLD.w = 1000). FLOOR is where things stand.

export const WORLD = { w: 1000, h: 620 };
export const FLOOR = 404;
export const TRAY_Y = 486;

export const LEVELS = [
  {
    // 1 — DROP. One thing, one place to put it, directly over where he stops.
    // You cannot fail. Teaches: drag, place, press play.
    fixed: [
      { type: "hook", x: 520, y: 118 },
    ],
    tray: ["bucket"],
    slots: [{ id: "hook", x: 520, y: 128, accepts: "bucket" }],
    route: [{ x: 520, act: "read", dur: 2.4 }, { x: 980, act: "leave" }],
    docStart: 132,
    par: [1, 2, 3],
  },
  {
    // 2 — CHOOSE. Two hooks, only one is over his route. Teaches: read the path.
    fixed: [
      { type: "hook", x: 330, y: 118 },
      { type: "hook", x: 660, y: 118 },
    ],
    tray: ["bucket"],
    slots: [
      { id: "hookA", x: 330, y: 128, accepts: "bucket" },
      { id: "hookB", x: 660, y: 128, accepts: "bucket" },
    ],
    route: [{ x: 660, act: "read", dur: 2.4 }, { x: 980, act: "leave" }],
    docStart: 132,
    par: [1, 2, 3],
  },
  {
    // 3 — CHAIN. Nothing hangs over him. But the plant does get watered, the
    // wire is live, and the lamp above it can be loaded. Teaches: two links.
    fixed: [
      { type: "cable", x: 470, y: FLOOR },
      { type: "lamp", x: 470, y: 128 },
    ],
    tray: ["plant", "bucket"],
    slots: [
      { id: "wire", x: 470, y: FLOOR, accepts: "plant" },
      { id: "lamp", x: 470, y: 138, accepts: "bucket" },
    ],
    route: [{ x: 470, act: "water", dur: 3.0 }, { x: 980, act: "leave" }],
    docStart: 132,
    par: [3, 5, 6],
  },
  {
    // 4 — ROLL. The puddle makes him slip; a slipping man shoves what rolls.
    fixed: [
      { type: "cable", x: 400, y: FLOOR },
      { type: "lamp", x: 400, y: 128 },
      { type: "cooler", x: 800, y: FLOOR },
    ],
    tray: ["plant", "bucket", "trolley"],
    slots: [
      { id: "wire", x: 400, y: FLOOR, accepts: "plant" },
      { id: "lamp", x: 400, y: 138, accepts: "bucket" },
      { id: "aisle", x: 560, y: FLOOR, accepts: "trolley" },
    ],
    route: [{ x: 400, act: "water", dur: 3.0 }, { x: 800, act: "drink", dur: 1.4 }, { x: 980, act: "leave" }],
    docStart: 132,
    par: [5, 9, 12],
  },
  {
    // 5 — REACH. The trolley has to travel: park it where a shove sends it into
    // something top-heavy, not just anywhere.
    fixed: [
      { type: "cable", x: 330, y: FLOOR },
      { type: "lamp", x: 330, y: 128 },
      { type: "cooler", x: 700, y: FLOOR },
    ],
    tray: ["plant", "bucket", "trolley"],
    slots: [
      { id: "wire", x: 330, y: FLOOR, accepts: "plant" },
      { id: "lamp", x: 330, y: 138, accepts: "bucket" },
      { id: "near", x: 470, y: FLOOR, accepts: "trolley" },
      { id: "far", x: 620, y: FLOOR, accepts: "trolley" },
    ],
    route: [{ x: 330, act: "water", dur: 3.0 }, { x: 700, act: "drink", dur: 1.4 }, { x: 980, act: "leave" }],
    docStart: 132,
    par: [5, 9, 12],
  },
  {
    // 6 — TWO OF THEM. Both walk. One chain, both caught.
    fixed: [
      { type: "cable", x: 350, y: FLOOR },
      { type: "lamp", x: 350, y: 128 },
      { type: "cooler", x: 760, y: FLOOR },
    ],
    tray: ["plant", "bucket", "trolley"],
    slots: [
      { id: "wire", x: 350, y: FLOOR, accepts: "plant" },
      { id: "lamp", x: 350, y: 138, accepts: "bucket" },
      { id: "aisle", x: 540, y: FLOOR, accepts: "trolley" },
    ],
    route: [{ x: 350, act: "water", dur: 3.0 }, { x: 760, act: "drink", dur: 1.4 }, { x: 980, act: "leave" }],
    route2: [{ x: 620, act: "read", dur: 2.0 }, { x: 980, act: "leave" }],
    docStart: 132,
    doc2Start: 940,
    par: [6, 10, 14],
  },
];
