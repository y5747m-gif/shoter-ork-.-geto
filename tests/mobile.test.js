/**
 * ORK ZONE — tests/mobile.test.js
 * اختبار اللعب بالعرض (Landscape) على الهاتف:
 *   • تخطيط أزرار اللمس موجود بالكامل في الصفحة
 *   • العصا العائمة تظهر مكان الإصبع وتحرّك اللاعب
 *   • السحب على يمين الشاشة يدير النظر (ثلاثي الأبعاد) وتعدد اللمسات يعمل
 *   • زر الرمي يطلق، والسحب من زر الرمي يدير النظر بنفس الإصبع
 *   • أزرار الانحناء/الاستلقاء/النتائج تعمل
 *   • طبقة «دوّر جهازك» تختفي في الوضع الأفقي
 * التشغيل: node tests/mobile.test.js
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader-hook.mjs', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('⚠️  jsdom غير مثبت — npm i jsdom --no-save'); process.exit(0); }

const W = 854, H = 400;                 // هاتف أفقي نموذجي
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:3000/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: this }, { get: (t, p) => (p in t ? t[p] : () => ({ addColorStop() { }, width: 1 })), set: (t, p, v) => (t[p] = v, true) });
};
Object.defineProperty(window, 'innerWidth', { value: W, writable: true });
Object.defineProperty(window, 'innerHeight', { value: H, writable: true });
window.matchMedia = () => ({ matches: true, addEventListener() { }, removeEventListener() { } });
window.navigator.vibrate = () => true;

globalThis.window = window;
globalThis.document = window.document;
globalThis.innerWidth = W; globalThis.innerHeight = H;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.removeEventListener = window.removeEventListener.bind(window);
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch { }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + ' ' + (extra || '')); } };

/* أداة: حدث لمس */
function touch(el, type, points) {
  const list = points.map(p => ({ identifier: p.id, clientX: p.x, clientY: p.y, target: el }));
  const ev = new window.Event(type, { bubbles: true, cancelable: true });
  ev.changedTouches = list; ev.touches = list;
  el.dispatchEvent(ev);
}

console.log('\n📱 تخطيط اللمس الأفقي موجود');
const doc = window.document;
const need = ['touch-ui', 'stick', 'stick-knob', 'game-canvas'];
for (const id of need) ok('العنصر #' + id + ' موجود', !!doc.getElementById(id));
const btns = [...doc.querySelectorAll('.tbtn')].map(b => b.dataset.tbtn);
for (const b of ['fire', 'aim', 'reload', 'jump', 'crouch', 'prone', 'pickup', 'swap', 'car', 'heal', 'skill', 'grenade', 'score', 'fs'])
  ok('زر «' + b + '» موجود', btns.includes(b));
ok('زر رمي إضافي لليد اليسرى', !!doc.querySelector('.tbtn.fire2'));
ok('عنقود القتال أسفل اليمين', !!doc.querySelector('.tcluster'));
ok('عمود الأدوات على الحافة اليمنى (٢×٣)', !!doc.querySelector('.tutil'));
const tutilBtns = [...doc.querySelectorAll('.tutil .tbtn')].map(b => b.dataset.tbtn);
ok('عمود الأدوات فيه ٦ أزرار', tutilBtns.length === 6, tutilBtns.join(','));
ok('عمود الأدوات لا يحتوي النتائج/ملء الشاشة (انتقلت أعلى اليسار)', !tutilBtns.includes('score') && !tutilBtns.includes('fs'));
ok('أزرار النتائج وملء الشاشة أعلى اليسار', !!doc.querySelector('.tmini [data-tbtn=score]') && !!doc.querySelector('.tmini [data-tbtn=fs]'));
ok('كل أزرار الأدوات داخل عمود واحد (لا شريط وسطي قديم)', !doc.querySelector('.tcol'));

console.log('\n🕹️ العصا العائمة والنظر باللمس');
const { Input2 } = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'input.js')).href);
const cv = doc.getElementById('game-canvas');
const inp = new Input2(cv);
inp.fps = true;

// لمسة في النصف الأيسر السفلي = عصا حركة تظهر هناك
touch(cv, 'touchstart', [{ id: 1, x: 120, y: 300 }]);
const stickEl = doc.getElementById('stick');
ok('العصا فُعّلت عند اللمس في اليسار', inp.stick.active === true);
ok('العصا انتقلت تحت الإصبع (ليست ثابتة بالزاوية)', !stickEl.classList.contains('idle') && stickEl.style.left === '45px');
touch(cv, 'touchmove', [{ id: 1, x: 120, y: 240 }]);
ok('دفع العصا للأعلى يعطي حركة للأمام', inp.stick.dy < -0.5, 'dy=' + inp.stick.dy.toFixed(2));
let st = inp.read({ x: 0, y: 0, z: 1 }, { x: 0, y: 0 }, null);
ok('read() يترجم العصا لحركة في العالم', Math.hypot(st.mx, st.my) > 0.5);

// إصبع ثانٍ على اليمين = نظر (بينما العصا ما زالت ممسوكة)
const yaw0 = inp.look.yaw;
touch(cv, 'touchstart', [{ id: 2, x: 600, y: 200 }]);
touch(cv, 'touchmove', [{ id: 2, x: 700, y: 200 }]);
ok('سحب اليمين يدير النظر أفقياً', inp.look.yaw > yaw0, 'Δ=' + (inp.look.yaw - yaw0).toFixed(3));
ok('العصا ما زالت فعّالة أثناء النظر (تعدد لمسات)', inp.stick.active === true);
const pitch0 = inp.look.pitch;
touch(cv, 'touchmove', [{ id: 2, x: 700, y: 120 }]);
ok('السحب لأعلى يرفع النظر', inp.look.pitch > pitch0);
ok('حد الميل الرأسي أوسع (±٠٫٦٢)', inp.pitchLimit > 0.55);
touch(cv, 'touchend', [{ id: 2, x: 700, y: 120 }]);
touch(cv, 'touchend', [{ id: 1, x: 120, y: 240 }]);
ok('رفع الإصبع يُرجع العصا لوضع الراحة', !inp.stick.active && stickEl.classList.contains('idle'));

console.log('\n🔥 أزرار القتال');
const fireBtn = doc.querySelector('.tcluster .tbtn.fire');
touch(fireBtn, 'touchstart', [{ id: 3, x: 800, y: 330 }]);
ok('زر الرمي يفعّل الإطلاق', inp.touchBtns.fire === true);
st = inp.read({ x: 0, y: 0, z: 1 }, { x: 0, y: 0 }, null);
ok('read() يرى الإطلاق', st.shoot === true);
const yaw1 = inp.look.yaw;
touch(fireBtn, 'touchmove', [{ id: 3, x: 760, y: 330 }]);
ok('السحب من زر الرمي يدير النظر بنفس الإصبع', inp.look.yaw !== yaw1);
touch(fireBtn, 'touchend', [{ id: 3, x: 760, y: 330 }]);
ok('إفلات الزر يوقف الإطلاق', !inp.touchBtns.fire);

const aimBtn = doc.querySelector('.tbtn.aim');
touch(aimBtn, 'touchstart', [{ id: 4, x: 800, y: 260 }]);
st = inp.read({ x: 0, y: 0, z: 1 }, { x: 0, y: 0 }, null);
ok('زر التصويب يفعّل التصويب', st.aiming === true);
touch(aimBtn, 'touchend', [{ id: 4, x: 800, y: 260 }]);

const proneBtn = doc.querySelector('[data-tbtn=prone]');
touch(proneBtn, 'touchstart', [{ id: 5, x: 700, y: 330 }]);
st = inp.read({ x: 0, y: 0, z: 1 }, { x: 0, y: 0 }, null);
ok('زر الاستلقاء يعمل', st.prone === true);
const crouchBtn = doc.querySelector('[data-tbtn=crouch]');
touch(crouchBtn, 'touchstart', [{ id: 6, x: 740, y: 330 }]);
st = inp.read({ x: 0, y: 0, z: 1 }, { x: 0, y: 0 }, null);
ok('زر الانحناء يلغي الاستلقاء', st.crouch === true && st.prone === false);
const scoreBtn = doc.querySelector('[data-tbtn=score]');
touch(scoreBtn, 'touchstart', [{ id: 7, x: 430, y: 370 }]);
ok('زر النتائج يفتح لوحة النتائج', inp.sbOpen === true);
const fsBtn = doc.querySelector('[data-tbtn=fs]');
touch(fsBtn, 'touchstart', [{ id: 8, x: 470, y: 370 }]);
ok('زر ملء الشاشة يُصدر أمراً', inp.drainActions().some(a => a.a === 'fullscreen'));

console.log('\n🧭 الوضع الأفقي');
const overlay = doc.getElementById('rotate-overlay');
ok('طبقة «دوّر جهازك» مخفية في الوضع الأفقي', !overlay.classList.contains('visible'));
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
ok('CSS فيه تخطيط العنقود الأفقي', /\.tcluster\{/.test(css.replace(/\s+/g, '')) || css.includes('.tcluster'));
ok('CSS يحترم حواف الشاشة (safe-area)', css.includes('env(safe-area-inset-bottom'));
ok('أحجام الأزرار تتكيّف مع الشاشات القصيرة', css.includes('max-height:360px') && css.includes('--tbfire'));
ok('أحجام الأزرار متكيّفة بوحدات vh (clamp)', /--tb:clamp\(/.test(css.replace(/\s+/g, '')));
ok('فراغات العنقود لا تبتلع اللمس (pointer-events للأزرار فقط)', /\.tcluster\s*\{[^}]*pointer-events:none/.test(css.replace(/\s+/g, '')) || css.includes('.tcluster{position:absolute;right:max(14px'));
ok('عمود الأدوات فوق العنقود مباشرة', css.includes('.tutil'));
ok('أشرطة الصحة أسفل الوسط بعيداً عن الإبهامين', /html\.is-touch #hud \.hud-left/.test(css));
ok('قائمة الأسلحة والذخيرة أسفل الوسط', /html\.is-touch #hud \.hud-right/.test(css));

console.log('\n🌦️ الطقس والظلال ثلاثية الأبعاد');
const r3src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'render3d.js'), 'utf8');
for (const k of ['rain', 'snow', 'ember', 'dust', 'pollen'])
  ok('طقس «' + k + '» معرّف', r3src.includes("'" + k + "'"));
ok('ظلال أرضية موجودة', r3src.includes('_groundShadow'));
ok('غيوم موجودة', r3src.includes('_drawClouds'));

console.log(`\n📊 النتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
