/**
 * ORK ZONE — tests/landscape.test.js
 * اختبار «اللعبة تعمل بالوضع الأفقي فقط + كل الأجهزة»:
 *   • أي شاشة عمودية (هاتف/تابلت/نافذة كمبيوتر ضيقة) تُحجب بطبقة ملء الشاشة — بلا زر تجاوز
 *   • حلقة اللعب تتجمد تماماً أثناء الحجب (window.__orkPortraitBlocked)
 *   • التدوير إلى الأفقي يُزيل الطبقة فوراً
 *   • محاولة قفل الاتجاه أفقياً متاحة (__orkTryLandscape)
 *   • ملف PWA manifest يفرض landscape عند تثبيت اللعبة
 *   • الجودة «تلقائي» هي الافتراضية وتتكيف مع قوة الجهاز ومعدل الإطارات
 *   • HUD اللمسي الجديد: عنقود قتال + عمود أدوات + أزرار علوية + أسلحة وسط
 * التشغيل: node tests/landscape.test.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* صفحة حقيقية مع تنفيذ السكربتات المضمنة (مدير الاتجاه) */
function makePage({ w, h, touch = false, ua } = {}) {
  const dom = new JSDOM(HTML, {
    url: 'http://localhost:3000/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    userAgent: ua,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: touch, addEventListener() { }, removeEventListener() { } });
      if (touch) {
        try { Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true }); } catch { }
      }
    },
  });
  const win = dom.window;
  Object.defineProperty(win, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: h, configurable: true });
  win.dispatchEvent(new win.Event('resize'));
  return dom;
}

console.log('\n🚫 ١) الوضع العمودي ممنوع على كل الأجهزة — لا تجاوز');
{
  // هاتف عمودي (آيفون برو ماكس)
  const dom = makePage({ w: 430, h: 932, touch: true, ua: 'iPhone' });
  const doc = dom.window.document;
  await sleep(800);
  ok('هاتف عمودي: طبقة «دوّر الجهاز» ظاهرة', doc.getElementById('rotate-overlay').classList.contains('visible'));
  ok('هاتف عمودي: حلقة اللعب مجمّدة', dom.window.__orkPortraitBlocked === true);
  ok('لا يوجد زر تجاوز («متابعة على أي حال») نهائياً', !doc.getElementById('btn-rotate-anyway'));
  ok('زر القفل الأفقي موجود', !!doc.getElementById('btn-rotate-try'));
  // التدوير → تختفي الطبقة وتعود اللعبة
  Object.defineProperty(dom.window, 'innerWidth', { value: 932, configurable: true });
  Object.defineProperty(dom.window, 'innerHeight', { value: 430, configurable: true });
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  await sleep(300);
  ok('بعد التدوير أفقياً: الطبقة اختفت', !doc.getElementById('rotate-overlay').classList.contains('visible'));
  ok('بعد التدوير أفقياً: اللعبة عادت للعمل', dom.window.__orkPortraitBlocked === false);
  dom.window.close();
}
{
  // تابلت عمودي كبير — كان مستثنى سابقاً، الآن ممنوع أيضاً
  const dom = makePage({ w: 1024, h: 1366, touch: true, ua: 'iPad' });
  const doc = dom.window.document;
  await sleep(800);
  ok('تابلت عمودي كبير: يُحجب أيضاً (لا استثناء للأحجام)', doc.getElementById('rotate-overlay').classList.contains('visible'));
  dom.window.close();
}
{
  // نافذة كمبيوتر عمودية — ممنوعة أيضاً: لا وضع عمودي إطلاقاً
  const dom = makePage({ w: 600, h: 900, touch: false });
  const doc = dom.window.document;
  await sleep(800);
  ok('نافذة كمبيوتر عمودية: تُحجب (اللعبة أفقية فقط)', doc.getElementById('rotate-overlay').classList.contains('visible'));
  dom.window.close();
}
{
  // نافذة كمبيوتر أفقية طبيعية — لا حجب
  const dom = makePage({ w: 1440, h: 800, touch: false });
  const doc = dom.window.document;
  await sleep(800);
  ok('كمبيوتر أفقي: لا حجب واللعبة تعمل', !doc.getElementById('rotate-overlay').classList.contains('visible')
    && dom.window.__orkPortraitBlocked === false);
  ok('مدير الاتجاه يوفّر محاولة القفل الأفقي', typeof dom.window.__orkTryLandscape === 'function');
  dom.window.close();
}

console.log('\n🪂 ٢) نافذة الهبوط مضبوطة للوضع الأفقي القصير');
{
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  const compact = css.replace(/\s+/g, '');
  ok('نافذة الهبوط لها مسافات أمان حتى لا يختفي زر القفز تحت الحواف', compact.includes('.jump-phase{') && compact.includes('env(safe-area-inset-bottom,0px)'));
  ok('الوضع الأفقي القصير يحوّل نافذة الهبوط إلى تخطيط جانبي', compact.includes('@media(orientation:landscape)and(max-height:560px)') && compact.includes('grid-template-areas:"maptitle""maphint""mapjump"'));
  ok('خريطة الهبوط تتقلص حسب ارتفاع الشاشة لا عرضها فقط', compact.includes('100dvh-34px') && compact.includes('grid-area:map'));
  ok('زر «اقفز الآن» مثبت داخل الشبكة وبحجم قابل للضغط', compact.includes('grid-area:jump') && compact.includes('min-height:clamp(38px,11vh,48px)'));
}

console.log('\n📐 ٣) تخطيط HUD اللمسي الأفقي الجديد (بابجي/فري فاير)');
{
  const dom = makePage({ w: 854, h: 400, touch: true });
  const doc = dom.window.document;
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  ok('عنقود القتال أسفل اليمين (reload/jump/aim + prone/crouch/fire)', !!doc.querySelector('.tcluster [data-tbtn=fire]'));
  ok('زر الرمي الكبير في زاوية العنقود (grid-area:fire)', /\.tcluster \[data-tbtn=fire\]\{grid-area:fire\}/.test(css.replace(/\s+/g, '')) || css.includes('grid-area:fire'));
  ok('عمود أدوات ٢×٣ على الحافة اليمنى', !!doc.querySelector('.tutil') && doc.querySelectorAll('.tutil .tbtn').length === 6);
  ok('أزرار النتائج/ملء الشاشة أعلى اليسار', !!doc.querySelector('.tmini'));
  ok('عصا الحركة العائمة أسفل اليسار', !!doc.getElementById('stick'));
  ok('زر رمي إضافي لليد اليسرى', !!doc.querySelector('.tbtn.fire2'));
  ok('حاوية العنقود لا تبتلع اللمس بين الأزرار', /\.tcluster\{[^}]*pointer-events:none/.test(css.replace(/\s+/g, '')));
  ok('حاوية عمود الأدوات لا تبتلع اللمس', /\.tutil\{[^}]*pointer-events:none/.test(css.replace(/\s+/g, '')));
  ok('أحجام الأزرار تتكيّف مع ارتفاع الشاشة (clamp + vh)', /--tb:clamp\(/.test(css.replace(/\s+/g, '')) && /--tbfire:clamp\(/.test(css.replace(/\s+/g, '')));
  ok('العصا تتكيّف مع ارتفاع الشاشة', /\.stick\{[^}]*clamp\(/.test(css.replace(/\s+/g, '')));
  ok('الصحة/الأسلحة أسفل الوسط بعيداً عن الإبهامين', /html\.is-touch #hud \.hud-left/.test(css) && /html\.is-touch #hud \.hud-right/.test(css));
  dom.window.close();
}

console.log('\n📱 ٤) PWA: تثبيت اللعبة يفرض الوضع الأفقي');
{
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8'));
  ok('manifest موجود ومقروء', !!mf.name);
  ok('manifest يفرض landscape', mf.orientation === 'landscape');
  ok('manifest ملء الشاشة', mf.display === 'fullscreen');
  ok('أيقونات موجودة (192 + 512)', fs.existsSync(path.join(ROOT, 'public/icons/icon-192.png')) && fs.existsSync(path.join(ROOT, 'public/icons/icon-512.png')));
  ok('الصفحة تشير إلى manifest', HTML.includes('rel="manifest"'));
}

console.log('\n⚡ ٥) الجودة التلقائية والأداء على كل الأجهزة');
{
  const mainSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'main.js'), 'utf8');
  const r3Src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'render3d.js'), 'utf8');
  const r2Src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'render.js'), 'utf8');
  ok('خيار «تلقائي» هو الافتراضي في الإعدادات', HTML.includes('value="auto" selected'));
  ok('main.js يكتشف درجة الجهاز (detectTier)', mainSrc.includes('detectTier'));
  ok('حاكم أداء يراقب FPS وينزل/يرفع الجودة تلقائياً', mainSrc.includes('perfTick') && mainSrc.includes("p.fps < 27") && mainSrc.includes('p.fps > 55'));
  ok('حلقة اللعب تتجمد في الوضع العمودي', mainSrc.includes('__orkPortraitBlocked'));
  ok('المحرك ثلاثي الأبعاد: مقياس دقة تكيّفي حتى ٠٫٥ للأجهزة الضعيفة جداً', r3Src.includes('Math.max(0.5') && r3Src.includes('_adaptResolution'));
  ok('المحرك ثنائي الأبعاد: مقياس دقة تكيّفي أيضاً', r2Src.includes('_adaptResolution'));
  ok('حد الجسيمات يتبع الجودة (ضعيف=جسيمات أقل)', r2Src.includes('_qualityParts'));
  ok('عرض معدل الإطارات في الـ HUD', HTML.includes('id="hud-fps"'));
}

console.log(`\n📊 النتيجة: ${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
