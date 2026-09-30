/**
 * ORK ZONE — client/net.js
 * الاتصال بالسيرفر: REST للحسابات/المتجر + WebSocket للمباريات الأونلاين.
 * إذا لم يوجد سيرفر (استضافة ثابتة مثل Vercel) يتحول تلقائياً للوضع المحلي:
 * كل طلبات API تُخدم من localstore.js على جهاز اللاعب — فتبدأ اللعبة دائماً.
 */
import { LocalStore } from './localstore.js';

export const API = {
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
      const res = await fetch(path, {
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
      const res = await fetch(path, { signal: ctrl?.signal });
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
  connect(token) {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      if (token) this.send({ t: 'auth', token });
      return;
    }
    try {
      const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss' : 'ws';
      const host = (typeof location !== 'undefined' && location.host) || 'localhost:3000';
      this.ws = new WebSocket(`${proto}://${host}/ws`);
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
        this.connected = false; this.emit('close', { code: e && e.code });
        // نبّئ مرة أو مرتين فقط ثم اصمت — لا سبام للتنبيهات كل ٣ ثوانٍ
        if (e && e.code !== 1000 && this._fails < 2 && !API.offline) {
          this.emit('error', { error: '🔌 انقطع الاتصال بالسيرفر — سنعيد المحاولة تلقائياً' });
        }
        this._scheduleReconnect(token);
      };
      this.ws.onerror = () => {
        if (this._fails < 2 && !API.offline) {
          this.emit('error', { error: '⚠️ تعذر الاتصال بالسيرفر الأونلاين (الأوفلاين يعمل دائماً)' });
        }
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
    const delay = Math.min(30000, Math.round(3000 * Math.pow(1.7, Math.max(0, this._fails - 1))));
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
export default { API, Net };
