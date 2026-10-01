/**
 * ORK ZONE — client/net.js
 * الاتصال بالسيرفر: REST للحسابات/المتجر + WebSocket للمباريات الأونلاين.
 * إذا لم يوجد سيرفر (استضافة ثابتة مثل Vercel) يتحول تلقائياً للوضع المحلي:
 * كل طلبات API تُخدم من localstore.js على جهاز اللاعب — فتبدأ اللعبة دائماً.
 */
import { LocalStore } from './localstore.js';

/* ============================================================================
 * 🌐 عنوان سيرفر الأونلاين
 * ----------------------------------------------------------------------------
 * المشكلة التي يحلّها هذا الجزء: عندما تُفتح اللعبة من استضافة ثابتة (Vercel مثلاً)
 * على هاتف حقيقي لا يوجد خلف نفس الرابط أي سيرفر Node — فلا أونلاين إطلاقاً.
 * الحل: السماح بتحديد عنوان سيرفر اللعبة يدوياً أو مسبقاً، فيتصل الهاتف بالسيرفر
 * مباشرة (REST + WebSocket) من أي مكان في العالم:
 *   ١) ?server=https://my-server.com  (رابط مشاركة — يُحفظ تلقائياً)
 *   ٢) ما حفظه اللاعب في الإعدادات (localStorage: orkz_server)
 *   ٣) window.ORK_SERVER من /config.js (يضبطه صاحب النشر مرة واحدة للجميع)
 *   ٤) نفس أصل الصفحة (عند تشغيل `npm start` محلياً أو على سيرفر كامل)
 * ========================================================================== */
const SERVER_KEY = 'orkz_server';

/** تطبيع أي عنوان يكتبه اللاعب: يقبل host فقط، http/https، ws/wss */
export function normalizeServer(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  u = u.replace(/\s+/g, '');
  if (/^wss:\/\//i.test(u)) u = 'https://' + u.slice(6);
  else if (/^ws:\/\//i.test(u)) u = 'http://' + u.slice(5);
  if (!/^https?:\/\//i.test(u)) {
    const secure = (typeof location !== 'undefined' && location.protocol === 'https:') || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u);
    u = (secure ? 'https://' : 'http://') + u;
  }
  try {
    const url = new URL(u);
    if (!url.hostname) return '';
    const path = url.pathname.replace(/\/+$/, '');
    return url.origin + (path === '/' ? '' : path);
  } catch { return ''; }
}

export const Server = {
  /** '' = نفس أصل الصفحة */
  base: '',
  /** من أين جاء العنوان: 'url' | 'saved' | 'config' | 'origin' */
  source: 'origin',
  /** 'unknown' | 'ok' | 'down' | 'mixed' (محتوى مختلط محظور) */
  status: 'unknown',
  /** آخر رسالة تشخيصية للعرض في الإعدادات */
  message: '',
  version: '',

  init() {
    let base = '', source = 'origin';
    try {
      const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
      const fromUrl = normalizeServer(q.get('server') || q.get('srv') || '');
      if (fromUrl) { base = fromUrl; source = 'url'; try { localStorage.setItem(SERVER_KEY, fromUrl); } catch { } }
    } catch { }
    if (!base) {
      try {
        const saved = normalizeServer(localStorage.getItem(SERVER_KEY) || '');
        if (saved) { base = saved; source = 'saved'; }
      } catch { }
    }
    if (!base) {
      try {
        const cfg = normalizeServer((typeof window !== 'undefined' && window.ORK_SERVER) || '');
        if (cfg) { base = cfg; source = 'config'; }
      } catch { }
    }
    this.base = base;
    this.source = source;
    this.status = 'unknown';
    return this;
  },

  /** هل الصفحة https بينما السيرفر http؟ المتصفح (خاصة على الهاتف) سيحجب الاتصال */
  isMixed() {
    try {
      return typeof location !== 'undefined' && location.protocol === 'https:' && this.base.startsWith('http://');
    } catch { return false; }
  },

  /** عنوان كامل لطلب REST */
  url(path) {
    if (!this.base) return path;
    return this.base + (path.startsWith('/') ? path : '/' + path);
  },

  /** عنوان WebSocket المشتق من عنوان السيرفر */
  wsURL() {
    if (this.base) return this.base.replace(/^http/i, 'ws') + '/ws';
    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss' : 'ws';
    const host = (typeof location !== 'undefined' && location.host) || 'localhost:3000';
    return `${proto}://${host}/ws`;
  },

  /** حفظ عنوان جديد (أو '' للعودة لنفس أصل الصفحة) */
  save(raw) {
    const base = normalizeServer(raw);
    this.base = base;
    this.source = base ? 'saved' : 'origin';
    this.status = 'unknown';
    this.message = '';
    try {
      if (base) localStorage.setItem(SERVER_KEY, base);
      else localStorage.removeItem(SERVER_KEY);
    } catch { }
    return base;
  },

  /** فحص حقيقي للسيرفر عبر /api/health — يحدّد الحالة ويُرجع true/false */
  async probe(timeoutMs = 7000) {
    if (this.isMixed()) {
      this.status = 'mixed';
      this.message = 'الصفحة تعمل عبر HTTPS والسيرفر عبر HTTP — المتصفح يحجب هذا الاتصال. استخدم عنوان https للسيرفر.';
      return false;
    }
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(this.url('/api/health'), { signal: ctrl?.signal, cache: 'no-store' });
      if (t) clearTimeout(t);
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        this.status = 'ok';
        this.version = data.version || '';
        this.message = 'السيرفر يعمل' + (data.version ? ' · إصدار ' + data.version : '');
        return true;
      }
      this.status = 'down';
      this.message = 'لا يوجد سيرفر أونلاين على هذا العنوان';
      return false;
    } catch (e) {
      this.status = 'down';
      this.message = this.base
        ? 'تعذّر الوصول إلى السيرفر — تأكد من العنوان ومن اتصال الإنترنت'
        : 'هذا الرابط استضافة ثابتة بلا سيرفر أونلاين';
      return false;
    }
  },
};
Server.init();

export const API = {
  /** عنوان السيرفر الحالي (للاستخدام الخارجي) */
  server: Server,
  /** true = لا يوجد سيرفر خلف هذا الرابط — نعمل محلياً بالكامل */
  offline: false,
  /** يُستدعى مرة واحدة عند اكتشاف غياب السيرفر (لإظهار تنبيه لطيف) */
  onOffline: null,

  _markOffline() {
    if (this.offline) return;
    this.offline = true;
    try { if (this.onOffline) this.onOffline(); } catch { }
  },

  async post(path, body, timeoutMs = 8000) {
    body = body || {};
    if (this.offline) return LocalStore.handle(path, body);
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(Server.url(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl?.signal,
      });
      if (t) clearTimeout(t);
      // 404 أو استجابة ليست JSON = لا يوجد سيرفر هنا (استضافة ثابتة) → الوضع المحلي
      const ctype = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (res.status === 404 || (res.ok && ctype && !ctype.includes('json'))) {
        this._markOffline();
        return LocalStore.handle(path, body);
      }
      const data = await res.json().catch(() => null);
      if (data === null) { this._markOffline(); return LocalStore.handle(path, body); }
      return data;
    } catch {
      this._markOffline();
      return LocalStore.handle(path, body);
    }
  },

  async get(path, timeoutMs = 8000) {
    if (this.offline) return LocalStore.handleGet(path);
    try {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetch(Server.url(path), { signal: ctrl?.signal });
      if (t) clearTimeout(t);
      const ctype = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (res.status === 404 || (res.ok && ctype && !ctype.includes('json'))) {
        this._markOffline();
        return LocalStore.handleGet(path);
      }
      const data = await res.json().catch(() => null);
      if (data === null) { this._markOffline(); return LocalStore.handleGet(path); }
      return data;
    } catch {
      this._markOffline();
      return LocalStore.handleGet(path);
    }
  },
};

export class Net {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.handlers = {};
    this.queue = [];
    this.ping = 0;
    this._lastPingSent = 0;
    this.reconnectT = null;
    this._fails = 0;        // عدد محاولات الاتصال الفاشلة (لإبطاء إعادة المحاولة ومنع سبام التنبيهات)
    this.stopped = false;   // توقف نهائي: لا سيرفر أونلاين هنا
    this.token = null;      // آخر رمز جلسة (لإعادة الاتصال تلقائياً)
    this.lastURL = '';
    this._wakeBound = false;
  }
  /**
   * على الهواتف الحقيقية: قفل الشاشة أو تبديل التطبيق يقطع WebSocket،
   * وتغيّر الشبكة (واي‑فاي ↔ بيانات) يقطعها أيضاً. نعيد الاتصال فوراً
   * عند عودة الصفحة للمقدمة أو عودة الإنترنت بدل انتظار التدرّج الطويل.
   */
  bindWakeEvents() {
    if (this._wakeBound || typeof window === 'undefined') return;
    this._wakeBound = true;
    const wake = () => {
      if (this.stopped || this.connected) return;
      this._fails = 0;
      clearTimeout(this.reconnectT);
      this.connect(this.token);
    };
    try {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
      window.addEventListener('online', wake);
      window.addEventListener('pageshow', wake);
      window.addEventListener('focus', wake);
    } catch { }
  }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
  emit(type, data) { for (const fn of (this.handlers[type] || [])) { try { fn(data); } catch (e) { console.error('[net]', type, e); } } }
  /** إيقاف محاولات الأونلاين نهائياً (استدعِ عند التأكد من غياب السيرفر) */
  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectT);
    try { if (this.ws) this.ws.onclose = null; } catch { }
    try { if (this.ws && this.ws.readyState === 1) this.ws.close(1000); } catch { }
    this.connected = false;
  }
  /** إعادة تفعيل الأونلاين بعد إيقافه (عند تغيير عنوان السيرفر مثلاً) */
  restart(token) {
    this.stopped = false;
    this._fails = 0;
    clearTimeout(this.reconnectT);
    try { if (this.ws) { this.ws.onclose = null; this.ws.close(1000); } } catch { }
    this.ws = null;
    this.connected = false;
    this.connect(token !== undefined ? token : this.token);
  }
  connect(token) {
    if (token !== undefined && token !== null) this.token = token;
    token = token !== undefined && token !== null ? token : this.token;
    if (this.stopped) return;
    this.bindWakeEvents();
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      if (token) this.send({ t: 'auth', token });
      return;
    }
    try {
      if (Server.isMixed()) { this.stop(); return; }
      this.lastURL = Server.wsURL();
      this.ws = new WebSocket(this.lastURL);
      this.ws.onopen = () => {
        this.connected = true;
        this._fails = 0;
        this.emit('open');
        if (token) this.send({ t: 'auth', token });
        for (const m of this.queue.splice(0)) this.send(m);
      };
      this.ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'pong') { this.ping = Math.round(performance.now() - msg.ts); this.emit('ping', this.ping); return; }
        this.emit(msg.t, msg);
      };
      this.ws.onclose = (e) => {
        // إعادة الاتصال بصمت دون إزعاج اللاعب برسائل علوية — الأوفلاين يعمل دائماً
        this.connected = false; this.emit('close', { code: e && e.code });
        this._scheduleReconnect(token);
      };
      this.ws.onerror = () => {
        // لا نُظهر أي تنبيه اتصال — نُعيد المحاولة تلقائياً في الخلفية
      };
    } catch (e) {
      this.connected = false;
      this._scheduleReconnect(token);
    }
  }
  _scheduleReconnect(token) {
    if (this.stopped) return;
    this._fails++;
    // تدرّج: ٣ث ← ٦ث ← ١٢ث ← ... حتى ٣٠ث كحد أقصى
    const delay = Math.min(30000, Math.round(2000 * Math.pow(1.7, Math.max(0, this._fails - 1))));
    clearTimeout(this.reconnectT);
    this.reconnectT = setTimeout(() => this.connect(token), delay);
  }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; } }
    if (obj.t !== 'input') this.queue.push(obj);
    return false;
  }
  pingLoop() {
    setInterval(() => {
      if (this.connected) this.send({ t: 'ping', ts: performance.now(), id: Math.random() });
    }, 2000);
  }
}
export default { API, Net, Server };
