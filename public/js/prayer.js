/**
 * ORK ZONE — client/prayer.js
 * ==============================================================
 * 🕌 حارس مواقيت الصلاة
 *
 * السلوك المطلوب:
 *   • عند دخول وقت الظهر أو العصر أو المغرب أو العشاء → تتعطّل اللعبة فوراً
 *     (تجميد كامل للمباراة + طبقة قفل لا يمكن تجاوزها).
 *   • يُسأل اللاعب: «هل صليت؟» — نعم / لا.
 *   • «نعم» → يُفتح القفل وتُستأنف اللعبة.
 *   • «لا»  → تُغلق اللعبة (إنهاء المباراة والعودة للقائمة) وتُفتح الكاميرا
 *            ويُطلب منه تصوير نفسه وهو يصلّي، ولا يُفتح القفل إلا بعد الصورة.
 *   • القفل محفوظ محلياً: إعادة تحميل الصفحة لا تتجاوزه.
 *
 * كل شيء يعمل محلياً بلا إنترنت: الحساب فلكي، والصورة تُحفظ على الجهاز فقط.
 * ==============================================================
 */
import {
  prayerTimes, METHODS, CITIES, PRAYER_AR, PRAYER_ORDER, DEFAULT_WATCHED,
  fmtTime, dayKey, duePrayer, nextPrayer, minutesOfDay,
} from '/shared/prayertimes.js';

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const K_CFG = 'orkz_prayer_cfg';
const K_DONE = 'orkz_prayer_done';
const K_PENDING = 'orkz_prayer_pending';
const K_PROOFS = 'orkz_prayer_proofs';

const DEF_CFG = {
  enabled: true,
  cityId: 'makkah',
  lat: 21.3891,
  lng: 39.8579,
  method: 'makkah',
  asr: 'shafi',
  watchFajr: false,          // اللاعب طلب الظهر/العصر/المغرب/العشاء — الفجر اختياري
  offsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  auto: false,               // تحديد الموقع تلقائياً (يتطلب إذن الجهاز)
};

const readJSON = (k, def) => {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; }
  catch { return def; }
};
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export class PrayerGuard {
  constructor(app) {
    this.app = app || null;
    const saved = readJSON(K_CFG, null);
    this.cfg = { ...DEF_CFG, ...(saved || {}) };
    this.cfg.offsets = { ...DEF_CFG.offsets, ...(this.cfg.offsets || {}) };
    // أول تشغيل: خمّن المدينة من المنطقة الزمنية للجهاز بدل افتراض مكة للجميع
    if (!saved) { try { this.guessCity(); } catch { } }
    this.locked = false;
    this.current = null;         // {key,start,end,dayShift}
    this.step = 'ask';           // ask | cam | shot | done
    this.stream = null;
    this.facing = 'user';
    this.shotData = null;
    this.timer = null;
    this.bound = false;
    this._lastTick = 0;
    this._resumeMatch = false;
  }

  /* ======================= الإعداد ======================= */
  init() {
    this.bindUI();
    this.restorePending();
    this.tick();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000);
    try {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
      window.addEventListener('focus', () => this.tick());
    } catch { }
    return this;
  }

  saveCfg() {
    writeJSON(K_CFG, this.cfg);
    this.renderPane();
    this.tick();
  }

  get watched() {
    return this.cfg.watchFajr ? ['fajr', ...DEFAULT_WATCHED] : [...DEFAULT_WATCHED];
  }

  /** مواقيت اليوم (أو ليوم مُعطى) بالدقائق من منتصف الليل */
  times(date = new Date()) {
    return prayerTimes({
      date, lat: this.cfg.lat, lng: this.cfg.lng,
      method: this.cfg.method, asr: this.cfg.asr, offsets: this.cfg.offsets,
    });
  }

  /* ======================= سجل التأكيد ======================= */
  doneMap() { return readJSON(K_DONE, {}) || {}; }
  isDone(key, dayShift = 0) {
    const d = new Date();
    if (dayShift) d.setDate(d.getDate() + dayShift);
    const m = this.doneMap();
    return !!(m[dayKey(d)] && m[dayKey(d)][key]);
  }
  markDone(key, via, dayShift = 0) {
    const d = new Date();
    if (dayShift) d.setDate(d.getDate() + dayShift);
    const m = this.doneMap();
    const dk = dayKey(d);
    m[dk] = m[dk] || {};
    m[dk][key] = { at: Date.now(), via };
    // تنظيف: نحتفظ بآخر ٧ أيام فقط
    const keys = Object.keys(m).sort();
    while (keys.length > 7) delete m[keys.shift()];
    writeJSON(K_DONE, m);
  }

  proofs() { return readJSON(K_PROOFS, []) || []; }
  addProof(entry) {
    let list = this.proofs();
    list.unshift(entry);
    list = list.slice(0, 12);
    if (!writeJSON(K_PROOFS, list)) {
      // مساحة التخزين ممتلئة — نحتفظ بآخر صورتين فقط
      writeJSON(K_PROOFS, list.slice(0, 2));
    }
  }

  /* ======================= الحالة ======================= */
  status(now = new Date()) {
    const t = this.times(now);
    const mins = minutesOfDay(now);
    const due = duePrayer(t, mins, (k, s) => this.isDone(k, s), this.watched);
    const next = nextPrayer(t, mins, ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    return { times: t, now: mins, due, next };
  }

  /* ======================= النبض ======================= */
  tick() {
    let st = null;
    try { st = this.status(); } catch { st = null; }
    if (!st) return;
    this.updateChip(st);
    this.renderPaneTimes(st);

    // ١) التزام الصورة أولاً: لا يفتحه تعطيل الحارس ولا مرور الوقت ولا إعادة التحميل
    const pending = readJSON(K_PENDING, null);
    if (pending && pending.needPhoto) {
      if (!this.locked) this.lock(pending.prayer || st.due || { key: pending.key, start: 0, end: 0, dayShift: 0 }, 'cam');
      else if (this.step !== 'cam' && this.step !== 'shot') this.showStep(this.step = 'cam');
      this.updateOverlay(st);
      return;
    }
    // ٢) الحارس مُعطَّل من الإعدادات
    if (!this.cfg.enabled) {
      if (this.locked) this.unlock('disabled');
      return;
    }
    if (st.due) {
      if (!this.locked) this.lock(st.due, 'ask');
      this.updateOverlay(st);
    } else if (this.locked && this.step !== 'cam' && this.step !== 'shot') {
      this.unlock('window-over');
    }
  }

  restorePending() {
    const pending = readJSON(K_PENDING, null);
    if (pending && pending.needPhoto) {
      this.lock(pending.prayer || { key: pending.key || 'dhuhr', start: 0, end: 0, dayShift: 0 }, 'cam');
    }
  }

  /* ======================= القفل والفتح ======================= */
  lock(due, step = 'ask') {
    this.locked = true;
    this.current = due;
    this.step = step;
    // تجميد المباراة إن كانت جارية
    try {
      const s = this.app && this.app.session;
      if (s && s.running) { this._resumeMatch = true; s.prayerFrozen = true; }
    } catch { }
    try { this.app?.session?.input?.releaseLock?.(); } catch { }
    try { this.app?.audio?.stopAll?.(); } catch { }
    // تنبيه محترم عند دخول الوقت (مرة واحدة لكل صلاة)
    const stamp = (due && due.key) + '|' + dayKey();
    if (this._alerted !== stamp) {
      this._alerted = stamp;
      try { this.app?.audio?.athan?.(); } catch { }
      try { navigator.vibrate && navigator.vibrate([120, 80, 120, 80, 220]); } catch { }
    }
    const el = $('prayer-lock');
    if (el) { el.classList.remove('hidden'); el.setAttribute('aria-hidden', 'false'); }
    this.showStep(step);
    this.updateOverlay();
  }

  unlock(reason = 'confirm') {
    this.locked = false;
    this.current = null;
    this.step = 'ask';
    this.shotData = null;
    this.stopCamera();
    try { localStorage.removeItem(K_PENDING); } catch { }
    const el = $('prayer-lock');
    if (el) { el.classList.add('hidden'); el.setAttribute('aria-hidden', 'true'); }
    try {
      const s = this.app && this.app.session;
      if (s) s.prayerFrozen = false;
    } catch { }
    this._resumeMatch = false;
    this.renderPane();
    return reason;
  }

  /* ======================= إجابات اللاعب ======================= */
  /** «نعم صليت» → فتح القفل ومتابعة اللعب */
  confirmPrayed() {
    if (!this.locked) return false;
    const key = this.current?.key || 'dhuhr';
    this.markDone(key, 'confirm', this.current?.dayShift || 0);
    try { this.app?.ui?.toast?.('تقبّل الله طاعتك 🤲 — عدنا للمعركة', 'ok'); } catch { }
    this.unlock('confirmed');
    return true;
  }

  /** «لا لم أصلِّ» → إغلاق اللعبة وفتح الكاميرا لإثبات الصلاة */
  declinePrayed() {
    if (!this.locked) return false;
    const key = this.current?.key || 'dhuhr';
    // إغلاق اللعبة فوراً
    try {
      const s = this.app && this.app.session;
      if (s && s.running) { s.prayerFrozen = false; s.quit(); s.prayerFrozen = true; }
    } catch { }
    this._resumeMatch = false;
    writeJSON(K_PENDING, { needPhoto: true, key, prayer: this.current, at: Date.now() });
    this.step = 'cam';
    this.showStep('cam');
    this.updateOverlay();
    // محاولة فتح الكاميرا مباشرة (نحن داخل نقرة مستخدم = الإذن مسموح به)
    this.startCamera();
    return true;
  }

  /* ======================= الكاميرا ======================= */
  async startCamera() {
    const note = $('prayer-cam-note');
    const video = $('prayer-cam');
    if (!video) return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (note) note.textContent = '⚠️ لا توجد كاميرا متاحة في هذا المتصفح — استخدم زر «اختر صورة من المعرض» لإرسال صورتك وأنت تصلي.';
      $('prayer-upload-row')?.classList.remove('hidden');
      return false;
    }
    this.stopCamera();
    try {
      if (note) note.textContent = 'جارٍ فتح الكاميرا...';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.stream = stream;
      video.srcObject = stream;
      video.classList.remove('hidden');
      $('prayer-shot')?.classList.add('hidden');
      try { await video.play(); } catch { }
      if (note) note.textContent = 'صوّر نفسك وأنت تصلّي ثم اضغط «التقاط الصورة».';
      $('prayer-capture')?.removeAttribute('disabled');
      return true;
    } catch (e) {
      if (note) note.textContent = '⚠️ تعذّر فتح الكاميرا (' + (e?.name || 'خطأ') + '). امنح الإذن وأعد المحاولة، أو استخدم «اختر صورة من المعرض».';
      $('prayer-upload-row')?.classList.remove('hidden');
      return false;
    }
  }

  stopCamera() {
    try {
      if (this.stream) { this.stream.getTracks().forEach(t => { try { t.stop(); } catch { } }); }
    } catch { }
    this.stream = null;
    const v = $('prayer-cam');
    try { if (v) v.srcObject = null; } catch { }
  }

  async switchCamera() {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    return this.startCamera();
  }

  /** التقاط الصورة من بث الكاميرا */
  capture() {
    const video = $('prayer-cam');
    const shot = $('prayer-shot');
    if (!video || !shot) return false;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    if (!w || !h) return false;
    const scale = Math.min(1, 480 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const cvs = document.createElement('canvas');
    cvs.width = cw; cvs.height = ch;
    const ctx = cvs.getContext('2d');
    try { ctx.drawImage(video, 0, 0, cw, ch); } catch { }
    let data = '';
    try { data = cvs.toDataURL('image/jpeg', 0.62); } catch { data = ''; }
    this.shotData = data || 'captured';
    if (data) { shot.src = data; shot.classList.remove('hidden'); }
    video.classList.add('hidden');
    this.stopCamera();
    this.step = 'shot';
    this.showStep('shot');
    return true;
  }

  /** بديل: رفع صورة من المعرض (لأجهزة بلا كاميرا ويب) */
  async useFile(file) {
    if (!file) return false;
    const data = await new Promise((res) => {
      try {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || ''));
        fr.onerror = () => res('');
        fr.readAsDataURL(file);
      } catch { res(''); }
    });
    if (!data) return false;
    this.shotData = data;
    const shot = $('prayer-shot');
    if (shot) { shot.src = data; shot.classList.remove('hidden'); }
    $('prayer-cam')?.classList.add('hidden');
    this.stopCamera();
    this.step = 'shot';
    this.showStep('shot');
    return true;
  }

  /** إعادة التصوير */
  retake() {
    this.shotData = null;
    this.step = 'cam';
    this.showStep('cam');
    return this.startCamera();
  }

  /** اعتماد الصورة → فتح القفل */
  submitPhoto() {
    if (!this.shotData) return false;
    const key = this.current?.key || readJSON(K_PENDING, {})?.key || 'dhuhr';
    this.addProof({ day: dayKey(), key, at: Date.now(), img: String(this.shotData).slice(0, 400000) });
    this.markDone(key, 'photo', this.current?.dayShift || 0);
    try { localStorage.removeItem(K_PENDING); } catch { }
    try { this.app?.ui?.toast?.('تم استلام صورة الصلاة — تقبّل الله 🤲', 'ok'); } catch { }
    this.unlock('photo');
    return true;
  }

  /* ======================= الواجهة ======================= */
  showStep(step) {
    for (const el of document.querySelectorAll('[data-prayer-step]')) {
      el.classList.toggle('hidden', el.getAttribute('data-prayer-step') !== step);
    }
  }

  updateOverlay(st) {
    if (!this.locked) return;
    const key = this.current?.key || 'dhuhr';
    const name = PRAYER_AR[key] || key;
    const t = (st && st.times) || this.times();
    const title = $('prayer-title');
    if (title) title.textContent = `🕌 حان وقت صلاة ${name}`;
    const sub = $('prayer-sub');
    if (sub) {
      const at = fmtTime(t[key] ?? 0);
      const since = Math.max(0, Math.round(minutesOfDay() - (this.current?.start ?? t[key] ?? 0)));
      sub.textContent = `الأذان عند ${at} · مضى ${since} دقيقة — اللعبة متوقفة حتى تؤكّد صلاتك.`;
    }
    const camTitle = $('prayer-cam-title');
    if (camTitle) camTitle.textContent = `📵 تم إغلاق اللعبة — صوّر نفسك وأنت تصلّي ${name}`;
  }

  updateChip(st) {
    const chip = $('prayer-chip');
    if (!chip) return;
    if (!this.cfg.enabled) { chip.textContent = '🕌 حارس الصلاة: متوقف'; return; }
    const n = st?.next;
    if (!n) { chip.textContent = '🕌 مواقيت الصلاة'; return; }
    const mins = Math.max(0, Math.round(n.in));
    const h = Math.floor(mins / 60), m = mins % 60;
    const left = h ? `${h} س ${m} د` : `${m} د`;
    chip.textContent = `🕌 ${PRAYER_AR[n.key]} ${fmtTime(n.at)} · بعد ${left}`;
  }

  /** جدول المواقيت داخل صفحة «مواقيت الصلاة» */
  renderPaneTimes(st) {
    const box = $('prayer-times-list');
    if (!box) return;
    const s = st || this.status();
    const rows = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => {
      const isNext = s.next && s.next.key === k;
      const watched = this.watched.includes(k);
      return `<div class="ptime ${isNext ? 'next' : ''}">
        <span class="pname">${PRAYER_AR[k]}${watched ? ' <b class="pguard" title="اللعبة تتوقف عند هذا الوقت">🔒</b>' : ''}</span>
        <span class="pval">${fmtTime(s.times[k])}</span>
      </div>`;
    }).join('');
    box.innerHTML = rows;
    const nx = $('prayer-next');
    if (nx && s.next) {
      const mins = Math.max(0, Math.round(s.next.in));
      const h = Math.floor(mins / 60), m = mins % 60;
      nx.textContent = `الصلاة القادمة: ${PRAYER_AR[s.next.key]} — ${fmtTime(s.next.at)} (بعد ${h ? h + ' ساعة و ' : ''}${m} دقيقة)`;
    }
  }

  /** إعدادات + سجل الإثباتات */
  renderPane() {
    const sel = $('prayer-city');
    if (sel && !sel.options.length) {
      sel.innerHTML = CITIES.map(c => `<option value="${c.id}">${c.ar}</option>`).join('') +
        '<option value="custom">📍 إحداثيات يدوية</option>';
    }
    if (sel) sel.value = this.cfg.cityId || 'custom';
    const msel = $('prayer-method');
    if (msel && !msel.options.length) {
      msel.innerHTML = Object.values(METHODS).map(m => `<option value="${m.id}">${m.ar}</option>`).join('');
    }
    if (msel) msel.value = this.cfg.method;
    const asel = $('prayer-asr');
    if (asel) asel.value = this.cfg.asr;
    const en = $('prayer-enabled');
    if (en) en.checked = this.cfg.enabled !== false;
    const fj = $('prayer-fajr');
    if (fj) fj.checked = !!this.cfg.watchFajr;
    const la = $('prayer-lat'), ln = $('prayer-lng');
    if (la) la.value = this.cfg.lat;
    if (ln) ln.value = this.cfg.lng;
    const log = $('prayer-proofs');
    if (log) {
      const list = this.proofs();
      log.innerHTML = list.length
        ? list.map(p => `<figure class="proof"><img src="${p.img}" alt="إثبات صلاة ${PRAYER_AR[p.key] || ''}" />
            <figcaption>${PRAYER_AR[p.key] || p.key} · ${p.day}</figcaption></figure>`).join('')
        : '<p class="hint">لا توجد صور إثبات — بارك الله فيك، حافظ على صلاتك في وقتها 🤲</p>';
    }
    this.renderPaneTimes();
  }

  /** تحديد الموقع تلقائياً */
  detectLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(false); return; }
      navigator.geolocation.getCurrentPosition((pos) => {
        this.cfg.lat = +pos.coords.latitude.toFixed(4);
        this.cfg.lng = +pos.coords.longitude.toFixed(4);
        this.cfg.cityId = 'custom';
        this.saveCfg();
        try { this.app?.ui?.toast?.('📍 تم ضبط موقعك — المواقيت مُحدّثة', 'ok'); } catch { }
        resolve(true);
      }, () => {
        try { this.app?.ui?.toast?.('تعذّر تحديد الموقع — اختر مدينتك يدوياً', 'err'); } catch { }
        resolve(false);
      }, { timeout: 8000, maximumAge: 600000 });
    });
  }

  /** تخمين المدينة من المنطقة الزمنية للجهاز (أول تشغيل فقط) */
  guessCity() {
    const ZONES = {
      'Asia/Riyadh': 'riyadh', 'Asia/Mecca': 'makkah', 'Africa/Cairo': 'cairo',
      'Asia/Dubai': 'dubai', 'Asia/Qatar': 'doha', 'Asia/Kuwait': 'kuwait',
      'Asia/Bahrain': 'manama', 'Asia/Muscat': 'muscat', 'Asia/Aden': 'sanaa',
      'Asia/Amman': 'amman', 'Asia/Beirut': 'beirut', 'Asia/Damascus': 'damascus',
      'Asia/Baghdad': 'baghdad', 'Asia/Hebron': 'gaza', 'Asia/Gaza': 'gaza',
      'Asia/Jerusalem': 'jerusalem', 'Africa/Khartoum': 'khartoum', 'Africa/Tripoli': 'tripoli',
      'Africa/Tunis': 'tunis', 'Africa/Algiers': 'algiers', 'Africa/Casablanca': 'casa',
      'Africa/Nouakchott': 'nouakchott', 'Africa/Mogadishu': 'mogadishu', 'Europe/Istanbul': 'istanbul',
      'Asia/Karachi': 'karachi', 'Asia/Jakarta': 'jakarta', 'Asia/Kuala_Lumpur': 'kl',
      'Europe/London': 'london', 'Europe/Paris': 'paris', 'Europe/Berlin': 'berlin',
      'America/New_York': 'newyork', 'America/Toronto': 'toronto',
    };
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { }
    if (ZONES[zone]) return this.setCityQuiet(ZONES[zone]);
    // احتياط: أقرب مدينة لفارق التوقيت
    const tz = -new Date().getTimezoneOffset() / 60;
    let best = null, bd = 1e9;
    for (const c of CITIES) {
      const d = Math.abs(tz - c.lng / 15);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 2.5) return this.setCityQuiet(best.id);
    return false;
  }

  setCityQuiet(id) {
    const c = CITIES.find(x => x.id === id);
    if (!c) return false;
    this.cfg.cityId = c.id; this.cfg.lat = c.lat; this.cfg.lng = c.lng; this.cfg.method = c.method;
    return true;
  }

  setCity(id) {
    const c = CITIES.find(x => x.id === id);
    if (!c) { this.cfg.cityId = 'custom'; this.saveCfg(); return false; }
    this.cfg.cityId = c.id; this.cfg.lat = c.lat; this.cfg.lng = c.lng; this.cfg.method = c.method;
    this.saveCfg();
    return true;
  }

  /* ======================= ربط الأزرار ======================= */
  bindUI() {
    if (this.bound || typeof document === 'undefined') return;
    this.bound = true;
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

    on('prayer-yes', 'click', () => this.confirmPrayed());
    on('prayer-no', 'click', () => this.declinePrayed());
    on('prayer-cam-start', 'click', () => this.startCamera());
    on('prayer-cam-switch', 'click', () => this.switchCamera());
    on('prayer-capture', 'click', () => this.capture());
    on('prayer-retake', 'click', () => this.retake());
    on('prayer-submit', 'click', () => this.submitPhoto());
    on('prayer-file', 'change', (e) => { const f = e.target.files && e.target.files[0]; if (f) this.useFile(f); });

    on('prayer-city', 'change', (e) => this.setCity(e.target.value));
    on('prayer-method', 'change', (e) => { this.cfg.method = e.target.value; this.saveCfg(); });
    on('prayer-asr', 'change', (e) => { this.cfg.asr = e.target.value; this.saveCfg(); });
    on('prayer-enabled', 'change', (e) => { this.cfg.enabled = !!e.target.checked; this.saveCfg(); });
    on('prayer-fajr', 'change', (e) => { this.cfg.watchFajr = !!e.target.checked; this.saveCfg(); });
    on('prayer-lat', 'change', (e) => { this.cfg.lat = +e.target.value || 0; this.cfg.cityId = 'custom'; this.saveCfg(); });
    on('prayer-lng', 'change', (e) => { this.cfg.lng = +e.target.value || 0; this.cfg.cityId = 'custom'; this.saveCfg(); });
    on('prayer-locate', 'click', () => this.detectLocation());

    this.renderPane();
  }
}

export default PrayerGuard;
