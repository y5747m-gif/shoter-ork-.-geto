/**
 * ORK ZONE — client/audio.js
 * ==============================================================
 * محرّك صوت احترافي مبني بالكامل بـ WebAudio (بدون أي ملفات خارجية).
 *
 *  🔇 الموسيقى مُزالة نهائياً من اللعبة (لا مؤقتات ولا مذبذبات موسيقية).
 *     بقيت الدوال `startMusic/stopMusic/setMusic` كـ«لا شيء» فقط حتى لا
 *     ينكسر أي نداء قديم — وهي لا تُنتج صوتاً أبداً.
 *
 *  🔫 أصوات الأسلحة أُعيدت هندستها بالكامل لتكون واقعية واحترافية:
 *     كل طلقة = ٧ طبقات متزامنة (فرقعة فوق صوتية + انفجار الكمّامة المشبع
 *     + جسم الصوت + ضربة الباص + ميكانيكا المدك + رنين الظرف + ذيل صدى
 *     مكاني عبر Convolver) مع محاكاة المسافة (تأخير انتقال الصوت + امتصاص
 *     الهواء + صدى بعيد) وملف صوتي مستقل لكل سلاح.
 * ==============================================================
 */

/* ============================================================
   بصمات الأسلحة — كل سلاح له توقيعه الصوتي
   gain     : القوة العامة
   body     : تردد جسم الصوت (كلما قلّ = عيار أثقل)
   crack    : حدّة الفرقعة فوق الصوتية
   thump    : تردد ضربة الباص
   dur      : طول انفجار الكمّامة
   tail     : كمية الصدى/الذيل
   mech     : قوة صوت الميكانيكا (مدك/ترباس)
   bolt     : تأخير صوت الترباس (ثوانٍ) — للقناصة ذات الترباس اليدوي
   shell    : رنين الظرف المعدني
   minGap   : أقل فاصل زمني بين طلقتين (مللي ثانية)
   ============================================================ */
const GUN_TYPE = {
  pistol:  { gain: 0.62, body: 1500, crack: 0.55, thump: 118, dur: 0.11, tail: 0.30, mech: 0.55, shell: 0.55, minGap: 70 },
  smg:     { gain: 0.60, body: 1700, crack: 0.62, thump: 110, dur: 0.09, tail: 0.26, mech: 0.60, shell: 0.50, minGap: 42 },
  ar:      { gain: 0.86, body: 1150, crack: 0.85, thump: 92,  dur: 0.14, tail: 0.44, mech: 0.50, shell: 0.45, minGap: 52 },
  dmr:     { gain: 0.95, body: 980,  crack: 0.95, thump: 80,  dur: 0.17, tail: 0.58, mech: 0.45, shell: 0.42, minGap: 110 },
  sniper:  { gain: 1.00, body: 760,  crack: 1.00, thump: 62,  dur: 0.24, tail: 0.85, mech: 0.40, shell: 0.30, minGap: 220 },
  shotgun: { gain: 0.95, body: 620,  crack: 0.40, thump: 70,  dur: 0.20, tail: 0.55, mech: 0.75, shell: 0.35, minGap: 200, pellets: 6 },
  lmg:     { gain: 0.92, body: 1000, crack: 0.80, thump: 84,  dur: 0.15, tail: 0.50, mech: 0.55, shell: 0.50, minGap: 40 },
  melee:   { gain: 0.35, body: 2200, crack: 0.10, thump: 150, dur: 0.05, tail: 0.10, mech: 0.20, shell: 0, minGap: 160 },
};

/** ملفات خاصة لكل سلاح (تُدمج فوق نوعه) */
const GUN_PROFILES = {
  p92:     { type: 'pistol',  body: 1650, gain: 0.58 },
  deagle:  { type: 'pistol',  body: 1000, gain: 0.90, thump: 78, dur: 0.16, tail: 0.50, crack: 0.80, minGap: 150 },
  mp40:    { type: 'smg',     body: 1450, gain: 0.62, minGap: 46 },
  ump:     { type: 'smg',     body: 1250, gain: 0.68, thump: 100, minGap: 52 },
  vector:  { type: 'smg',     body: 1950, gain: 0.52, crack: 0.70, minGap: 30, shell: 0.6 },
  akm:     { type: 'ar',      body: 980,  gain: 0.95, thump: 84,  dur: 0.16, crack: 0.88, tail: 0.50, minGap: 50 },
  m416:    { type: 'ar',      body: 1250, gain: 0.84, crack: 0.90, minGap: 46 },
  scar:    { type: 'ar',      body: 1150, gain: 0.87, minGap: 48 },
  groza:   { type: 'ar',      body: 900,  gain: 0.96, thump: 80,  dur: 0.17, tail: 0.55, minGap: 44 },
  sks:     { type: 'dmr',     body: 940,  gain: 0.96 },
  kar98:   { type: 'sniper',  body: 800,  gain: 1.00, bolt: 0.34, mech: 0.85, minGap: 500 },
  awm:     { type: 'sniper',  body: 640,  gain: 1.00, thump: 52, dur: 0.30, tail: 1.00, bolt: 0.42, mech: 0.90, minGap: 650 },
  m1014:   { type: 'shotgun', body: 680,  pellets: 6, mech: 0.8 },
  spas:    { type: 'shotgun', body: 600,  pellets: 7, gain: 1.0, mech: 0.95, minGap: 260 },
  m249:    { type: 'lmg',     body: 1000, gain: 0.94, minGap: 42 },
  minigun: { type: 'lmg',     body: 1250, gain: 0.72, thump: 95, dur: 0.10, tail: 0.32, crack: 0.65, minGap: 26, shell: 0.65 },
  machete: { type: 'melee' },
  pan:     { type: 'melee',   body: 1800, gain: 0.5 },
};

/** وحدات اللعبة → متر تقريباً (لحساب تأخير الصوت والامتصاص) */
const UNITS_PER_METER = 22;
const SPEED_OF_SOUND = 343;

export class Audio2 {
  constructor() {
    this.ctx = null;
    this.master = null; this.sfxGain = null; this.comp = null;
    this.verbSend = null; this.verb = null;
    this.sfxVol = 0.8;
    this.enabled = true;
    this.lastPlay = {};
    this._ends = [];          // أزمنة انتهاء الأصوات النشطة (حماية من التكدّس)
    this.maxVoices = 26;
    this._veh = null;
    this._timers = [];
    // مُزالة نهائياً — تبقى الحقول لأن كوداً قديماً قد يقرؤها
    this.musicVol = 0;
    this.mood = null;
    this.musicTimer = null;
  }

  /* ======================= التهيئة ======================= */
  init() {
    if (this.ctx) return;
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      const ctx = this.ctx;

      // سلسلة الإخراج: sfx → ضاغط (لَمعة وقوة) → ماستر → السماعات
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      this.comp = ctx.createDynamicsCompressor();
      try {
        this.comp.threshold.value = -16; this.comp.knee.value = 24;
        this.comp.ratio.value = 7; this.comp.attack.value = 0.002; this.comp.release.value = 0.22;
      } catch { }
      this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.comp);
      this.comp.connect(this.master);
      this.master.connect(ctx.destination);

      // صدى المكان (Convolver بمستجيب نبضي مُولَّد)
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.makeIR(1.7, 2.6);
      this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.9;
      this.verbSend.connect(this.verb);
      const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
      this.verb.connect(verbOut); verbOut.connect(this.comp);

      this.noiseBuf = this.makeNoise(2.0);
      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = this.makeCurve(2.6);
      this.shaper.oversample = '2x';
    } catch {
      this.enabled = false;
      this.ctx = null;
    }
  }

  resume() {
    try {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
    } catch { }
  }

  /** ضجيج أبيض قابل للحلقة */
  makeNoise(sec) {
    try {
      if (!this.ctx) return null;
      const len = Math.floor(this.ctx.sampleRate * sec);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;              // القليل من الضجيج البني = دفء
        d[i] = w * 0.75 + last * 3.2;
      }
      return buf;
    } catch { return null; }
  }

  /** مستجيب نبضي ستيريو: انعكاسات مبكرة + ذيل أُسّي (صدى ساحة مفتوحة) */
  makeIR(sec = 1.6, decay = 2.4) {
    try {
      if (!this.ctx) return null;
      const sr = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(sr * sec));
      const buf = this.ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
        // انعكاسات مبكرة واضحة (جدران/تلال)
        for (const [ms, amp] of [[17, 0.5], [31, 0.38], [47, 0.3], [73, 0.24], [111, 0.18]]) {
          const idx = Math.floor((ms / 1000) * sr) + (ch ? 37 : 0);
          if (idx < len) d[idx] += amp * (ch ? -1 : 1);
        }
      }
      return buf;
    } catch { return null; }
  }

  /** منحنى تشبّع ناعم يعطي «لحم» لصوت الطلقة */
  makeCurve(k = 2.5) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }

  setSfx(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; }

  /* ---------- الموسيقى: مُزالة نهائياً (دوال صامتة للتوافق) ---------- */
  setMusic() { /* الموسيقى مُزالة من اللعبة */ }
  startMusic() { /* الموسيقى مُزالة من اللعبة */ }
  stopMusic() { /* الموسيقى مُزالة من اللعبة */ }

  /** إيقاف كل الأصوات المستمرة (يُستخدم عند قفل الصلاة مثلاً) */
  stopAll() {
    try { this.vehicle(false); } catch { }
    this._ends.length = 0;
    for (const t of this._timers) { try { clearTimeout(t); } catch { } }
    this._timers.length = 0;
  }

  /* ======================= لَبِنات البناء ======================= */
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  /**
   * عدد الأصوات النشطة الآن — محسوب من أزمنة الانتهاء المجدولة بدل الاعتماد
   * على حدث onended (بعض المتصفحات تتأخر في إطلاقه فيتسرّب العدّاد).
   */
  get voices() {
    const t = this.now();
    if (this._ends.length > 96) this._ends = this._ends.slice(-96);
    this._ends = this._ends.filter(x => x > t);
    return this._ends.length;
  }

  /** جدولة مؤجّلة آمنة */
  later(fn, ms) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter(x => x !== id);
      try { fn(); } catch { }
    }, ms);
    this._timers.push(id);
    if (this._timers.length > 60) this._timers.shift();
    return id;
  }

  /** طبقة ضجيج مُرشَّحة عامة */
  noise(dur, {
    vol = 0.4, lp = 2400, hp = 100, q = 1, attack = 0.0015, dest = null,
    type = 'lowpass', at = 0, curve = 'exp', verb = 0, shape = false, lpEnd = 0,
  } = {}) {
    if (!this.enabled || !this.ctx || !this.noiseBuf) return null;
    if (this.voices >= this.maxVoices) return null;
    try {
      const ctx = this.ctx, t = ctx.currentTime + Math.max(0, at);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      let node = src;
      if (type === 'bandpass') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
        bp.frequency.setValueAtTime(lp, t); bp.Q.value = q;
        if (lpEnd) bp.frequency.exponentialRampToValueAtTime(Math.max(40, lpEnd), t + dur);
        node.connect(bp); node = bp;
      } else {
        const f1 = ctx.createBiquadFilter(); f1.type = 'lowpass';
        f1.frequency.setValueAtTime(lp, t); f1.Q.value = q;
        if (lpEnd) f1.frequency.exponentialRampToValueAtTime(Math.max(40, lpEnd), t + dur);
        node.connect(f1); node = f1;
        const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
        node.connect(f2); node = f2;
      }
      if (shape && this.shaper) {
        const pre = ctx.createGain(); pre.gain.value = 1.6;
        node.connect(pre); pre.connect(this.shaper);
        node = this.shaper;
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur);
      else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      node.connect(g);
      g.connect(dest || this.sfxGain);
      if (verb > 0 && this.verbSend) {
        const s = ctx.createGain(); s.gain.value = verb;
        g.connect(s); s.connect(this.verbSend);
      }
      this._ends.push(t + dur);
      src.start(t); src.stop(t + dur + 0.05);
      return g;
    } catch { return null; }
  }

  /** نغمة مُذبذبة عامة */
  tone(freq, dur, {
    type = 'sine', vol = 0.25, slide = 0, attack = 0.005, dest = null, detune = 0,
    at = 0, verb = 0, target = 0,
  } = {}) {
    if (!this.enabled || !this.ctx) return null;
    if (this.voices >= this.maxVoices) return null;
    try {
      const ctx = this.ctx, t = ctx.currentTime + Math.max(0, at);
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      const end = target || (slide ? freq + slide : 0);
      if (end) o.frequency.exponentialRampToValueAtTime(Math.max(18, end), t + dur);
      if (detune) o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      if (verb > 0 && this.verbSend) {
        const s = ctx.createGain(); s.gain.value = verb;
        g.connect(s); s.connect(this.verbSend);
      }
      this._ends.push(t + dur);
      o.start(t); o.stop(t + dur + 0.05);
      return g;
    } catch { return null; }
  }

  throttle(name, ms) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.lastPlay[name] && now - this.lastPlay[name] < ms) return false;
    this.lastPlay[name] = now;
    return true;
  }

  /** دمج بصمة السلاح */
  profile(weaponId) {
    const p = GUN_PROFILES[weaponId];
    const base = GUN_TYPE[(p && p.type) || 'ar'] || GUN_TYPE.ar;
    return { ...base, ...(p || {}) };
  }

  /* ======================= صوت الطلقة ======================= */
  /**
   * @param {string} weaponId معرف السلاح
   * @param {number} dist     المسافة بوحدات اللعبة (٠ = سلاحك أنت)
   * @param {boolean} silent  كاتم صوت
   */
  shot(weaponId, dist = 0, silent = false) {
    if (!this.enabled || !this.ctx) return;
    const pf = this.profile(weaponId);
    if (!this.throttle('shot' + weaponId, pf.minGap || 45)) return;
    if (pf.type === 'melee' || (GUN_PROFILES[weaponId] && GUN_PROFILES[weaponId].type === 'melee')) return this.melee();

    const meters = Math.max(0, dist) / UNITS_PER_METER;
    const delay = Math.min(0.45, meters / SPEED_OF_SOUND);            // زمن وصول الصوت
    const att = Math.pow(Math.max(0.05, 1 - dist / 3000), 1.25);      // تلاشي المسافة
    const airLP = 1200 + 16000 * Math.pow(att, 1.7);                  // امتصاص الهواء للترددات العالية
    const far = 1 - att;                                              // كم هو بعيد (٠..١)
    const g = pf.gain * att * (silent ? 0.34 : 1);
    if (g < 0.02) return;
    const jitter = 0.94 + Math.random() * 0.12;                        // لا طلقتان متطابقتان

    if (silent) return this.suppressedShot(pf, g, delay, airLP, jitter);

    /* ١) الفرقعة فوق الصوتية — أول ما يصل الأذن */
    if (pf.crack > 0.2) {
      this.noise(0.022 * jitter, {
        vol: 0.5 * g * pf.crack, lp: Math.min(airLP, 7200), q: 0.9, hp: 2200,
        attack: 0.0004, at: delay, curve: 'lin', verb: 0.12 * pf.tail,
      });
    }

    /* ٢) انفجار الكمّامة المشبع (قلب الصوت) */
    const pellets = pf.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const off = i === 0 ? 0 : Math.random() * 0.012;
      this.noise((pf.dur * (i === 0 ? 1 : 0.55)) * jitter, {
        vol: (i === 0 ? 0.62 : 0.2) * g, lp: Math.min(airLP, pf.body * 2.4), hp: 220,
        q: 1.1, attack: 0.0006, at: delay + off, shape: true, verb: 0.35 * pf.tail,
        lpEnd: pf.body * 0.5,
      });
    }

    /* ٣) جسم الصوت — الرنين المميز لكل عيار */
    this.noise(pf.dur * 1.6 * jitter, {
      vol: 0.45 * g, lp: pf.body * jitter, q: 2.6, type: 'bandpass',
      attack: 0.001, at: delay + 0.002, verb: 0.45 * pf.tail, lpEnd: pf.body * 0.62,
    });

    /* ٤) ضربة الباص (تُحسّ في الصدر) */
    this.tone(pf.thump * jitter, Math.min(0.42, pf.dur * 2.2), {
      type: 'sine', vol: 0.55 * g, target: pf.thump * 0.42,
      attack: 0.0015, at: delay, verb: 0.2 * pf.tail,
    });
    this.tone(pf.thump * 1.9, pf.dur * 1.1, {
      type: 'triangle', vol: 0.18 * g, target: pf.thump * 0.8, attack: 0.001, at: delay,
    });

    /* ٥) الصدى البعيد — كلما ابتعد السلاح زاد الذيل وقلّت الحدة */
    if (far > 0.12 || pf.tail > 0.5) {
      const echoAt = delay + 0.085 + far * 0.22;
      this.noise(0.28 + pf.tail * 0.5, {
        vol: (0.16 + far * 0.3) * g * (0.5 + pf.tail), lp: Math.min(2200, airLP * 0.55),
        hp: 90, attack: 0.02, at: echoAt, verb: 0.9, curve: 'lin',
      });
      if (far > 0.4) {
        this.noise(0.5, {
          vol: 0.1 * g, lp: 900, hp: 60, attack: 0.05, at: echoAt + 0.16, verb: 1, curve: 'lin',
        });
      }
    }

    /* ٦) ميكانيكا السلاح — لا تُسمع إلا عن قرب */
    if (att > 0.55 && pf.mech > 0) {
      const mechAt = delay + (pf.bolt || 0.028);
      this.noise(0.03, { vol: 0.16 * pf.mech * att, lp: 5200, hp: 1500, attack: 0.0006, at: mechAt });
      this.tone(2400 * (0.9 + Math.random() * 0.2), 0.03, { type: 'square', vol: 0.05 * pf.mech * att, at: mechAt + 0.008 });
      if (pf.bolt) { // ترباس يدوي للقناصة
        this.noise(0.05, { vol: 0.13 * pf.mech, lp: 3800, hp: 900, at: mechAt + 0.12, attack: 0.004 });
        this.tone(1300, 0.05, { type: 'square', vol: 0.05 * pf.mech, at: mechAt + 0.2, slide: -300 });
      }
    }

    /* ٧) رنين الظرف المعدني على الأرض */
    if (att > 0.7 && pf.shell > 0 && Math.random() < 0.8) {
      const sAt = delay + 0.34 + Math.random() * 0.22;
      const f = 3200 + Math.random() * 2400;
      this.tone(f, 0.05, { type: 'triangle', vol: 0.035 * pf.shell * att, at: sAt, slide: -600 });
      this.tone(f * 1.48, 0.035, { type: 'sine', vol: 0.022 * pf.shell * att, at: sAt + 0.035 });
    }
  }

  /** طلقة بكاتم صوت: «بفّ» قصيرة + ميكانيكا واضحة */
  suppressedShot(pf, g, delay, airLP, jitter) {
    this.noise(0.05 * jitter, {
      vol: 0.5 * g, lp: Math.min(airLP, 1400), hp: 180, attack: 0.001, at: delay, shape: true, verb: 0.1,
    });
    this.noise(0.1, { vol: 0.28 * g, lp: 700, q: 2, type: 'bandpass', at: delay + 0.004, verb: 0.15 });
    this.tone(pf.thump * 0.9, 0.09, { type: 'sine', vol: 0.3 * g, target: pf.thump * 0.4, at: delay });
    // الميكانيكا تصبح أوضح من الطلقة نفسها
    this.noise(0.04, { vol: 0.2 * g, lp: 5600, hp: 1800, at: delay + 0.022, attack: 0.0006 });
    this.tone(2600, 0.035, { type: 'square', vol: 0.07 * g, at: delay + 0.03 });
  }

  /** صفير الرصاصة المارّة قرب الرأس */
  crack(dist = 0) {
    if (!this.throttle('whiz', 60)) return;
    const att = Math.max(0.2, 1 - dist / 2200);
    this.noise(0.07, { vol: 0.3 * att, lp: 5200, q: 3, type: 'bandpass', attack: 0.0006, lpEnd: 1200 });
    this.tone(2600, 0.05, { type: 'sawtooth', vol: 0.07 * att, target: 700 });
  }

  /** ضربة سلاح أبيض */
  melee() {
    this.noise(0.08, { vol: 0.32, lp: 3200, hp: 300, attack: 0.001, shape: true, verb: 0.2 });
    this.tone(180, 0.12, { type: 'triangle', vol: 0.16, target: 70 });
  }

  /* ======================= بقية المؤثرات ======================= */
  hit(head = false) {
    if (head) {
      this.noise(0.07, { vol: 0.3, lp: 4200, hp: 900, attack: 0.0005, shape: true });
      this.tone(1500, 0.07, { type: 'triangle', vol: 0.2, target: 520 });
      this.tone(2400, 0.05, { type: 'sine', vol: 0.12, at: 0.02, target: 1200 });
    } else {
      this.noise(0.06, { vol: 0.24, lp: 2400, hp: 260, attack: 0.0008 });
      this.tone(320, 0.07, { type: 'triangle', vol: 0.16, target: 150 });
    }
  }

  kill() {
    this.noise(0.09, { vol: 0.2, lp: 5200, hp: 1600, attack: 0.001 });
    [0, 0.07, 0.15].forEach((d, i) => this.tone([760, 1010, 1520][i], 0.16, { type: 'triangle', vol: 0.2, at: d, verb: 0.2 }));
  }

  /** إعادة تعبئة واقعية: تحرير المخزن → سقوطه → إدخال الجديد → تحرير الترباس */
  reload() {
    this.tone(2200, 0.02, { type: 'square', vol: 0.07 });                                   // زر التحرير
    this.noise(0.05, { vol: 0.14, lp: 3400, hp: 700, at: 0.06 });                            // خروج المخزن
    this.tone(900, 0.05, { type: 'triangle', vol: 0.05, at: 0.22, slide: -400 });            // ارتطامه بالأرض
    this.noise(0.07, { vol: 0.2, lp: 2400, hp: 300, at: 0.52, attack: 0.002, shape: true }); // إدخال المخزن
    this.tone(160, 0.1, { type: 'sine', vol: 0.16, at: 0.52, target: 80 });
    this.noise(0.05, { vol: 0.17, lp: 5200, hp: 1600, at: 0.78 });                            // سحب الترباس
    this.tone(1800, 0.04, { type: 'square', vol: 0.07, at: 0.83, slide: -700 });
  }

  /** طقّة المخزن الفارغ */
  dryFire() {
    if (!this.throttle('dry', 220)) return;
    this.tone(1800, 0.025, { type: 'square', vol: 0.09, slide: -900 });
    this.noise(0.02, { vol: 0.08, lp: 4200, hp: 1400 });
  }

  explosion(dist = 0) {
    const att = Math.pow(Math.max(0.08, 1 - dist / 3200), 1.2);
    const delay = Math.min(0.5, (dist / UNITS_PER_METER) / SPEED_OF_SOUND);
    this.noise(0.05, { vol: 0.5 * att, lp: 8000, hp: 1200, attack: 0.0006, at: delay });         // الوميض
    this.noise(1.1, { vol: 0.8 * att, lp: 1100 * att + 200, hp: 40, attack: 0.004, at: delay, shape: true, verb: 0.8, lpEnd: 120 });
    this.tone(70, 0.9, { type: 'sine', vol: 0.55 * att, target: 28, attack: 0.004, at: delay, verb: 0.4 });
    this.tone(120, 0.35, { type: 'triangle', vol: 0.2 * att, target: 45, at: delay });
    this.noise(1.4, { vol: 0.18 * att, lp: 700, hp: 50, attack: 0.12, at: delay + 0.1, verb: 1, curve: 'lin' }); // الذيل
    for (let i = 0; i < 5; i++) {                                                                  // شظايا
      this.noise(0.05, { vol: 0.06 * att, lp: 6000, hp: 1800, at: delay + 0.18 + Math.random() * 0.5 });
    }
  }

  footstep(sprint, surface = 'dirt') {
    if (!this.throttle('step', sprint ? 230 : 350)) return;
    const v = sprint ? 0.11 : 0.07;
    const lp = surface === 'metal' ? 2600 : surface === 'water' ? 1400 : 1000;
    this.noise(0.06, { vol: v, lp, hp: 180, attack: 0.002 });
    this.tone(90, 0.05, { type: 'sine', vol: v * 0.5, target: 50 });
  }

  pickup() {
    this.tone(880, 0.08, { type: 'triangle', vol: 0.14, slide: 320 });
    this.tone(1320, 0.08, { type: 'triangle', vol: 0.1, at: 0.07 });
    this.noise(0.04, { vol: 0.07, lp: 6000, hp: 2200, at: 0.02 });
  }

  ui() { this.tone(620, 0.04, { type: 'square', vol: 0.07, slide: 140 }); }
  uiBig() { this.tone(300, 0.1, { type: 'triangle', vol: 0.16, slide: 320 }); this.noise(0.08, { vol: 0.06, lp: 6000, hp: 1800, at: 0.02 }); }
  heal() { this.tone(430, 0.28, { type: 'sine', vol: 0.13, slide: 260 }); this.noise(0.18, { vol: 0.05, lp: 2200, hp: 500, attack: 0.05 }); }
  jump() { this.noise(0.45, { vol: 0.14, lp: 780, hp: 90, attack: 0.05 }); }
  land() { this.noise(0.18, { vol: 0.24, lp: 520, hp: 60, attack: 0.001, shape: true }); this.tone(70, 0.16, { type: 'sine', vol: 0.18, target: 38 }); }
  zoneWarn() {
    this.tone(210, 0.45, { type: 'sawtooth', vol: 0.13, slide: 110, verb: 0.3 });
    this.tone(158, 0.5, { type: 'sawtooth', vol: 0.12, slide: 80, at: 0.33, verb: 0.3 });
  }
  airdrop() {
    this.tone(520, 0.65, { type: 'triangle', vol: 0.12, verb: 0.4 });
    this.tone(392, 0.85, { type: 'triangle', vol: 0.1, at: 0.26, verb: 0.4 });
    this.noise(1.1, { vol: 0.05, lp: 900, hp: 120, attack: 0.3, curve: 'lin' });
  }
  vehicle(on) {
    if (on) {
      if (this._veh || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 68;
        const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 34;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
        const g = this.ctx.createGain(); g.gain.value = 0.0001;
        g.gain.linearRampToValueAtTime(0.085, t + 0.35);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain);
        o.start(); o2.start();
        this._veh = { o, o2, g };
      } catch { }
    } else if (this._veh) {
      try { this._veh.o.stop(); this._veh.o2 && this._veh.o2.stop(); } catch { }
      this._veh = null;
    }
  }
  respawn() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.18, at: i * 0.08 })); }
  victory() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.22, at: i * 0.13, verb: 0.4 }));
    this.noise(1.0, { vol: 0.14, lp: 4200, hp: 500, at: 0.5, attack: 0.1, curve: 'lin' });
  }
  defeat() { [440, 392, 330, 262].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.2, at: i * 0.18, verb: 0.3 })); }
  levelUp() { [659, 880, 1174].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.22, at: i * 0.09, verb: 0.3 })); }
  buy() { this.tone(720, 0.09, { type: 'triangle', vol: 0.18, slide: 480 }); this.noise(0.35, { vol: 0.09, lp: 6500, hp: 2200, at: 0.08, attack: 0.02 }); }

  /** نداء الأذان القصير عند دخول وقت الصلاة (نغمة تنبيه محترمة — ليست موسيقى) */
  athan() {
    [440, 587, 523, 392].forEach((f, i) => this.tone(f, 0.75, { type: 'sine', vol: 0.16, at: i * 0.62, attack: 0.08, verb: 0.5 }));
  }
}

export const WEAPON_AUDIO_PROFILES = GUN_PROFILES;
export const WEAPON_AUDIO_TYPES = GUN_TYPE;
export default Audio2;
