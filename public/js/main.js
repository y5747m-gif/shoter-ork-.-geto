/**
 * ORK ZONE — client/main.js
 * نقطة التمهيد: تحميل الحساب، ربط الشبكة، تشغيل حلقة اللعب، وربط كل الأزرار.
 */
import { API, Net, Server, normalizeServer } from './net.js';
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
      // لا سيرفر على هذا العنوان: نعمل محلياً. إن كان اللاعب ضابطاً عنوان سيرفر
      // بنفسه نُبقي محاولات إعادة الاتصال شغّالة (قد يكون السيرفر نائماً ويستيقظ).
      try { if (!Server.base) this.net.stop(); } catch {}
      try { this.updateServerUI(); } catch {}
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
    const defSettings = { sfx: 0.8, sens: 1, tsens: 1, autofire: false, blood: true, touch: false, aimassist: true, vibrate: true, tapfire: false, view: 'fps' };
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
      return isMobile;
    } catch { this.isMobile = false; return false; }
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
      // 🌐 افحص سيرفر الأونلاين أولاً (العنوان قد يكون مختلفاً عن رابط الصفحة)
      try { await Server.probe(this.isMobile ? 9000 : 6000); } catch {}
      if (Server.status === 'ok') { API.offline = false; this.net.stopped = false; }
      if (Server.status !== 'ok') {
        API.offline = true;                              // لا سيرفر: اخدم كل شيء محلياً بلا انتظار
        if (!Server.base) { try { this.net.stop(); } catch {} }
      }
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
      try { this.updateServerUI(); } catch {}
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
    this.net.on('open', () => { Server.status = 'ok'; API.offline = false; this.updateServerUI(); });
    this.net.on('close', () => { this.updateServerUI(); });
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

    // 🌐 سيرفر الأونلاين
    on('btn-server-save', () => this.setServer($('set-server')?.value || ''));
    on('btn-server-test', () => this.testServer());
    on('btn-server-reset', () => { const el = $('set-server'); if (el) el.value = ''; this.setServer(''); });
    on('btn-server-copy', () => this.copyInvite());
    const srvEl = $('set-server');
    if (srvEl) srvEl.onkeydown = (e) => { if (e.key === 'Enter') $('btn-server-save')?.click(); };

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
    if ($('set-server')) $('set-server').value = Server.base || '';
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

  openSettings() {
    $('scr-settings')?.classList.add('active');
    const el = $('set-server');
    if (el) el.value = Server.base || '';
    this.updateServerUI();
  }

  /* ---------- 🌐 سيرفر الأونلاين (ليعمل الأونلاين على الهواتف الحقيقية) ---------- */
  /** يحدّث سطر الحالة في الإعدادات حسب نتيجة آخر فحص + حالة WebSocket */
  updateServerUI(text, kind) {
    const el = $('server-status');
    if (!el) return;
    if (text) {
      el.textContent = text;
      el.className = 'server-status' + (kind ? ' ' + kind : '');
      return;
    }
    const where = Server.base || (typeof location !== 'undefined' ? location.origin : '');
    let msg, cls;
    if (Server.status === 'ok') {
      msg = (this.net.connected ? '✅ متصل بالأونلاين' : '✅ السيرفر يعمل — جارٍ الاتصال') + ' · ' + where;
      cls = 'ok';
    } else if (Server.status === 'mixed') {
      msg = '⛔ ' + Server.message;
      cls = 'err';
    } else if (Server.status === 'down') {
      msg = '📴 ' + Server.message + ' — اللعب الأوفلاين يعمل بالكامل';
      cls = 'err';
    } else {
      msg = '… لم يُفحص بعد';
      cls = 'wait';
    }
    el.textContent = msg;
    el.className = 'server-status ' + cls;
  }

  /** حفظ عنوان سيرفر جديد ثم فحصه وإعادة الاتصال فوراً */
  async setServer(raw) {
    const base = Server.save(raw);
    const el = $('set-server');
    if (el) el.value = base;
    this.updateServerUI('⏳ جارٍ الاتصال بالسيرفر…', 'wait');
    const ok = await Server.probe(9000);
    API.offline = !ok;
    if (ok) {
      this.net.restart(this.token);
      this.ui.toast('🌐 تم الاتصال بسيرفر الأونلاين ✓', 'ok');
      // أعد تحميل الحساب من السيرفر الجديد
      try {
        if (this.token) {
          const r = await API.get('/api/profile?token=' + encodeURIComponent(this.token), 6000);
          if (r && r.profile) { this.profile = r.profile; this.ui.updateProfile(); }
        }
      } catch {}
    } else {
      try { if (!Server.base) this.net.stop(); } catch {}
      this.ui.toast('⚠️ ' + Server.message, 'err');
    }
    this.updateServerUI();
    return ok;
  }

  /** زر «فحص»: يختبر العنوان المكتوب دون حفظه نهائياً إن فشل */
  async testServer() {
    const raw = $('set-server')?.value || '';
    const prev = Server.base;
    Server.base = normalizeServer(raw);
    this.updateServerUI('⏳ جارٍ فحص السيرفر…', 'wait');
    const ok = await Server.probe(9000);
    if (!ok) Server.base = prev;
    this.updateServerUI();
    this.ui.toast(ok ? '✅ السيرفر يعمل — اضغط «حفظ العنوان»' : '❌ ' + Server.message, ok ? 'ok' : 'err');
    return ok;
  }

  /** رابط دعوة يحمل عنوان السيرفر معه — يفتحه الصديق على هاتفه فيلعب أونلاين مباشرة */
  async copyInvite() {
    let url = typeof location !== 'undefined' ? location.origin + location.pathname : '';
    if (Server.base) url += '?server=' + encodeURIComponent(Server.base);
    try {
      await navigator.clipboard.writeText(url);
      this.ui.toast('🔗 تم نسخ رابط الدعوة', 'ok');
    } catch {
      this.ui.toast('🔗 الرابط: ' + url, 'ok');
    }
  }

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
      this.ui.toast('🔒 غرف الأصدقاء تحتاج سيرفر أونلاين. افتح «الإعدادات ← 🌐 سيرفر الأونلاين» واكتب عنوان السيرفر، أو العب أوفلاين 📴', 'err');
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
        this.ui.toast('⚠️ لا يوجد سيرفر أونلاين على هذا الرابط — بدأنا مباراة أوفلاين. لتفعيل الأونلاين على هاتفك: الإعدادات ← 🌐 سيرفر الأونلاين', 'err');
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
