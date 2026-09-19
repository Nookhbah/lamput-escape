import { Game } from "./game.js";
import { audio } from "./audio.js";

const KEYMAP = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowDown: "down", s: "down", S: "down",
  ArrowUp: "jump", w: "jump", W: "jump", " ": "jump",
  Shift: "morph",
  x: "dash", X: "dash", Control: "dash",
  p: "pause", P: "pause",
  r: "retry", R: "retry",
  m: "mute", M: "mute",
  Enter: "start",
};

class Input {
  constructor() {
    this.held = new Set();
    this.hit = new Set();

    addEventListener("keydown", (e) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      if (!this.held.has(k)) this.hit.add(k);
      this.held.add(k);
      audio.init(); audio.resume();
    });

    addEventListener("keyup", (e) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      this.held.delete(k);
    });

    addEventListener("blur", () => this.held.clear());

    // touch / pointer buttons
    const pad = document.getElementById("touch");
    if (matchMedia("(pointer: coarse)").matches) pad.classList.remove("hidden");
    for (const btn of pad.querySelectorAll(".tbtn")) {
      const k = btn.dataset.key;
      const press = (e) => {
        e.preventDefault();
        if (!this.held.has(k)) this.hit.add(k);
        this.held.add(k);
        if (k === "jump") this.hit.add("start");
        audio.init(); audio.resume();
      };
      const release = (e) => { e.preventDefault(); this.held.delete(k); };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    }

    // tapping the canvas also confirms menus
    document.getElementById("game").addEventListener("pointerdown", () => {
      audio.init(); audio.resume();
      this.hit.add("start");
    });
  }

  down(k) { return this.held.has(k); }
  pressed(k) { return this.hit.has(k); }
  endFrame() { this.hit.clear(); }
}

const canvas = document.getElementById("game");
const input = new Input();
const game = new Game(canvas, input);
window.__game = game; // handy for debugging in the console

// Crisp rendering on high-DPI screens.
function fitDpr() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = 960, h = 560;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitDpr();
addEventListener("resize", fitDpr);

let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was backgrounded

  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 16) {
    game.update(STEP);
    acc -= STEP;
  }
  fitDpr();
  game.render();
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { audio.stopMusic(); }
  else if (game.state === "play") { audio.startMusic(); }
});
