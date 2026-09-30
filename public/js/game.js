/**
 * ORK ZONE — client/game.js
 * إدارة المباراة: أوفلاين (محاكاة محلية) وأونلاين (سيرفر سلطوي) + كل واجهة اللعب (HUD).
 */
import {
  createMatch, addPlayer, dropPlayer, stepMatch, tryPickup, enterVehicle, exitVehicle, useSkill,
  genWorld, dist, curSlot, curW, zoomOf, magSize, revivePlayer, briefLoot, snapshot,
  startReload, startHeal,
} from '/shared/sim.js';
import { botThink, makeBotBrain, DIFFICULTY } from '/shared/ai.js';
import { WEAPONS, CHARACTERS, SKINS, MAPS, MODES, ARMORS, HEALS, ATTACHMENTS, GAME, REWARD, RARITY } from '/shared/gamedata.js';
import Renderer from './render.js';
import Audio2 from './audio.js';
import Input2 from './input.js';
import { API } from './net.js';

const $ = (id) => document.getElementById(id);
const BOT_NAMES = ['أبو الفهد', 'سيف الشرق', 'صقر الليل', 'قناص', 'ظل الرمال', 'ذيب الشمال', 'عاصفة', 'فارس', 'النسر', 'حجر الرحى', 'بركان', 'خنجر', 'المرعب', 'جبل النار', 'شبح', 'طيف', 'الأمير', 'جوكر', 'عقرب', 'رعد', 'سهم', 'صخرة', 'الملك', 'تنين', 'الجبل', 'مدفع', 'خفاش', 'دبابة', 'زئير', 'الأسود', 'جحدر', 'ملثم', 'كمين', 'مقاتل', 'سلاش', 'زعيم'];

export class Session {
  constructor(app) {
    this.app = app;
    this.renderer = new Renderer($('game-canvas'));
    this.audio = app.audio;
    this.input = new Input2($('game-canvas'));
    this.online = false;
    this.match = null;
    this.you = null;
    this.running = false;
    this.paused = false;
    this.prayerFrozen = false;   // 🕌 تجميد بسبب وقت الصلاة
    this.dropPhase = true;
    this.dropPoint = null;
    this.view = null;
    this.killfeed = [];
    this.lastSnapTime = 0;
    this.snapInfo = null;
    this.prevSnap = null;
    this.playersNet = new Map();
    this.netYou = null;
    this.results = null;
    this.healIdx = 0;
    this.emoteIdx = 0;
    this.grenadeMode = 'frag';
    this.chatLog = [];
    this.smokes = [];
    this.eventQueue = [];
    this.hitTimes = [];
    this.damageFlash = 0;
    this.shotDirs = [];
    this.acc = 0;
    this.hudCache = {};
    this.dropMapReady = false;
    /* ---------- 🪂 مرحلة النزول ---------- */
    this.dropMode = 'manual';        // manual | random | hot | safe
    this.dropRemain = 60;            // ثوانٍ قبل الإنزال التلقائي
    this.dropRedrawT = 0;
    this._dropBase = null;           // ذاكرة مؤقتة لرسم الخريطة الثابتة
    this._dropBaseKey = '';
    this.dropUIBound = false;
  }

  /* ============================= 🪂 مرحلة النزول ============================= */

  /** العالم الحالي (أونلاين أو أوفلاين) */
  dropWorld() { return this.online ? this.world : this.match?.world; }

  /** بدء مرحلة النزول: صفر المؤقت، طبّق النمط المحفوظ، وجهّز الواجهة */
  beginDropPhase() {
    this.bindDropUI();
    const saved = this.app?.settings?.dropMode;
    this.dropMode = ['manual', 'random', 'hot', 'safe'].includes(saved) ? saved : 'manual';
    this.dropRemain = this.online ? 62 : 62;
    this.dropRedrawT = 0;
    this._dropBase = null;
    const rem = document.getElementById('jump-remember');
    if (rem) rem.checked = !!this.app?.settings?.dropRemember;
    this.syncDropModeButtons();
    if (!this.dropPhase) { this.updateDropHud(); return; }
    // النزول العشوائي/الساخن/الهادئ: تُختار النقطة فوراً — واللاعب يستطيع تغييرها
    if (this.dropMode !== 'manual') this.dropPoint = this.pickDropPoint(this.dropMode);
    else this.dropPoint = null;
    this.drawDropMap(true);
    this.updateDropHud();
  }

  /** تبديل نمط النزول (من الأزرار أو من الإعدادات) */
  setDropMode(mode, fromUser = true) {
    if (!['manual', 'random', 'hot', 'safe'].includes(mode)) mode = 'manual';
    this.dropMode = mode;
    this.syncDropModeButtons();
    if (mode === 'manual') {
      if (fromUser) this.dropPoint = this.dropPoint || null;
    } else {
      const p = this.pickDropPoint(mode);
      if (p) this.dropPoint = p;
    }
    if (fromUser && this.app?.settings?.dropRemember) {
      this.app.settings.dropMode = mode;
      try { localStorage.setItem('orkz_settings', JSON.stringify(this.app.settings)); } catch { }
    }
    const sel = document.getElementById('set-dropmode');
    if (sel) sel.value = mode;
    this.drawDropMap();
    this.updateDropHud();
    try { this.audio.ui?.(); } catch { }
  }

  syncDropModeButtons() {
    const wrap = document.getElementById('jump-modes');
    if (!wrap) return;
    for (const b of wrap.querySelectorAll('[data-dropmode]')) {
      b.classList.toggle('active', b.dataset.dropmode === this.dropMode);
    }
    const hint = $('jump-maphint');
    if (hint) {
      const touch = !!this.input?.isTouch;
      const verb = touch ? 'المس' : 'انقر على';
      hint.textContent = (this.dropMode === 'manual'
        ? `${verb} الخريطة لاختيار نقطتك`
        : `نقطة مختارة تلقائياً — ${verb} الخريطة لتغييرها`)
        + (touch ? '' : ' · مسافة = قفز · R = عشوائي');
    }
    const sub = $('jump-sub');
    if (sub) {
      sub.textContent = {
        manual: 'انقر على الخريطة لتحديد نقطتك — أو اجعل النزول عشوائياً',
        random: 'نزول عشوائي: تُختار لك نقطة في أي مكان على الخريطة',
        hot: 'نزول ساخن: أقوى الغنائم… وأشرس الخصوم',
        safe: 'نزول هادئ: أطراف الخريطة بعيداً عن المناطق الساخنة',
      }[this.dropMode];
    }
  }

  /** نقطة عشوائية صالحة داخل حدود الخريطة */
  randomPointIn(world, pad = 220) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * Math.max(80, world.half - pad);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (world.shape.inside(x, y)) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  /** اختيار نقطة نزول حسب النمط */
  pickDropPoint(mode = this.dropMode) {
    const world = this.dropWorld();
    if (!world) return null;
    if (mode === 'hot') {
      const hot = world.hotDrops || [];
      if (hot.length) {
        const hd = hot[Math.floor(Math.random() * hot.length)];
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * hd.r * 0.7;
          const x = hd.x + Math.cos(a) * r, y = hd.y + Math.sin(a) * r;
          if (world.shape.inside(x, y)) return { x, y };
        }
        return { x: hd.x, y: hd.y };
      }
      // لا مناطق ساخنة: أقرب شيء = مركز الخريطة المزدحم
      return this.randomPointIn(world, world.half * 0.6);
    }
    if (mode === 'safe') {
      // أبعد نقطة عن كل المناطق الساخنة ضمن ٢٤ محاولة
      let best = null, bestD = -1;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = world.half * (0.58 + Math.random() * 0.3);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (!world.shape.inside(x, y)) continue;
        let d = 1e9;
        for (const hd of (world.hotDrops || [])) d = Math.min(d, Math.hypot(x - hd.x, y - hd.y));
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best || this.randomPointIn(world, 260);
    }
    // عشوائي تماماً
    return this.randomPointIn(world, 200);
  }

  /** هل النقطة داخل منطقة ساخنة؟ */
  isHotPoint(x, y) {
    const world = this.dropWorld();
    if (!world) return false;
    return (world.hotDrops || []).some(hd => Math.hypot(x - hd.x, y - hd.y) <= hd.r);
  }

  /** اسم تقريبي للمنطقة (بوصلة عربية) */
  dropPlaceName(x, y) {
    const world = this.dropWorld();
    if (!world) return '—';
    const q = world.half * 0.3;
    const ns = y < -q ? 'الشمال' : y > q ? 'الجنوب' : '';
    const ew = x < -q ? 'الغرب' : x > q ? 'الشرق' : '';
    let name;
    if (!ns && !ew) name = 'وسط الخريطة';
    else if (ns && ew) name = `${ns} ${ew === 'الشرق' ? 'الشرقي' : 'الغربي'}`;
    else name = ns || ew;
    return (this.isHotPoint(x, y) ? '🔥 ' : '') + name;
  }

  /** موقع الطائرة الحالي (أونلاين/أوفلاين) */
  planePos() {
    if (this.online) {
      const pl = this.snapInfo?.plane;
      return pl ? { x: pl.x, y: pl.y, a: pl.a || 0, done: !!pl.done } : null;
    }
    const pl = this.match?.plane;
    return pl ? { x: pl.x, y: pl.y, a: pl.angle || 0, done: !!pl.done } : null;
  }

  /** تحديث بطاقة المعلومات + العدّاد */
  updateDropHud() {
    const cnt = $('jump-count');
    if (cnt) {
      const s = Math.max(0, Math.ceil(this.dropRemain));
      if (cnt.textContent !== String(s)) cnt.textContent = String(s);
      cnt.parentElement?.classList.toggle('urgent', s <= 10);
    }
    const place = $('ji-place'), dEl = $('ji-dist'), rEl = $('ji-risk');
    const p = this.dropPoint;
    if (place) place.textContent = p ? this.dropPlaceName(p.x, p.y) : 'لم تُحدَّد بعد';
    if (dEl) {
      const pl = this.planePos();
      dEl.textContent = (p && pl) ? Math.round(Math.hypot(p.x - pl.x, p.y - pl.y)) + ' م' : '—';
    }
    if (rEl) {
      rEl.className = '';
      if (!p) { rEl.textContent = '—'; }
      else if (this.isHotPoint(p.x, p.y)) { rEl.textContent = 'عالية 🔥'; rEl.className = 'hot'; }
      else {
        const world = this.dropWorld();
        const far = world ? Math.hypot(p.x, p.y) / Math.max(1, world.half) : 0;
        if (far > 0.62) { rEl.textContent = 'منخفضة 🛡️'; rEl.className = 'calm'; }
        else { rEl.textContent = 'متوسطة'; rEl.className = 'mid'; }
      }
    }
    const btn = $('btn-jump');
    if (btn) btn.textContent = this.dropPoint ? 'اقفز الآن 🪂' : 'اقفز فوراً (نزول حر) 🪂';
  }

  /** نبضة مرحلة النزول: عدّاد تنازلي + تحديث الخريطة الحيّة */
  tickDropPhase(dt) {
    if (!this.dropPhase) return;
    // الزمن المتبقي: من الطائرة أوفلاين، ومؤقت محلي أونلاين
    if (!this.online && this.match?.plane) {
      const pl = this.match.plane;
      this.dropRemain = Math.max(0, (1.16 - pl.t) * (pl.duration || 55));
    } else {
      this.dropRemain = Math.max(0, this.dropRemain - dt);
    }
    this.dropRedrawT -= dt;
    if (this.dropRedrawT <= 0) {
      this.dropRedrawT = 0.12;
      this.drawDropMap();
      this.updateDropHud();
    }
    // انتهى الوقت: نزول تلقائي (عشوائي إن لم يختر اللاعب شيئاً)
    if (this.dropRemain <= 0) {
      const p = this.dropPoint || this.pickDropPoint('random') || { x: 0, y: 0 };
      this.toastBig('🪂 إنزال تلقائي!');
      this.doJump(p.x, p.y);
    }
  }

  /** ربط عناصر واجهة النزول مرة واحدة */
  bindDropUI() {
    if (this.dropUIBound) return;
    const cv = $('dropmap');
    if (!cv) return;
    this.dropUIBound = true;

    const pointToWorld = (clientX, clientY) => {
      const world = this.dropWorld();
      if (!world) return null;
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const S = cv.width, k = (S * 0.92) / world.map.size, o = S / 2;
      const x = ((clientX - r.left) / r.width * S - o) / k;
      const y = ((clientY - r.top) / r.height * S - o) / k;
      return { x, y };
    };
    const place = (clientX, clientY) => {
      const world = this.dropWorld();
      const pt = pointToWorld(clientX, clientY);
      if (!world || !pt) return;
      if (!world.shape.inside(pt.x, pt.y)) return;
      this.dropPoint = pt;
      if (this.dropMode !== 'manual') { this.dropMode = 'manual'; this.syncDropModeButtons(); }
      this.drawDropMap();
      this.updateDropHud();
    };

    // Pointer Events تغطي الماوس واللمس والقلم معاً — مع احتياط للمتصفحات القديمة
    let dragging = false, usedPointer = false;
    cv.addEventListener('pointerdown', (e) => {
      usedPointer = true; dragging = true;
      try { cv.setPointerCapture?.(e.pointerId); } catch { }
      place(e.clientX, e.clientY);
      e.preventDefault?.();
    });
    cv.addEventListener('pointermove', (e) => { if (dragging) { place(e.clientX, e.clientY); e.preventDefault?.(); } });
    cv.addEventListener('pointerup', () => { dragging = false; });
    cv.addEventListener('pointercancel', () => { dragging = false; });
    cv.addEventListener('click', (e) => { if (!usedPointer) place(e.clientX, e.clientY); });
    cv.addEventListener('touchstart', (e) => {
      if (usedPointer) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (t) { place(t.clientX, t.clientY); e.preventDefault?.(); }
    }, { passive: false });

    const modes = document.getElementById('jump-modes');
    if (modes) modes.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-dropmode]');
      if (b) this.setDropMode(b.dataset.dropmode, true);
    });
    $('btn-drop-random')?.addEventListener('click', () => {
      const p = this.pickDropPoint(this.dropMode === 'manual' ? 'random' : this.dropMode);
      if (p) this.dropPoint = p;
      if (this.dropMode === 'manual') { this.dropMode = 'random'; this.syncDropModeButtons(); }
      this.drawDropMap();
      this.updateDropHud();
      try { this.audio.ui?.(); } catch { }
    });
    $('jump-remember')?.addEventListener('change', (e) => {
      if (!this.app?.settings) return;
      this.app.settings.dropRemember = !!e.target.checked;
      if (e.target.checked) this.app.settings.dropMode = this.dropMode;
      try { localStorage.setItem('orkz_settings', JSON.stringify(this.app.settings)); } catch { }
    });
    $('btn-jump')?.addEventListener('click', () => {
      const p = this.dropPoint || this.pickDropPoint('random') || { x: 0, y: 0 };
      this.doJump(p.x, p.y);
    });
    // اختصارات لوحة المفاتيح (الكمبيوتر): مسافة/إدخال = قفز · R = نقطة عشوائية
    document.addEventListener('keydown', (e) => {
      if (!this.dropPhase || !this.running) return;
      const k = e.key;
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        const p = this.dropPoint || this.pickDropPoint('random') || { x: 0, y: 0 };
        this.doJump(p.x, p.y);
      } else if (k === 'r' || k === 'R' || k === 'ق') {
        e.preventDefault();
        $('btn-drop-random')?.click();
      }
    });
  }

  /* ============================= بدء الأوفلاين ============================= */
  startOffline(opts) {
    const app = this.app;
    this.online = false;
    const mode = opts.mode || 'solo';
    const mapId = opts.mapId || 'ork_island';
    const botCount = Math.max(0, Math.min(49, opts.bots ?? 39));
    const seed = Math.floor(Math.random() * 1e9);
    const match = createMatch({ mapId, seed, mode, teams: mode !== 'ffa' });
    this.match = match;
    const eq = app.profile?.equipped || {};
    const me = addPlayer(match, {
      id: 'you', name: app.profile?.name || 'لاعب', team: 0, bot: false,
      charId: eq.char || 'fahd', skinId: eq.skin || 'out_basic', parachute: eq.parachute || 'pc_basic',
    });
    this.you = me;
    me.dropState = 'plane';
    const modeDef = MODES.find(m => m.id === mode) || MODES[0];
    const squadSize = modeDef.players || 1;
    const totalTeams = mode === 'tdm' ? 2 : mode === 'solo' ? botCount + 1 : Math.max(2, Math.ceil((botCount + 1) / squadSize));
    const diffPool = opts.difficulty === 'mixed' ? ['rookie', 'normal', 'normal', 'veteran', 'veteran', 'pro'] : null;
    const diff = opts.difficulty && opts.difficulty !== 'mixed' ? opts.difficulty : 'normal';
    for (let i = 0; i < botCount; i++) {
      let team;
      if (mode === 'tdm') team = i % 2 === 0 ? 1 : 0;
      else if (mode === 'solo') team = 1 + i;
      else team = (i + 1) % totalTeams;
      const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
      const skins = SKINS.filter(s => s.char === '*' || s.char === char.id);
      const skin = skins[Math.floor(Math.random() * skins.length)];
      const bot = addPlayer(match, {
        id: 'b' + i, name: BOT_NAMES[(i * 3) % BOT_NAMES.length] + (i > 40 ? i : ''), team, bot: true,
        charId: char.id, skinId: skin ? skin.id : 'out_basic',
      });
      const bd = diffPool ? diffPool[Math.floor(Math.random() * diffPool.length)] : (Math.random() < 0.2 ? 'rookie' : Math.random() < 0.75 ? diff : 'pro');
      bot.ai = makeBotBrain(bd);
      bot.difficulty = bd;
    }
    match.totalTeams = new Set(match.players.map(p => p.team)).size;
    this.mode = mode;
    this.mapId = mapId;
    this.teams = mode !== 'ffa';
    if (mode === 'tdm') {
      // نمط الساحة: بدء فوري بالعتاد
      const a2 = Math.random() * Math.PI * 2, r2 = 150 + Math.random() * 420;
      me.x = Math.cos(a2) * r2; me.y = Math.sin(a2) * r2; me.dropState = 'landed'; me.z = 0; me.shield = 50;
      me.weapons = [{ id: 'akm', ammo: 30, attachments: [] }, { id: 'p92', ammo: 15, attachments: [] }];
      me.curWeapon = 0;
      me.ammo = { '9mm': 120, '556': 120, '762': 120, '12g': 16, '45': 40, 'sniper': 10 };
      me.heals = { bandage: 3, energy: 1, medkit: 1, grenade: 2, smoke: 1 };
      this.dropPhase = false;
    } else {
      this.dropPhase = true;
    }
    this.dropPoint = null;
    this.beginMatchUI();
    if (this.dropPhase) this.toastBig('🪂 اختر نقطة هبوطك!'); else this.toastBig('⚔️ معركة الفريق — أول فريق يصل ٣٠ إقصاء!');
    return true;
  }

  /* ============================= بدء الأونلاين ============================= */
  onStart(info) {
    const app = this.app;
    this.online = true;
    this.mode = info.mode;
    this.mapId = info.mapId;
    this.myId = info.youId;
    this.myTeam = info.team;
    const world = genWorld(info.mapId, info.seed);
    this.world = world;
    this.loot = world.loot;
    this.dynamicLoot = [];
    this.teams = info.mode !== 'solo';
    this.prevSnap = null;
    this.playersNet = new Map();
    this.netYou = null;
    this.dropPhase = true;
    this.dropPoint = null;
    this._yawSynced = false;
    this.snapInfo = { zone: null, plane: null, airdrops: [], vehicles: world.vehicles.map(v => ({ id: v.id, x: v.x, y: v.y, a: v.angle, t: v.type, hp: v.hp, o: 0, dr: null })), bullets: [], grenades: [] };
    this.beginMatchUI();
    this.toastBig('🪂 اختر نقطة هبوطك!');
  }

  beginMatchUI() {
    this.running = true;
    this.paused = false;
    this.prayerFrozen = !!this.app?.prayer?.locked;
    // مزامنة وضع الإدخال مع منظور العرض
    this.input.fps = this.renderer.is3D;
    this.input.look.yaw = this.you ? this.you.aim : (this.input.look.yaw || 0);
    this.input.look.pitch = 0;
    if (this.renderer.r3) {
      this.renderer.r3.cam.yaw = this.input.look.yaw;
      this.renderer.r3.cam.pitch = 0;
      this.renderer.r3.parts.length = 0;
      this.renderer.r3.corpses.length = 0;
    }
    this.results = null;
    this.killfeed = []; this.chatLog = []; this.smokes = [];
    this.hitTimes = []; this.shotDirs = [];
    $('scr-loading')?.classList.remove('active');
    $('scr-menu').classList.remove('active'); $('scr-results').classList.remove('active');
    $('scr-modes').classList.remove('active'); $('scr-room').classList.remove('active');
    $('hud').classList.remove('hidden');
    $('jump-phase').classList.toggle('hidden', !this.dropPhase);
    $('killfeed').innerHTML = '';
    $('hud-mode').textContent = (MODES.find(m => m.id === this.mode) || MODES[0]).ar;
    $('tdm-score').classList.toggle('hidden', this.mode !== 'tdm');
    $('pause').classList.add('hidden');
    // أزرار اللمس: للجهاز اللمسي مع احترام اختيار اللاعب — وتُخفى أثناء نافذة النزول
    this.syncTouchUI();
    this.updateLookHint();
    this.beginDropPhase();
  }

  /** إظهار/إخفاء أزرار اللمس (تُخفى أثناء نافذة اختيار النزول) */
  syncTouchUI() {
    const want = this.input.isTouch && this.app?.settings?.touch !== false && !this.dropPhase;
    $('touch-ui')?.classList.toggle('hidden', !want);
  }

  /** مسافة حدث عن اللاعب (لمحاكاة بُعد الصوت) — ٠ إن تعذّر الحساب */
  distToMe(e) {
    try {
      const me = this.online ? (this.view?.players || []).find(p => p.id === this.myId) : this.you;
      if (!me || !e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return 0;
      return Math.hypot(e.x - me.x, e.y - me.y);
    } catch { return 0; }
  }

  /* ============================= الحلقة ============================= */
  update(dt) {
    if (!this.running) return;
    // 🕌 حارس الصلاة: تجميد كامل للمباراة حتى يؤكّد اللاعب صلاته
    if (this.prayerFrozen || this.app?.prayer?.locked) {
      this.prayerFrozen = true;
      try { this.input.drainActions(); } catch { }
      return;
    }
    if (this.paused) { this.drawPaused(); this.updateLookHint(); return; }
    const actions = this.input.drainActions();
    this.applyAimAssist(dt);
    if (this.online) this.updateOnline(dt, actions); else this.updateOffline(dt, actions);
    if (this.dropPhase) this.tickDropPhase(dt);
    this.render(dt);
    this.updateHud();
  }

  /* ---------- أوفلاين ---------- */
  updateOffline(dt, actions) {
    const match = this.match, me = this.you;
    if (!match || !me) return;
    const input = this.input.read(this.renderer.cam, me, null);
    this.handleActions(actions, me, true);
    if (me.dropState === 'plane' || me.dropState === 'wait') {
      input.mx = 0; input.my = 0; input.shoot = false;
      // الطيران: نتحرك مع الطائرة بصرياً
      me.x = match.plane.x; me.y = match.plane.y; me.z = 900;
      if (this.dropPoint) {
        $('center-msg').innerHTML = `<div>اضغط "اقفز الآن" للهبوط في النقطة المحددة</div>`;
      }
    } else if (me.dropState === 'freefall' || me.dropState === 'parachute') {
      $('center-msg').innerHTML = `<div>هبوط بالمظلة... ${Math.round(me.z)}م</div>`;
    } else {
      $('center-msg').innerHTML = '';
    }
    input.emote = null;
    if (this.pendingHeal) { input.heal = this.pendingHeal; this.pendingHeal = null; }
    if (this.grenadeShot) { input.shoot = true; input.grenade = true; this.grenadeShot = false; }
    const inputs = { you: input };
    for (const bot of match.players) {
      if (!bot.bot || !bot.alive) continue;
      if (match.mode === 'tdm' && !bot.alive && bot.respawnT > 0) {
        bot.respawnT -= dt;
        if (bot.respawnT <= 0) this.respawnTdm(bot);
        continue;
      }
      // التفكير لا يحتاج ٦٠ مرة/ثانية. تحديثه عند ٢٠ هرتز يقلل كلفة
      // البحث عن الأهداف وخطوط الرؤية، بينما تبقى المحاكاة نفسها ثابتة.
      bot.aiThinkT = (bot.aiThinkT || 0) - dt;
      if (bot.aiThinkT <= 0 || !bot.aiInput) {
        bot.aiThinkT = 0.05;
        bot.aiInput = botThink(match, bot, dt);
      }
      const inp = bot.aiInput;
      inputs[bot.id] = inp;
      if (inp.jump) dropPlayer(match, bot, inp.jump.x, inp.jump.y);
      if (inp.pickup) tryPickup(match, bot, inp.pickup);
      if (inp.interact?.vehicle) enterVehicle(match, bot, inp.interact.vehicle);
      if (inp.exitVehicle) exitVehicle(match, bot);
    }
    // إحياء يدوي
    if (input.reviving && me.alive && !me.knocked) {
      for (const t of match.players) if (t.knocked && t.team === me.team && dist(t.x, t.y, me.x, me.y) < 70) revivePlayer(match, me, t, dt * 1.6);
    }
    // خطوات ثابتة
    this.acc += dt;
    const step = 1 / 60;
    let iter = 0;
    while (this.acc >= step && iter < 6) {
      const before = match.events.length;
      stepMatch(match, step, inputs, { onKill: (v, k) => this.onLocalKill(v, k) });
      this.processEvents(match.events.slice(before));
      this.acc -= step; iter++;
    }
    if (this.you.knocked) this.checkReviveSelf(dt);
    // صوت طلقاتنا
    const shots = me.stats.shots;
    if (shots !== this._lastShots) {
      this._lastShots = shots;
      const w = curW(me);
      const silent = curSlot(me)?.attachments?.some(a => ATTACHMENTS[a]?.silent);
      if (w) this.audio.shot(w.id, 0, silent);
      this.renderer.shake(w && (w.type === 'sniper' || w.type === 'lmg') ? 3.4 : 1.5);
    }
    if (match.state === 'over' && !this.results) this.finishOffline();
    me.walking = Math.hypot(me.vx, me.vy) > 20;
    if (me.walking && Math.random() < 0.3) this.renderer.footprints.push({ x: me.x, y: me.y, a: me.aim, life: 6 });
    if (this.renderer.footprints.length > 260) this.renderer.footprints.shift();
    this.lastYou = me;
  }

  /* ---------- أونلاين ---------- */
  updateOnline(dt, actions) {
    const me = this.netYou?.pos || (this.prevSnap ? this.prevSnap.players.find(p => p.id === this.myId) : null);
    const input = this.input.read(this.renderer.cam, me, null);
    this.handleActions(actions, me, false);
    if (this.dropPhase) { input.mx = 0; input.my = 0; input.shoot = false; }
    if (this.pendingHeal) { input.heal = this.pendingHeal; this.pendingHeal = null; }
    if (this.grenadeShot) { input.shoot = true; input.grenade = true; this.grenadeShot = false; }
    input.crouch = input.crouch; input.prone = input.prone;
    // إرسال بمعدل ٣٠ في الثانية
    this.sendAcc = (this.sendAcc || 0) + dt;
    if (this.sendAcc >= 1 / 30) {
      this.sendAcc = 0;
      this.app.net.send({ t: 'input', ...input, grenade: !!input.grenade, seq: ++this.seq });
      if (input.reviving) this.app.net.send({ t: 'input', ...input, reviving: true }); // تعزيز
    }
    // صوت الطلقات محلياً
    this.localFireT = (this.localFireT || 0) - dt;
    const wpnNow = this.netYou?.weapons?.[this.netYou.curWeapon || 0];
    if (input.shoot && wpnNow && this.localFireT <= 0) {
      const def = WEAPONS[wpnNow.id];
      if (def && def.type !== 'melee' && wpnNow.ammo > 0) {
        this.localFireT = 60 / def.rpm;
        this.audio.shot(def.id, 0, (wpnNow.att || []).includes('suppressor'));
        this.renderer.shake(def.type === 'sniper' || def.type === 'lmg' ? 3.4 : 1.5);
      }
    }
    // تنبيهات
    if (this.dropPhase) $('center-msg').innerHTML = `<div>${this.planeDone ? 'هبوط بالمظلة...' : 'الطائرة في الجو — اختر نقطة الهبوط'}</div>`;
    else $('center-msg').innerHTML = '';
    if (this.snapTime) {
      const age = (performance.now() - this.snapTime) / 1000;
      if (age > 3) { this.toastBig('⚠️ انقطاع الاتصال...'); }
    }
  }

  respawnTdm(p) {
    const a0 = Math.random() * Math.PI * 2, r0 = Math.random() * this.match.zone.r * 0.8;
    p.x = this.match.zone.x + Math.cos(a0) * r0;
    p.y = this.match.zone.y + Math.sin(a0) * r0;
    p.hp = 100; p.shield = 50; p.alive = true; p.knocked = false; p.effects = {};
    p.weapons = [{ id: 'akm', ammo: 30, attachments: [] }, { id: 'p92', ammo: 15, attachments: [] }];
    p.curWeapon = 0;
    p.ammo = { '9mm': 90, '556': 90, '762': 90, '12g': 12, '45': 30, 'sniper': 8 };
    this.audio.respawn();
  }
  checkReviveSelf(dt) {
    const me = this.you;
    const mate = this.match.players.find(p => p.knocked && p.team === me.team && dist(p.x, p.y, me.x, me.y) < 70);
    if (mate) $('center-msg').innerHTML = `<div>إحياء ${mate.name}... ${Math.round(mate.reviveProgress * 33)}%</div>`;
  }

  onLocalKill(victim, killer) {
    this.audio.kill();
    if (killer && killer.id === 'you') {
      const slot = curW(killer);
      this.addKillfeed(killer.name, victim.name, slot ? slot.ar : 'قريب');
      this.toastBig('💀 أقصيت ' + victim.name);
    } else {
      this.addKillfeed(killer ? killer.name : (victim.deathSource === 'zone' ? 'العاصفة' : 'البيئة'), victim.name, '');
    }
  }

  /* ============================= الأحداث ============================= */
  processEvents(events) {
    const view = this.view;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          this.renderer.handleEvent(e, this.viewForEvents());
          if (e.by === this.myId || (this.you && e.by === 'you')) {
            if (e.on === this.myId || (this.you && e.id === 'you')) { }
            this.showDamage(e.dmg, e.x, e.y, e.head);
            this.audio.hit(e.head);
            $('hitmarker').classList.remove('on'); void $('hitmarker').offsetWidth; $('hitmarker').classList.add('on');
          }
          if (e.on === this.myId || (this.you && e.on === 'you')) { this.damageFlash = 1; this.renderer.shake(4); }
          break;
        }
        case 'kill': {
          const meId = this.myId || 'you';
          const view2 = this.viewForEvents();
          this.renderer.handleEvent(e, view2);
          if (e.id === meId) { this.audio.defeat(); this.toastBig('💀 تم إقصاؤك'); }
          else if (e.by === meId) { this.audio.kill(); }
          const v = view2.players.find(p => p.id === e.id);
          const pr = view2.players.find(p => p.id === e.by);
          this.addKillfeed(e.byName, e.name, e.weapon);
          break;
        }
        case 'knock': {
          const meId = this.myId || 'you';
          if (e.id === meId) { this.toastBig('🩸 أنت مصاب! اطلب المساعدة'); this.damageFlash = 1; }
          if (e.by === meId) this.toastBig('🎯 أسقطت ' + (this.viewForEvents().players.find(p => p.id === e.id)?.n || 'عدواً'));
          this.audio.hit(true);
          break;
        }
        case 'revive': {
          const meId = this.myId || 'you';
          if (e.id === meId) this.toastBig('💚 تم إحياؤك!'); else if (e.by === meId) this.toastBig('💚 أحيت زميلك!');
          this.audio.heal();
          break;
        }
        case 'explosion': this.audio.explosion(this.distToMe(e)); this.renderer.handleEvent(e, this.viewForEvents()); break;
        case 'vehicleBoom': this.audio.explosion(this.distToMe(e)); this.renderer.handleEvent(e, this.viewForEvents()); break;
        case 'pickup': {
          if (this.online) { const it = this.loot.find(l => l.id === e.loot); if (it) it.taken = true; }
          const meId = this.myId || 'you';
          if (e.id === meId) this.audio.pickup();
          break;
        }
        case 'spawnLoot': {
          for (const b of e.items) {
            const item = {
              id: b.id, x: b.x, y: b.y, taken: false, kind: b.k, weapon: b.wp, armor: b.ar, heal: b.hl,
              attach: b.at, ammoType: b.am, count: b.c, table: 'floor',
            };
            if (this.online) { this.dynamicLoot.push(item); this.loot.push(item); }
            else this.match.loot.push(item);
          }
          break;
        }
        case 'airdrop': this.audio.airdrop(); this.toastBig('📦 إنزال جوي!'); break;
        case 'airdropLand': this.renderer.handleEvent(e, this.viewForEvents()); this.audio.airdrop(); break;
        case 'zone': this.audio.zoneWarn(); this.toastBig('⭕ الدائرة تتقلص!'); break;
        case 'crateBreak': this.renderer.handleEvent(e, this.viewForEvents()); break;
        case 'smoke': this.smokes.push({ x: e.x, y: e.y, r: 180, t: e.dur || 14 }); break;
        case 'gameover': break;
        default: break;
      }
    }
    // تلاشي الدخان
    for (let i = this.smokes.length - 1; i >= 0; i--) { this.smokes[i].t -= 1 / 60; if (this.smokes[i].t <= 0) this.smokes.splice(i, 1); }
  }
  viewForEvents() {
    if (this.view) return this.view;
    const players = this.online ? (this.prevSnap?.players || []) : (this.match?.players || []).map(p => ({ id: p.id, x: p.x, y: p.y, c: p.charId }));
    return { players, myId: this.myId || 'you', zone: this.online ? this.snapInfo.zone : this.match?.zone, loot: this.loot || [], bullets: [], grenades: [], airdrops: [], vehicles: [], world: this.world || this.match?.world, biome: this.biome };
  }

  addKillfeed(killer, victim, weapon) {
    this.killfeed.unshift({ killer: killer || 'البيئة', victim, weapon, t: performance.now() });
    if (this.killfeed.length > 6) this.killfeed.pop();
    const el = $('killfeed');
    el.innerHTML = this.killfeed.map(k => `<div class="kf"><span class="k">${esc(k.killer)}</span> <span class="w">[${esc(k.weapon || '—')}]</span> <span class="v">${esc(k.victim)}</span></div>`).join('');
  }
  showDamage(dmg, x, y, head) {
    const pr = this.renderer.worldToScreen(x, y, 55);
    const sx = (pr.vis ? pr.x : innerWidth / 2) + (Math.random() - 0.5) * 30;
    const sy = (pr.vis ? pr.y : innerHeight / 2) + (Math.random() - 0.5) * 30;
    const d = document.createElement('div');
    d.className = 'dpop' + (head ? ' head' : '');
    d.textContent = (head ? '🎯 ' : '') + Math.round(dmg);
    d.style.left = sx + 'px'; d.style.top = sy + 'px';
    $('dmg-popups').appendChild(d);
    setTimeout(() => d.remove(), 820);
  }
  toastBig(text, ms = 2200) {
    const el = $('big-msg'); el.textContent = text; el.classList.add('on');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => el.classList.remove('on'), ms);
  }

  /* ============================= الأفعال ============================= */
  handleActions(actions, me, offline) {
    for (const a of actions) {
      switch (a.a) {
        case 'jumpHurdle': {
          if (this.dropPhase && this.dropPoint) this.doJump(this.dropPoint.x, this.dropPoint.y);
          else this.audio.ui();
          break;
        }
        case 'reload': if (offline && me) { startReload(me); } this.audio.reload(); break;
        case 'healCycle': {
          const items = ['bandage', 'medkit', 'energy'];
          const src = offline ? (me?.heals || {}) : (this.netYou?.heals || {});
          for (let i = 0; i < 3; i++) {
            this.healIdx = (this.healIdx + 1) % 3;
            const it = items[this.healIdx];
            if ((src[it] || 0) > 0) {
              if (offline) startHeal(me, it);
              else this.pendingHeal = it;
              this.audio.heal();
              this.toastBig('💊 ' + HEALS[it].ar, 900);
              break;
            }
          }
          break;
        }
        case 'grenadeToggle': {
          this.grenadeMode = this.grenadeMode === 'frag' ? 'smoke' : 'frag';
          this.toastBig(this.grenadeMode === 'frag' ? '💣 قنبلة يدوية' : '💨 قنبلة دخان', 900);
          if (!offline) this.app.net.send({ t: 'action', a: 'grenadeMode', mode: this.grenadeMode });
          break;
        }
        case 'skill': {
          if (offline && me) { if (me.skill.cd <= 0) useSkill(this.match, me); else this.toastBig('⏳ المهارة ليست جاهزة', 800); }
          else { this.app.net.send({ t: 'action', a: 'skill' }); }
          break;
        }
        case 'pickupNear': {
          if (offline && me) {
            let best = null, bd = 80;
            for (const l of this.match.loot) { if (l.taken) continue; const d = dist(l.x, l.y, me.x, me.y); if (d < bd) { bd = d; best = l; } }
            if (best) { tryPickup(this.match, me, best.id); this.audio.pickup(); } else this.audio.ui();
          } else this.app.net.send({ t: 'action', a: 'pickupNear' });
          break;
        }
        case 'vehicleToggle': {
          if (offline && me) {
            if (me.inVehicle) exitVehicle(this.match, me);
            else {
              let best = null, bd = 150;
              for (const v of this.match.vehicles) { if (v.dead) continue; const d = dist(v.x, v.y, me.x, me.y); if (d < bd) { bd = d; best = v; } }
              if (best) enterVehicle(this.match, me, best.id); else this.toastBig('🚙 لا توجد مركبة قريبة', 900);
            }
          } else {
            const v = this.nearestVehicle();
            if (v) this.app.net.send({ t: 'action', a: 'vehicle', id: v.id });
            else this.app.net.send({ t: 'action', a: 'exitVehicle' });
          }
          break;
        }
        case 'swap': {
          if (offline && me) { me.curWeapon = a.i; me.reloadT = 0; }
          else this.app.net.send({ t: 'action', a: 'swap', i: a.i });
          break;
        }
        case 'swapToggle': {
          const cur = offline ? (me?.curWeapon || 0) : (this.netYou?.curWeapon || 0);
          const next = cur === 0 ? 1 : 0;
          if (offline && me?.weapons[next]) { me.curWeapon = next; }
          else this.app.net.send({ t: 'action', a: 'swap', i: next });
          break;
        }
        case 'melee': {
          if (offline && me) { const idx = me.weapons.findIndex(w => WEAPONS[w.id].type === 'melee'); if (idx >= 0) { me.curWeapon = idx; me.fireT = 0; } }
          break;
        }
        case 'emoteMenu': {
          const list = this.app.profile.owned.emotes || [];
          if (!list.length) break;
          this.emoteIdx = (this.emoteIdx + 1) % list.length;
          const id = list[this.emoteIdx];
          if (offline && me) { me.emote = id; me.emoteT = 4; }
          else this.app.net.send({ t: 'action', a: 'emote', id });
          this.toastBig('😄 رقصة: ' + (require_emote(id)?.ar || id), 1200);
          break;
        }
        case 'pause': {
          if (this.app?.prayer?.locked) break;      // لا إيقاف/استئناف أثناء قفل الصلاة
          this.paused = !this.paused;
          $('pause').classList.toggle('hidden', !this.paused);
          break;
        }
        case 'scoreboard': $('scoreboard').classList.remove('hidden'); break;
        case 'fullscreen': {
          try {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else document.documentElement.requestFullscreen?.().catch(() => {});
          } catch { }
          try { window.__orkTryLandscape && window.__orkTryLandscape(); } catch { }
          break;
        }
        case 'aimToggleFree': break;
        default: break;
      }
    }
  }
  nearestVehicle() {
    const src = this.online ? (this.snapInfo.vehicles || []) : (this.match.vehicles || []);
    const me = this.online ? (this.prevSnap?.players.find(p => p.id === this.myId)) : this.you;
    if (!me) return null;
    let best = null, bd = 170;
    for (const v of src) { const d = dist(v.x, v.y, me.x, me.y); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  doJump(x, y) {
    if (!this.dropPhase) return;
    if (this.online) {
      this.app.net.send({ t: 'action', a: 'jump', x, y });
    } else {
      if (!this.match || !this.you) return;
      dropPlayer(this.match, this.you, x, y);
    }
    this.dropPhase = false;
    $('jump-phase')?.classList.add('hidden');
    this.syncTouchUI();
    this.audio.jump();
  }

  /* ============================= البناء البصري ============================= */
  render(dt) {
    if (this.online) this.renderOnline(dt); else this.renderOffline(dt);
  }
  /**
   * مساعدة تصويب لطيفة للهاتف: عند التصويب/الرمي تنجذب زاوية النظر قليلاً
   * نحو أقرب عدو داخل زاوية ضيقة — تجعل اللعب باللمس عادلاً أمام الماوس.
   */
  applyAimAssist(dt) {
    const inp = this.input;
    if (!inp || !inp.aimAssist || !inp.isTouch || !inp.fps) return;
    if (!(inp.touchBtns?.aim || inp.touchBtns?.fire || inp.mouse.down)) return;
    const myId = this.online ? this.myId : 'you';
    const list = this.view?.players || [];
    const me = list.find(p => p.id === myId) || (this.online ? null : this.you);
    if (!me) return;
    const myTeam = this.online ? this.myTeam : (this.you ? this.you.team : -1);
    let bestDa = null, bestScore = Infinity;
    for (const p of list) {
      if (p.id === myId || !p.al || p.kn) continue;
      if (this.teams && p.t === myTeam) continue;
      const dx = p.x - me.x, dy = p.y - me.y;
      const d = Math.hypot(dx, dy);
      if (d > 1500 || d < 1) continue;
      let da = Math.atan2(dy, dx) - inp.look.yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const cone = inp.touchBtns?.aim ? 0.20 : 0.12;
      if (Math.abs(da) > cone) continue;
      const score = Math.abs(da) * 900 + d * 0.08;
      if (score < bestScore) { bestScore = score; bestDa = da; }
    }
    if (bestDa !== null) inp.look.yaw += bestDa * Math.min(1, dt * 4.5);
  }
  /** هل اللاعب يصوّب الآن؟ (زر الماوس الأيمن أو زر التصويب باللمس) */
  isAiming() { return !!(this.input.mouse.right || this.input.touchBtns?.aim); }
  baseView() {
    const r3 = this.renderer.r3;
    return {
      myId: this.online ? this.myId : 'you',
      myTeam: this.online ? this.myTeam : 0,
      teams: this.teams,
      firstPerson: this.renderer.mode === 'fps',
      view3d: this.renderer.mode,
      camYaw: this.input.fps ? this.input.look.yaw : undefined,
      camPitch: this.input.fps ? this.input.look.pitch : 0,
      ads: this.isAiming(),
      sprint: !!this.input.sprinting,
      damageFlash: this.damageFlash,
      shotDirs: this.shotDirs,
      smokes: this.smokes,
      dropPhase: this.dropPhase,
      weaponSkins: this.weaponSkins || {},
      fogOfWar: !this.online,
      scope: 1,
      r3cam: r3 ? r3.cam : null,
    };
  }
  renderOffline(dt) {
    const match = this.match;
    const world = match.world;
    const loot = [];
    const me = this.you;
    for (const l of match.loot) { if (l.taken) continue; if (dist(l.x, l.y, me.x, me.y) < 1500) loot.push(l); }
    const players = match.players.map(p => this.simPlayerView(p));
    const view = Object.assign(this.baseView(), {
      world, biome: world.biome, loot, players,
      bullets: match.bullets, grenades: match.grenades, airdrops: match.airdrops,
      vehicles: match.vehicles, zone: match.zone, plane: match.plane,
      scope: this.isAiming() && curW(me) ? zoomOf(me) : 1,
    });
    view.myId = 'you';
    if (this.isAiming() && curW(me)) view.myTeam = me.team;
    // مشاهدة بعد الموت: الكاميرا تتبع زميلاً حياً أو أقرب لاعب
    if (!me.alive && match.state !== 'over') {
      const mate = match.players.find(p => p.alive && p.team === me.team && p !== me);
      const camT = mate || match.players.find(p => p.alive);
      if (camT) { view.camTarget = camT; $('center-msg').innerHTML = `<div>👁️ مشاهدة: ${camT.name}</div>`; }
    } else if (me.alive) view.camTarget = null;
    this.view = view;
    this.renderer.frame(view, dt);
  }
  simPlayerView(p) {
    const slot = curSlot(p);
    const w = curW(p);
    return {
      id: p.id, n: p.name, t: p.team, x: p.x, y: p.y, a: p.aim, hp: Math.round(p.hp), sh: Math.round(p.shield),
      al: p.alive ? 1 : 0, k: p.kills, kn: p.knocked ? 1 : 0, c: p.charId, s: p.skinId,
      w: w ? w.id : null, veh: p.inVehicle, st: p.dropState, z: Math.round(p.z),
      sp: p.sprint ? 1 : 0, cr: p.crouch ? 1 : 0, pr: p.prone ? 1 : 0, ai: p.aiming ? 1 : 0,
      hl: p.healT > 0 ? 1 : 0, rl: p.reloadT > 0 ? 1 : 0, bot: p.bot ? 1 : 0, em: p.emote,
      stl: p.effects.stealth ? 1 : 0, bo: Math.round(p.boost),
      walking: Math.hypot(p.vx, p.vy) > 20,
      vestLvl: p.vest ? ARMORS[p.vest].lvl : 0, helmLvl: p.helmet ? ARMORS[p.helmet].lvl : 0,
      bagLvl: p.bag ? ARMORS[p.bag].lvl : 0, zoom: zoomOf(p), fireFx: Math.max(0, p.fireT * 3),
      vx: p.vx, vy: p.vy, dying: !p.alive && p.deathT < 0.1,
    };
  }
  renderOnline(dt) {
    const snap = this.snapInfo;
    if (!snap.zone) return;
    const t = (performance.now() - this.snapTime) / 1000;
    const players = [];
    for (const p of (this.prevSnap?.players || [])) {
      const np = snap.players.find(x => x.id === p.id) || p;
      const k = Math.min(1.4, t * 12);
      players.push({
        ...np,
        x: p.x + (np.x - p.x) * k, y: p.y + (np.y - p.y) * k,
        a: np.a, walking: Math.abs(np.x - p.x) + Math.abs(np.y - p.y) > 1.2,
        vestLvl: np.ve || 0, helmLvl: np.he || 0, bagLvl: np.bg || 0, zoom: 1,
        dying: np.al === 0,
      });
    }
    for (const np of snap.players) if (!players.find(p => p.id === np.id)) players.push({ ...np, walking: false, vestLvl: np.ve || 0, helmLvl: np.he || 0, bagLvl: np.bg || 0 });
    // توقع بسيط للاعب المحلي (لتقليل الإحساس بالتأخير)
    const meIdx = players.findIndex(p => p.id === this.myId);
    if (meIdx >= 0 && this.netYou?.pos && !this.dropPhase) {
      const inp = this.input.read(this.renderer.cam, players[meIdx], null);
      const p = players[meIdx];
      const speed = 225 * (WEAPONS[p.w]?.move || 1) * (inp.sprint ? 1.42 : 1) * (inp.aiming ? 0.55 : 1);
      p.x += inp.mx * speed * Math.min(t, 0.12) * 0.55;
      p.y += inp.my * speed * Math.min(t, 0.12) * 0.55;
      p.walking = p.walking || Math.hypot(inp.mx, inp.my) > 0.1;
      p.a = inp.aim;
    }
    // الدخان المحلي
    const view = Object.assign(this.baseView(), {
      world: this.world, biome: this.world.biome, loot: this.loot,
      players, bullets: snap.bullets || [], grenades: snap.grenades || [],
      airdrops: snap.airdrops || [], vehicles: snap.vehicles || [], zone: snap.zone, plane: snap.plane,
      scope: this.isAiming() && this.netYou ? (this.netYou.scope || 1.2) : 1,
    });
    view.myId = this.myId;
    // مشاهدة بعد الموت (أونلاين)
    const meP = players.find(p => p.id === this.myId);
    if (meP && meP.al === 0 && snap.state !== 'over') {
      const mate = players.find(p => p.al === 1 && p.t === this.myTeam && p.id !== this.myId);
      const camT = mate || players.find(p => p.al === 1);
      if (camT) { view.camTarget = camT; $('center-msg').innerHTML = `<div>👁️ مشاهدة: ${camT.n}</div>`; }
    } else if (meP && meP.al === 1) view.camTarget = null;
    this.view = view;
    this.renderer.frame(view, dt);
  }

  /* ============================= الـ HUD ============================= */
  updateHud() {
    const c = this.hudCache;
    const get = (id) => c[id] || (c[id] = $(id));
    const online = this.online;
    const you = online ? this.netYou : this.you;
    const snap = online ? this.snapInfo : null;
    const me = online ? (this.view?.players.find(p => p.id === this.myId)) : this.you;
    const zone = online ? snap.zone : this.match.zone;

    if (you) {
      const hp = online ? you.hp : Math.round(this.you.hp);
      const sh = online ? you.sh : Math.round(this.you.shield);
      const bo = online ? you.boost : Math.round(this.you.boost);
      get('bar-hp').style.width = Math.max(0, hp) + '%';
      get('hp-txt').textContent = Math.max(0, Math.round(hp));
      get('bar-sh').style.width = Math.max(0, sh) + '%';
      get('sh-txt').textContent = Math.round(sh);
      get('bar-bo').style.width = Math.max(0, bo) + '%';
      get('bo-txt').textContent = Math.round(bo);
    }
    // الأسلحة والذخيرة
    const wl = online ? (you?.weapons || []) : (this.you.weapons || []).map((w, i) => ({ id: w.id, ammo: w.ammo, att: w.attachments, cur: i === this.you.curWeapon }));
    const curIdx = online ? (this.netYou?.curWeapon || 0) : this.you.curWeapon;
    get('hud-weapons').innerHTML = wl.map((w, i) => {
      const def = WEAPONS[w.id]; if (!def) return '';
      const isCur = online ? (you?.weapons && this.netYou.curWeapon === i) : i === this.you.curWeapon;
      return `<div class="wslot ${isCur ? 'cur' : ''}"><span>${i + 1}</span> ${def.ar} <b>${w.ammo || ''}</b></div>`;
    }).join('');
    const curWpn = wl[curIdx];
    if (curWpn) {
      const def = WEAPONS[curWpn.id];
      get('hud-ammo').textContent = def.type === 'melee' ? '∞' : curWpn.ammo;
      get('hud-reserve').textContent = def.type === 'melee' ? '' : (online ? (you?.ammo?.reserve ?? 0) : (this.you.ammo[def.ammo] || 0));
      get('hud-wname').textContent = def.ar + (curWpn.att?.length ? ' · ' + curWpn.att.map(a => ATTACHMENTS[a]?.ar).filter(Boolean).join(' ') : '');
    } else { get('hud-ammo').textContent = '0'; get('hud-reserve').textContent = '0'; get('hud-wname').textContent = '—'; }
    // العتاد
    const heals = online ? (you?.heals || {}) : this.you.heals;
    const gear = online ? { vest: you?.vest, helmet: you?.helmet, bag: you?.bag } : { vest: this.you.vest, helmet: this.you.helmet, bag: this.you.bag };
    get('hud-gear').innerHTML = [
      gear.vest ? ARMORS[gear.vest].ar : 'بلا درع',
      gear.helmet ? ARMORS[gear.helmet].ar : 'بلا خوذة',
      gear.bag ? ARMORS[gear.bag].ar : 'بلا حقيبة',
    ].map(t => `<div>${t}</div>`).join('');
    const items = [];
    for (const k of ['bandage', 'medkit', 'energy', 'grenade', 'smoke']) if ((heals[k] || 0) > 0) items.push(`<div class="item">${HEALS[k].ar} ×${heals[k]}</div>`);
    items.push(`<div class="item ${this.grenadeMode === 'smoke' ? 'selfire' : ''}">${this.grenadeMode === 'frag' ? '💣 قنبلة' : '💨 دخان'}</div>`);
    get('hud-items').innerHTML = items.join('');
    // العدادات
    get('hud-alive').textContent = online ? snap.alive : this.match.aliveCount;
    get('hud-kills').textContent = online ? (you?.kills || 0) : this.you.kills;
    const time = online ? snap.t : this.match.time;
    get('hud-timer').textContent = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
    get('hud-ping').textContent = online ? this.app.net.ping + ' ms' : 'أوفلاين';
    if (this.mode === 'tdm') {
      const sc = online ? this.tdmScore : this.match.tdmScore;
      get('tdm-score').textContent = `🔵 ${sc?.[1] || 0} : ${sc?.[0] || 0} 🔴`;
    }
    get('zone-timer').textContent = zone ? (zone.st === 'hold' ? `الدائرة ${zone.phase + 1} · ${Math.ceil(zone.timer)}ث` : `تتقلص! ${Math.ceil(zone.timer)}ث`) : '—';
    // الكومباس
    this.drawCompass(me);
    // الأعداء في الاتجاهات
    this.updateShotDirs();
    this.damageFlash = Math.max(0, this.damageFlash - 0.03);
    // الحساسية و التقاطع
    const spread = online ? 8 : (you && this.you ? 6 + this.you.reloadT * 8 : 8);
    const ch = $('crosshair');
    const cx = Math.max(4, Math.min(30, spread));
    ch.querySelectorAll('i').forEach((el, i) => {
      const off = cx;
      if (i === 0) el.style.transform = `translateX(-50%) translateY(${-off + 12}px)`;
      if (i === 1) el.style.transform = `translateX(-50%) translateY(${off - 12}px)`;
      if (i === 2) el.style.transform = `translateY(-50%) translateX(${-off + 12}px)`;
      if (i === 3) el.style.transform = `translateY(-50%) translateX(${off - 12}px)`;
    });
    // لوحة النتائج
    if (!this.input.keys.has('Tab') && !this.input.sbOpen) $('scoreboard').classList.add('hidden');
    else this.showScoreboard();
    // أزرار اللمس: للجهاز اللمسي مع احترام اختيار اللاعب في الإعدادات
    this.syncTouchUI();
  }
  drawCompass(me) {
    if (!me) return;
    const el = $('compass');
    const dirs = [['ش', 180], ['غ', 270], ['ج', 0], ['ق', 90]];
    let html = '<div class="nd"></div>';
    for (let deg = -90; deg <= 90; deg += 15) {
      const a = (me.a * 180 / Math.PI) + deg;
      const x = 50 + deg / 180 * 100;
      html += `<i style="left:${x}%"></i>`;
    }
    for (const [label, base] of dirs) {
      let dd = ((base - me.a * 180 / Math.PI + 540) % 360) - 180;
      if (Math.abs(dd) < 92) html += `<b style="left:${50 + dd / 180 * 100}%;transform:translateX(-50%)">${label}</b>`;
    }
    html += `<b style="left:50%;top:6px;transform:translateX(-50%);color:#ffc63d">▲</b>`;
    el.innerHTML = html;
  }
  updateShotDirs() {
    const now = performance.now();
    this.shotDirs = this.shotDirs.filter(s => now - s.t < 1400);
    for (const s of this.shotDirs) s.k = Math.max(0, 1 - (now - s.t) / 1400);
  }
  onEnemyShot(ev) {
    const me = this.online ? this.view?.players.find(p => p.id === this.myId) : this.you;
    if (!me) return;
    const src = this.view?.players.find(p => p.id === ev.by);
    if (!src || ev.by === (this.online ? this.myId : 'you')) return;
    const d = Math.hypot(src.x - me.x, src.y - me.y);
    if (d > 2400) return;
    this.audio.shot(ev.weapon, d, ev.silent);
    this.shotDirs.push({ x: src.x, y: src.y, t: performance.now(), k: 1 });
    if (this.shotDirs.length > 6) this.shotDirs.shift();
  }
  showScoreboard() {
    const el = $('scoreboard');
    el.classList.remove('hidden');
    const myId = this.online ? this.myId : 'you';
    const players = this.online ? (this.snapInfo.players || []) : this.match.players.map(p => ({ id: p.id, n: p.name, k: p.kills, al: p.alive ? 1 : 0, bot: p.bot ? 1 : 0, dmg: Math.round(p.damage) }));
    const sorted = players.slice().sort((a, b) => (b.k || 0) - (a.k || 0));
    const alive = this.online ? this.snapInfo.alive : this.match.aliveCount;
    $('sb-body').innerHTML = `<div style="margin-bottom:8px;color:var(--dim)">أحياء: <b style="color:var(--gold)">${alive}</b> / ${players.length}</div>` +
      sorted.slice(0, 50).map((p, i) => `<div class="sb-row ${p.id === myId ? 'me' : ''}"><span class="pos">#${i + 1}</span><span>${esc(p.n)}</span><span style="margin-inline-start:auto">☠️ ${p.k || 0} · 💥 ${p.dmg || 0}</span><span style="color:${p.al ? '#41e06a' : '#ff6b6b'}">${p.al ? 'حي' : 'مقصى'}</span></div>`).join('');
  }
  drawPaused() { }
  /** تلميح "انقر للتحكم بالماوس" في المنظور ثلاثي الأبعاد */
  updateLookHint() {
    const el = $('look-hint');
    if (!el) return;
    const show = this.running && this.renderer.is3D && !this.input.locked && !this.input.isTouch && !this.paused;
    el.classList.toggle('hidden', !show);
  }
  lockLook() {
    if (this.renderer.is3D && !this.input.locked) this.input.requestLock();
  }

  /* ---------- 🗺️ خريطة النزول ----------
     الطبقة الثابتة (الأرض/الطرق/المباني/المناطق الساخنة) تُرسم مرة واحدة في
     لوحة مخفية ثم تُنسخ كل إطار، وفوقها الطبقة الحيّة: مسار الطائرة، موقعها
     الحالي، ونقطة النزول المختارة. هذا يبقي الواجهة سلسة على الهواتف. */
  buildDropBase(world, S) {
    const key = `${world.mapId}:${world.seed}:${S}`;
    if (this._dropBase && this._dropBaseKey === key) return this._dropBase;
    let base;
    try { base = document.createElement('canvas'); } catch { return null; }
    base.width = S; base.height = S;
    const ctx = base.getContext('2d');
    if (!ctx) return null;
    const k = (S * 0.92) / world.map.size, o = S / 2;
    const W = (x) => o + x * k, H = (y) => o + y * k;
    const biome = world.biome;
    const ring = () => {
      ctx.beginPath();
      for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2, r = world.shape.radius(a); ctx.lineTo(W(Math.cos(a) * r), H(Math.sin(a) * r)); }
      ctx.closePath();
    };
    ctx.fillStyle = '#08111a'; ctx.fillRect(0, 0, S, S);
    ctx.save();
    ring(); ctx.fillStyle = biome.ground; ctx.fill(); ctx.clip();
    for (const d of world.decals) {
      if (d.kind === 'road') { ctx.strokeStyle = biome.road; ctx.lineWidth = Math.max(2, d.width * k); ctx.beginPath(); ctx.moveTo(W(d.x1), H(d.y1)); ctx.lineTo(W(d.x2), H(d.y2)); ctx.stroke(); }
      else if (d.kind === 'water') { ctx.fillStyle = biome.water; ctx.fillRect(W(d.x - d.w / 2), H(d.y - d.h / 2), d.w * k, d.h * k); }
      else if (d.kind === 'building') { ctx.fillStyle = 'rgba(20,14,10,.8)'; ctx.fillRect(W(d.x - d.w / 2), H(d.y - d.h / 2), Math.max(2, d.w * k), Math.max(2, d.h * k)); }
    }
    // المناطق الساخنة (غنائم أقوى)
    for (const hd of (world.hotDrops || [])) {
      ctx.fillStyle = 'rgba(255,70,70,.2)';
      ctx.beginPath(); ctx.arc(W(hd.x), H(hd.y), hd.r * k, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,90,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(W(hd.x), H(hd.y), hd.r * k, 0, 6.283); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,198,61,.6)'; ctx.lineWidth = 2; ring(); ctx.stroke();
    this._dropBase = base; this._dropBaseKey = key;
    return base;
  }

  drawDropMap(force = false) {
    const cv = $('dropmap');
    if (!cv) return;
    const world = this.dropWorld();
    if (!world) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const S = cv.width, k = (S * 0.92) / world.map.size, o = S / 2;
    const W = (x) => o + x * k, H = (y) => o + y * k;
    if (force) { this._dropBase = null; this._dropBaseKey = ''; }
    const base = this.buildDropBase(world, S);
    ctx.clearRect(0, 0, S, S);
    if (base) { try { ctx.drawImage(base, 0, 0); } catch { } }

    // مسار الطائرة + موقعها الحالي
    const pl = this.online ? this.snapInfo?.plane : this.match?.plane;
    if (pl) {
      if (!this.online && Number.isFinite(pl.ax)) {
        ctx.save();
        ctx.setLineDash([7, 7]); ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(W(pl.ax), H(pl.ay)); ctx.lineTo(W(pl.bx), H(pl.by)); ctx.stroke();
        ctx.restore();
      }
      if (Number.isFinite(pl.x) && !pl.done) {
        const px = W(pl.x), py = H(pl.y);
        ctx.save();
        ctx.translate(px, py); ctx.rotate((this.online ? pl.a : pl.angle) || 0);
        ctx.fillStyle = '#eaf3ff';
        ctx.beginPath();
        ctx.moveTo(11, 0); ctx.lineTo(-7, 7); ctx.lineTo(-3, 0); ctx.lineTo(-7, -7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        // خط الاقتراب من نقطة النزول
        if (this.dropPoint) {
          ctx.save();
          ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,198,61,.55)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(W(this.dropPoint.x), H(this.dropPoint.y)); ctx.stroke();
          ctx.restore();
        }
      }
    }

    // نقطة النزول المختارة — علامة نابضة واضحة على الهاتف
    if (this.dropPoint) {
      const x = W(this.dropPoint.x), y = H(this.dropPoint.y);
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const pulse = 12 + Math.sin(t * 4) * 3;
      ctx.strokeStyle = 'rgba(255,198,61,.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, pulse + 8, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = '#ffc63d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - pulse - 7, y); ctx.lineTo(x - pulse + 2, y);
      ctx.moveTo(x + pulse - 2, y); ctx.lineTo(x + pulse + 7, y);
      ctx.moveTo(x, y - pulse - 7); ctx.lineTo(x, y - pulse + 2);
      ctx.moveTo(x, y + pulse - 2); ctx.lineTo(x, y + pulse + 7);
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffc63d';
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.283); ctx.fill();
    }
  }

  /* ---------- استقبال اللقطات (أونلاين) ---------- */
  onSnapshot(msg) {
    const s = msg.s;
    this.prevSnap = (this.snapInfo && this.snapInfo.zone) ? this.snapInfo : s;
    this.snapInfo = s;
    this.snapTime = performance.now();
    if (msg.you) {
      this.netYou = {
        ...msg.you,
        curWeapon: Math.max(0, Math.min((msg.you.weapons || []).length - 1, msg.you.cur || 0)),
        scope: msg.you.scope || 1.2,
        pos: this.netYou?.pos,
      };
    }
    this.tdmScore = s.tdmScore || this.tdmScore;
    const me = (s.players || []).find(p => p.id === this.myId);
    if (this.netYou) this.netYou.pos = me;
    if (!this._yawSynced && me) {
      this._yawSynced = true;
      this.input.look.yaw = me.a || 0;
      if (this.renderer.r3) this.renderer.r3.cam.yaw = me.a || 0;
    }
    if (me && me.st !== 'plane' && me.st !== 'wait') {
      if (this.dropPhase) { this.dropPhase = false; this.syncTouchUI(); }
    }
    $('jump-phase').classList.toggle('hidden', !this.dropPhase);
  }
  onMatchEnd(msg) {
    this.res = msg.res;
    this.showResults(msg.res, null);
    if (msg.res.won || (msg.res.placement === 1 && msg.res.mode !== 'tdm')) this.audio.victory(); else this.audio.defeat();
  }
  onRewards(msg) {
    if (!msg.rewards) return;
    this.app.profile = msg.rewards.profile || this.app.profile;
    this.app.ui.updateProfile();
    const el = $('res-rewards');
    if (el) el.innerHTML = `<div class="reward-chip gold">+${msg.rewards.gold} 🪙</div><div class="reward-chip gems">+${msg.rewards.gems} 💎</div><div class="reward-chip xp">+${msg.rewards.xp} خبرة</div><div class="reward-chip bp">+${msg.rewards.bpXp} 🎖️</div>`;
    const xp = $('res-xp');
    if (xp) xp.textContent = `المستوى ${msg.rewards.profile.level} · ${msg.rewards.profile.xp}/${msg.rewards.profile.xpNeed} خبرة`;
    if (msg.rewards.levelUps > 0) { this.audio.levelUp(); this.toastBig('🎉 ارتقيت للمستوى ' + msg.rewards.profile.level); }
  }
  onEvents(msg) {
    this.processEvents(msg.list || []);
    for (const e of msg.list || []) {
      if (e.type === 'hit' && e.by !== this.myId) this.onEnemyShot({ by: e.by, weapon: e.weapon, silent: e.silent });
      if (e.type === 'shot') this.onEnemyShot(e);
    }
  }

  /* ---------- نهاية المباراة ---------- */
  finishOffline() {
    const match = this.match;
    const me = this.you;
    const alive = match.players.filter(p => p.alive);
    const place = me.alive ? 1 : (me.placement || 0);
    const won = this.mode === 'tdm' ? (match.tdmScore[me.team] > (match.tdmScore[1 - me.team] || 0)) : (me.alive && match.teamCount <= 1);
    this.results = {
      placement: place || (me.placement || 0) || 1, kills: me.kills, damage: Math.round(me.damage),
      headshots: me.headshots, time: match.time, mode: this.mode, won, revives: me.revives || 0,
      aliveCount: alive.length,
    };
    this.showResults(this.results, null);
    if (won) this.audio.victory(); else this.audio.defeat();
    // إرسال النتيجة للسيرفر لمنح الجوائز (حتى في الأوفلاين)
    if (this.app.token) {
      API.post('/api/offline/result', { token: this.app.token, result: this.results }).then(r => {
        if (r.rewards) {
          this.app.profile = r.rewards.profile || this.app.profile;
          this.app.ui.updateProfile();
          const el = $('res-rewards');
          el.insertAdjacentHTML('beforeend', `<div class="reward-chip gold">+${r.rewards.gold} 🪙</div><div class="reward-chip gems">+${r.rewards.gems} 💎</div><div class="reward-chip xp">+${r.rewards.xp} خبرة</div><div class="reward-chip bp">+${r.rewards.bpXp} 🎖️</div>`);
        }
      }).catch(() => { });
    }
  }
  showResults(res, rewards) {
    this.running = false;
    if (this.input.releaseLock) this.input.releaseLock();
    this.updateLookHint();
    $('hud').classList.add('hidden');
    $('scr-results').classList.add('active');
    const modeName = (MODES.find(m => m.id === res.mode) || {}).ar || '';
    const isWin = res.placement === 1 && res.mode !== 'tdm';
    $('res-title').textContent = isWin ? '🍗 بويـه! فوز!' : (res.mode === 'tdm' ? (res.won ? '🎉 فوز الفريق!' : 'خسارة الفريق') : `${modeName} — أفضل ${res.placement}`);
    $('res-place').textContent = res.mode === 'tdm' ? (res.won ? 'فوز' : 'خسارة') : '#' + res.placement;
    $('res-kills').textContent = res.kills;
    $('res-dmg').textContent = Math.round(res.damage);
    $('res-hs').textContent = res.headshots;
    $('res-time').textContent = `${Math.floor(res.time / 60)}:${String(Math.floor(res.time % 60)).padStart(2, '0')}`;
    const rw = $('res-rewards');
    rw.innerHTML = rewards ? '' : '<div class="reward-chip">...جاري حساب الجوائز</div>';
    $('res-xp').textContent = rewards ? `مستوى ${rewards.profile.level} · ${rewards.profile.xp}/${rewards.profile.xpNeed}` : '';
  }
  quit() {
    this.running = false;
    if (this.input.releaseLock) this.input.releaseLock();
    this.updateLookHint();
    if (this.online) this.app.net.send({ t: 'leave' });
    $('hud').classList.add('hidden');
    $('scr-results').classList.remove('active');
    this.app.ui.showMenu();
  }
}
function require_emote(id) {
  const all = { em_wave: { ar: 'تحية' }, em_dance: { ar: 'رقصة النصر' }, em_laugh: { ar: 'ضحكة' }, em_taunt: { ar: 'استفزاز' }, em_crown: { ar: 'تاج الملك' } };
  return all[id];
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export default Session;
