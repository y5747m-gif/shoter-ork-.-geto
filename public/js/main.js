/**
 * ORK ZONE — client/main.js
 * نقطة التمهيد: تحميل الحساب، ربط الشبكة، تشغيل حلقة اللعب، وربط كل الأزرار.
 */
import { API, Net } from './net.js';
import Audio2 from './audio.js';
import { Session } from './game.js';
import UI from './ui.js';
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
    this.token = localStorage.getItem('orkz_token') || null;
    this.profile = null;
    this.ui = new UI(this);
    this.session = new Session(this);
    this.quality = localStorage.getItem('orkz_quality') || 'high';
    this.settings = JSON.parse(localStorage.getItem('orkz_settings') || '{"sfx":0.8,"music":0.45,"sens":1,"autofire":false,"blood":true,"touch":false}');
  }

  async boot() {
    this.loadingAnim();
    const t0 = performance.now();
    this.audio.init();
    // تحقق من الجلسة
    let ok = false;
    if (this.token) {
      try {
        const r = await API.get('/api/profile?token=' + encodeURIComponent(this.token));
        if (r.profile) { this.profile = r.profile; ok = true; }
        else { localStorage.removeItem('orkz_token'); this.token = null; }
      } catch { }
    }
    this.net.connect(this.token);
    this.bindNet();
    this.bindUI();
    this.applySettings();
    this.session.renderer.setQuality(this.quality);
    // شريط التحميل
    const steps = ['جاري تجهيز الساحة...', 'توليد الخرائط الخمس...', 'تحميل الأسلحة والاسكنات...', 'تجهيز ٥٠ مقاتلاً...', 'جاهز!'];
    for (let i = 0; i < steps.length; i++) {
      $('load-status').textContent = steps[i];
      $('load-fill').style.width = ((i + 1) / steps.length * 100) + '%';
      await sleep(190);
    }
    $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const wait = Math.max(0, 900 - (performance.now() - t0));
    if (wait) await sleep(wait);
    if (ok) { $('scr-loading').classList.remove('active'); this.ui.showMenu(); this.audio.startMusic('menu'); }
    else { $('scr-loading').classList.remove('active'); $('scr-auth').classList.add('active'); }
    this.loop();
  }
  loadingAnim() {
    let p = 0;
    const el = $('load-fill');
    const it = setInterval(() => { p = Math.min(38, p + Math.random() * 6); el.style.width = p + '%'; }, 120);
    setTimeout(() => clearInterval(it), 4000);
  }

  /* ---------- الشبكة ---------- */
  bindNet() {
    this.net.on('authOk', msg => { this.profile = msg.profile; if (msg.token) { this.token = msg.token; localStorage.setItem('orkz_token', msg.token); } this.ui.updateProfile(); });
    this.net.on('authFail', () => { localStorage.removeItem('orkz_token'); this.token = null; });
    this.net.on('queued', msg => { this.ui.toast('تم الدخول للغرفة ' + (msg.code ? '· الرمز ' + msg.code : ''), 'ok'); });
    this.net.on('lobby', msg => this.ui.onLobby(msg.room));
    this.net.on('start', msg => { this.session.onStart(msg.info); $('scr-room').classList.remove('active'); });
    this.net.on('snap', msg => this.session.onSnapshot(msg));
    this.net.on('ev', msg => this.session.onEvents(msg));
    this.net.on('matchEnd', msg => this.session.onMatchEnd(msg));
    this.net.on('rewards', msg => this.session.onRewards(msg));
    this.net.on('chat', msg => this.ui.onChat(msg));
    this.net.on('error', msg => this.ui.toast((msg && msg.error) || '⚠️ تعذر الاتصال بالسيرفر — تأكد من تشغيله', 'err'));
    this.net.on('youDied', msg => this.session.toastBig('☠️ ' + (msg.by ? 'أقصاك ' + msg.by : 'تم إقصاؤك')));
    this.net.on('ping', p => { });
    this.net.pingLoop();
  }

  /* ---------- الأحداث العامة ---------- */
  bindUI() {
    // تبويبات الدخول
    for (const t of document.querySelectorAll('[data-authtab]')) {
      t.onclick = () => {
        document.querySelectorAll('[data-authtab]').forEach(x => x.classList.toggle('active', x === t));
        document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.authtab));
        this.audio.ui();
      };
    }
    $('btn-guest').onclick = () => this.doGuest($('guest-name').value.trim());
    $('btn-register').onclick = () => this.doRegister($('reg-name').value.trim(), $('reg-pass').value);
    $('btn-login').onclick = () => this.doLogin($('login-name').value.trim(), $('login-pass').value);

    // قائمة جانبية
    for (const b of document.querySelectorAll('.side-btn')) b.onclick = () => { this.ui.openPane(b.dataset.nav); this.audio.ui(); };
    $('btn-daily').onclick = () => { this.audio.uiBig(); this.ui.claimDaily(); };
    $('btn-online').onclick = () => { this.audio.uiBig(); this.ui.openModes(true); };
    $('btn-offline').onclick = () => { this.audio.uiBig(); this.ui.openModes(false); };
    $('btn-private').onclick = () => { this.audio.uiBig(); this.openPrivate(); };
    $('btn-settings').onclick = () => this.openSettings();
    $('btn-logout').onclick = () => { localStorage.removeItem('orkz_token'); location.reload(); };
    $('btn-modes-back').onclick = () => { $('scr-modes').classList.remove('active'); this.ui.showMenu(); };
    $('btn-modes-go').onclick = () => this.startSelected();
    $('btn-room-leave').onclick = () => { this.net.send({ t: 'leave' }); $('scr-room').classList.remove('active'); this.ui.showMenu(); };
    $('btn-room-ready').onclick = () => { this.net.send({ t: 'ready' }); this.ui.toast('جاهز! ✅', 'ok'); };
    $('btn-join-code').onclick = () => { const c = $('join-code').value.trim(); if (c) this.net.send({ t: 'joinCode', code: c }); };
    $('btn-room-chat').onclick = () => { const t = $('room-chat-input').value.trim(); if (t) { this.net.send({ t: 'lobbyChat', text: t }); $('room-chat-input').value = ''; } };
    $('btn-setname').onclick = () => this.rename($('nickname').value.trim());
    $('btn-add-friend').onclick = () => { const n = $('friend-name').value.trim(); if (n) this.ui.addFriend(n); };
    $('btn-bp-buy').onclick = () => this.ui.buyBP();
    $('btn-resume').onclick = () => { this.session.paused = false; $('pause').classList.add('hidden'); };
    $('btn-quit').onclick = () => { this.session.quit(); $('pause').classList.add('hidden'); };
    $('btn-res-menu').onclick = () => { this.session.quit(); };
    $('btn-res-again').onclick = () => { const mode = this.session.online ? 'online' : 'offline'; this.session.quit(); this._lastStart = { mode, modeId: this.ui.selectedMode, mapId: this.ui.selectedMap }; setTimeout(() => this.startSelected(true), 60); };
    $('btn-settings-close').onclick = () => { $('scr-settings').classList.remove('active'); this.ui.showMenu(); };
    $('btn-settings-save').onclick = () => this.saveSettings();
    for (const b of document.querySelectorAll('[data-buycur]')) b.onclick = () => this.ui.toast('💎 الجواهر تُكسب من: المهام اليومية، باس المعركة، الفوز بالمباريات، عجلة الحظ', 'ok');
    for (const t of document.querySelectorAll('[data-lockertab]')) t.onclick = () => { this.ui.lockerTab = t.dataset.lockertab; document.querySelectorAll('[data-lockertab]').forEach(x => x.classList.toggle('active', x === t)); this.ui.renderLocker(); };
    for (const t of document.querySelectorAll('[data-mtab]')) t.onclick = () => { this.ui.missionTab = t.dataset.mtab; document.querySelectorAll('[data-mtab]').forEach(x => x.classList.toggle('active', x === t)); this.ui.renderMissions(); };
    for (const t of document.querySelectorAll('[data-rtab]')) t.onclick = () => { this.ui.rankTab = t.dataset.rtab; document.querySelectorAll('[data-rtab]').forEach(x => x.classList.toggle('active', x === t)); this.ui.renderRank(); };
    $('btn-add-friend').onclick = () => this.ui.addFriend($('friend-name').value.trim());

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
    for (const [id, fn] of [['guest-name', () => $('btn-guest').click()], ['reg-pass', () => $('btn-register').click()], ['login-pass', () => $('btn-login').click()]]) {
      const el = $(id); if (el) el.onkeydown = (e) => { if (e.key === 'Enter') fn(); };
    }
    // إعدادات
    $('set-sfx').oninput = (e) => { this.audio.setSfx(+e.target.value / 100); this.settings.sfx = +e.target.value / 100; };
    $('set-music').oninput = (e) => { this.audio.setMusic(+e.target.value / 100); this.settings.music = +e.target.value / 100; };
    $('set-sens').oninput = (e) => { this.settings.sens = +e.target.value / 100; this.session.input.sens = this.settings.sens; };
    $('set-quality').onchange = (e) => { this.quality = e.target.value; this.session.renderer.setQuality(this.quality); };
    $('set-autofire').onchange = (e) => { this.settings.autofire = e.target.checked; this.session.input.autoFire = e.target.checked; };
    $('set-touch').onchange = (e) => { this.settings.touch = e.target.checked; $('touch-ui').classList.toggle('hidden', !e.target.checked || !this.session.running); };
    $('set-blood').onchange = (e) => { this.settings.blood = e.target.checked; this.session.renderer.bloodFx = e.target.checked; };
    $('set-view').onchange = (e) => {
      this.session.renderer.setMode(e.target.value);
      this.session.input.fps = this.session.renderer.is3D;
      this.session.updateLookHint();
      this.ui.toast(this.session.renderer.is3D ? '🎮 منظور ثلاثي الأبعاد: ' + (this.session.renderer.mode === 'fps' ? 'الشخص الأول' : 'الشخص الثالث') : '🕹️ منظور ثنائي الأبعاد من الأعلى', 'ok');
    };
    // النقر على الشاشة أثناء اللعب = قفل المؤشر (للنظر بالماوس)
    $('game-canvas').addEventListener('click', () => { if (this.session.running) this.session.lockLook(); });
    if (this.session.input) this.session.input.onLockChange = () => this.session.updateLookHint();
    document.addEventListener('pointerlockchange', () => this.session.updateLookHint());
    document.addEventListener('pointerdown', () => this.audio.resume(), { once: false });
  }
  applySettings() {
    this.audio.setSfx(this.settings.sfx ?? 0.8);
    this.audio.setMusic(this.settings.music ?? 0.45);
    $('set-sfx').value = (this.settings.sfx ?? 0.8) * 100;
    $('set-music').value = (this.settings.music ?? 0.45) * 100;
    $('set-sens').value = (this.settings.sens ?? 1) * 100;
    $('set-quality').value = this.quality;
    $('set-autofire').checked = !!this.settings.autofire;
    $('set-touch').checked = !!this.settings.touch;
    $('set-blood').checked = this.settings.blood !== false;
    this.session.input.autoFire = !!this.settings.autofire;
    this.session.input.sens = this.settings.sens ?? 1;
    this.session.renderer.bloodFx = this.settings.blood !== false;
    // منظور اللعب (ثلاثي الأبعاد أول/ثالث أو ثنائي الأبعاد)
    const viewMode = this.settings.view || this.session.renderer.mode || 'fps';
    this.session.renderer.setMode(viewMode);
    this.session.input.fps = this.session.renderer.is3D;
    const sv = $('set-view');
    if (sv) sv.value = this.session.renderer.mode;
  }
  saveSettings() {
    this.settings.quality = this.quality;
    this.settings.view = this.session.renderer.mode;
    localStorage.setItem('orkz_settings', JSON.stringify(this.settings));
    localStorage.setItem('orkz_quality', this.quality);
    if (this.token) this.ui.saveSettings(this.settings);
    $('scr-settings').classList.remove('active');
    this.ui.toast('تم حفظ الإعدادات ✓', 'ok');
  }
  openSettings() { $('scr-settings').classList.add('active'); }

  /* ---------- الحساب ---------- */
  async doGuest(name) {
    try {
      const r = await API.post('/api/auth/guest', { name: name || '' });
      if (r.error) return this.authErr(r.error);
      this.token = r.token; this.profile = r.profile;
      localStorage.setItem('orkz_token', r.token);
      this.net.connect(this.token);
      this.audio.resume(); this.audio.startMusic('menu'); this.audio.uiBig();
      $('scr-auth').classList.remove('active');
      this.ui.showMenu();
    } catch { this.authErr('تعذر الاتصال بالسيرفر'); }
  }
  async doRegister(name, pass) {
    if (!name || name.length < 3) return this.authErr('الاسم ٣ أحرف على الأقل');
    if (!pass || pass.length < 4) return this.authErr('كلمة المرور ٤ أحرف على الأقل');
    const r = await API.post('/api/auth/register', { name, password: pass });
    if (r.error) return this.authErr(r.error);
    this.token = r.token; this.profile = r.profile;
    localStorage.setItem('orkz_token', r.token);
    this.net.connect(this.token);
    this.audio.startMusic('menu');
    $('scr-auth').classList.remove('active');
    this.ui.showMenu();
    this.ui.toast('مرحباً ' + r.profile.name + '! 🎉', 'ok');
  }
  async doLogin(name, pass) {
    const r = await API.post('/api/auth/login', { name, password: pass });
    if (r.error) return this.authErr(r.error);
    this.token = r.token; this.profile = r.profile;
    localStorage.setItem('orkz_token', r.token);
    this.net.connect(this.token);
    this.audio.startMusic('menu');
    $('scr-auth').classList.remove('active');
    this.ui.showMenu();
    this.ui.toast('أهلاً بعودتك ' + r.profile.name + ' 👑', 'ok');
  }
  authErr(msg) { $('auth-err').textContent = msg; this.audio.ui(); }
  async rename(name) {
    if (!name || name.length < 3) return this.ui.toast('الاسم ٣ أحرف على الأقل', 'err');
    this.ui.toast('سيتم تحديث الاسم في المباريات القادمة (حفظ محلي)', 'ok');
    this.profile.name = name;
    localStorage.setItem('orkz_name', name);
    this.ui.updateProfile();
  }

  /* ---------- بدء المباريات ---------- */
  openPrivate() {
    this.ui.hideAll();
    $('scr-room').classList.add('active');
    this.ui.toast('اختر النمط ثم أنشئ غرفة، أو أنشئ فوراً', 'ok');
    // استخدام النمط المختار
    setTimeout(() => {
      if (!this.net.connected) this.net.connect(this.token);
      this.net.send({ t: 'createRoom', mode: this.ui.selectedMode, mapId: this.ui.selectedMap });
    }, 250);
  }
  startSelected(again) {
    const mode = this._lastStart?.mode === 'offline' || !this.ui.onlineSelect ? 'offline' : 'online';
    const modeId = (again && this._lastStart?.modeId) || this.ui.selectedMode;
    const mapId = (again && this._lastStart?.mapId) || this.ui.selectedMap;
    this._lastStart = { mode, modeId, mapId };
    if (!this.profile) { $('scr-modes').classList.remove('active'); $('scr-auth').classList.add('active'); return; }
    if (mode === 'offline') {
      const bots = +$('off-bots').value;
      const diff = $('off-diff').value;
      $('scr-modes').classList.remove('active');
      this.audio.resume();
      this.session.startOffline({ mode: modeId, mapId, bots, difficulty: diff });
    } else {
      if (!this.net.connected) this.net.connect(this.token);
      this.net.send({ t: 'queue', mode: modeId, mapId });
      $('scr-modes').classList.remove('active');
      this.ui.toast('🔎 جاري البحث عن مباراة... سيبدأ العد فوراً مع البوتات إن لم يتوفر لاعبون', 'ok');
      this.audio.resume();
    }
  }

  /* ---------- الحلقة ---------- */
  loop() {
    let last = performance.now();
    const tick = (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (this.session.running) this.session.update(dt);
      else if (this.session.online) { /* انتظار اللقطة الأولى */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // عرض خريطة القفز عند الحاجة
    setInterval(() => {
      if (this.session.running && this.session.dropPhase) {
        $('jump-phase').classList.remove('hidden');
        this.session.drawDropMap();
      }
      this.session.updateLookHint();
    }, 700);
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const app = new App();
window.ORK = app;
app.boot();
export default app;
