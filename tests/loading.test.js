/**
 * ORK ZONE — tests/loading.test.js
 * اختبار «شاشة التحميل لا تعلق أبداً»:
 *   ١) لا يوجد أي مورد خارجي (CDN / خطوط Google) في الصفحة — فلا شيء يمكن أن يحجب العرض.
 *   ٢) كل مورد محلي مذكور في الصفحة موجود فعلاً ويُخدَم بـ 200 (بما فيها ملفات الخطوط woff2).
 *   ٣) لو لم يعمل main.js إطلاقاً (متصفح قديم / فشل تحميل) فإن المراقب المبكر يُنهي شاشة
 *      التحميل ويعرض شاشة الدخول + رسالة وزر إعادة محاولة.
 *   ٤) لو اكتمل التمهيد فلا يتدخل المراقب ولا يخرّب الشاشة.
 *   ٥) طبقة «دوّر الجهاز» لا تحجب الكمبيوتر (نافذة قصيرة) ويمكن تجاوزها على الهاتف.
 * التشغيل: node tests/loading.test.js   (يحتاج السيرفر على المنفذ ٣٠٠٠: npm start)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const HTML = path.join(ROOT, 'public', 'index.html');

let JSDOM, ResourceLoader;
try { ({ JSDOM, ResourceLoader } = await import('jsdom')); }
catch { console.log('⚠️  jsdom غير مثبت — npm i jsdom --no-save'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra ? '→ ' + extra : ''); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read(HTML);

/* ===================== ١) لا موارد خارجية ===================== */
console.log('\n🔒 ١) الصفحة خالية من أي مورد خارجي (CDN)');
const scanTargets = [
  ['public/index.html', html],
  ['public/css/style.css', read(path.join(ROOT, 'public/css/style.css'))],
  ['public/css/fonts.css', read(path.join(ROOT, 'public/css/fonts.css'))],
];
for (const f of fs.readdirSync(path.join(ROOT, 'public/js'))) {
  scanTargets.push(['public/js/' + f, read(path.join(ROOT, 'public/js', f))]);
}
const stripComments = (s, kind) => kind === 'html'
  ? s.replace(/<!--[\s\S]*?-->/g, '')
  : s.replace(/\/\*[\s\S]*?\*\//g, '');
const external = [];
for (const [name, src] of scanTargets) {
  const clean = stripComments(src, name.endsWith('.html') ? 'html' : 'js');
  const hits = clean.match(/https?:\/\/[^\s'"()]+/g) || [];
  for (const h of hits) if (!/localhost|127\.0\.0\.1/.test(h)) external.push(name + ' → ' + h);
}
ok('لا يوجد أي رابط http(s) خارجي في index.html أو CSS أو JS', external.length === 0, external.join(' , '));
ok('لا يوجد <link rel=stylesheet> خارجي يحجب العرض',
  !/<link[^>]+rel=["']?stylesheet["']?[^>]+href=["']?https?:/i.test(html));
ok('لا يوجد <script src> خارجي', !/<script[^>]+src=["']?https?:/i.test(html));
ok('لا preconnect لمضيف خارجي', !/<link[^>]+rel=["']?preconnect["']?[^>]+https?:/i.test(html));

/* ===================== ٢) كل مورد محلي موجود ويُخدَم ===================== */
console.log('\n📦 ٢) الموارد المحلية موجودة ومخدومة');
let serverUp = false;
try {
  const h = await fetch(BASE + '/api/health');
  serverUp = h.ok;
} catch { serverUp = false; }
if (!serverUp) console.log('  ⚠️  السيرفر غير مشغّل على ' + BASE + ' — سنفحص الملفات على القرص فقط (npm start)');

const localRefs = [...html.matchAll(/(?:href|src)=["'](\/[^"']+)["']/g)].map(m => m[1]);
ok('الصفحة تشير إلى ملفات محلية (css + js)', localRefs.length >= 3, JSON.stringify(localRefs));
for (const ref of new Set(localRefs)) {
  const onDisk = fs.existsSync(path.join(ROOT, 'public', ref));
  let served = null;
  if (serverUp) {
    try { served = (await fetch(BASE + ref)).status; } catch { served = 'ERR'; }
  }
  ok('المورد ' + ref + ' موجود' + (serverUp ? ' ويُخدَم' : ''),
    onDisk && (serverUp ? served === 200 : true), 'disk=' + onDisk + ' http=' + served);
}

const fontsCss = read(path.join(ROOT, 'public/css/fonts.css'));
const fontUrls = [...fontsCss.matchAll(/url\('(\/[^']+)'\)/g)].map(m => m[1]);
ok('fonts.css يصرّح بملفات خطوط محلية', fontUrls.length >= 10, 'count=' + fontUrls.length);
let badFonts = 0, checked = 0;
for (const u of fontUrls) {
  const p = path.join(ROOT, 'public', u);
  if (!fs.existsSync(p)) { badFonts++; continue; }
  checked++;
  const magic = fs.readFileSync(p).subarray(0, 4).toString('latin1');
  if (magic !== 'wOF2') badFonts++;
  if (serverUp) {
    try {
      const r = await fetch(BASE + u);
      if (r.status !== 200) badFonts++;
    } catch { badFonts++; }
  }
}
ok('كل ملفات الخطوط woff2 سليمة ومخدومة (200)', badFonts === 0, 'checked=' + checked + ' bad=' + badFonts);
ok('الخطوط تُحمَّل بـ font-display: swap (لا حجب للنص)',
  (fontsCss.match(/font-display:\s*swap/g) || []).length === (fontsCss.match(/@font-face/g) || []).length);

/* ===================== ٣) المراقب المبكر ينقذ شاشة التحميل ===================== */
console.log('\n🛟 ٣) لو لم يعمل main.js — شاشة التحميل لا تبقى عالقة');
const requested = [];
class Recorder extends ResourceLoader {
  fetch(url, options) {
    requested.push(url);
    // أي طلب خارجي يُعلّق للأبد — لمحاكاة شبكة تحجب CDN
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return new Promise(() => { });
    return super.fetch(url, options);
  }
}
const { VirtualConsole } = await import('jsdom');
const makeDom = (opts = {}) => {
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', (e) => { if (!/Could not load|module/i.test(e.message)) jsErrors.push(e.message); });
  const dom = new JSDOM(html, {
    url: BASE + '/',
    runScripts: 'dangerously',
    resources: new Recorder(),
    pretendToBeVisual: true,
    virtualConsole: vc,
    userAgent: opts.userAgent,
  });
  if (opts.size) {
    Object.defineProperty(dom.window, 'innerWidth', { value: opts.size[0], configurable: true });
    Object.defineProperty(dom.window, 'innerHeight', { value: opts.size[1], configurable: true });
  }
  if (opts.maxTouchPoints !== undefined) {
    Object.defineProperty(dom.window.navigator, 'maxTouchPoints', { value: opts.maxTouchPoints, configurable: true });
  }
  return { dom, jsErrors };
};

// الحالة الأولى: main.js لا يعمل أبداً (jsdom لا ينفّذ type=module) — كما لو فشل تحميله
{
  const { dom, jsErrors } = makeDom();
  const win = dom.window, doc = win.document;
  ok('شاشة التحميل نشطة في البداية', doc.getElementById('scr-loading').classList.contains('active'));
  ok('لم يُطلب أي مورد خارجي أثناء التحميل',
    requested.every(u => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)), requested.filter(u => !/localhost|127\.0\.0\.1/.test(u)).join(','));
  await sleep(5800); // المراقب يعمل بعد ٥ ثوانٍ
  ok('المراقب المبكر أنهى شاشة التحميل', !doc.getElementById('scr-loading').classList.contains('active'));
  ok('شاشة الدخول ظهرت للاعب', doc.getElementById('scr-auth').classList.contains('active'));
  const notice = doc.querySelector('.boot-fail');
  ok('رسالة فشل واضحة ظهرت', !!notice);
  ok('فيها زر إعادة المحاولة', !!notice && !!notice.querySelector('button'));
  ok('لا أخطاء jsdom غير متوقعة', jsErrors.length === 0, jsErrors.join(' | '));
  win.close();
}

/* ===================== ٤) المراقب لا يتدخل عندما يكتمل التمهيد ===================== */
console.log('\n✅ ٤) عند اكتمال التمهيد لا يتدخل المراقب');
{
  const { dom } = makeDom();
  const win = dom.window, doc = win.document;
  win.ORK = { bootDone: true, profile: null };
  await sleep(5800);
  ok('لم تظهر رسالة فشل', !doc.querySelector('.boot-fail'));
  ok('لم تُجبر شاشة الدخول على الظهور', !doc.getElementById('scr-auth').classList.contains('active'));
  win.close();
}

/* ===================== ٥) طبقة «دوّر الجهاز» ===================== */
console.log('\n📱 ٥) طبقة التدوير لا تحجب الكمبيوتر وتُتجاوز على الهاتف');
{
  const { dom } = makeDom({ size: [1440, 700] }); // نافذة كمبيوتر قصيرة
  const doc = dom.window.document;
  await sleep(900);
  ok('نافذة كمبيوتر قصيرة لا تُعامل كهاتف', !doc.getElementById('rotate-overlay').classList.contains('visible'));
  dom.window.close();
}
{
  const { dom } = makeDom({
    size: [420, 860],
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
    maxTouchPoints: 5,
  });
  const win = dom.window, doc = win.document;
  await sleep(900);
  const overlay = doc.getElementById('rotate-overlay');
  ok('هاتف عمودي يرى رسالة التدوير', overlay.classList.contains('visible'));
  doc.getElementById('btn-rotate-anyway').click();
  await sleep(100);
  ok('زر «متابعة على أي حال» يخفي الطبقة', !overlay.classList.contains('visible'));
  win.close();
}

console.log(`\n📊 النتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
