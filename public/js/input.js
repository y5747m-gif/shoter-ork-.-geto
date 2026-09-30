/**
 * ORK ZONE — client/input.js
 * التحكم: لوحة مفاتيح + ماوس (كمبيوتر) و أزرار لمس + عصا حركة (هاتف).
 * في الوضع ثلاثي الأبعاد (منظور الشخص الأول) يعمل قفل المؤشر (Pointer Lock) للنظر حولك،
 * وتُحوَّل مفاتيح WASD إلى اتجاه الحركة نسبةً لاتجاه النظر.
 */
export class Input2 {
  constructor(canvas) {
    this.cv = canvas;
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, right: false };
    this.sens = 1;
    // اكتشاف اللمس تلقائياً لكل الأجهزة (هاتف/تابلت/حتى لابتوب لمسي)
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0; } catch {}
    this.touchMode = !!coarse;
    this.stick = { active: false, id: null, dx: 0, dy: 0, cx: 0, cy: 0 };
    this.touchBtns = {};
    this.actions = [];
    this.autoFire = false;
    this.aimAssist = true;
    this.swapQueued = null;
    /** النظر ثلاثي الأبعاد: yaw دوران أفقي، pitch ارتفاع النظر (راديان) */
    this.look = { yaw: 0, pitch: 0 };
    this.fps = true;              // هل نحن في وضع ثلاثي الأبعاد؟
    this.locked = false;          // هل المؤشر مقفول؟
    this.pitchLimit = 0.62;       // ±٣٥° تقريباً: مجال رؤية رأسي أوسع في الثري دي
    this._touchLook = null;
    /* ---- إعدادات اللمس ---- */
    this.touchLookSens = 1;       // حساسية النظر باللمس (من الإعدادات)
    this.vibrate = true;          // اهتزاز خفيف عند الضغط
    this.tapToFire = false;       // نقرة على جهة النظر = طلقة
    this.sbOpen = false;          // لوحة النتائج مفتوحة (زر اللمس)
    this.lookIds = new Map();
    this.fireDrag = null;
    this._bind();
  }
  get isTouch() { return this.touchMode; }
  /** معامل تحويل بكسلات السحب إلى حركة نظر (يراعي دقّة الشاشة والحساسية) */
  get touchLookScale() { return 2.0 * (this.touchLookSens || 1); }

  _bind() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', e => {
      if (e.repeat) { return; }
      this.keys.add(e.code);
      if (['Tab', 'Space', 'KeyF', 'KeyR', 'KeyG', 'KeyH', 'KeyQ', 'KeyE', 'Digit1', 'Digit2'].includes(e.code)) e.preventDefault();
      this.onKey(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    if (this.cv) {
      this.cv.addEventListener('mousemove', e => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (this.fps && this.locked) this.lookBy(e.movementX || 0, e.movementY || 0);
      });
      this.cv.addEventListener('mousedown', e => {
        if (e.button === 0) this.mouse.down = true;
        if (e.button === 2) this.mouse.right = true;
        if (this.fps && !this.locked) this.requestLock();
        this.onMouseDown(e.button);
      });
      this.cv.addEventListener('contextmenu', e => e.preventDefault());
    }
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.right = false; });
    // قفل المؤشر
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('pointerlockchange', () => {
        this.locked = (document.pointerLockElement === this.cv);
        if (!this.locked) { this.mouse.down = false; this.mouse.right = false; }
        if (this.onLockChange) this.onLockChange(this.locked);
      });
      document.addEventListener('pointerlockerror', () => { this.locked = false; });
    }
    addEventListener('wheel', e => { this.actions.push({ a: 'swapDelta', v: Math.sign(e.deltaY) }); }, { passive: true });

    // ===================== اللمس (تخطيط أفقي احترافي) =====================
    // يسار الشاشة: عصا حركة «عائمة» تظهر مكان إصبعك.
    // يمين الشاشة: سحب للنظر (تعدد لمسات) + أزرار الرمي والحركة.
    this._bindTouch();
  }

  /* ------------------------------------------------------------------ */
  /* اللمس                                                               */
  /* ------------------------------------------------------------------ */
  _bindTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    this.stickEl = stick; this.knobEl = knob;
    this.lookIds = new Map();          // أصابع النظر (تعدد لمسات)
    this.fireDrag = null;              // إصبع بدأ من زر الرمي ويستمر بالنظر

    const placeStick = (x, y) => {
      if (!stick) return;
      stick.classList.remove('idle');
      const half = (stick.offsetWidth || 150) / 2;
      stick.style.left = (x - half) + 'px';
      stick.style.top = (y - half) + 'px';
      stick.style.right = 'auto';
      stick.style.bottom = 'auto';
    };
    const resetStick = () => {
      this.stick.active = false; this.stick.id = null;
      this.stick.dx = 0; this.stick.dy = 0;
      if (knob) knob.style.transform = 'translate(-50%,-50%)';
      if (stick) { stick.classList.add('idle'); stick.style.left = ''; stick.style.top = ''; stick.style.right = ''; stick.style.bottom = ''; }
    };
    this._resetStick = resetStick;

    /* نصف قطر العصا يتبع حجمها الفعلي (يتكيّف مع حجم الشاشة الأفقية) */
    const stickRadius = () => {
      const size = (stick && stick.offsetWidth) || 130;
      return Math.max(40, size * 0.38);
    };

    const moveStick = (x, y) => {
      const R = stickRadius();
      const dx = x - this.stick.cx, dy = y - this.stick.cy;
      const len = Math.hypot(dx, dy);
      const m = Math.min(1, len / R);
      const a = Math.atan2(dy, dx);
      this.stick.dx = Math.cos(a) * m; this.stick.dy = Math.sin(a) * m;
      if (knob) knob.style.transform = `translate(calc(-50% + ${this.stick.dx * R * 0.55}px), calc(-50% + ${this.stick.dy * R * 0.55}px))`;
    };

    const startStick = (x, y, id) => {
      this.stick.active = true; this.stick.id = id;
      this.stick.cx = x; this.stick.cy = y;
      this.stick.dx = 0; this.stick.dy = 0;
      placeStick(x, y);
      if (knob) knob.style.transform = 'translate(-50%,-50%)';
    };

    /** منطقة العصا: الربع الأيسر السفلي (نترك الأعلى للواجهة وأزرار النتائج) */
    const inMoveZone = (x, y) => x < innerWidth * 0.44 && y > innerHeight * 0.30;

    const target = this.cv || (typeof document !== 'undefined' ? document.body : null);
    if (target && target.addEventListener) {
      target.addEventListener('touchstart', (e) => {
        this.touchMode = true;
        for (const t of e.changedTouches) {
          const id = t.identifier;
          if (!this.stick.active && inMoveZone(t.clientX, t.clientY)) {
            startStick(t.clientX, t.clientY, id);
          } else {
            this.mouse.x = t.clientX; this.mouse.y = t.clientY;
            if (this.fps) this.lookIds.set(id, { x: t.clientX, y: t.clientY, moved: 0, t: Date.now() });
            else { this.mouse.down = true; this.touchAimId = id; }
          }
        }
      }, { passive: true });

      target.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          const id = t.identifier;
          if (this.stick.active && id === this.stick.id) { moveStick(t.clientX, t.clientY); continue; }
          const L = this.lookIds.get(id);
          if (L) {
            const dx = t.clientX - L.x, dy = t.clientY - L.y;
            L.moved += Math.abs(dx) + Math.abs(dy);
            this.lookBy(dx * this.touchLookScale, dy * this.touchLookScale);
            L.x = t.clientX; L.y = t.clientY;
            continue;
          }
          if (!this.fps && id === this.touchAimId) { this.mouse.x = t.clientX; this.mouse.y = t.clientY; }
        }
      }, { passive: true });

      const endTouch = (e) => {
        for (const t of e.changedTouches) {
          const id = t.identifier;
          if (this.stick.active && id === this.stick.id) { resetStick(); continue; }
          const L = this.lookIds.get(id);
          if (L) {
            // نقرة قصيرة على جهة النظر = طلقة سريعة (اختياري عبر الإعدادات)
            if (this.tapToFire && L.moved < 14 && Date.now() - L.t < 260) {
              this.touchBtns.fire = true;
              setTimeout(() => { this.touchBtns.fire = false; }, 110);
            }
            this.lookIds.delete(id);
            continue;
          }
          if (id === this.touchAimId) { this.mouse.down = false; this.touchAimId = null; }
        }
      };
      target.addEventListener('touchend', endTouch);
      target.addEventListener('touchcancel', endTouch);
    }

    // أزرار اللمس: ضغط/إفلات + إمكانية «السحب من زر الرمي للنظر» (رمي وتصويب بإصبع واحد)
    for (const b of document.querySelectorAll('.tbtn')) {
      const name = b.dataset.tbtn;
      const press = (e) => {
        if (e.cancelable) e.preventDefault();
        this.touchMode = true;
        this.touchBtns[name] = true;
        b.classList.add('on');
        this.haptic(name === 'fire' ? 8 : 12);
        this.onTouchBtn(name, true);
        if (e.changedTouches && (name === 'fire' || name === 'aim')) {
          const t = e.changedTouches[0];
          this.fireDrag = { id: t.identifier, x: t.clientX, y: t.clientY, btn: name };
        }
      };
      const release = (e) => {
        if (e.cancelable) e.preventDefault();
        this.touchBtns[name] = false;
        b.classList.remove('on');
        if (this.fireDrag && (name === 'fire' || name === 'aim')) this.fireDrag = null;
        this.onTouchBtn(name, false);
      };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', release);
      b.addEventListener('touchcancel', release);
      b.addEventListener('mousedown', press);
      b.addEventListener('mouseup', release);
      b.addEventListener('mouseleave', (e) => { if (this.touchBtns[name]) release(e); });
      // سحب من الزر = تحريك النظر بنفس الإصبع مع استمرار الرمي
      b.addEventListener('touchmove', (e) => {
        const d = this.fireDrag;
        if (!d) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== d.id) continue;
          this.lookBy((t.clientX - d.x) * this.touchLookScale, (t.clientY - d.y) * this.touchLookScale);
          d.x = t.clientX; d.y = t.clientY;
        }
      }, { passive: true });
    }

    const firstTouch = () => { this.touchMode = true; window.removeEventListener('touchstart', firstTouch); };
    addEventListener('touchstart', firstTouch, { passive: true });
  }

  /** اهتزاز خفيف عند الضغط (إن دعمه الجهاز) */
  haptic(ms) {
    if (!this.vibrate) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch { }
  }

  /** تحريك النظر (ماوس/لمس) */
  lookBy(dx, dy) {
    const s = 0.0022 * (this.sens || 1);
    this.look.yaw += dx * s;
    this.look.pitch = Math.max(-this.pitchLimit, Math.min(this.pitchLimit, this.look.pitch - dy * s));
    if (this.look.yaw > Math.PI) this.look.yaw -= Math.PI * 2;
    else if (this.look.yaw < -Math.PI) this.look.yaw += Math.PI * 2;
  }
  /** طلب قفل المؤشر (يحتاج تفاعل مستخدم) */
  requestLock() {
    try { if (this.cv.requestPointerLock) this.cv.requestPointerLock(); } catch { }
  }
  releaseLock() {
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch { }
  }
  onTouchBtn(name, down) {
    if (!down) return;
    switch (name) {
      case 'reload': this.actions.push({ a: 'reload' }); break;
      case 'heal': this.actions.push({ a: 'healCycle' }); break;
      case 'skill': this.actions.push({ a: 'skill' }); break;
      case 'pickup': this.actions.push({ a: 'pickupNear' }); break;
      case 'swap': this.actions.push({ a: 'swapToggle' }); break;
      case 'car': this.actions.push({ a: 'vehicleToggle' }); break;
      case 'jump': this.actions.push({ a: 'jumpHurdle' }); break;
      case 'crouch': this.crouchToggle = !this.crouchToggle; this.proneToggle = false; break;
      case 'prone': this.proneToggle = !this.proneToggle; this.crouchToggle = false; break;
      case 'grenade': this.actions.push({ a: 'grenadeToggle' }); break;
      case 'score': this.sbOpen = !this.sbOpen; break;
      case 'fs': this.actions.push({ a: 'fullscreen' }); break;
      default: break;
    }
  }
  onKey(code) {
    switch (code) {
      case 'KeyR': this.actions.push({ a: 'reload' }); break;
      case 'KeyF': this.actions.push({ a: 'pickupNear' }); break;
      case 'KeyH': this.actions.push({ a: 'healCycle' }); break;
      case 'KeyG': this.actions.push({ a: 'grenadeToggle' }); break;
      case 'KeyQ': this.actions.push({ a: 'skill' }); break;
      case 'KeyE': this.actions.push({ a: 'vehicleToggle' }); break;
      case 'Digit1': this.swapQueued = 0; break;
      case 'Digit2': this.swapQueued = 1; break;
      case 'Digit3': this.actions.push({ a: 'melee' }); break;
      case 'Space': this.actions.push({ a: 'jumpHurdle' }); break;
      case 'KeyC': this.crouchToggle = !this.crouchToggle; break;
      case 'KeyZ': this.proneToggle = !this.proneToggle; this.crouchToggle = false; break;
      case 'KeyM': this.actions.push({ a: 'emoteMenu' }); break;
      case 'Escape': this.actions.push({ a: 'pause' }); break;
      case 'Tab': this.actions.push({ a: 'scoreboard', v: true }); break;
      default: break;
    }
  }
  onMouseDown(button) {
    if (button === 2) this.actions.push({ a: 'aimToggleFree' });
  }
  /** استهلاك الأحداث اللحظية */
  drainActions() { const a = this.actions; this.actions = []; if (this.swapQueued !== null) { a.push({ a: 'swap', i: this.swapQueued }); this.swapQueued = null; } return a; }
  /** حالة الإدخال المستمرة */
  read(camera, myPlayer, view) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (this.stick.active) { mx += this.stick.dx; my += this.stick.dy; }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    let aim = this.aimAngle(camera, myPlayer);
    if (this.fps) {
      // تحويل الحركة المحلية (أمام/يمين) إلى اتجاهات العالم حسب اتجاه النظر
      const f = -my, r = mx;
      const cy = Math.cos(this.look.yaw), sy = Math.sin(this.look.yaw);
      mx = f * cy - r * sy;
      my = f * sy + r * cy;
      aim = this.look.yaw;
    }
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || (this.touchMode && ml > 0.85 && !this.mouse.down);
    const aiming = this.mouse.right || !!this.touchBtns.aim;
    const shoot = this.mouse.down || this.touchBtns.fire || (this.autoFire && aiming);
    return {
      mx, my, aim, shoot, aiming,
      sprint, crouch: !!this.crouchToggle, prone: !!this.proneToggle,
      reload: false, heal: null, skill: false, swap: null,
      reviving: !!k.has('KeyX') || !!this.touchBtns.revive,
    };
  }
  aimAngle(camera, me) {
    if (this.fps) return this.look.yaw;
    if (!me) return 0;
    const sx = this.mouse.x, sy = this.mouse.y;
    const k = (this.sens || 1) / camera.z;   // الحساسية تكبّر/تصغّر مسافة التصويب
    const wx = camera.x + (sx - innerWidth / 2) * k;
    const wy = camera.y + (sy - innerHeight / 2) * k;
    return Math.atan2(wy - me.y, wx - me.x);
  }
  /* كمبيوتر: نقطة الهبوط */
  screenToWorld(camera, sx, sy) {
    return { x: camera.x + (sx - innerWidth / 2) / camera.z, y: camera.y + (sy - innerHeight / 2) / camera.z };
  }
}
export default Input2;
