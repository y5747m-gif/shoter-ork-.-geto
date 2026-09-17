/**
 * ORK ZONE — orientation.js
 * يضمن أن تُلعب المباراة **بالعرض (Landscape)**:
 *  1. يكشف اتجاه الشاشة الحالي (أفقي/عمودي) من أبعاد النافذة وواجهة Screen Orientation.
 *  2. يعرض طبقة «أدر جهازك» عندما يكون الجهاز عمودياً (على أجهزة اللمس افتراضياً).
 *  3. يطلب قفل الاتجاه أفقياً — ملء الشاشة ثم screen.orientation.lock('landscape').
 *  4. يعيد ضبط مقاسات الرسم عند كل تدوير أو تغيير في حجم النافذة.
 *  5. يجمّد المحاكاة أثناء ظهور طبقة التدوير حتى لا يُقصى اللاعب وهو يدير جهازه.
 * ملاحظة: آيفون لا يدعم قفل الاتجاه برمجياً، لذلك تبقى التعليمات اليدوية كخيار بديل.
 */

export const HINT_ID = 'rotate-hint';

const mq = (q) => {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') return window.matchMedia(q);
  } catch { /* لا شيء */ }
  return null;
};

/** كائن الشاشة (واجهة Screen Orientation) — من window.screen أو العام */
const screenObj = () => {
  try {
    if (typeof window !== 'undefined' && window.screen) return window.screen;
    if (typeof screen !== 'undefined' && screen) return screen;
  } catch { /* لا شيء */ }
  return null;
};

/** واجهة Screen Orientation إن توفرت */
const orientationApi = () => {
  const s = screenObj();
  return (s && s.orientation) || null;
};

export class Orientation {
  constructor(app) {
    this.app = app || null;
    /** null = تلقائي (أجهزة اللمس فقط) | true = إجبار | false = إيقاف */
    this.enforced = null;
    /** اللاعب اختار «المتابعة بالوضع العمودي» — يُصفَّر عند التدوير الفعلي */
    this.dismissed = false;
    /** أوقف اللاعب القفل التلقائي لبقية الجلسة */
    this.autoLockOff = false;
    /** فشل القفل البرمجي: نُظهر تعليمات التدوير اليدوي (آيفون) */
    this.manualNote = false;
    /** نتيجة آخر محاولة قفل */
    this.lastLock = null;
    /** دالة تُستدعى عند تغيّر الاتجاه: (dir, prev) */
    this.onChange = null;
    this._dir = null;
    this._w = 0;
    this._h = 0;
    this._bound = false;
  }

  /* ============================= الكشف ============================= */

  /** هل الجهاز يعمل باللمس؟ */
  get touch() {
    try {
      const m = mq('(pointer: coarse)');
      if (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number') {
        // المتصفح الحديث يبلّغ عدد نقاط اللمس صراحةً — وهو أدق من وجود معالجات اللمس
        if (navigator.maxTouchPoints > 0) return true;
        return !!(m && m.matches);
      }
      if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
      if (m && m.matches) return true;
    } catch { /* لا شيء */ }
    return false;
  }

  /** نوع الاتجاه كما يبلّغه المتصفح (إن وُجد) */
  get apiType() {
    try {
      const so = orientationApi();
      if (so && typeof so.type === 'string') return so.type;
    } catch { /* لا شيء */ }
    return '';
  }

  /** هل المتصفح يدعم قفل الاتجاه؟ */
  get lockSupported() {
    try {
      const so = orientationApi();
      return !!(so && typeof so.lock === 'function');
    } catch { return false; }
  }

  /** الاتجاه الحالي: 'portrait' | 'landscape' */
  get direction() {
    const t = this.apiType;
    if (t) return t.indexOf('portrait') === 0 ? 'portrait' : 'landscape';
    const w = (typeof window !== 'undefined' && window.innerWidth) || 0;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 0;
    if (w && h) return h > w ? 'portrait' : 'landscape';
    const m = mq('(orientation: portrait)');
    if (m) return m.matches ? 'portrait' : 'landscape';
    return 'landscape';
  }

  get portrait() { return this.direction === 'portrait'; }
  get landscape() { return this.direction === 'landscape'; }

  /** نافذة بعرض هاتف (مثل iframe عمودي على الكمبيوتر) */
  get phoneSized() {
    const w = (typeof window !== 'undefined' && window.innerWidth) || 0;
    return !!w && w < 900;
  }

  /** هل نُجبر اللعب بالعرض؟ (تلقائياً: أجهزة اللمس أو نافذة بعرض هاتف) */
  get shouldEnforce() {
    if (this.enforced === true) return true;
    if (this.enforced === false) return false;
    return this.touch || this.phoneSized;
  }

  /** هل الطبقة حاجبة الآن؟ */
  get blocked() { return this.shouldEnforce && this.portrait && !this.dismissed; }

  /* ============================= الربط ============================= */

  init() {
    if (this._bound || typeof window === 'undefined' || typeof document === 'undefined') return this;
    this._bound = true;

    const m = mq('(orientation: portrait)');
    if (m) {
      const handler = () => { this.dismissed = false; this.update(); };
      if (typeof m.addEventListener === 'function') m.addEventListener('change', handler);
      else if (typeof m.addListener === 'function') m.addListener(handler);
    }
    try {
      const so = orientationApi();
      if (so && typeof so.addEventListener === 'function') {
        so.addEventListener('change', () => { this.dismissed = false; this.update(); });
      }
    } catch { /* لا شيء */ }

    window.addEventListener('resize', () => this.update());
    // التدوير على الهاتف: يعيد القياس بعد استقرار الأبعاد
    window.addEventListener('orientationchange', () => {
      this.dismissed = false;
      this.update();
      setTimeout(() => this.update(), 80);
      setTimeout(() => this.update(), 320);
    });
    document.addEventListener('fullscreenchange', () => this.update());
    document.addEventListener('webkitfullscreenchange', () => this.update());

    // أزرار الطبقة
    const auto = document.getElementById('btn-rotate-auto');
    if (auto) auto.onclick = () => { this.tryLock(true); };
    const later = document.getElementById('btn-rotate-later');
    if (later) later.onclick = () => { this.dismiss(true); };

    this.update();
    return this;
  }

  /* ============================= الحالة ============================= */

  /** يفرض/يوقف الوضع الأفقي (من الإعدادات) */
  setEnforced(v) {
    this.enforced = (v === true || v === false) ? v : null;
    this.dismissed = false;
    this.update();
    return this.shouldEnforce;
  }

  /** «المتابعة بالوضع العمودي» */
  dismiss(byUser) {
    this.dismissed = true;
    if (byUser) {
      this.autoLockOff = true;
      this.toast('📱 تكمل بالوضع العمودي — أعد التدوير أفقياً للعب الأمثل', 'ok');
    }
    this.update();
  }

  /** يعيد الضبط بعد التدوير أو تغيير الإعدادات */
  update() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const dir = this.direction;
    const root = document.documentElement;
    if (root && root.classList) {
      root.classList.toggle('portrait', dir === 'portrait');
      root.classList.toggle('landscape', dir === 'landscape');
      root.classList.toggle('force-landscape', this.shouldEnforce);
      root.classList.toggle('touch-device', this.touch);
    }

    // مقاسات الرسم: أي تغيير في الأبعاد (تدوير/نافذة/ملء الشاشة) يعيد ضبط الكانفس
    const w = window.innerWidth || 0, h = window.innerHeight || 0;
    if (w && h && (w !== this._w || h !== this._h)) {
      this._w = w; this._h = h;
      this.resizeCanvas();
    }

    // الطبقة وأزرارها
    const hint = document.getElementById(HINT_ID);
    if (hint && hint.classList) {
      hint.classList.toggle('hidden', !this.blocked);
      if (this.blocked) {
        const auto = document.getElementById('btn-rotate-auto');
        if (auto) auto.classList.toggle('hidden', !this.lockSupported);
        const note = document.getElementById('rh-note');
        if (note) note.classList.toggle('hidden', this.lockSupported && !this.manualNote);
      }
    }

    // تجميد المحاكاة أثناء الطبقة (حتى لا تموت وأنت تدير جهازك)
    const s = this.app && this.app.session;
    if (s) s.holdForRotation = !!(this.blocked && s.running);

    if (dir !== this._dir) {
      const prev = this._dir;
      this._dir = dir;
      if (prev) {
        // دوّر جهازه فعلياً: نعيد التذكير إن رجع إلى العمودي لاحقاً
        if (dir === 'landscape') { this.dismissed = false; this.manualNote = false; }
        try { if (typeof this.onChange === 'function') this.onChange(dir, prev); } catch { /* لا شيء */ }
      }
    }
  }

  /** يعيد ضبط مقاسات الرسم (2D + 3D) */
  resizeCanvas() {
    const s = this.app && this.app.session;
    if (!s || !s.renderer) return;
    try { s.renderer.resize(); } catch { /* لا شيء */ }
    try { if (s.renderer.r3) { s.renderer.r3.dpr = s.renderer.dpr; s.renderer.r3.w = s.renderer.w; s.renderer.r3.h = s.renderer.h; } } catch { /* لا شيء */ }
    try { if (s.dropPhase) s.drawDropMap(); } catch { /* لا شيء */ }
    try { s.updateLookHint(); } catch { /* لا شيء */ }
  }

  toast(msg, kind) {
    try { if (this.app && this.app.ui && this.app.ui.toast) this.app.ui.toast(msg, kind || 'ok'); } catch { /* لا شيء */ }
  }

  /* ============================= القفل ============================= */

  /** ملء الشاشة (مطلوب قبل قفل الاتجاه في أغلب المتصفحات) */
  async enterFullscreen() {
    if (typeof document === 'undefined') return false;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return true;
      const el = document.documentElement;
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (!fn) return false;
      const r = fn.call(el, { navigationUI: 'hide' });
      if (r && typeof r.then === 'function') await r;
      return true;
    } catch { return false; }
  }

  /**
   * يحاول تشغيل اللعبة بالعرض: ملء الشاشة ثم قفل الاتجاه.
   * يجب استدعاؤها داخل تفاعل المستخدم (نقرة) وإلا رفضها المتصفح.
   */
  async requestLandscape() {
    const res = { fullscreen: false, locked: false, unsupported: false, error: null };
    this.lastLock = res;
    res.fullscreen = await this.enterFullscreen();
    try {
      const so = orientationApi();
      if (so && typeof so.lock === 'function') {
        await so.lock('landscape');
        res.locked = true;
      } else {
        res.unsupported = true;
      }
    } catch (e) {
      res.error = (e && (e.name || e.message)) || 'lock-failed';
    }
    // آيفون ومتصفحات لا تسمح بالقفل: نُظهر طريقة التدوير اليدوي بدل زر لا يعمل
    if (!res.locked) this.manualNote = true;
    this.update();
    return res;
  }

  /** محاولة قفل مع رسالة للاعب */
  async tryLock(announce) {
    const r = await this.requestLandscape();
    if (announce) {
      if (r.locked) this.toast('🔒 الوضع الأفقي مفعّل — لن يدور العرض تلقائياً', 'ok');
      else if (r.fullscreen) this.toast('🔄 ملء الشاشة جاهز — أدر جهازك أفقياً الآن', 'ok');
      else this.toast('📱 متصفحك لا يسمح بالقفل التلقائي — أدر جهازك أفقياً يدوياً', 'err');
    }
    return r;
  }

  /** قبل بدء المباراة: إن كان الجهاز عمودياً نطلب الوضع الأفقي (داخل نقرة المستخدم) */
  beforeMatchStart() {
    if (!this.shouldEnforce) return null;
    if (!this.portrait) return null;
    if (this.autoLockOff) return null;
    if (!this.lockSupported && !this.fullscreenSupported()) return null;
    return this.tryLock(true);
  }

  fullscreenSupported() {
    try {
      const el = document.documentElement;
      return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen));
    } catch { return false; }
  }
}

export default Orientation;
