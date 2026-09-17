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
    this.pitchLimit = 0.42;       // ±٢٤° تقريباً (المحاكاة ثنائية الأبعاد في الأساس)
    this._touchLook = null;
    this._bind();
  }
  get isTouch() { return this.touchMode; }

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

    // لمس
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (stick) {
      const onStart = (e) => {
        const t = e.changedTouches ? e.changedTouches[0] : e;
        const r = stick.getBoundingClientRect();
        this.stick.active = true; this.stick.id = t.identifier ?? 'mouse';
        this.stick.cx = r.left + r.width / 2; this.stick.cy = r.top + r.height / 2;
        this.stick.dx = 0; this.stick.dy = 0;
        knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('touchstart', onStart, { passive: true });
      stick.addEventListener('mousedown', onStart);
      const onMove = (e) => {
        if (!this.stick.active) return;
        const list = e.changedTouches || [e];
        for (const t of list) {
          if ((t.identifier ?? 'mouse') !== this.stick.id) continue;
          const dx = t.clientX - this.stick.cx, dy = t.clientY - this.stick.cy;
          const m = Math.min(1, Math.hypot(dx, dy) / 60);
          const a = Math.atan2(dy, dx);
          this.stick.dx = Math.cos(a) * m; this.stick.dy = Math.sin(a) * m;
          knob.style.transform = `translate(${this.stick.dx * 44}px, ${this.stick.dy * 44}px)`;
        }
      };
      addEventListener('touchmove', onMove, { passive: true });
      addEventListener('mousemove', onMove);
      const onEnd = () => { this.stick.active = false; this.stick.dx = 0; this.stick.dy = 0; knob.style.transform = 'translate(0,0)'; };
      addEventListener('touchend', onEnd); addEventListener('mouseup', onEnd);
    }
    for (const b of document.querySelectorAll('.tbtn')) {
      const name = b.dataset.tbtn;
      const press = (e) => { e.preventDefault(); this.touchBtns[name] = true; this.touchMode = true; this.onTouchBtn(name, true); };
      const release = (e) => { e.preventDefault(); this.touchBtns[name] = false; this.onTouchBtn(name, false); };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('touchend', release);
      b.addEventListener('mousedown', press);
      b.addEventListener('mouseup', release);
    }
    const firstTouch = () => { this.touchMode = true; window.removeEventListener('touchstart', firstTouch); };
    addEventListener('touchstart', firstTouch, { passive: true });
    // لمس الشاشة: سحب = النظر حولك (ثلاثي الأبعاد)، وفي الوضع القديم = تصويب/رمي
    this.cv.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > innerWidth * 0.35) {
          this.mouse.x = t.clientX; this.mouse.y = t.clientY;
          if (this.fps) { this.touchAimId = t.identifier; this._touchLook = { x: t.clientX, y: t.clientY }; }
          else { this.mouse.down = true; this.touchAimId = t.identifier; }
        }
      }
    }, { passive: true });
    this.cv.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touchAimId) continue;
        if (this.fps) {
          if (this._touchLook) this.lookBy((t.clientX - this._touchLook.x) * 2.2, (t.clientY - this._touchLook.y) * 2.2);
          this._touchLook = { x: t.clientX, y: t.clientY };
        } else { this.mouse.x = t.clientX; this.mouse.y = t.clientY; }
      }
    }, { passive: true });
    const up = (e) => { for (const t of e.changedTouches) if (t.identifier === this.touchAimId) { this.mouse.down = false; this.touchAimId = null; this._touchLook = null; } };
    this.cv.addEventListener('touchend', up);
    this.cv.addEventListener('touchcancel', up);
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
      case 'crouch': this.actions.push({ a: 'crouchToggle' }); break;
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
