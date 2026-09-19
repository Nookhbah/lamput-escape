// Tiny procedural sound engine — every sound is synthesised, no asset files.

let ctx = null;
let master = null;
let musicGain = null;
let musicTimer = null;
let musicStep = 0;

export const audio = {
  muted: false,
  ready: false,

  init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.28;
    musicGain.connect(master);
    this.ready = true;
  },

  resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (master) master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  },

  // --- primitives -------------------------------------------------------
  tone(freq, dur, { type = "square", vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  noise(dur, { vol = 0.2, filter = 1200, delay = 0, sweep = 0 } = {}) {
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(filter, t);
    if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(60, filter + sweep), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(gain).connect(master);
    src.start(t);
  },

  // --- game sounds ------------------------------------------------------
  jump() { this.tone(300, 0.16, { type: "sine", vol: 0.28, slide: 320 }); },
  doubleJump() {
    this.tone(420, 0.18, { type: "sine", vol: 0.26, slide: 380 });
    this.noise(0.12, { vol: 0.08, filter: 900, sweep: 1400 });
  },
  land() { this.noise(0.07, { vol: 0.12, filter: 320 }); },
  dash() { this.noise(0.22, { vol: 0.2, filter: 400, sweep: 2600 }); this.tone(180, 0.2, { type: "sawtooth", vol: 0.14, slide: 500 }); },
  collect(i = 0) {
    const scale = [523, 659, 784, 988, 1175, 1318];
    this.tone(scale[i % scale.length], 0.1, { type: "triangle", vol: 0.3 });
    this.tone(scale[i % scale.length] * 2, 0.16, { type: "sine", vol: 0.16, delay: 0.05 });
  },
  morph() { this.tone(160, 0.26, { type: "sine", vol: 0.26, slide: 420 }); this.noise(0.2, { vol: 0.09, filter: 600, sweep: 900 }); },
  unmorph() { this.tone(560, 0.22, { type: "sine", vol: 0.24, slide: -380 }); },
  alert() { this.tone(880, 0.1, { type: "square", vol: 0.2 }); this.tone(1150, 0.12, { type: "square", vol: 0.2, delay: 0.1 }); },
  caught() {
    this.tone(320, 0.3, { type: "sawtooth", vol: 0.3, slide: -220 });
    this.tone(160, 0.5, { type: "square", vol: 0.22, slide: -100, delay: 0.1 });
    this.noise(0.4, { vol: 0.16, filter: 500, sweep: -300, delay: 0.05 });
  },
  hurt() { this.tone(220, 0.18, { type: "sawtooth", vol: 0.24, slide: -120 }); },
  door() { this.tone(392, 0.12, { type: "triangle", vol: 0.24 }); this.tone(523, 0.12, { type: "triangle", vol: 0.24, delay: 0.1 }); this.tone(784, 0.3, { type: "triangle", vol: 0.24, delay: 0.2 }); },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.28, { type: "triangle", vol: 0.26, delay: i * 0.1 }));
  },
  ui() { this.tone(700, 0.06, { type: "square", vol: 0.16 }); },

  // --- boss ---
  bossCharge() {
    this.tone(90, 0.7, { type: "sawtooth", vol: 0.16, slide: 520 });
    this.noise(0.7, { vol: 0.1, filter: 200, sweep: 1800 });
  },
  bossSuck() {
    this.tone(70, 1.9, { type: "sawtooth", vol: 0.2, slide: 40 });
    this.noise(1.9, { vol: 0.16, filter: 1600, sweep: -1200 });
  },
  bossOverheat() {
    this.noise(1.1, { vol: 0.18, filter: 2600, sweep: -2100 });
    this.tone(420, 0.5, { type: "sine", vol: 0.14, slide: -260 });
  },
  bossHurt() {
    this.tone(260, 0.45, { type: "square", vol: 0.3, slide: -180 });
    this.tone(130, 0.7, { type: "sawtooth", vol: 0.22, slide: -80, delay: 0.08 });
    this.noise(0.6, { vol: 0.2, filter: 900, sweep: -700 });
  },
  bossDrop() { this.tone(520, 0.14, { type: "square", vol: 0.16, slide: -260 }); },
  bossBolt() {
    this.noise(0.28, { vol: 0.18, filter: 2400, sweep: -1600 });
    this.tone(150, 0.2, { type: "sawtooth", vol: 0.16, slide: -90 });
  },
  bossDie() {
    [220, 185, 150, 110, 80].forEach((f, i) =>
      this.tone(f, 0.55, { type: "sawtooth", vol: 0.26, slide: -50, delay: i * 0.22 }));
    this.noise(2.4, { vol: 0.22, filter: 700, sweep: -520 });
  },

  // --- music ------------------------------------------------------------
  // A goofy walking bassline + blip melody that speeds up when docs chase.
  startMusic() {
    if (!ctx || musicTimer) return;
    const bass = [55, 55, 73.4, 55, 65.4, 65.4, 49, 58.3];
    const lead = [440, 523, 659, 523, 587, 494, 440, 392];
    const tick = () => {
      if (!this.muted) {
        const i = musicStep % 8;
        const t = ctx.currentTime;
        const b = ctx.createOscillator();
        const bg = ctx.createGain();
        b.type = "triangle";
        b.frequency.value = bass[i] * (this.tense ? 1.0 : 1.0);
        bg.gain.setValueAtTime(0.0001, t);
        bg.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        b.connect(bg).connect(musicGain);
        b.start(t); b.stop(t + 0.26);

        if (this.tense || i % 2 === 0) {
          const l = ctx.createOscillator();
          const lg = ctx.createGain();
          l.type = "square";
          l.frequency.value = lead[i] * (this.tense ? 1.5 : 1);
          lg.gain.setValueAtTime(0.0001, t);
          lg.gain.exponentialRampToValueAtTime(this.tense ? 0.09 : 0.055, t + 0.01);
          lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          l.connect(lg).connect(musicGain);
          l.start(t); l.stop(t + 0.18);
        }
        if (i % 4 === 2) this.noise(0.06, { vol: 0.07, filter: 3000 });
      }
      musicStep++;
      musicTimer = setTimeout(tick, this.tense ? 168 : 232);
    };
    tick();
  },

  stopMusic() {
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
  },

  tense: false,
};
