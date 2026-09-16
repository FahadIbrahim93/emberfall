/* AUDIO + MUSIC — synthesised voices, adaptive score — extracted from the original monolith.
   Classic script: shares globals with index.html's inline core. Load order
   is enforced in index.html; file:// play still works. */
/* ══════════════════════════════════════════════════════════════════════
   AUDIO — everything is synthesised at runtime. No files, no loading.
   Signal path:  voices → [dry | reverb send] → bus (music/sfx) → comp → out
   ══════════════════════════════════════════════════════════════════════ */
const AU = {
  ctx: null, ready: false, muted: false,
  out: null, comp: null, musicBus: null, sfxBus: null, verb: null, verbGain: null,
  noise: null, lastAt: {}, duck: null,

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    const c = this.ctx;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 22;
    this.comp.ratio.value = 5; this.comp.attack.value = .004; this.comp.release.value = .18;

    this.out = c.createGain();
    this.comp.connect(this.out);
    this.out.connect(c.destination);

    this.musicBus = c.createGain(); this.musicBus.connect(this.comp);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.comp);

    // Ducks the music a little whenever something loud happens.
    this.duck = c.createGain(); this.duck.gain.value = 1;
    this.musicBus.disconnect(); this.musicBus.connect(this.duck); this.duck.connect(this.comp);

    // Generated impulse response — a short, dark, metallic space.
    this.verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.9);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const decay = Math.pow(1 - t, 3.1);
        d[i] = (Math.random() * 2 - 1) * decay * (1 - t * .35);
      }
      // a couple of early reflections give it a hangar-sized feel
      d[(c.sampleRate * .018) | 0] += .55 * (ch ? -1 : 1);
      d[(c.sampleRate * .031) | 0] += .38;
    }
    this.verb.buffer = ir;
    this.verbGain = c.createGain(); this.verbGain.gain.value = .26;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.comp);

    // One second of white noise, reused for every percussive/explosive voice.
    const nl = c.sampleRate | 0;
    const nb = c.createBuffer(1, nl, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;

    this.ready = true;
    this.applyVolumes();
    this.unlockiOS();
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
  },
  applyVolumes() {
    if (!this.ready) return;
    const curve = v => Math.pow(clamp(v, 0, 100) / 100, 1.8);
    this.out.gain.value = this.muted ? 0 : curve(CFG.master);
    this.musicBus.gain.value = curve(CFG.music) * .85;
    this.sfxBus.gain.value = curve(CFG.sfx);
  },
  gate(key, ms) {
    const n = performance.now();
    if (this.lastAt[key] && n - this.lastAt[key] < ms) return true;
    this.lastAt[key] = n; return false;
  },
  duckNow(amount, time) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, g = this.duck.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(clamp(1 - amount, .15, 1), t + .015);
      g.linearRampToValueAtTime(1, t + (time || .3));
    } catch (e) { }
  },

  /* ── voice primitives ── */
  tone(o) {
    if (!this.ready) return;
    const c = this.ctx, t = o.t0 || c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.atk || .004));
    g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter[0]; f.frequency.setValueAtTime(o.filter[1], t);
      if (o.filter[2]) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter[2]), t + o.dur);
      if (o.q) f.Q.value = o.q;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.music ? this.musicBus : this.sfxBus);
    if (o.verb) { const s = c.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(this.verb); }
    osc.start(t); osc.stop(t + o.dur + .03);
  },
  hiss(o) {
    if (!this.ready) return;
    const c = this.ctx, t = o.t0 || c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + (o.atk || .003));
    g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    if (o.verb) { const s = c.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(this.verb); }
    src.start(t); src.stop(t + o.dur + .03);
  },

  /* ── sfx bank ── */
  shoot(tier) {
    if (this.gate('sh', 38)) return;
    const base = 620 + tier * 55;
    this.tone({ type: 'square', f0: rnd(base * .92, base * 1.08), f1: 140, dur: .075, vol: .075, filter: ['lowpass', 5200, 900] });
    this.hiss({ dur: .035, f0: 6400, vol: .026, type: 'highpass' });
  },
  laserLoop(t0) {
    this.tone({ type: 'sawtooth', f0: 180, f1: 240, dur: .14, vol: .05, t0, filter: ['bandpass', 1400], q: 6 });
  },
  hit() { if (this.gate('hit', 34)) return; this.hiss({ dur: .045, f0: 2600, f1: 900, vol: .06, type: 'bandpass', q: 1.4 }); },
  armor() { if (this.gate('arm', 55)) return; this.tone({ type: 'square', f0: 240, f1: 160, dur: .07, vol: .05 }); },
  graze() {
    if (this.gate('gz', 70)) return;
    this.tone({ type: 'sine', f0: 2050, f1: 2700, dur: .05, vol: .034, verb: .4 });
  },
  foeShot(kind) {
    if (this.gate('fs', 62)) return;
    const f = kind === 'heavy' ? 200 : 320;
    this.tone({ type: 'square', f0: f, f1: f * .55, dur: .07, vol: .032 });
  },
  boom(size, big) {
    size = clamp(size, .35, 2.6);
    this.hiss({ dur: .3 * size + .16, f0: 2800, f1: 62, vol: .34 * Math.min(1, size), verb: .35 });
    this.tone({ type: 'sine', f0: 170 * size + 44, f1: 32, dur: .3 * size + .12, vol: .32 });
    if (big) {
      this.tone({ type: 'sawtooth', f0: 90, f1: 26, dur: .8, vol: .2, filter: ['lowpass', 900, 120] });
      this.duckNow(.5, .55);
    }
  },
  pickup(rare) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = rare ? [523, 784, 1046, 1568] : [523, 659, 784];
    notes.forEach((f, i) => this.tone({
      type: 'triangle', f0: f, dur: .16, vol: .075, t0: t + i * .052, verb: .3
    }));
  },
  tierUp() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: .09, vol: .06, t0: t + i * .048 }));
  },
  shieldOn() { this.tone({ type: 'triangle', f0: 380, f1: 900, dur: .3, vol: .12, verb: .3 }); },
  shieldBreak() {
    this.tone({ type: 'triangle', f0: 920, f1: 200, dur: .26, vol: .15 });
    this.hiss({ dur: .14, f0: 3400, f1: 700, vol: .09, type: 'highpass' });
  },
  dash() {
    if (this.gate('dash', 120)) return;
    this.hiss({ dur: .2, f0: 380, f1: 3600, vol: .1, type: 'bandpass', q: 2 });
    this.tone({ type: 'sine', f0: 140, f1: 420, dur: .18, vol: .07 });
  },
  bomb() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sawtooth', f0: 1900, f1: 70, dur: .75, vol: .16, t0: t });
    this.hiss({ dur: 1.05, f0: 5200, f1: 90, vol: .34, t0: t, verb: .6 });
    this.tone({ type: 'sine', f0: 88, f1: 26, dur: .95, vol: .4, t0: t + .04 });
    this.duckNow(.62, .9);
  },
  playerDown() {
    this.boom(2.1, true);
    this.tone({ type: 'sawtooth', f0: 420, f1: 44, dur: .85, vol: .15, filter: ['lowpass', 2200, 200] });
  },
  alarm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'square', f0: 466, dur: .17, vol: .075, t0: t + i * .42, verb: .3 });
      this.tone({ type: 'square', f0: 311, dur: .17, vol: .075, t0: t + i * .42 + .21, verb: .3 });
    }
    this.duckNow(.35, 1.4);
  },
  charge(dur) {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', f0: 110, f1: 900, dur: dur || .8, vol: .07, filter: ['bandpass', 800, 2600], q: 7 });
  },
  waveClear() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [392, 523, 659, 784].forEach((f, i) => this.tone({
      type: 'triangle', f0: f, dur: .42, vol: .07, t0: t + i * .1, verb: .5
    }));
  },
  unlock() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523, 698, 880, 1174, 1568].forEach((f, i) => this.tone({
      type: 'triangle', f0: f, dur: .5, vol: .08, t0: t + i * .09, verb: .6
    }));
  },
  /* comet sighting — a soft celestial chime: a slow rising arpeggio with
     long decays and heavy reverb, felt more than heard. No duck: it is
     ambience, not a combat event. */
  sight() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', f0: 523.25, dur: 2.4, vol: .035, t0: t, verb: .7 });
    [1046.5, 1318.5, 1568].forEach((f, i) => this.tone({
      type: 'sine', f0: f, dur: 1.4, vol: .05, t0: t + .26 + i * .26, verb: .7
    }));
    this.tone({ type: 'triangle', f0: 2093, dur: 2.2, vol: .02, t0: t + 1.05, verb: .8 });
  },
  /* golden comet — a brighter, fuller fanfare: an E-major-add9 rising
     figure with bell partials over a deep root. Unmistakably bigger than
     the plain sighting chime. */
  golden() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', f0: 329.63, dur: 3.0, vol: .03, t0: t + .08, verb: .7 });
    this.tone({ type: 'sine', f0: 659.25, dur: 2.6, vol: .045, t0: t, verb: .75 });
    [1318.5, 1648.1, 1975.5, 2637].forEach((f, i) => this.tone({
      type: 'sine', f0: f, dur: 1.6, vol: .055, t0: t + .22 + i * .2, verb: .75
    }));
    this.tone({ type: 'triangle', f0: 3296, dur: 2.4, vol: .02, t0: t + 1.0, verb: .8 });
  },
  /* the pyre — a warship dies somewhere out there: one deep sub rumble
     with a slow dark decay and a distant debris crackle. Felt more than
     heard. */
  pyre() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', f0: 58, f1: 24, dur: 3.4, vol: .26, t0: t, verb: .5 });
    this.tone({ type: 'triangle', f0: 112, f1: 40, dur: 2.2, vol: .1, t0: t + .12, verb: .55 });
    this.hiss({ dur: 2.6, f0: 340, f1: 90, vol: .05, t0: t + .3 });
  },
  ui() { if (this.gate('ui', 45)) return; this.tone({ type: 'square', f0: 1250, dur: .03, vol: .04 }); },
  uiBig() { this.tone({ type: 'square', f0: 700, f1: 1400, dur: .1, vol: .06 }); },

  /* ── v3 voices ── */
  gameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [440, 349, 294, 220].forEach((f, i) => this.tone({
      type: 'triangle', f0: f, dur: .6, vol: .09, t0: t + i * .17, verb: .55
    }));
    this.tone({ type: 'sine', f0: 110, f1: 27, dur: 1.6, vol: .22, t0: t + .1 });
    this.duckNow(.4, 1.2);
  },
  comboSting(n) {
    if (!this.ready) return;
    this.tone({ type: 'square', f0: 740 + Math.min(12, n) * 26, dur: .05, vol: .035, verb: .2 });
  },
  ramRoar() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sawtooth', f0: 84, f1: 38, dur: .5, vol: .16, t0: t, filter: ['lowpass', 480, 160] });
    this.hiss({ dur: .4, f0: 900, f1: 220, vol: .1, t0: t });
  },
  sniperLock() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'sine', f0: 1720, dur: .05, vol: .05, t0: t });
    this.tone({ type: 'sine', f0: 1720, dur: .05, vol: .05, t0: t + .08 });
  },
  emp() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone({ type: 'square', f0: 980, f1: 110, dur: .38, vol: .12, t0: t });
    this.hiss({ dur: .5, f0: 4200, f1: 260, vol: .16, t0: t, type: 'bandpass', q: 1.2 });
    this.duckNow(.4, .6);
  },
  /* iOS silent-switch hardening: an inaudible buffer, played inside the
     first gesture, unlocks WebAudio where a plain resume() is not enough */
  unlockiOS() {
    if (!this.ready) return;
    try {
      const c = this.ctx;
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) { }
  }
};

/* ══════════════════════════════════════════════════════════════════════
   MUSIC — an adaptive score. `intensity` (0..1) is driven by the game and
   decides how many layers are audible; `mode` swaps the harmonic material.
   Scheduled ahead of time on the audio clock so it never drifts with frames.
   ══════════════════════════════════════════════════════════════════════ */
const MUSIC = {
  timer: null, step: 0, nextAt: 0, bpm: 124,
  intensity: .25, target: .25, mode: 'calm', bar: 0,
  variant: 'dreadnought', droneOsc: null, droneGain: null,

  // Aeolian on A, with a phrygian-flavoured boss variant. Semitone offsets.
  BASS: {
    calm: [0, -1, -1, 0, -1, -1, 7, -1, 3, -1, -1, 3, -1, -1, 5, -1,
      0, -1, -1, 0, -1, -1, 7, -1, 8, -1, 10, -1, 7, -1, 5, -1],
    combat: [0, 0, -1, 0, -1, 0, -1, 7, 3, 3, -1, 3, -1, 10, -1, 7,
      0, 0, -1, 0, -1, 0, -1, 7, 8, 8, -1, 10, -1, 7, 5, 3],
    boss: [0, 0, 1, 0, -1, 0, 1, 0, -4, -4, -3, -4, -1, -4, -3, -4,
      0, 0, 1, 0, -1, 0, 1, 0, 3, 3, 5, 3, 1, 0, 1, -1]
  },
  ARP: {
    calm: [0, 7, 12, 15, 19, 15, 12, 7],
    combat: [0, 12, 15, 19, 22, 19, 15, 12],
    boss: [0, 13, 15, 19, 20, 19, 15, 13]
  },

  start() {
    AU.init();
    if (!AU.ready || this.timer) return;
    this.step = 0; this.bar = 0;
    this.nextAt = AU.ctx.currentTime + .12;
    this.timer = setInterval(() => this.tick(), 26);
  },
  stop() { clearInterval(this.timer); this.timer = null; },
  set(mode, target) { this.mode = mode; this.target = clamp(target, 0, 1); },

  tick() {
    if (!AU.ready) return;
    if (GAME.paused) { this.nextAt = Math.max(this.nextAt, AU.ctx.currentTime + .06); return; }
    this.intensity += (this.target - this.intensity) * .045;
    const spb = 60 / this.bpm / 4;               // one sixteenth
    const horizon = AU.ctx.currentTime + .16;
    let guard = 0;
    while (this.nextAt < horizon && guard++ < 64) {
      this.emit(this.step, this.nextAt, spb);
      this.nextAt += spb;
      this.step = (this.step + 1) % 32;
      if (this.step === 0) this.bar++;
    }
  },
  voice(freq, t, dur, type, vol, cut, verb, detune) {
    const c = AU.ctx;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(AU.musicBus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(AU.verb); }
    o.start(t); o.stop(t + dur + .02);
  },
  perc(t, hp, vol, dur) {
    const c = AU.ctx;
    const src = c.createBufferSource(); src.buffer = AU.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(AU.musicBus);
    src.start(t); src.stop(t + dur + .02);
  },
  /* per-capital scoring: each boss gets its own harmonic ground.
     Gate Warden sits on the tritone — the gate does not sound like home. */
  VARIANT_ROOT: { dreadnought: 0, matriarch: -3, tyrant: 2, gatewarden: 6 },
  emit(s, t, spb) {
    const I = this.intensity, M = this.mode;
    const root = 55 * Math.pow(2, (this.VARIANT_ROOT[this.variant] || 0) / 12);
    const st = n => root * Math.pow(2, n / 12);
    const bass = this.BASS[M] || this.BASS.calm;
    const arp = this.ARP[M] || this.ARP.calm;

    // kick
    if (s % 8 === 0 || (I > .5 && s % 16 === 11)) {
      AU.tone({ type: 'sine', f0: 132, f1: 40, dur: .16, vol: .5, t0: t, music: true, atk: .002 });
      this.perc(t, 120, .07, .04);
    }
    // snare / clap on the backbeat, only once the fight is on
    if (I > .3 && s % 16 === 8) {
      this.perc(t, 1800, .1 + I * .1, .1);
      AU.tone({ type: 'triangle', f0: 210, f1: 120, dur: .09, vol: .1, t0: t, music: true });
    }
    // hats
    if (I > .18 && s % 2 === 1) this.perc(t, 7200, .022 + I * .028, .028);
    if (I > .62 && s % 4 === 2) this.perc(t, 9000, .02, .02);

    // bassline
    const bn = bass[s];
    if (bn > -1) {
      this.voice(st(bn), t, .26, 'sawtooth', .13 + I * .07, 260 + I * 520, 0, -6);
      this.voice(st(bn) / 2, t, .3, 'sine', .16, 180);
    }
    // arpeggio — fades in with intensity
    if (I > .2) {
      const n = arp[s % 8];
      this.voice(220 * Math.pow(2, n / 12), t, .11, 'square',
        .028 + I * .038, 520 + I * 3200, .25, 5);
      if (I > .74) this.voice(440 * Math.pow(2, n / 12), t, .07, 'square', .018 * I, 4200, .4, -7);
    }
    // pad — a slow chord bed, one hit per bar
    if (s % 16 === 0) {
      const chord = M === 'boss' ? [0, 1, 7, 8] : (this.bar % 2 ? [3, 7, 10, 15] : [0, 7, 12, 15]);
      chord.forEach((n, i) => this.voice(
        st(n) * 2, t, spb * 15, 'sawtooth', .012 + I * .014, 380 + I * 700, .55, (i - 1.5) * 9
      ));
    }
    // boss lead stab
    if (M === 'boss' && I > .8 && (s === 6 || s === 22)) {
      this.voice(st(12) * 2, t, .2, 'sawtooth', .05, 2600, .4);
      this.voice(st(13) * 2, t + spb, .18, 'sawtooth', .04, 2200, .4);
    }
    // title theme: a quiet four-note motif over the calm bed, menus only
    if ((GAME.state === 'title' || GAME.state === 'hangar') && s === 0) {
      const motif = [19, 15, 17, 14];
      motif.forEach((n, i) => this.voice(
        st(n) * 2, t + i * spb * 6, spb * 5, 'triangle', .05, 1400, .6, i % 2 ? 4 : -4
      ));
    }
  },
  /* low-hull sub-drone: a physical voice for “one hull left” */
  startDrone() {
    if (!AU.ready || this.droneOsc) return;
    const c = AU.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 36.5;
    f.type = 'lowpass'; f.frequency.value = 130; f.Q.value = 2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.075, t + .6);
    o.connect(f); f.connect(g); g.connect(AU.musicBus);
    o.start(t);
    this.droneOsc = o; this.droneGain = g;
  },
  stopDrone() {
    if (!this.droneOsc) return;
    const c = AU.ctx, t = c.currentTime, o = this.droneOsc, g = this.droneGain;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + .5);
      o.stop(t + .6);
    } catch (e) { }
    this.droneOsc = null; this.droneGain = null;
  }
};
