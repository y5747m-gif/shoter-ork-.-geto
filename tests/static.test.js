/**
 * ORK ZONE — tests/static.test.js
 * اختبار «الاستضافة الثابتة»: يشغّل خادم ملفات عادي لمجلد public/ فقط (بدون API وبدون
 * WebSocket — تماماً مثل Vercel/GitHub Pages) ثم يفتح اللعبة في DOM حقيقي ويتأكد أن:
 *   • ملفات اللعبة تُحمَّل كلها (بما فيها /shared/*.js) — سبب تعطل الموقع سابقاً
 *   • الدخول السريع يعمل محلياً (حساب محلي على الجهاز) فتظهر القائمة
 *   • المتجر والخزنة والمهام تعمل بلا سيرفر
 *   • مباراة أوفلاين كاملة تبدأ وتُحسب جوائزها على الحساب المحلي
 *   • الضغط «أونلاين» بلا سيرفر يبدأ مباراة أوفلاين بدلاً من التعليق
 * التشغيل: node tests/static.test.js   (لا يحتاج أي سيرفر — العكس تماماً)
 */
import { register } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader-hook.mjs', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('⚠️  jsdom غير مثبت — npm i jsdom --no-save'); process.exit(0); }

/* ---------- خادم ملفات ثابت فقط (محاكاة Vercel) ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const staticServer = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('403'); }
  if (p === '/' || p === '') file = path.join(PUB, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('404: NOT_FOUND'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => staticServer.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + staticServer.address().port;
console.log('🌐 محاكاة استضافة ثابتة (ملفات فقط — لا API ولا WebSocket): ' + BASE);

/* ---------- ملفات اللعبة كلها تُخدَم ---------- */
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { console.log('  ✅', name); pass++; } else { console.log('  ❌', name, extra); fail++; } };
console.log('\n📦 ١) كل ملفات اللعبة تُخدَم من الاستضافة الثابتة');
for (const ref of ['/', '/js/main.js', '/js/game.js', '/js/ui.js', '/js/net.js', '/js/localstore.js',
  '/shared/gamedata.js', '/shared/sim.js', '/shared/ai.js', '/css/style.css']) {
  let st = 'ERR';
  try { st = (await fetch(BASE + ref)).status; } catch { }
  check('GET ' + ref + ' ← 200', st === 200, 'http=' + st);
}
let apiSt = 'ERR';
try { apiSt = (await fetch(BASE + '/api/auth/guest', { method: 'POST' })).status; } catch { }
check('POST /api/auth/guest ← 404 (لا سيرفر — كما على Vercel)', apiSt === 404, 'http=' + apiSt);

/* ---------- بيئة DOM ---------- */
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

class FakePath2D {
  constructor() { this.ops = []; }
  moveTo() { } lineTo() { } rect() { } arc() { } closePath() { } addPath() { } quadraticCurveTo() { } bezierCurveTo() { } ellipse() { }
}
const gradient = { addColorStop() { } };
function fakeCtx(canvas) {
  const store = { canvas, globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', shadowBlur: 0, shadowColor: '#000' };
  return new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'measureText') return () => ({ width: 24 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => gradient;
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      return () => { };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}
window.Path2D = FakePath2D;
window.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx(this); };
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.HTMLMediaElement.prototype.play = () => Promise.resolve();

const errors = [];
window.addEventListener('error', (e) => errors.push('window error: ' + (e.message || e.error)));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); origError(...a); };
window.onunhandledrejection = (e) => errors.push('unhandled: ' + e.reason);
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.message || e)));

globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch { }
try { Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true }); } catch { }
globalThis.localStorage = window.localStorage;
// 🕌 حارس الصلاة يعطّل اللعب عمداً عند دخول الوقت — نُعطّله هنا حتى تبقى اختبارات
// اللعب مستقرة في أي ساعة من اليوم (له اختباره الخاص: tests/prayer.test.js)
try { window.localStorage.setItem('orkz_prayer_cfg', JSON.stringify({ enabled: false })); } catch { }
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Path2D = FakePath2D;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.removeEventListener = window.removeEventListener.bind(window);
globalThis.innerWidth = 1440; globalThis.innerHeight = 860;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.AudioContext = undefined;
globalThis.WebSocket = window.WebSocket;
globalThis.performance = globalThis.performance || window.performance;
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
  return nodeFetch(url, init);
};
window.fetch = globalThis.fetch;

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (id) => window.document.getElementById(id);

/* ---------- التمهيد ---------- */
console.log('\n🧩 ٢) تمهيد اللعبة على الاستضافة الثابتة');
const netMod = await import(pathToFileURL(path.join(PUB, 'js/net.js')).href);
await import(pathToFileURL(path.join(PUB, 'js/ui.js')).href);
await import(pathToFileURL(path.join(PUB, 'js/game.js')).href);
await import(pathToFileURL(path.join(PUB, 'js/main.js')).href);
await wait(4200);
const app = window.ORK;
check('الوحدات تُحمّل (main/ui/game/net/localstore)', !!app && !!app.ui && !!app.session);
check('شاشة التحميل انتهت', !$('scr-loading').classList.contains('active'));
check('شاشة الدخول ظهرت', $('scr-auth').classList.contains('active'));

/* ---------- الدخول السريع محلياً ---------- */
console.log('\n🔑 ٣) الدخول السريع يعمل بلا سيرفر (حساب محلي)');
app.audio.enabled = false;
await app.doGuest('لاعب الموقع');
await wait(900);
check('حساب محلي أُنشئ وتقدّمه محفوظ', !!(app.profile && app.profile.name === 'لاعب الموقع'));
check('الوضع المحلي مفعّل تلقائياً', netMod.API.offline === true);
check('القائمة الرئيسية ظاهرة', $('scr-menu').classList.contains('active'));
check('الذهب الابتدائي يظهر', $('cur-gold').textContent !== '0');
check('الحساب موسوم «محلي»', app.profile.local === true);

/* ---------- المتجر والخزنة بلا سيرفر ---------- */
console.log('\n🛒 ٤) المتجر والخزنة والمهام تعمل محلياً');
app.ui.openPane('store');
app.ui.storeTab = 'skins'; app.ui.renderStore(); await wait(80);
check('قسم المتجر «skins» فيه عناصر', $('store-grid').children.length > 0);
app.ui.lockerTab = 'chars'; app.ui.renderLocker(); await wait(80);
check('خزنة الشخصيات فيها عناصر', $('locker-grid').children.length > 0);
const goldBefore = app.profile.gold;
await app.ui.equip('char', 'amer');
await wait(150);
check('التجهيز يعمل محلياً', app.profile.equipped.char === 'amer', JSON.stringify(app.profile.equipped));
const daily = await netMod.API.post('/api/daily/claim', { token: app.token });
check('المكافأة اليومية تُستلم محلياً', !!(daily.ok && daily.gold > 0), JSON.stringify(daily).slice(0, 80));
const wheel = await netMod.API.post('/api/shop/wheel', { token: app.token });
check('عجلة الحظ تدور محلياً (أول دورة مجانية الوضع التجريبي؟ لا — ٦٠ جوهرة)', !wheel.error || /جوهرة/.test(wheel.error), JSON.stringify(wheel).slice(0, 80));
const persist = JSON.parse(window.localStorage.getItem('orkz_local_db') || '{}');
check('الحساب محفوظ فعلاً في localStorage', Object.keys(persist.accounts || {}).length >= 1);

/* ---------- مباراة أوفلاين كاملة ---------- */
console.log('\n🎮 ٥) مباراة أوفلاين كاملة (كما على الموقع)');
app.ui.selectedMode = 'solo';
app.ui.selectedMap = 'ork_island';
app.startSelected();
await wait(600);
const s = app.session;
check('المباراة بدأت (HUD ظاهر)', $('hud').classList.contains('hidden') === false);
check('عالم اللعبة مولّد', !!(s.match && s.match.world && s.match.world.obstacles.length > 100));
check('اللاعب موجود', !!(s.you && s.you.id === 'you'));
check('عدد اللاعبين = البوتات + أنا', !!(s.match && s.match.players.length > 20));
s.dropPoint = { x: 200, y: 150 };
s.doJump(200, 150);
let crashed = null;
try {
  for (let i = 0; i < 1400; i++) {
    s.update(1 / 60);
    if (i % 240 === 0) await wait(0);
  }
} catch (e) { crashed = e; }
check('١٤٠٠ إطار بلا انهيار + هبوط على الأرض', !crashed && s.you.dropState === 'landed', crashed ? crashed.message : s.you.dropState);
const gold0 = app.profile.gold, games0 = app.profile.stats.games;
s.match.state = 'over';
s.match.events.push({ t: s.match.time, type: 'gameover', winner: 'x' });
s.update(1 / 60);
await wait(700);
check('شاشة النتائج تظهر', $('scr-results').classList.contains('active'));
check('الجوائز حُسبت على الحساب المحلي (ذهب + مباراة)', app.profile.gold > gold0 && app.profile.stats.games === games0 + 1,
  `gold ${gold0}→${app.profile.gold}, games ${games0}→${app.profile.stats.games}`);
const ranks = await netMod.API.get('/api/rankings');
check('لوحة الأبطال تعمل محلياً', Array.isArray(ranks.kills) && ranks.kills.some(e => e.name === 'لاعب الموقع'));

/* ---------- زر الأونلاين بلا سيرفر: بداية أوفلاين بدل التعليق ---------- */
console.log('\n🌐 ٦) «أونلاين» بلا سيرفر ← مباراة أوفلاين فوراً (لا تعليق أبداً)');
s.quit(); await wait(250);
app.ui.onlineSelect = true;
app.ui.selectedMode = 'solo';
app.ui.selectedMap = 'neo_city';
app.startSelected();
await wait(700);
check('بدأت مباراة أوفلاين بدل الانتظار', !!(app.session.running && app.session.match && app.session.match.mapId === 'neo_city'));
app.session.quit(); await wait(200);

/* ---------- تقرير ---------- */
console.log('\n📊 التقرير');
const uniq = [...new Set(errors)].filter(e => !/WebSocket|network|ECONNREFUSED|ws:\/\//i.test(e)).slice(0, 10);
if (uniq.length) { console.log('  ⚠️  أخطاء مرصودة:'); uniq.forEach(e => console.log('     -', e.slice(0, 160))); }
else console.log('  ✅ لا أخطاء JavaScript غير متوقعة');
staticServer.close();
console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
process.exit(fail ? 1 : 0);
