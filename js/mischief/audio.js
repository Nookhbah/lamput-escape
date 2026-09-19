// Everything synthesised — no asset files. A light bouncy loop that ducks when
// something lands, plus one sound per beat of the chain.

let ctx = null, master = null, musicGain = null, timer = null, stepN = 0;

export const audio = {
  on: true,
  ready: false,

  init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.34; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.2; musicGain.connect(master);
    this.ready = true;
    this.startMusic();
  },
  resume() { if (ctx && ctx.state === "suspended") ctx.resume(); },
  toggle() { this.on = !this.on; if (master) master.gain.value = this.on ? 0.34 : 0; return this.on; },

  tone(f, dur, o) {
    if (!ctx || !this.on) return;
    o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "triangle";
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.25, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master); osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  noise(dur, o) {
    if (!ctx || !this.on) return;
    o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = o.type || "bandpass";
    bp.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.to) bp.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(master); src.start(t0);
  },

  // --- one per beat of the chain ---
  pick()   { this.tone(680, 0.07, { type: "square", vol: 0.16 }); },
  place()  { this.tone(420, 0.1, { type: "triangle", vol: 0.24, to: 660 }); },
  denied() { this.tone(180, 0.12, { type: "sawtooth", vol: 0.16, to: 120 }); },
  step()   { this.noise(0.05, { vol: 0.055, f: 420 }); },
  spark()  { this.noise(0.24, { vol: 0.22, f: 2600, to: 700 }); this.tone(1400, 0.1, { type: "square", vol: 0.1 }); },
  swing()  { this.noise(0.3, { vol: 0.1, f: 500, to: 1400 }); },
  fall()   { this.tone(760, 0.32, { type: "sine", vol: 0.2, to: 150 }); },
  splash() { this.noise(0.42, { vol: 0.3, f: 1800, to: 240 }); this.tone(220, 0.22, { type: "sine", vol: 0.16, to: 90 }); },
  slip()   { this.tone(300, 0.3, { type: "sine", vol: 0.24, to: 820 }); this.noise(0.2, { vol: 0.12, f: 900, to: 2200 }); },
  shove()  { this.noise(0.5, { vol: 0.12, f: 260, to: 150 }); },
  clang()  { this.tone(540, 0.4, { type: "square", vol: 0.2, to: 300 }); this.noise(0.3, { vol: 0.2, f: 3200, to: 900 }); },
  topple() { this.tone(160, 0.6, { type: "sawtooth", vol: 0.26, to: 60 }); this.noise(0.6, { vol: 0.22, f: 700, to: 180 }); },
  ouch()   { this.tone(420, 0.16, { type: "square", vol: 0.2, to: 300 }); this.tone(300, 0.2, { type: "square", vol: 0.18, to: 210, delay: 0.14 }); },
  star(i)  { this.tone([784, 988, 1319][i] || 784, 0.3, { type: "triangle", vol: 0.28 }); },
  win()    { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.26, { type: "triangle", vol: 0.24, delay: i * 0.09 })); },
  fail()   { this.tone(300, 0.35, { type: "sawtooth", vol: 0.2, to: 160 }); },

  duck() {
    if (!musicGain || !ctx) return;
    const t0 = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t0);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
    musicGain.gain.linearRampToValueAtTime(0.05, t0 + 0.05);
    musicGain.gain.linearRampToValueAtTime(0.2, t0 + 0.9);
  },

  // a light, slightly silly walking loop
  startMusic() {
    if (!ctx || timer) return;
    const bass = [98, 98, 131, 98, 110, 110, 87, 98];
    const lead = [587, 698, 784, 698, 659, 587, 523, 587];
    const tick = () => {
      if (this.on && ctx) {
        const i = stepN % 8, t0 = ctx.currentTime;
        const b = ctx.createOscillator(), bg = ctx.createGain();
        b.type = "triangle"; b.frequency.value = bass[i];
        bg.gain.setValueAtTime(0.0001, t0);
        bg.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
        b.connect(bg).connect(musicGain); b.start(t0); b.stop(t0 + 0.3);
        if (i % 2 === 0) {
          const l = ctx.createOscillator(), lg = ctx.createGain();
          l.type = "square"; l.frequency.value = lead[i];
          lg.gain.setValueAtTime(0.0001, t0);
          lg.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01);
          lg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
          l.connect(lg).connect(musicGain); l.start(t0); l.stop(t0 + 0.2);
        }
        if (i === 2 || i === 6) this.noise(0.05, { vol: 0.05, f: 3200 });
      }
      stepN++;
      timer = setTimeout(tick, 250);
    };
    tick();
  },
};

export const SFX = {
  spark: "spark", swing: "swing", fall: "fall", splash: "splash", soak: "ouch",
  slip: "slip", shove: "shove", hit: "clang", topple: "topple", flood: "splash",
};
