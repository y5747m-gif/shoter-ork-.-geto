/**
 * ORK ZONE — client/main.js
 * نقطة التمهيد: تحميل الحساب، ربط الشبكة، تشغيل حلقة اللعب، وربط كل الأزرار.
 */
import { API, Net } from './net.js';
import Audio2 from './audio.js';
import { Session } from './game.js';
import UI from './ui.js';
import PrayerGuard from './prayer.js';
import { MODES, MAPS, GAME } from '/shared/gamedata.js';

const $ = (id) => document.getElementById(id);
const TIPS = [
  'نصيحة: اهبط على المناطق الحمراء للحصول على أقوى الأسلحة!',
  'نصيحة: الإنزال الجوي يحمل AWM وجروزا والمنجل الدوار.',
  'نصيحة: اقفل باب الغرفة واصطحب أصدقاءك في غرفة خاصة.',
  'نصيحة: المدرعة تتحمل الانفجارات — لكن الحمم تحرق كل شيء.',
  'نصيحة: حرّك الزاوية: القناص في الخلف، الرشاش في المقدمة.',
  'نصيحة: فعّل مهماتك اليومية لجني الذهب والجواهر.',
  'نصيحة: الشخصيات الأسطورية لها مهارات تغيّر مجرى المعركة.',
];

class App {
  constructor() {
    this.audio = new Audio2();
    this.net = new Net();
    this.token = null;
    try { this.token = localStorage.getItem('orkz_token') || null; } catch {}
    this.profile = null;
    this.ui = new UI(this);
    this.session = new Session(this);
    // 🕌 حارس مواقيت الصلاة — يعطّل اللعبة عند دخول وقت الصلاة
    this.prayer = new PrayerGuard(this);
    // عند اكتشاف غياب السيرفر (استضافة ثابتة): وضع محلي كامل + إيقاف محاولات الأونلاين
    API.onOffline = () => {
      // إيقاف محاولات الأونلاين بصمت — لا نُظهر أي رسالة علوية تزعج اللاعب
      try { this.net.stop(); } catch {}
    };
    // الجودة «تلقائي» هي الافتراضي: تكتشف قوة الجهاز ثم تتكيّف لحظياً مع معدل الإطارات
    // (الأجهزة الضعيفة و٣٠fps تنخفض لها الدقة تلقائياً، والأجهزة القوية ترتفع لها)
    this.quality = 'auto';
    try {
      this.quality = localStorage.getItem('orkz_quality') || 'auto';
      if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(this.quality)) this.quality = 'auto';
    } catch {}
    this.deviceTier = 'medium';   // درجة جهاز المستخدم المكتشفة
    this.autoTier = null;         // الدرجة الحالية للوضع التلقائي (تتغيّر مع الأداء)
    this.perf = { fps: 60, lowT: 0, highT: 0, cooldown: 0, showT: 0 };
    const defSettings = { sfx: 0.8, sens: 1, tsens: 1, autofire: false, blood: true, touch: false, aimassist: true, vibrate: true, tapfire: false, view: 'fps', uiMode: 'auto', dropMode: 'manual', dropRemember: false };
    try {
      const saved = JSON.parse(localStorage.getItem('orkz_settings') || '{}');
      this.settings = { ...defSettings, ...saved };
    } catch {
      this.settings = { ...defSettings };
    }
    this._loadIt = null;
    this.bootDone = false;
  }

  detectDevice() {
    try {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const small = Math.min(innerWidth, innerHeight) <= 900;
      // نافذة قصيرة على الكمبيوتر ليست هاتفاً: نعتمد اللمس/coarse/وكيل المستخدم فقط
      const isMobile = coarse || (touch && small) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      this.isMobile = isMobile;
      this.deviceTier = this.detectTier(isMobile);
      // فعّل أزرار اللمس تلقائياً على الأجهزة اللمسية — مرة واحدة فقط (لا نلغي اختيار اللاعب)
      if (isMobile && (coarse || touch)) {
        let had = false;
        try { had = !!localStorage.getItem('orkz_settings'); } catch {}
        if (!had) {
          this.settings.touch = true;
          try { localStorage.setItem('orkz_settings', JSON.stringify(this.settings)); } catch {}
        }
      }
      document.documentElement.classList.toggle('is-touch', !!isMobile);
      document.documentElement.classList.toggle('is-desktop', !isMobile);
      this.applyUiMode();
      return isMobile;
    } catch { this.isMobile = false; try { this.applyUiMode(); } catch {} return false; }
  }

  /**
   * 📐 مقاس الواجهة حسب الجهاز.
   * يضبط السمة data-ui على <html> (phone | tablet | desktop) والمتغيرات
   * --ui-scale و --app-h، فتتكيّف كل نوافذ اللعبة تلقائياً.
   * اللاعب يستطيع فرض المقاس من الإعدادات (تلقائي / هاتف / لوحي / كمبيوتر).
   */
  detectUiMode() {
    const pref = (this.settings && this.settings.uiMode) || 'auto';
    if (pref === 'phone' || pref === 'tablet' || pref === 'desktop') return pref;
    const w = window.innerWidth || 1024, h = window.innerHeight || 768;
    const shortSide = Math.min(w, h), longSide = Math.max(w, h);
    if (!this.isMobile) {
      // كمبيوتر: نافذة صغيرة جداً تُعامل كجهاز لوحي حتى تبقى النوافذ داخل الشاشة
      if (longSide < 900 || h < 560) return 'tablet';
      return 'desktop';
    }
    // جهاز لمسي: الفاصل بين الهاتف والجهاز اللوحي بالضلع الأقصر
    if (shortSide >= 600 && longSide >= 960) return 'tablet';
    return 'phone';
  }

  applyUiMode() {
    try {
      const root = document.documentElement;
      const mode = this.detectUiMode();
      this.uiMode = mode;
      root.setAttribute('data-ui', mode);
      root.classList.toggle('ui-phone', mode === 'phone');
      root.classList.toggle('ui-tablet', mode === 'tablet');
      root.classList.toggle('ui-desktop', mode === 'desktop');
      // الارتفاع الحقيقي للنافذة (يتفادى شريط عنوان المتصفح على الهواتف)
      const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight) || window.innerHeight || 720;
      root.style.setProperty('--app-h', Math.round(vh) + 'px');
      // معامل تصغير إضافي للشاشات القصيرة جداً حتى لا تخرج أي نافذة عن الشاشة
      let scale = mode === 'phone' ? 0.88 : mode === 'tablet' ? 0.95 : 1;
      if (vh < 420) scale *= 0.92;
      if (vh < 340) scale *= 0.92;
      scale = Math.max(0.7, Math.min(1.15, scale));
      root.style.setProperty('--ui-scale', scale.toFixed(3));
      const sel = document.getElementById('set-uisize');
      if (sel) sel.value = (this.settings && this.settings.uiMode) || 'auto';
      return mode;
    } catch { return 'desktop'; }
  }

  /** تقدير قوة الجهاز → درجة جودة ابتدائية للوضع «تلقائي» (ضعيف/متوسط/قوي) */
  detectTier(isMobile) {
    try {
      let score = 0;
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 0;          // جيجابايت (كروم فقط — البقية 0)
      if (cores >= 12) score += 3;
      else if (cores >= 8) score += 2;
      else if (cores >= 6) score += 1;
      else score -= 1;
      if (mem >= 8) score += 2;
      else if (mem >= 4) score += 1;
      else if (mem > 0) score -= 1;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.max((screen && screen.width) || 0, (screen && screen.height) || 0) * dpr;
      if (px >= 2200) score += 1;                       // شاشة عالية الدقة تحتاج قوة أعلى
      if (isMobile) score -= 2;                         // الراسم البرمجي أثقل على الهواتف
      if (cores <= 4 || (mem > 0 && mem <= 3)) score -= 2;   // جهاز ضعيف
      if (/Android [4-9]\./.test(navigator.userAgent || '')) score -= 1;
      if (score >= 3) return 'high';
      if (score >= 1) return 'medium';
      return 'low';
    } catch { return 'medium'; }
  }

  /** الجودة الفعلية المطبَّقة على الراسم */
  effectiveQuality() {
    if (this.quality !== 'auto') return this.quality;
    return this.autoTier || this.deviceTier || 'medium';
  }
  applyQuality() {
    try { this.session.renderer.setQuality(this.effectiveQuality()); } catch {}
    const q = $('set-quality');
    if (q) q.value = this.quality;
  }

  /**
   * حاكم الأداء (للوضع «تلقائي»): يراقب معدل الإطارات لحظياً —
   * الأجهزة الضعيفة/٣٠fps تنخفض لها الجودة تلقائياً حتى تستقر،
   * والأجهزة القوية ترتفع لها تدريجياً حتى الحد المكتشف لجهازها.
   */
  perfTick(dt) {
    const p = this.perf;
    const inst = dt > 0 ? Math.min(240, 1 / dt) : 60;
    p.fps += (inst - p.fps) * 0.05;                     // متوسط منزلق
    p.cooldown = Math.max(0, p.cooldown - dt);
    // عرض معدل الإطارات في الـ HUD (مرتين في الثانية)
    p.showT += dt;
    if (p.showT > 0.5) {
      p.showT = 0;
      const el = $('hud-fps');
      if (el) {
        const f = Math.round(p.fps);
        el.textContent = f + ' FPS';
        el.style.color = f >= 50 ? '#9fe8a8' : f >= 28 ? '#ffd166' : '#ff8a9a';
      }
    }
    if (this.quality !== 'auto' || p.cooldown > 0) return;
    const tiers = ['low', 'medium', 'high', 'ultra'];
    let i = tiers.indexOf(this.autoTier || this.deviceTier);
    if (p.fps < 27) {
      // تهنيج مستمر ثانيتين → انزل درجة كاملة (دقة أقل + مسافة رسم أقل + جسيمات أقل)
      p.lowT += dt;
      if (p.lowT >= 2 && i > 0) {
        i--;
        this.autoTier = tiers[i];
        this.applyQuality();
        p.cooldown = 5; p.lowT = 0; p.highT = 0;
      }
    } else {
      p.lowT = 0;
      if (p.fps > 55 && i >= 0 && i < tiers.indexOf(this.deviceTier)) {
        // أداء فائض مستقر ٨ ثوانٍ → اصعد درجة تدريجياً حتى حد الجهاز
        p.highT += dt;
        if (p.highT >= 8) {
          i++;
          this.autoTier = tiers[i];
          this.applyQuality();
          p.cooldown = 6; p.highT = 0;
        }
      } else if (p.fps <= 55) {
        p.highT = 0;
      }
    }
  }

  setupUniversalSupport() {
    // اكتشاف الجهاز وتحديث عند التدوير
    this.detectDevice();
    const onResize = () => {
      try { this.detectDevice(); } catch {}
      try { this.session.renderer.resize(); } catch {}
      try { if (window.__orkTryLandscape) window.__orkTryLandscape(); } catch {}
      // تحسين الـ viewport على iOS عند ظهور شريط العنوان
      try { document.documentElement.style.setProperty('--vh', (window.visualViewport ? window.visualViewport.height : innerHeight) * 0.01 + 'px'); } catch {}
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
    try { window.visualViewport && window.visualViewport.addEventListener('resize', onResize); } catch {}
    // محاولة قفل أفقي عند أول تفاعل أثناء اللعب
    const tryFs = async () => {
      try { if (window.__orkTryLandscape) await window.__orkTryLandscape(); } catch {}
    };
    window.addEventListener('click', tryFs, {capture:true});
    window.addEventListener('touchend', tryFs, {capture:true, once:true});
    onResize();
  }

  async boot() {
    try {
      this.setupUniversalSupport();
      this.loadingAnim();
      const t0 = performance.now();
      try { this.audio.init(); } catch {}
      try { this.prayer.init(); } catch (e) { console.warn('[prayer] init', e); }
      // تحقق من الجلسة
      let ok = false;
      if (this.token) {
        try {
          const r = await API.get('/api/profile?token=' + encodeURIComponent(this.token), 4000);
          if (r && r.profile) {
            this.profile = r.profile;
            ok = true;
          } else {
            try { localStorage.removeItem('orkz_token'); } catch {}
            this.token = null;
          }
        } catch {}
      }
      try { this.net.connect(this.token); } catch {}
      try { this.bindNet(); } catch {}
      try { this.bindUI(); } catch {}
      try { this.applySettings(); } catch {}
      try { this.applyQuality(); } catch {}

      // شريط التحميل
      const steps = [
        'جاري تجهيز الساحة...',
        'توليد الخرائط الخمس...',
        'تحميل الأسلحة والاسكنات...',
        'تجهيز ٥٠ مقاتلاً...',
        'جاهز!'
      ];
      for (let i = 0; i < steps.length; i++) {
        const sEl = $('load-status'), fEl = $('load-fill');
        if (sEl) sEl.textContent = steps[i];
        if (fEl) fEl.style.width = ((i + 1) / steps.length * 100) + '%';
        await sleep(150);
      }
      if (this._loadIt) { clearInterval(this._loadIt); this._loadIt = null; }
      const tipEl = $('load-tip');
      if (tipEl) tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      const wait = Math.max(0, 500 - (performance.now() - t0));
      if (wait) await sleep(wait);

      // إنهاء شاشة التحميل وإبلاغ المراقب المبكر بنجاح التمهيد
      this.bootDone = true;
      try { if (typeof window !== 'undefined' && window.__orkBootOk) window.__orkBootOk(); } catch {}
      $('scr-loading')?.classList.remove('active');
      if (ok) {
        try { this.ui.showMenu(); } catch (e) {
          console.error('[boot] showMenu error:', e);
          $('scr-auth')?.classList.add('active');
        }
      } else {
        $('scr-auth')?.classList.add('active');
      }
    } catch (err) {
      console.error('[boot] uncaught error:', err);
      if (this._loadIt) { clearInterval(this._loadIt); this._loadIt = null; }
      this.bootDone = true;
      $('scr-loading')?.classList.remove('active');
      $('scr-auth')?.classList.add('active');
      // رسالة واضحة + زر إعادة تحميل بدل شاشة صامتة
      try { if (typeof window !== 'undefined' && window.__orkBootFail) window.__orkBootFail('حدث خطأ أثناء تجهيز اللعبة'); } catch {}
    }
    this.loop();
  }

  loadingAnim() {
    const el = $('load-fill');
    if (!el) return;
    this._loadIt = setInterval(() => {
      const cur = parseFloat(el.style.width) || 0;
      if (cur >= 38) return;                       // خطوات التمهيد سبقتنا — لا نرجع الشريط للوراء
      el.style.width = Math.min(38, cur + Math.random() * 6) + '%';
    }, 120);
    setTimeout(() => {
      if (this._loadIt) { clearInterval(this._loadIt); this._loadIt = null; }
    }, 3000);
  }

  /* ---------- الشبكة ---------- */
  bindNet() {
    this.net.on('authOk', msg => {
      this.profile = msg.profile;
      if (msg.token) {
        this.token = msg.token;
        try { localStorage.setItem('orkz_token', msg.token); } catch {}
      }
      this.ui.updateProfile();
    });
    this.net.on('authFail', () => {
      try { localStorage.removeItem('orkz_token'); } catch {}
      this.token = null;
    });
    this.net.on('queued', msg => {
      this.ui.toast('تم الدخول للغرفة ' + (msg.code ? '· الرمز ' + msg.code : ''), 'ok');
    });
    this.net.on('lobby', msg => this.ui.onLobby(msg.room));
    this.net.on('start', msg => {
      this.session.onStart(msg.info);
      $('scr-room')?.classList.remove('active');
    });
    this.net.on('snap', msg => this.session.onSnapshot(msg));
    this.net.on('ev', msg => this.session.onEvents(msg));
    this.net.on('matchEnd', msg => this.session.onMatchEnd(msg));
    this.net.on('rewards', msg => this.session.onRewards(msg));
    this.net.on('chat', msg => this.ui.onChat(msg));
    this.net.on('error', msg => this.ui.toast((msg && msg.error) || '⚠️ تعذر الاتصال بالسيرفر — تأكد من تشغيله', 'err'));
    this.net.on('youDied', msg => this.session.toastBig('☠️ ' + (msg.by ? 'أقصاك ' + msg.by : 'تم إقصاؤك')));
    this.net.on('ping', () => {});
    this.net.pingLoop();
  }

  /* ---------- الأحداث العامة ---------- */
  bindUI() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

    // تبويبات الدخول
    for (const t of document.querySelectorAll('[data-authtab]')) {
      t.onclick = () => {
        document.querySelectorAll('[data-authtab]').forEach(x => x.classList.toggle('active', x === t));
        document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.authtab));
        this.audio.ui();
      };
    }
    on('btn-guest', () => this.doGuest($('guest-name')?.value?.trim() || ''));
    on('btn-register', () => this.doRegister($('reg-name')?.value?.trim() || '', $('reg-pass')?.value || ''));
    on('btn-login', () => this.doLogin($('login-name')?.value?.trim() || '', $('login-pass')?.value || ''));

    // قائمة جانبية
    for (const b of document.querySelectorAll('.side-btn')) {
      b.onclick = () => { this.ui.openPane(b.dataset.nav); this.audio.ui(); };
    }
    on('btn-daily', () => { this.audio.uiBig(); this.ui.claimDaily(); });
    on('btn-online', () => { this.audio.uiBig(); this.ui.openModes(true); });
    on('btn-offline', () => { this.audio.uiBig(); this.ui.openModes(false); });
    on('btn-private', () => { this.audio.uiBig(); this.openPrivate(); });
    on('btn-settings', () => this.openSettings());
    on('btn-logout', () => { try { localStorage.removeItem('orkz_token'); } catch {} location.reload(); });
    on('btn-modes-back', () => { $('scr-modes')?.classList.remove('active'); this.ui.showMenu(); });
    on('btn-modes-go', () => this.startSelected());
    on('btn-room-leave', () => { this.net.send({ t: 'leave' }); $('scr-room')?.classList.remove('active'); this.ui.showMenu(); });
    on('btn-room-ready', () => { this.net.send({ t: 'ready' }); this.ui.toast('جاهز! ✅', 'ok'); });
    on('btn-join-code', () => { const c = $('join-code')?.value?.trim(); if (c) this.net.send({ t: 'joinCode', code: c }); });
    on('btn-room-chat', () => { const t = $('room-chat-input')?.value?.trim(); if (t) { this.net.send({ t: 'lobbyChat', text: t }); const inp = $('room-chat-input'); if (inp) inp.value = ''; } });
    on('btn-setname', () => this.rename($('nickname')?.value?.trim() || ''));
    on('btn-add-friend', () => { const n = $('friend-name')?.value?.trim(); if (n) this.ui.addFriend(n); });
    on('btn-bp-buy', () => this.ui.buyBP());
    on('btn-resume', () => { this.session.paused = false; $('pause')?.classList.add('hidden'); });
    on('btn-quit', () => { this.session.quit(); $('pause')?.classList.add('hidden'); });
    on('btn-res-menu', () => { this.session.quit(); });
    on('btn-res-again', () => {
      const mode = this.session.online ? 'online' : 'offline';
      this.session.quit();
      this._lastStart = { mode, modeId: this.ui.selectedMode, mapId: this.ui.selectedMap };
      setTimeout(() => this.startSelected(true), 60);
    });
    on('btn-settings-close', () => { $('scr-settings')?.classList.remove('active'); this.ui.showMenu(); });
    on('btn-settings-save', () => this.saveSettings());

    for (const b of document.querySelectorAll('[data-buycur]')) {
      b.onclick = () => this.ui.toast('💎 الجواهر تُكسب من: المهام اليومية، باس المعركة، الفوز بالمباريات، عجلة الحظ', 'ok');
    }
    for (const t of document.querySelectorAll('[data-lockertab]')) {
      t.onclick = () => {
        this.ui.lockerTab = t.dataset.lockertab;
        document.querySelectorAll('[data-lockertab]').forEach(x => x.classList.toggle('active', x === t));
        this.ui.renderLocker();
      };
    }
    for (const t of document.querySelectorAll('[data-mtab]')) {
      t.onclick = () => {
        this.ui.missionTab = t.dataset.mtab;
        document.querySelectorAll('[data-mtab]').forEach(x => x.classList.toggle('active', x === t));
        this.ui.renderMissions();
      };
    }
    for (const t of document.querySelectorAll('[data-rtab]')) {
      t.onclick = () => {
        this.ui.rankTab = t.dataset.rtab;
        document.querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('active', x === t));
        this.ui.renderRank();
      };
    }

    // تفويض الأحداث للعناصر الديناميكية
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-buy],[data-eq],[data-bundle],[data-crate],[data-spin],[data-mission],[data-bp],[data-store],[data-mode],[data-map],[data-tab],[data-lockertab],[data-mtab]');
      if (!el) return;
      this.audio.ui();
      if (el.dataset.buy) { const [k, id] = el.dataset.buy.split(':'); this.ui.buy(k, id); }
      else if (el.dataset.eq) { const [k, id] = el.dataset.eq.split(':'); this.ui.equip(k, id); }
      else if (el.dataset.bundle) this.ui.buyBundle(el.dataset.bundle);
      else if (el.dataset.crate) this.ui.openCrate(el.dataset.crate);
      else if (el.id === 'btn-spin' || el.dataset.spin) this.ui.spinWheel();
      else if (el.dataset.mission) this.ui.claimMission(el.dataset.mission);
      else if (el.dataset.bp) { const [tr, tier] = el.dataset.bp.split(':'); this.ui.claimBP(tr, +tier); }
      else if (el.dataset.store) { this.ui.storeTab = el.dataset.store; this.ui.renderStore(); }
      else if (el.dataset.mode) { this.ui.selectedMode = el.dataset.mode; this.ui.renderModeCards(); }
      else if (el.dataset.map) { this.ui.selectedMap = el.dataset.map; this.ui.renderMapCards(); }
    });

    // مفتاح Enter في حقول الدخول
    for (const [id, btnId] of [['guest-name', 'btn-guest'], ['reg-pass', 'btn-register'], ['login-pass', 'btn-login']]) {
      const el = $(id);
      if (el) el.onkeydown = (e) => { if (e.key === 'Enter') $(btnId)?.click(); };
    }

    // إعدادات
    const sfxEl = $('set-sfx');
    if (sfxEl) sfxEl.oninput = (e) => { this.audio.setSfx(+e.target.value / 100); this.settings.sfx = +e.target.value / 100; };
    const sensEl = $('set-sens');
    if (sensEl) sensEl.oninput = (e) => { this.settings.sens = +e.target.value / 100; if (this.session?.input) this.session.input.sens = this.settings.sens; };
    const qEl = $('set-quality');
    if (qEl) qEl.onchange = (e) => {
      this.quality = e.target.value;
      if (this.quality === 'auto') {
        this.autoTier = this.deviceTier;   // ابدأ من درجة الجهاز ثم تكيّف مع الأداء
        this.perf = { fps: 60, lowT: 0, highT: 0, cooldown: 2, showT: 0 };
      }
      this.applyQuality();
    };
    // 📐 مقاس الواجهة (تلقائي / هاتف / لوحي / كمبيوتر)
    const uiEl = $('set-uisize');
    if (uiEl) uiEl.onchange = (e) => {
      this.settings.uiMode = e.target.value || 'auto';
      const m = this.applyUiMode();
      try { this.session.renderer.resize(); } catch { }
      try { this.session.drawDropMap(true); } catch { }
      this.ui.toast('📐 مقاس الواجهة: ' + ({ phone: 'هاتف', tablet: 'جهاز لوحي', desktop: 'كمبيوتر' }[m] || m), 'ok');
    };
    // 🪂 نوع النزول الافتراضي
    const dmEl = $('set-dropmode');
    if (dmEl) dmEl.onchange = (e) => {
      this.settings.dropMode = e.target.value || 'manual';
      try { this.session.setDropMode(this.settings.dropMode, false); } catch { }
    };
    const tsEl = $('set-tsens');
    if (tsEl) tsEl.oninput = (e) => { this.settings.tsens = +e.target.value / 100; if (this.session?.input) this.session.input.touchLookSens = this.settings.tsens; };
    const aaEl = $('set-aimassist');
    if (aaEl) aaEl.onchange = (e) => { this.settings.aimassist = e.target.checked; if (this.session?.input) this.session.input.aimAssist = e.target.checked; };
    const vbEl = $('set-vibrate');
    if (vbEl) vbEl.onchange = (e) => { this.settings.vibrate = e.target.checked; if (this.session?.input) this.session.input.vibrate = e.target.checked; };
    const tfEl = $('set-tapfire');
    if (tfEl) tfEl.onchange = (e) => { this.settings.tapfire = e.target.checked; if (this.session?.input) this.session.input.tapToFire = e.target.checked; };
    const afEl = $('set-autofire');
    if (afEl) afEl.onchange = (e) => { this.settings.autofire = e.target.checked; if (this.session?.input) this.session.input.autoFire = e.target.checked; };
    const tchEl = $('set-touch');
    if (tchEl) tchEl.onchange = (e) => { this.settings.touch = e.target.checked; $('touch-ui')?.classList.toggle('hidden', !e.target.checked || !this.session.running); };
    const bldEl = $('set-blood');
    if (bldEl) bldEl.onchange = (e) => { this.settings.blood = e.target.checked; if (this.session?.renderer) this.session.renderer.bloodFx = e.target.checked; };
    const vwEl = $('set-view');
    if (vwEl) vwEl.onchange = (e) => {
      this.session.renderer.setMode(e.target.value);
      if (this.session.input) this.session.input.fps = this.session.renderer.is3D;
      this.session.updateLookHint();
      this.ui.toast(this.session.renderer.is3D ? '🎮 منظور ثلاثي الأبعاد: ' + (this.session.renderer.mode === 'fps' ? 'الشخص الأول' : 'الشخص الثالث') : '🕹️ منظور ثنائي الأبعاد من الأعلى', 'ok');
    };

    // النقر على الشاشة أثناء اللعب = قفل المؤشر (للنظر بالماوس)
    $('game-canvas')?.addEventListener('click', () => { if (this.session.running) this.session.lockLook(); });
    if (this.session.input) this.session.input.onLockChange = () => this.session.updateLookHint();
    document.addEventListener('pointerlockchange', () => this.session.updateLookHint());
    document.addEventListener('pointerdown', () => this.audio.resume(), { once: false });
  }

  applySettings() {
    this.audio.setSfx(this.settings.sfx ?? 0.8);
    if ($('set-sfx')) $('set-sfx').value = (this.settings.sfx ?? 0.8) * 100;
    if ($('set-sens')) $('set-sens').value = (this.settings.sens ?? 1) * 100;
    if ($('set-quality')) $('set-quality').value = this.quality;
    if ($('set-tsens')) $('set-tsens').value = (this.settings.tsens ?? 1) * 100;
    if ($('set-autofire')) $('set-autofire').checked = !!this.settings.autofire;
    if ($('set-aimassist')) $('set-aimassist').checked = this.settings.aimassist !== false;
    if ($('set-vibrate')) $('set-vibrate').checked = this.settings.vibrate !== false;
    if ($('set-tapfire')) $('set-tapfire').checked = !!this.settings.tapfire;
    if ($('set-touch')) $('set-touch').checked = !!this.settings.touch;
    if ($('set-blood')) $('set-blood').checked = this.settings.blood !== false;
    if ($('set-uisize')) $('set-uisize').value = this.settings.uiMode || 'auto';
    if ($('set-dropmode')) $('set-dropmode').value = this.settings.dropMode || 'manual';
    try { this.applyUiMode(); } catch { }
    if (this.session?.input) {
      this.session.input.autoFire = !!this.settings.autofire;
      this.session.input.sens = this.settings.sens ?? 1;
      this.session.input.touchLookSens = this.settings.tsens ?? 1;
      this.session.input.vibrate = this.settings.vibrate !== false;
      this.session.input.aimAssist = this.settings.aimassist !== false;
      this.session.input.tapToFire = !!this.settings.tapfire;
    }
    if (this.session?.renderer) {
      this.session.renderer.bloodFx = this.settings.blood !== false;
      const viewMode = this.settings.view || this.session.renderer.mode || 'fps';
      this.session.renderer.setMode(viewMode);
      if (this.session.input) this.session.input.fps = this.session.renderer.is3D;
      const sv = $('set-view');
      if (sv) sv.value = this.session.renderer.mode;
    }
  }

  saveSettings() {
    this.settings.quality = this.quality;
    this.settings.view = this.session.renderer.mode;
    try {
      localStorage.setItem('orkz_settings', JSON.stringify(this.settings));
      localStorage.setItem('orkz_quality', this.quality);
    } catch {}
    if (this.token) this.ui.saveSettings(this.settings);
    $('scr-settings')?.classList.remove('active');
    this.ui.toast('تم حفظ الإعدادات ✓', 'ok');
  }

  openSettings() { $('scr-settings')?.classList.add('active'); }

  /* ---------- الحساب ---------- */
  async doGuest(name) {
    try {
      const r = await API.post('/api/auth/guest', { name: name || '' });
      if (r.error) return this.authErr(r.error);
      this.token = r.token; this.profile = r.profile;
      try { localStorage.setItem('orkz_token', r.token); } catch {}
      this.net.connect(this.token);
      this.audio.resume(); this.audio.uiBig();
      $('scr-auth')?.classList.remove('active');
      this.ui.showMenu();
    } catch { this.authErr('تعذر الاتصال بالسيرفر'); }
  }

  async doRegister(name, pass) {
    if (!name || name.length < 3) return this.authErr('الاسم ٣ أحرف على الأقل');
    if (!pass || pass.length < 4) return this.authErr('كلمة المرور ٤ أحرف على الأقل');
    const r = await API.post('/api/auth/register', { name, password: pass });
    if (r.error) return this.authErr(r.error);
    this.token = r.token; this.profile = r.profile;
    try { localStorage.setItem('orkz_token', r.token); } catch {}
    this.net.connect(this.token);
    $('scr-auth')?.classList.remove('active');
    this.ui.showMenu();
    this.ui.toast('مرحباً ' + r.profile.name + '! 🎉', 'ok');
  }

  async doLogin(name, pass) {
    const r = await API.post('/api/auth/login', { name, password: pass });
    if (r.error) return this.authErr(r.error);
    this.token = r.token; this.profile = r.profile;
    try { localStorage.setItem('orkz_token', r.token); } catch {}
    this.net.connect(this.token);
    $('scr-auth')?.classList.remove('active');
    this.ui.showMenu();
    this.ui.toast('أهلاً بعودتك ' + r.profile.name + ' 👑', 'ok');
  }

  authErr(msg) {
    const el = $('auth-err');
    if (el) el.textContent = msg;
    this.audio.ui();
  }

  async rename(name) {
    if (!name || name.length < 3) return this.ui.toast('الاسم ٣ أحرف على الأقل', 'err');
    this.ui.toast('سيتم تحديث الاسم في المباريات القادمة (حفظ محلي)', 'ok');
    if (this.profile) this.profile.name = name;
    try { localStorage.setItem('orkz_name', name); } catch {}
    this.ui.updateProfile();
  }

  /* ---------- بدء المباريات ---------- */
  /** هل اللعب ممنوع الآن بسبب وقت الصلاة؟ */
  prayerBlocked() {
    if (this.prayer && this.prayer.locked) {
      try { this.prayer.updateOverlay(); } catch {}
      try { this.ui.toast('🕌 وقت الصلاة — اللعبة متوقفة حتى تؤكّد صلاتك', 'err'); } catch {}
      return true;
    }
    return false;
  }

  async openPrivate() {
    if (this.prayerBlocked()) return;
    // الغرف الخاصة تحتاج السيرفر الأونلاين — إن لم يوجد نوضح ذلك بدل شاشة ميتة
    if (!this.net.connected && !API.offline) this.net.connect(this.token);
    if (!this.net.connected && !API.offline) await this.waitConnected(1500);
    if (!this.net.connected) {
      this.ui.toast('🔒 غرف الأصدقاء تحتاج سيرفر اللعبة الأونلاين — غير متاح على هذا الرابط. جرّب اللعب الأوفلاين 📴', 'err');
      this.ui.showMenu();
      return;
    }
    this.ui.hideAll();
    $('scr-room')?.classList.add('active');
    this.ui.toast('اختر النمط ثم أنشئ غرفة، أو أنشئ فوراً', 'ok');
    setTimeout(() => {
      if (!this.net.connected) this.net.connect(this.token);
      this.net.send({ t: 'createRoom', mode: this.ui.selectedMode, mapId: this.ui.selectedMap });
    }, 250);
  }

  async requestLandscapeAndFullscreen(){
    try { if(window.__orkTryLandscape) await window.__orkTryLandscape(); } catch{}
    // حاول ملء الشاشة على الهواتف عند بدء اللعب (يتطلب تفاعل مستخدم — نحن داخل نقرة)
    try {
      const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
      if(isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement && innerWidth > innerHeight){
        // لا نطلب تلقائياً إذا رفض المتصفح — نتجاهل الخطأ
        await document.documentElement.requestFullscreen().catch(()=>{});
      }
    } catch{}
  }
  async startSelected(again) {
    if (this.prayerBlocked()) return;
    const mode = this._lastStart?.mode === 'offline' || !this.ui.onlineSelect ? 'offline' : 'online';
    const modeId = (again && this._lastStart?.modeId) || this.ui.selectedMode;
    const mapId = (again && this._lastStart?.mapId) || this.ui.selectedMap;
    this._lastStart = { mode, modeId, mapId };
    if (!this.profile) {
      $('scr-modes')?.classList.remove('active');
      $('scr-auth')?.classList.add('active');
      return;
    }
    this.requestLandscapeAndFullscreen();
    if (mode === 'offline') {
      const bots = +($('off-bots')?.value ?? 39);
      const diff = $('off-diff')?.value || 'normal';
      $('scr-modes')?.classList.remove('active');
      this.audio.resume();
      this.session.startOffline({ mode: modeId, mapId, bots, difficulty: diff });
    } else {
      // أونلاين: إن لم يكن السيرفر متاحاً هنا، ابدأ أوفلاين فوراً — اللعبة لا تتعطل أبداً
      if (!this.net.connected && !API.offline) {
        this.net.connect(this.token);
        await this.waitConnected(1500);
      }
      if (!this.net.connected) {
        $('scr-modes')?.classList.remove('active');
        this.audio.resume();
        const bots = +($('off-bots')?.value ?? 39);
        const diff = $('off-diff')?.value || 'normal';
        this.ui.toast('⚠️ السيرفر الأونلاين غير متاح على هذا الرابط — بدأنا لك مباراة أوفلاين بنفس النمط والخريطة', 'err');
        this.session.startOffline({ mode: modeId, mapId, bots, difficulty: diff });
        return;
      }
      this.net.send({ t: 'queue', mode: modeId, mapId });
      $('scr-modes')?.classList.remove('active');
      this.ui.toast('🔎 جاري البحث عن مباراة... سيبدأ العد فوراً مع البوتات إن لم يتوفر لاعبون', 'ok');
      this.audio.resume();
    }
  }
  /** انتظر اتصال الأونلاين حتى المهلة — يفيد قبل إرسال طلبات الغرف */
  waitConnected(ms = 1500) {
    if (this.net.connected) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const fin = (ok) => { if (!done) { done = true; resolve(ok); } };
      const h = () => { this.net.handlers.open = this.net.handlers.open?.filter(f => f !== onOpen); fin(true); };
      const onOpen = h;
      this.net.on('open', onOpen);
      setTimeout(() => { this.net.handlers.open = this.net.handlers.open?.filter(f => f !== onOpen); fin(this.net.connected); }, ms);
    });
  }

  /* ---------- الحلقة ---------- */
  loop() {
    let last = performance.now();
    const tick = (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      /* اللعبة لا تعمل عمودياً أبداً: تجميد كامل أثناء طبقة «دوّر الجهاز»
         (نستمر بتحديث الطابع الزمني حتى لا تقفز اللعبة بعد التدوير) */
      if (window.__orkPortraitBlocked) { requestAnimationFrame(tick); return; }
      if (this.session.running) {
        this.session.update(dt);
        this.perfTick(dt);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // عرض خريطة القفز عند الحاجة
    setInterval(() => {
      if (this.session.running && this.session.dropPhase) {
        $('jump-phase')?.classList.remove('hidden');
        this.session.drawDropMap();
      }
      this.session.updateLookHint();
    }, 700);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const app = new App();
window.ORK = app;
app.boot().catch((e) => {
  console.error('[main] boot failed:', e);
  try { if (typeof window !== 'undefined' && window.__orkBootFail) window.__orkBootFail('تعذّر تشغيل اللعبة'); } catch {}
});
export default app;
