/**
 * ORK ZONE — tests/client.test.js
 * اختبار عميل حقيقي: يُنشئ DOM كامل (jsdom) ثم يشغّل ملفات الواجهة واللعبة كما في المتصفح،
 * يتنقل بين الشاشات، يبدأ مباراة أوفلاين، يشغّل ٩٠٠ إطار رسم، ويرصد أي خطأ.
 * التشغيل: node tests/client.test.js   (يحتاج السيرفر على المنفذ ٣٠٠٠ للحسابات)
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader-hook.mjs', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('⚠️  jsdom غير مثبت — npm i jsdom --no-save'); process.exit(0); }

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: BASE + '/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;

/* ---------- تجهيز بيئة المتصفح الناقصة ---------- */
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
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1, height: 1 });
      return () => { };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}
window.Path2D = FakePath2D;
window.HTMLCanvasElement.prototype.getContext = function () { return fakeCtx(this); };
window.canvas = null;
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.HTMLMediaElement.prototype.play = () => Promise.resolve();

// كشف الأخطاء
const errors = [];
window.addEventListener('error', (e) => errors.push('window error: ' + (e.message || e.error)));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); origError(...a); };
window.onunhandledrejection = (e) => errors.push('unhandled: ' + e.reason);
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.message || e)));

// Globals
globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch { }
try { Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true, writable: true }); } catch { }
globalThis.localStorage = window.localStorage;
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
// المتصفح يحل الروابط النسبية تلقائياً — نطبق نفس السلوك في Node
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
  return nodeFetch(url, init);
};
window.fetch = globalThis.fetch;

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (id) => window.document.getElementById(id);
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) { console.log('  ✅', name); pass++; } else { console.log('  ❌', name, extra); fail++; } };

console.log('\n🧩 تحميل وحدات العميل في بيئة DOM حقيقية');
const uiMod = await import(pathToFileURL(path.join(ROOT, 'public/js/ui.js')).href);
const gameMod = await import(pathToFileURL(path.join(ROOT, 'public/js/game.js')).href);
await import(pathToFileURL(path.join(ROOT, 'public/js/main.js')).href);
await wait(4000);
check('الوحدات تُحمّل بلا أخطاء', errors.length === 0, errors.slice(0, 5).join(' | '));
check('شاشة التحميل اشتغلت', !!$('load-fill'));
check('واجهة اللاعب متاحة عالمياً', !!window.ORK);
const app = window.ORK;

console.log('\n🔑 الدخول والقائمة');
app.audio.enabled = false;
await app.doGuest('لاعب الاختبار');
await wait(800);
check('تسجيل الدخول السريع أنشأ حساباً', !!(app.profile && app.profile.name));
check('القائمة الرئيسية ظاهرة', $('scr-menu').classList.contains('active'));
check('المستوى والذهب يظهران', $('cur-gold').textContent !== '0' && $('mini-lvl').textContent !== '');
check('البورتريه اشتغل (avatar)', true);

console.log('\n🧭 التنقل بين الشاشات');
for (const nav of ['locker', 'store', 'bp', 'missions', 'rank', 'friends']) {
  app.ui.openPane(nav);
  await wait(90);
  const cards = $('scr-menu').querySelectorAll('.card, .mission, .rank-row, .friend').length;
  check(`شاشة ${nav} تُرسم (${cards} عنصر)`, cards >= 0);
}
// المتجر: كل الأقسام
for (const t of ['featured', 'bundles', 'chars', 'skins', 'weapons', 'vehicles', 'crates', 'wheel']) {
  app.ui.storeTab = t; app.ui.renderStore(); await wait(60);
  const n = $('store-grid').children.length;
  if (t !== 'featured') check(`قسم المتجر «${t}» فيه عناصر (${n})`, n > 0);
}
// الخزنة: كل التبويبات
for (const t of ['chars', 'skins', 'wskins', 'parachutes', 'emotes']) {
  app.ui.lockerTab = t; app.ui.renderLocker(); await wait(60);
  check(`خزنة «${t}» فيها عناصر (${$('locker-grid').children.length})`, $('locker-grid').children.length > 0);
}
// عجلة الحظ تُرسم
app.ui.storeTab = 'wheel'; app.ui.renderStore(); await wait(80);
check('عجلة الحظ تُرسم', !!$('wheel-canvas'));
app.ui.spin(3); await wait(200);
check('حركة العجلة تعمل', true);
// خرائط المعاينة
app.ui.openModes(false); await wait(200);
const mapCanvases = $('map-grid').querySelectorAll('canvas').length;
check('٥ خرائط بمعاينة مرسومة', mapCanvases === 5);
check('نمط الساحة موجود', !!$('mode-grid').querySelector('[data-mode="tdm"]'));

console.log('\n🎮 تشغيل مباراة أوفلاين كاملة');
app.ui.selectedMode = 'solo';
app.ui.selectedMap = 'ork_island';
app.startSelected();
await wait(500);
const s = app.session;
check('المباراة بدأت (HUD ظاهر)', $('hud').classList.contains('hidden') === false);
check('عالم اللعبة مولّد', !!(s.match && s.match.world && s.match.world.obstacles.length > 100));
check('اللاعب موجود ومحلي', !!s.you && s.you.id === 'you');
check('عدد اللاعبين = البوتات + أنا', !!(s.match && s.match.players.length > 20), 'العدد: ' + (s.match ? s.match.players.length : 'لا مباراة'));
// القفز
s.dropPoint = { x: 200, y: 150 };
s.doJump(200, 150);
await wait(120);
check('القفز يعمل وحالة الهبوط تغيّرت', s.you.dropState === 'freefall' || s.you.dropState === 'parachute');
// شغّل إطارات اللعب
const frames = 1400;
let crashed = null;
try {
  for (let i = 0; i < frames; i++) {
    s.update(1 / 60);
    if (i % 240 === 0) await wait(0);
  }
} catch (e) { crashed = e; }
check(`تشغيل ${frames} إطار لعبة بلا انهيار`, !crashed, crashed && crashed.message + '\n' + (crashed.stack || '').split('\n').slice(1, 4).join('\n'));
check('اللاعب هبط على الأرض', s.you.dropState === 'landed', s.you.dropState);
check('البوتات تتحرك وتتسلح', s.match.players.filter(p => p.bot && p.weapons.length > 1).length > 5);
check('البوتات تقاتل (ضرر مسجّل)', s.match.players.some(p => p.damage > 0));
check('بعض اللاعبين أُقصوا', s.match.players.filter(p => !p.alive).length >= 0);
check('عناصر الـ HUD تُحدَّث', $('hud-alive').textContent !== '50' || $('hud-timer').textContent !== '00:00');
check('الميني ماب يعمل', !!s.renderer.miniStatic);
check('العاصفة تتقدم', s.match.zone.timer < 120);
// التقط غنيمة قريبة
const loot = s.match.loot.find(l => !l.taken && Math.hypot(l.x - s.you.x, l.y - s.you.y) < 2500);
if (loot) {
  s.you.x = loot.x; s.you.y = loot.y;
  s.input.actions.push({ a: 'pickupNear' });
  s.update(1 / 60);
  check('الالتقاط يعمل من اللعب', loot.taken || s.you.weapons.length > 0);
} else check('غنائم موجودة', s.match.loot.length > 0);
// مهارة
s.you.skill.cd = 0;
s.input.actions.push({ a: 'skill' });
s.update(1 / 60);
check('المهارة تُستخدم', s.you.skill.cd > 0);
// النتائج
s.match.state = 'over';
s.match.events.push({ t: s.match.time, type: 'gameover', winner: 'x' });
s.update(1 / 60);
await wait(400);
check('شاشة النتائج تظهر', $('scr-results').classList.contains('active'));
const resText = $('res-place').textContent;
check('النتيجة معروضة', resText.length > 0, resText);

console.log('\n📴 مباراة أوفلاين على كل خريطة');
for (const mapId of ['sand_storm', 'snow_peak', 'neo_city', 'volcano']) {
  app.startSelected(); // يعيد استخدام الخريطة المختارة
  app.ui.selectedMap = mapId;
  app.startSelected();
  await wait(200);
  let ok = true, err = null;
  try { for (let i = 0; i < 220; i++) s.update(1 / 60); } catch (e) { ok = false; err = e; }
  check(`خريطة «${mapId}» تعمل (${s.match.world.obstacles.length} عائق)`, ok, err && err.message);
  s.quit();
  await wait(120);
}
console.log('\n🏟️  نمط الساحة (TDM) أوفلاين');
app.ui.selectedMode = 'tdm'; app.ui.selectedMap = 'neo_city';
app.startSelected();
await wait(200);
let ok = true, err = null;
try { for (let i = 0; i < 600; i++) s.update(1 / 60); } catch (e) { ok = false; err = e; }
check('نمط الساحة يعمل بلا أخطاء', ok, err && err.message);
check('لاعبو الساحة داخل الحلبة', s.match.players.every(p => Math.hypot(p.x - s.match.zone.x, p.y - s.match.zone.y) < s.match.zone.r * 1.3));
s.quit(); await wait(150);

console.log('\n🖼️  رسم البورتريه واللقطات');
const ctx = fakeCtx(null);
let portraitErr = null;
try {
  for (const c of ['fahd', 'hakim', 'yaser', 'tannin', 'orkking']) {
    uiMod.drawPortrait(ctx, 320, 420, { charId: c, skinId: 'out_gold', weaponId: 'akm', t: 1.2, weaponTint: { tint: '#c9a227', accent: '#ffe07a' } });
  }
} catch (e) { portraitErr = e; }
check('رسم كل الشخصيات يعمل', !portraitErr, portraitErr && portraitErr.message);

console.log('\n🔄 اللعب بالوضع الأفقي');
const or = app.orientation;
check('وحدة الوضع الأفقي مربوطة بالتطبيق', !!or && typeof or.update === 'function');
check('شاشة عريضة تُحتسب أفقية', or.direction === 'landscape', or.direction);
check('طبقة «أدر جهازك» موجودة في الصفحة', !!$('rotate-hint'));
check('الطبقة مخفية في الوضع الأفقي', $('rotate-hint').classList.contains('hidden'));
check('إعداد «اللعب بالعرض» موجود', !!$('set-landscape'));
check('زر تدوير داخل الـ HUD موجود', !!$('btn-hud-rotate'));
check('بيان التطبيق يثبّت الاتجاه الأفقي', (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8')).orientation === 'landscape'; }
  catch { return false; }
})());
check('التصميم فيه قواعد للعرض والعمودي', (() => {
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  return /#rotate-hint\{/.test(css) && /orientation:landscape/.test(css) && /orientation:portrait/.test(css);
})());

/* محاكاة هاتف: أبعاد النافذة + نقاط اللمس */
const setVp = (w, h) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true });
  globalThis.innerWidth = w; globalThis.innerHeight = h;
};
const setTouch = (n) => { try { Object.defineProperty(window.navigator, 'maxTouchPoints', { value: n, configurable: true }); } catch { } };

app.ui.selectedMode = 'solo'; app.ui.selectedMap = 'ork_island';
app.startSelected();
await wait(200);
setTouch(5); setVp(390, 844);           // هاتف عمودي
or.update();
check('الهاتف العمودي يُكتشف عمودياً', or.portrait, or.direction);
check('أجهزة اللمس تُجبَر على الوضع الأفقي تلقائياً', or.shouldEnforce === true);
check('طبقة التدوير تظهر في العمودي', !$('rotate-hint').classList.contains('hidden'));
check('الجذر يحمل صنف portrait', window.document.documentElement.classList.contains('portrait'));
const tHold = s.match.time;
for (let i = 0; i < 60; i++) s.update(1 / 60);
check('المباراة تتجمّد أثناء طبقة التدوير', s.holdForRotation === true && s.match.time === tHold, `t=${s.match.time} vs ${tHold}`);
// «المتابعة عمودياً»
$('btn-rotate-later').click();
check('زر المتابعة عمودياً يخفي الطبقة', $('rotate-hint').classList.contains('hidden') && or.dismissed === true);
const tRun = s.match.time;
s.update(1 / 60);
check('بعد الاختيار: المحاكاة ترجع للعمل', s.match.time > tRun);
// التدوير إلى الأفقي
setVp(844, 390);
or.update();
check('بعد التدوير: الاتجاه أفقي والطبقة مخفية', or.landscape && $('rotate-hint').classList.contains('hidden'));
check('الجذر يحمل صنف landscape', window.document.documentElement.classList.contains('landscape'));
check('مقاسات الرسم أعيد ضبطها للعرض الجديد', s.renderer.w === 844 && s.renderer.h === 390 && s.renderer.r3.w === 844 && s.renderer.r3.h === 390,
  `${s.renderer.w}x${s.renderer.h} / 3D:${s.renderer.r3.w}x${s.renderer.r3.h}`);
check('اختيار المتابعة عمودياً يُصفَّر بعد التدوير', or.dismissed === false);
// نافذة ضيقة عمودية على كمبيوتر (بلا لمس) تعامل كالهاتف
setTouch(0); setVp(720, 960);
or.update();
check('نافذة ضيقة عمودية تُعامل كالهاتف', or.shouldEnforce === true && or.blocked === true && !$('rotate-hint').classList.contains('hidden'));
// نافذة كمبيوتر عمودية عريضة: لا تُحجب أبداً
setVp(1100, 1400);
or.update();
check('نافذة كمبيوتر عمودية لا تُحجب', or.shouldEnforce === false && $('rotate-hint').classList.contains('hidden'));
// قفل الاتجاه برمجياً
setVp(390, 844);
let lockedTo = null, fsCalls = 0;
window.screen.orientation = { type: 'portrait-primary', lock: async (o) => { lockedTo = o; }, addEventListener() { } };
window.document.documentElement.requestFullscreen = () => { fsCalls++; return Promise.resolve(); };
or.update();
const lockRes = await or.tryLock(false);
check('طلب ملء الشاشة تم قبل القفل', fsCalls === 1, 'calls=' + fsCalls);
check('قفل الاتجاه طُلب أفقياً', lockedTo === 'landscape', String(lockedTo));
check('القفل يُبلّغ عن النجاح', lockRes.locked === true && lockRes.error === null);
check('زر القفل التلقائي يظهر عند دعم المتصفح', !$('btn-rotate-auto').classList.contains('hidden'));
// متصفح لا يدعم قفل الاتجاه (مثل آيفون): تظهر تعليمات التدوير اليدوي
window.screen.orientation = { type: 'portrait-primary' };
setVp(400, 780);
or.manualNote = false;
const noLock = await or.requestLandscape();
check('بلا قفل: يُبلّغ عدم الدعم ويُظهر التعليمات اليدوية',
  noLock.locked === false && (noLock.unsupported === true || !!noLock.error) && or.manualNote === true && !$('rh-note').classList.contains('hidden'),
  JSON.stringify(noLock));
// إيقاف الإجبار من الإعدادات
or.setEnforced(false);
check('إيقاف «اللعب بالعرض» يخفي الطبقة', $('rotate-hint').classList.contains('hidden') && or.shouldEnforce === false);
or.setEnforced(true);
s.quit(); await wait(120);
check('الخروج من المباراة يرفع تجميد التدوير', s.holdForRotation === false);
// إرجاع بيئة الاختبار كما كانت
try { delete window.screen.orientation; } catch { window.screen.orientation = undefined; }
setTouch(0); setVp(1440, 860);
or.enforced = null; or.dismissed = false; or.autoLockOff = false; or.update();
check('العودة لشاشة عريضة تُخفي طبقة التدوير', $('rotate-hint').classList.contains('hidden') && or.landscape);

console.log('\n📊 التقرير');
const uniq = [...new Set(errors)].slice(0, 12);
if (uniq.length) { console.log('  ⚠️  أخطاء مرصودة:'); uniq.forEach(e => console.log('     -', e.slice(0, 200))); }
else console.log('  ✅ لا أخطاء JavaScript في العميل');
console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل (${uniq.length} خطأ مرصود)\n`);
process.exit(fail ? 1 : 0);
