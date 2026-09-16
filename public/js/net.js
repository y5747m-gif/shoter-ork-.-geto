/**
 * ORK ZONE — client/net.js
 * الاتصال بالسيرفر: REST للحسابات/المتجر + WebSocket للمباريات الأونلاين.
 */
export const API = {
  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json().catch(() => ({ error: 'خطأ في الاستجابة' }));
  },
  async get(path) {
    const r = await fetch(path);
    return r.json().catch(() => ({ error: 'خطأ في الاستجابة' }));
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
  }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
  emit(type, data) { for (const fn of (this.handlers[type] || [])) { try { fn(data); } catch (e) { console.error('[net]', type, e); } } }
  connect(token) {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) { if (token) this.send({ t: 'auth', token }); return; }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.connected = true;
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
      if (e && e.code !== 1000) this.emit('error', { error: '🔌 انقطع الاتصال بالسيرفر — جاري إعادة المحاولة' });
      clearTimeout(this.reconnectT);
      this.reconnectT = setTimeout(() => this.connect(token), 2500);
    };
    this.ws.onerror = () => { this.emit('error', { error: '⚠️ تعذر الاتصال بالسيرفر الأونلاين (الأوفلاين يعمل دائماً)' }); };
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
