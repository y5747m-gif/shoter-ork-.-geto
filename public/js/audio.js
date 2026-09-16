/**
 * ORK ZONE — client/audio.js
 * محرك صوت مُركّب بالكامل بـ WebAudio (بدون ملفات خارجية): طلقات، انفجارات، موسيقى، تنبيهات.
 */
export class Audio2 {
  constructor() {
    this.ctx = null; this.master = null; this.sfxGain = null; this.musicGain = null;
    this.sfxVol = 0.8; this.musicVol = 0.45; this.enabled = true;
    this.musicTimer = null; this.mood = null; this.step = 0;
    this.lastPlay = {};
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.85; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol * 0.5; this.musicGain.connect(this.master);
    this.noiseBuf = this.makeNoise(1.4);
  }
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  makeNoise(sec) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  setSfx(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v * 0.5; }

  /* ---------- أدوات ---------- */
  noise(dur, { vol = 0.4, lp = 2400, hp = 100, q = 1, attack = 0.001, dest = null } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = lp; f1.Q.value = q;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
  tone(freq, dur, { type = 'sine', vol = 0.25, slide = 0, attack = 0.005, dest = null, detune = 0 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    if (detune) o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }
  throttle(name, ms) {
    const now = performance.now();
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return false;
    this.lastPlay[name] = now; return true;
  }

  /* ---------- المؤثرات ---------- */
  shot(weaponId, dist = 0, silent = false) {
    if (!this.throttle('shot' + weaponId, 45)) return;
    const v = Math.max(0.05, 1 - dist / 2600) * (silent ? 0.35 : 1);
    const heavy = { awm: 1, kar98: 1, m249: 1, minigun: 1, groza: 0.8 }[weaponId] || 0.6;
    this.noise(0.14, { vol: 0.42 * v * heavy, lp: 5200 - heavy * 1800, hp: 160 });
    this.tone(140 * (1.2 - heavy * 0.4), 0.09, { type: 'square', vol: 0.16 * v, slide: -70 });
    if (heavy > 0.9) this.tone(70, 0.22, { type: 'sine', vol: 0.2 * v, slide: -30 });
  }
  hit(head = false) { this.noise(0.05, { vol: 0.22, lp: 3200, hp: 1200 }); this.tone(head ? 1250 : 620, 0.06, { type: 'triangle', vol: 0.2, slide: head ? -400 : -120 }); }
  crack() { this.noise(0.09, { vol: 0.3, lp: 6000, hp: 2400 }); this.tone(260, 0.05, { type: 'sawtooth', vol: 0.12, slide: -80 }); }
  kill() { [0, 0.07, 0.14].forEach((d, i) => setTimeout(() => this.tone([660, 880, 1320][i], 0.16, { type: 'triangle', vol: 0.22 }), d * 1000)); }
  reload() { this.noise(0.06, { vol: 0.2, lp: 1800, hp: 300 }); setTimeout(() => this.tone(320, 0.05, { type: 'square', vol: 0.14 }), 90); }
  explosion() { this.noise(0.9, { vol: 0.75, lp: 900, hp: 40 }); this.tone(48, 0.8, { type: 'sine', vol: 0.4, slide: -26 }); }
  footstep(sprint) { if (!this.throttle('step', sprint ? 210 : 320)) return; this.noise(0.05, { vol: sprint ? 0.1 : 0.06, lp: 900, hp: 200 }); }
  pickup() { this.tone(880, 0.09, { type: 'triangle', vol: 0.16, slide: 320 }); setTimeout(() => this.tone(1320, 0.08, { type: 'triangle', vol: 0.12 }), 70); }
  ui() { this.tone(520, 0.05, { type: 'square', vol: 0.1, slide: 120 }); }
  uiBig() { this.tone(300, 0.12, { type: 'triangle', vol: 0.2, slide: 300 }); }
  heal() { this.tone(420, 0.3, { type: 'sine', vol: 0.14, slide: 260 }); }
  jump() { this.noise(0.5, { vol: 0.16, lp: 700, hp: 90 }); }
  land() { this.noise(0.2, { vol: 0.24, lp: 500, hp: 60 }); }
  zoneWarn() { this.tone(200, 0.5, { type: 'sawtooth', vol: 0.16, slide: 120 }); setTimeout(() => this.tone(150, 0.5, { type: 'sawtooth', vol: 0.14, slide: 90 }), 320); }
  airdrop() { this.tone(520, 0.7, { type: 'triangle', vol: 0.14 }); setTimeout(() => this.tone(390, 0.9, { type: 'triangle', vol: 0.12 }), 260); }
  vehicle(on) { if (on) { if (this._veh) return; if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70; const g = this.ctx.createGain(); g.gain.value = 0.0001; g.gain.linearRampToValueAtTime(0.09, t + 0.3); o.connect(g); g.connect(this.sfxGain); o.start(); this._veh = { o, g }; } else if (this._veh) { try { this._veh.o.stop(); } catch { } this._veh = null; } }
  respawn() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, { type: 'triangle', vol: 0.2 }), i * 80)); }
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, { type: 'triangle', vol: 0.25 }), i * 130)); setTimeout(() => this.noise(1.2, { vol: 0.2, lp: 4000, hp: 400 }), 500); }
  defeat() { [440, 392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, { type: 'sine', vol: 0.22 }), i * 180)); }
  levelUp() { [659, 880, 1174].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, { type: 'triangle', vol: 0.24 }), i * 90)); }
  buy() { this.tone(700, 0.1, { type: 'triangle', vol: 0.2, slide: 500 }); setTimeout(() => this.noise(0.4, { vol: 0.12, lp: 6000, hp: 2000 }), 80); }

  /* ---------- الموسيقى ---------- */
  startMusic(mood = 'menu') {
    this.init(); if (!this.ctx || this.mood === mood) return;
    this.stopMusic();
    this.mood = mood; this.step = 0;
    const bpm = mood === 'menu' ? 84 : mood === 'match' ? 96 : 110;
    const interval = 60000 / bpm / 2;
    const scales = {
      menu: [220, 246.9, 293.7, 329.6, 392, 440, 493.9, 587.3],
      match: [196, 220, 261.6, 293.7, 349.2, 392, 440, 523.3],
      drop: [174.6, 207.7, 233.1, 277.2, 311.1, 349.2, 415.3, 466.2],
      over: [261.6, 293.7, 329.6, 392, 440, 523.3],
    };
    const sc = scales[mood] || scales.menu;
    this.musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const t = this.step++;
      const root = sc[0] / 2;
      // باس
      if (t % 4 === 0) this.tone(root, 0.9, { type: 'sine', vol: 0.5, dest: this.musicGain, attack: 0.05 });
      // أربيجيو
      const n = sc[(t * 3) % sc.length];
      this.tone(n, 0.42, { type: 'triangle', vol: 0.22, dest: this.musicGain, attack: 0.02 });
      if (t % 8 === 4) this.tone(n * 2, 0.3, { type: 'sine', vol: 0.12, dest: this.musicGain });
      // إيقاع خفيف
      if (mood !== 'menu' && t % 2 === 0) this.noise(0.09, { vol: 0.05, lp: 5000, hp: 900, dest: this.musicGain });
      if (mood === 'match' && t % 16 === 0) this.tone(root * 1.5, 1.4, { type: 'sawtooth', vol: 0.1, dest: this.musicGain, attack: 0.2 });
    }, interval);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; this.mood = null; }
}
export default Audio2;
