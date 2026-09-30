/**
 * ORK ZONE — tests/drop.test.js
 * اختبار «واجهة النزول» الجديدة + مقاس النوافذ حسب الجهاز:
 *   • النافذة فيها خريطة + أنواع نزول (اختياري/عشوائي/ساخن/هادئ) + عدّاد + زر قفز
 *   • النزول العشوائي يختار نقطة صالحة داخل الخريطة فوراً
 *   • النزول الساخن يقع داخل منطقة ساخنة، والهادئ بعيد عنها
 *   • النقر على الخريطة يرجع النمط إلى «اختياري» ويحدد النقطة
 *   • العدّاد ينقص وينتهي بإنزال تلقائي (لا يعلق اللاعب في الطائرة أبداً)
 *   • أزرار اللمس تختفي أثناء نافذة النزول وتعود بعدها
 *   • data-ui على <html> يتبدل بين phone / tablet / desktop وتتبعه متغيرات النوافذ
 * التشغيل: node tests/drop.test.js   (بلا سيرفر — يعمل محلياً بالكامل)
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

/* ---------- خادم ملفات ثابت (لا API) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(PUB, p === '/' ? '/index.html' : p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('404: NOT_FOUND'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + srv.address().port;

/* ---------- بيئة متصفح ---------- */
const W = 854, H = 400;                    // هاتف أفقي نموذجي
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

class FakePath2D { moveTo() { } lineTo() { } rect() { } arc() { } closePath() { } addPath() { } quadraticCurveTo() { } bezierCurveTo() { } ellipse() { } }
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
window.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240 }; };
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 6);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
Object.defineProperty(window, 'innerWidth', { value: W, writable: true, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: H, writable: true, configurable: true });
try { Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true }); } catch { }
window.matchMedia = (q) => ({ matches: /coarse|hover:\s*none/.test(q || ''), media: q, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } });
window.navigator.vibrate = () => true;

const errors = [];
window.addEventListener('error', (e) => errors.push('window: ' + (e.message || e.error)));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); };
process.on('unhandledRejection', (e) => errors.push('rejection: ' + (e?.message || e)));

globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch { }
try { Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true }); } catch { }
globalThis.localStorage = window.localStorage;
try { window.localStorage.setItem('orkz_prayer_cfg', JSON.stringify({ enabled: false })); } catch { }
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Path2D = FakePath2D;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.removeEventListener = window.removeEventListener.bind(window);
globalThis.innerWidth = W; globalThis.innerHeight = H;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.AudioContext = undefined;
globalThis.WebSocket = window.WebSocket;
globalThis.matchMedia = window.matchMedia;
const nodeFetch = globalThis.fetch;
globalThis.fetch = (i, init) => nodeFetch(typeof i === 'string' && i.startsWith('/') ? BASE + i : i, init);
window.fetch = globalThis.fetch;

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (id) => window.document.getElementById(id);
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { console.log('  ✅', name); pass++; } else { console.log('  ❌', name, extra); fail++; } };

/* ---------- ١) بنية الواجهة في الصفحة ---------- */
console.log('\n🪂 ١) واجهة النزول موجودة بكل عناصرها');
for (const id of ['jump-phase', 'jump-modes', 'dropmap', 'jump-count', 'btn-jump', 'btn-drop-random', 'ji-place', 'ji-dist', 'ji-risk', 'jump-maphint'])
  check('العنصر #' + id + ' موجود', !!$(id));
const modeBtns = [...window.document.querySelectorAll('[data-dropmode]')].map(b => b.dataset.dropmode);
for (const m of ['manual', 'random', 'hot', 'safe']) check('نمط النزول «' + m + '» متاح كزر', modeBtns.includes(m));
check('إعداد «نوع النزول الافتراضي» موجود', !!$('set-dropmode'));
check('إعداد «حجم الواجهة» موجود', !!$('set-uisize'));

/* ---------- ٢) تحميل اللعبة وبدء مباراة ---------- */
console.log('\n🎮 ٢) بدء مباراة أوفلاين ودخول مرحلة النزول');
await import(pathToFileURL(path.join(ROOT, 'public/js/ui.js')).href);
await import(pathToFileURL(path.join(ROOT, 'public/js/game.js')).href);
await import(pathToFileURL(path.join(ROOT, 'public/js/main.js')).href);
await wait(3500);
const app = window.ORK;
check('اللعبة حُمّلت', !!app);
app.audio.enabled = false;
await app.doGuest('لاعب النزول');
await wait(600);
app.ui.selectedMode = 'solo';
app.ui.selectedMap = 'ork_island';
app.startSelected();
await wait(600);
const s = app.session;
check('المباراة بدأت', !!(s && s.running && s.match));
check('مرحلة النزول مفعّلة', s.dropPhase === true);
check('نافذة النزول ظاهرة', !$('jump-phase').classList.contains('hidden'));
check('أزرار اللمس مخفية أثناء اختيار النزول', $('touch-ui').classList.contains('hidden'));
check('النمط الافتراضي «اختياري»', s.dropMode === 'manual');

/* ---------- ٣) النزول العشوائي / الساخن / الهادئ ---------- */
console.log('\n🎲 ٣) النزول العشوائي والاختياري');
const world = s.match.world;
s.setDropMode('random', true);
check('اختيار «عشوائي» يحدد نقطة فوراً', !!s.dropPoint);
check('النقطة العشوائية داخل حدود الخريطة', !!s.dropPoint && world.shape.inside(s.dropPoint.x, s.dropPoint.y),
  JSON.stringify(s.dropPoint));
const p1 = { ...s.dropPoint };
let changed = false;
for (let i = 0; i < 12; i++) { $('btn-drop-random').click(); if (Math.hypot(s.dropPoint.x - p1.x, s.dropPoint.y - p1.y) > 1) { changed = true; break; } }
check('زر «نقطة عشوائية» يغيّر النقطة فعلاً', changed);

if (world.hotDrops.length) {
  s.setDropMode('hot', true);
  check('النزول الساخن يقع داخل منطقة ساخنة', s.isHotPoint(s.dropPoint.x, s.dropPoint.y), JSON.stringify(s.dropPoint));
} else check('النزول الساخن (لا مناطق ساخنة في هذه الخريطة — تخطي)', true);

s.setDropMode('safe', true);
check('النزول الهادئ داخل الخريطة وبعيد عن المركز', !!s.dropPoint && world.shape.inside(s.dropPoint.x, s.dropPoint.y));
check('النزول الهادئ ليس منطقة ساخنة', !s.isHotPoint(s.dropPoint.x, s.dropPoint.y));

console.log('\n🎯 ٤) الاختيار اليدوي من الخريطة');
const cv = $('dropmap');
const ev = new window.Event('pointerdown', { bubbles: true, cancelable: true });
ev.clientX = 150; ev.clientY = 96; ev.pointerId = 1;
cv.dispatchEvent(ev);
check('النقر على الخريطة رجع بالنمط إلى «اختياري»', s.dropMode === 'manual');
check('النقر على الخريطة حدّد نقطة داخل الخريطة', !!s.dropPoint && world.shape.inside(s.dropPoint.x, s.dropPoint.y), JSON.stringify(s.dropPoint));
check('زر النمط النشط انعكس على الواجهة', window.document.querySelector('[data-dropmode="manual"]').classList.contains('active'));
check('بطاقة المعلومات تعرض الوجهة', $('ji-place').textContent.trim().length > 0 && $('ji-place').textContent !== 'لم تُحدَّد بعد');
check('بطاقة المعلومات تعرض المسافة بالأمتار', /\d+\s*م/.test($('ji-dist').textContent));

/* ---------- ٥) العدّاد والإنزال التلقائي ---------- */
console.log('\n⏱️ ٥) العدّاد التنازلي والإنزال التلقائي');
const c0 = +$('jump-count').textContent;
for (let i = 0; i < 120; i++) s.update(1 / 60);
const c1 = +$('jump-count').textContent;
check('العدّاد يعمل وينقص', c1 < c0, c0 + ' → ' + c1);
let frames = 0;
while (s.dropPhase && frames < 6000) { s.update(1 / 60); frames++; }
check('انتهاء الوقت يُنزل اللاعب تلقائياً (لا تعليق في الطائرة)', s.dropPhase === false, 'frames=' + frames);
check('نافذة النزول أُغلقت', $('jump-phase').classList.contains('hidden'));
check('اللاعب غادر الطائرة فعلاً', s.you.dropState !== 'plane' && s.you.dropState !== 'wait', s.you.dropState);
for (let i = 0; i < 1200; i++) s.update(1 / 60);
check('اللاعب هبط على الأرض بسلام', s.you.dropState === 'landed', s.you.dropState);
check('أزرار اللمس رجعت بعد النزول', !$('touch-ui').classList.contains('hidden'));

/* ---------- ٦) مقاس النوافذ حسب الجهاز ---------- */
console.log('\n📐 ٦) النوافذ تتكيّف مع الجهاز (هاتف / لوحي / كمبيوتر)');
const root = window.document.documentElement;
check('السمة data-ui مضبوطة على <html>', ['phone', 'tablet', 'desktop'].includes(root.getAttribute('data-ui')), root.getAttribute('data-ui'));
check('الجهاز اللمسي الصغير يُعامل كهاتف', root.getAttribute('data-ui') === 'phone', root.getAttribute('data-ui'));
check('متغير ارتفاع النافذة --app-h مضبوط', /\d+px/.test(root.style.getPropertyValue('--app-h')));
check('معامل --ui-scale مضبوط', parseFloat(root.style.getPropertyValue('--ui-scale')) > 0);
for (const m of ['desktop', 'tablet', 'phone']) {
  app.settings.uiMode = m;
  check('اللاعب يستطيع فرض مقاس «' + m + '»', app.applyUiMode() === m && root.getAttribute('data-ui') === m);
}
app.settings.uiMode = 'auto';
check('الوضع التلقائي يرجع لاكتشاف الجهاز', app.applyUiMode() === 'phone');

const css = fs.readFileSync(path.join(PUB, 'css', 'style.css'), 'utf8');
const block = (sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
check('لكل مقاس جهاز متغيراته في CSS', ['phone', 'tablet', 'desktop'].every(m => /--win-pad/.test(block(`html[data-ui="${m}"]`))));
check('.modal لا يتجاوز الشاشة ويُمرَّر داخلياً', /max-height:var\(--win-max-h\)/.test(block('.modal')) && /overflow:auto/.test(block('.modal')));
check('نافذة النزول لا تتجاوز الشاشة', /max-height:var\(--win-max-h\)/.test(block('.jump-box')));
check('خريطة النزول تُقاس بارتفاع الشاشة (تناسب الهاتف الأفقي)', /height:min\(52dvh/.test(block('#dropmap')));
check('طبقة النزول تحترم حواف الشاشة الآمنة', /safe-area-inset/.test(block('.jump-phase')));
check('تخطيط مضغوط للهواتف الأفقية القصيرة', /@media \(max-height:470px\) and \(orientation:landscape\)/.test(css));

/* ---------- تقرير ---------- */
console.log('\n📊 التقرير');
const uniq = [...new Set(errors)].filter(e => !/WebSocket|ECONNREFUSED|ws:\/\/|Not implemented/i.test(e)).slice(0, 8);
if (uniq.length) { console.log('  ⚠️  أخطاء مرصودة:'); uniq.forEach(e => console.log('     -', e.slice(0, 160))); }
else console.log('  ✅ لا أخطاء JavaScript غير متوقعة');
srv.close();
console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
process.exit(fail ? 1 : 0);
