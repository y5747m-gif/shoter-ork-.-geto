/**
 * ORK ZONE — tests/prayer.test.js
 * ==============================================================
 * اختبار كامل لـ:
 *   ١) دقة حساب مواقيت الصلاة (مقارنة بمراجع معروفة).
 *   ٢) منطق نوافذ الصلاة والصلاة المستحقة والقادمة.
 *   ٣) حارس الصلاة: القفل عند دخول الوقت، «نعم صليت» → فتح،
 *      «لا» → إغلاق اللعبة + كاميرا + عدم الفتح إلا بصورة، وبقاء
 *      القفل بعد إعادة تحميل الصفحة.
 *   ٤) إزالة الموسيقى نهائياً من كل مكان في المشروع.
 *   ٥) وجود بصمة صوتية احترافية لكل سلاح في اللعبة.
 * التشغيل: node tests/prayer.test.js
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader-hook.mjs', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { console.log('  ✅', name); pass++; }
  else { console.log('  ❌', name, extra); fail++; }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const PT = await import(pathToFileURL(path.join(PUB, 'shared', 'prayertimes.js')).href);
const { prayerTimes, fmtTime, duePrayer, nextPrayer, prayerWindows, PRAYER_ORDER, CITIES, METHODS } = PT;

/* ============================================================
   ١) دقة الحساب الفلكي
   ============================================================ */
console.log('\n🕌 ١) دقة مواقيت الصلاة');
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// مكة المكرمة — أم القرى — ٣٠ سبتمبر ٢٠٢٦ (مرجع: التقويم الرسمي)
{
  const t = prayerTimes({ date: new Date(2026, 8, 30), lat: 21.3891, lng: 39.8579, tz: 3, method: 'makkah' });
  const ref = { fajr: '04:55', sunrise: '06:11', dhuhr: '12:12', asr: '15:34', maghrib: '18:09', isha: '19:39' };
  for (const k of Object.keys(ref)) {
    check(`مكة · ${PT.PRAYER_AR[k]} ≈ ${ref[k]} (±3د) → ${fmtTime(t[k], false)}`, near(t[k], hm(ref[k]), 3), fmtTime(t[k], false));
  }
}
// القاهرة — الهيئة المصرية
{
  const t = prayerTimes({ date: new Date(2026, 8, 30), lat: 30.0444, lng: 31.2357, tz: 3, method: 'egypt' });
  const ref = { fajr: '05:21', dhuhr: '12:46', asr: '16:09', maghrib: '18:42', isha: '19:59' };
  for (const k of Object.keys(ref)) {
    check(`القاهرة · ${PT.PRAYER_AR[k]} ≈ ${ref[k]} (±4د)`, near(t[k], hm(ref[k]), 4), fmtTime(t[k], false));
  }
}
// الترتيب المنطقي عبر السنة وفي مدن مختلفة
{
  let ordered = true, finite = true;
  for (const c of CITIES) {
    for (const mth of [0, 3, 6, 9]) {
      const tz = Math.round(c.lng / 15);            // توقيت تقريبي واقعي لكل مدينة
      const t = prayerTimes({ date: new Date(2026, mth, 15), lat: c.lat, lng: c.lng, tz, method: c.method });
      for (const k of PRAYER_ORDER) if (!Number.isFinite(t[k])) finite = false;
      if (!(t.fajr < t.sunrise && t.sunrise < t.dhuhr && t.dhuhr < t.asr && t.asr < t.maghrib && t.maghrib < t.isha)) {
        ordered = false;
        if (process.env.DEBUG) console.log('   ⚠️', c.ar, mth, t);
      }
    }
  }
  check('كل المدن × ٤ مواسم: أرقام صحيحة (لا NaN)', finite);
  check('ترتيب الصلوات صحيح دائماً (فجر < شروق < ظهر < عصر < مغرب < عشاء)', ordered);
}
// خط عرض قطبي لا يكسر الحساب
{
  const t = prayerTimes({ date: new Date(2026, 5, 21), lat: 69.6496, lng: 18.9560, tz: 2, method: 'mwl' });
  check('خط عرض قطبي (ترومسو): مواقيت صالحة بلا انهيار', PRAYER_ORDER.every(k => Number.isFinite(t[k])), JSON.stringify(t));
}
// المذهب الحنفي: العصر متأخر عن الجمهور
{
  const a = prayerTimes({ date: new Date(2026, 8, 30), lat: 24.7136, lng: 46.6753, tz: 3, asr: 'shafi' });
  const b = prayerTimes({ date: new Date(2026, 8, 30), lat: 24.7136, lng: 46.6753, tz: 3, asr: 'hanafi' });
  check('عصر الحنفي متأخر عن عصر الجمهور', b.asr > a.asr + 20, `${fmtTime(a.asr, false)} → ${fmtTime(b.asr, false)}`);
}
// التعديل اليدوي بالدقائق
{
  const a = prayerTimes({ date: new Date(2026, 8, 30), lat: 21.3891, lng: 39.8579, tz: 3 });
  const b = prayerTimes({ date: new Date(2026, 8, 30), lat: 21.3891, lng: 39.8579, tz: 3, offsets: { dhuhr: 5, asr: -3 } });
  check('تعديل يدوي +٥ دقائق للظهر', near(b.dhuhr - a.dhuhr, 5, 0.01));
  check('تعديل يدوي -٣ دقائق للعصر', near(b.asr - a.asr, -3, 0.01));
}
check('كل طرق الحساب معرّفة بزوايا صحيحة', Object.values(METHODS).every(m => m.fajr > 5 && m.fajr < 25 && (m.isha.angle || m.isha.minutes)));
check('التنسيق العربي يعمل', fmtTime(12 * 60 + 5) === '12:05 م' && fmtTime(5 * 60 + 9) === '5:09 ص', fmtTime(12 * 60 + 5) + ' / ' + fmtTime(5 * 60 + 9));

/* ============================================================
   ٢) منطق النوافذ والصلاة المستحقة
   ============================================================ */
console.log('\n⏱️ ٢) منطق نوافذ الصلاة');
const T = { fajr: 300, sunrise: 380, dhuhr: 730, asr: 940, maghrib: 1090, isha: 1180 };
{
  const w = prayerWindows(T);
  check('٤ نوافذ فقط (ظهر/عصر/مغرب/عشاء) افتراضياً', w.length === 4 && w.map(x => x.key).join() === 'dhuhr,asr,maghrib,isha');
  check('نافذة الظهر تنتهي بالعصر', w[0].start === 730 && w[0].end === 940);
  check('نافذة العشاء تمتد لفجر الغد', w[3].end === T.fajr + 1440);
  check('لا قفل قبل الأذان بدقيقة', duePrayer(T, 729) === null);
  check('قفل فور دخول وقت الظهر', duePrayer(T, 730)?.key === 'dhuhr');
  check('يظل مقفلاً منتصف الوقت', duePrayer(T, 800)?.key === 'dhuhr');
  check('ينتقل للعصر بعد دخول وقته', duePrayer(T, 941)?.key === 'asr');
  check('لا قفل بعد تأكيد الصلاة', duePrayer(T, 800, (k) => k === 'dhuhr') === null);
  check('عشاء الأمس يقفل بعد منتصف الليل', duePrayer(T, 60, () => false)?.key === 'isha');
  check('الفجر لا يقفل افتراضياً', duePrayer(T, 310) === null);
  check('الفجر يقفل إذا فُعّل', duePrayer(T, 310, () => false, ['fajr', 'dhuhr'])?.key === 'fajr');
  const n = nextPrayer(T, 500);
  check('الصلاة القادمة تُحسب صحيحاً', n.key === 'dhuhr' && n.in === 230, JSON.stringify(n));
  const n2 = nextPrayer(T, 1300);
  check('بعد العشاء ← فجر الغد', n2.key === 'fajr' && Math.round(n2.in) === 440, JSON.stringify(n2));
}

/* ============================================================
   ٣) حارس الصلاة داخل DOM حقيقي
   ============================================================ */
console.log('\n🔒 ٣) حارس الصلاة (DOM حقيقي)');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('⚠️  jsdom غير مثبت — تخطّي اختبارات الواجهة'); finish(); }

const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: () => () => { }, set: () => true });
};
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.FileReader = window.FileReader;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true }); } catch { }
const $ = (id) => window.document.getElementById(id);

const { PrayerGuard } = await import(pathToFileURL(path.join(PUB, 'js', 'prayer.js')).href);

/* تطبيق وهمي بجلسة لعب */
function makeApp() {
  const app = {
    toasts: [],
    session: {
      running: true, prayerFrozen: false, quitCalls: 0,
      input: { releaseLock() { } },
      quit() { this.quitCalls++; this.running = false; },
      update() { if (this.prayerFrozen || app.prayer?.locked) { this.frames = (this.frames || 0); return; } this.frames = (this.frames || 0) + 1; },
    },
    audio: { stopAll() { this.stopped = true; } },
    ui: { toast(m, k) { app.toasts.push([m, k]); } },
  };
  return app;
}

// ساعة مُتحكَّم بها: الظهر دخل قبل ٥ دقائق
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const fixedTimes = () => {
  const n = nowMins();
  return { fajr: Math.max(0, n - 400), sunrise: Math.max(1, n - 340), dhuhr: n - 5, asr: n + 180, maghrib: n + 300, isha: n + 360 };
};

window.localStorage.clear();
const app = makeApp();
const guard = new PrayerGuard(app);
app.prayer = guard;
guard.times = fixedTimes;
guard.init();

check('القفل يُفعَّل تلقائياً عند دخول وقت الظهر', guard.locked === true && guard.current.key === 'dhuhr');
check('طبقة القفل ظاهرة على الشاشة', !$('prayer-lock').classList.contains('hidden'));
check('العنوان يذكر اسم الصلاة', /الظهر/.test($('prayer-title').textContent), $('prayer-title').textContent);
check('خطوة السؤال «هل صليت؟» ظاهرة', !window.document.querySelector('[data-prayer-step="ask"]').classList.contains('hidden'));
check('خطوة الكاميرا مخفية في البداية', window.document.querySelector('[data-prayer-step="cam"]').classList.contains('hidden'));
check('المباراة تجمّدت', app.session.prayerFrozen === true);
app.session.frames = 0;
for (let i = 0; i < 30; i++) app.session.update(1 / 60);
check('٣٠ إطاراً لم تُحرَّك اللعبة أثناء القفل', app.session.frames === 0);

/* «نعم صليت» يفتح القفل */
$('prayer-yes').click();
check('«نعم صليت» يفتح القفل فوراً', guard.locked === false);
check('الطبقة اختفت', $('prayer-lock').classList.contains('hidden'));
check('المباراة عادت للعمل', app.session.prayerFrozen === false);
app.session.frames = 0;
for (let i = 0; i < 10; i++) app.session.update(1 / 60);
check('الإطارات تعمل بعد الفتح', app.session.frames === 10);
check('التأكيد محفوظ في السجل', guard.isDone('dhuhr') === true);
guard.tick();
check('لا يعود القفل بعد التأكيد في نفس الوقت', guard.locked === false);

/* «لا لم أصلِّ» → إغلاق اللعبة + كاميرا */
window.localStorage.clear();
const app2 = makeApp();
const g2 = new PrayerGuard(app2);
app2.prayer = g2;
g2.times = fixedTimes;
g2.init();
check('قفل جديد بعد مسح السجل', g2.locked === true);
$('prayer-no').click();
check('«لا» تُغلق المباراة (quit)', app2.session.quitCalls === 1);
check('اللعبة لا تزال مقفلة بعد «لا»', g2.locked === true);
check('انتقلنا لخطوة الكاميرا', g2.step === 'cam' && !window.document.querySelector('[data-prayer-step="cam"]').classList.contains('hidden'));
check('رسالة الإغلاق تطلب تصوير الصلاة', /صوّر نفسك/.test($('prayer-cam-title').textContent), $('prayer-cam-title').textContent);
check('بديل رفع الصورة يظهر عند غياب الكاميرا', !$('prayer-upload-row').classList.contains('hidden'));
check('طلب الفتح بلا صورة مرفوض', g2.submitPhoto() === false && g2.locked === true);
check('حالة «مطلوب صورة» محفوظة للتخزين', !!JSON.parse(window.localStorage.getItem('orkz_prayer_pending') || 'null')?.needPhoto);

/* القفل يصمد أمام إعادة تحميل الصفحة */
const g3 = new PrayerGuard(makeApp());
g3.times = fixedTimes;
g3.init();
check('بعد «إعادة تحميل الصفحة» يبقى القفل على خطوة الكاميرا', g3.locked === true && g3.step === 'cam');
check('حتى لو عُطِّل الحارس من الإعدادات لا تُتجاوز الصورة', (() => {
  g3.cfg.enabled = false; g3.tick();
  const stillLocked = g3.locked === true;
  g3.cfg.enabled = true; g3.tick();
  return stillLocked;
})());

/* إرسال الصورة يفتح القفل */
const file = new window.File([new Uint8Array([255, 216, 255, 219, 0, 1, 2, 3])], 'prayer.jpg', { type: 'image/jpeg' });
await g2.useFile(file);
check('الصورة المرفوعة تنتقل لخطوة المراجعة', g2.step === 'shot' && !!g2.shotData);
check('صورة المراجعة معروضة', !window.document.querySelector('[data-prayer-step="shot"]').classList.contains('hidden'));
check('اعتماد الصورة يفتح القفل', g2.submitPhoto() === true && g2.locked === false);
check('الصورة حُفظت في سجل الإثباتات', g2.proofs().length === 1 && g2.proofs()[0].key === 'dhuhr');
check('حالة «مطلوب صورة» أُزيلت', window.localStorage.getItem('orkz_prayer_pending') === null);
check('الحارس سجّل الصلاة بطريقة «photo»', guardVia(g2, 'dhuhr') === 'photo', guardVia(g2, 'dhuhr'));

/* تعطيل الحارس من الإعدادات */
window.localStorage.clear();
const g4 = new PrayerGuard(makeApp());
g4.times = fixedTimes;
g4.cfg.enabled = false;
g4.init();
check('تعطيل الحارس يمنع القفل تماماً', g4.locked === false);
g4.cfg.enabled = true; g4.tick();
check('إعادة تفعيله تُرجع القفل', g4.locked === true);
g4.confirmPrayed();

/* المدن والإعدادات */
const g5 = new PrayerGuard(makeApp());
g5.init();
check('قائمة المدن مُعبّأة في الواجهة', $('prayer-city').options.length >= CITIES.length);
check('قائمة طرق الحساب مُعبّأة', $('prayer-method').options.length === Object.keys(METHODS).length);
check('اختيار مدينة يضبط الإحداثيات', g5.setCity('cairo') && g5.cfg.lat === 30.0444 && g5.cfg.method === 'egypt');
check('جدول مواقيت اليوم يُعرض', $('prayer-times-list').children.length === 6);
check('شريحة الصلاة القادمة تُحدَّث', /🕌/.test($('prayer-chip').textContent), $('prayer-chip').textContent);
if (g5.locked) g5.confirmPrayed();

function guardVia(g, key) {
  const m = JSON.parse(window.localStorage.getItem('orkz_prayer_done') || '{}');
  const day = Object.keys(m)[0];
  return m[day]?.[key]?.via;
}

/* ---------- سلامة تنسيق طبقة القفل (لا يمكن تجاوزها بصرياً) ---------- */
const cssTxt = fs.readFileSync(path.join(PUB, 'css', 'style.css'), 'utf8');
const cssBlock = (sel) => {
  const i = cssTxt.indexOf(sel + '{');
  return i < 0 ? '' : cssTxt.slice(i, cssTxt.indexOf('}', i));
};
const lockCss = cssBlock('.prayer-lock');
check('طبقة القفل ثابتة وتغطي الشاشة كاملة', /position:fixed/.test(lockCss) && /inset:0/.test(lockCss), lockCss.slice(0, 60));
check('طبقة القفل فوق كل عناصر اللعبة (z-index عالٍ)', /z-index:1\d{4,}/.test(lockCss), lockCss);
check('كلاس hidden يُخفي الطبقة فعلاً', /display:none/.test(cssBlock('.prayer-lock.hidden')));
check('صندوق القفل قابل للتمرير على الشاشات الصغيرة', /overflow:auto/.test(cssBlock('.prayer-lock .prayer-box')));
check('معاينة الكاميرا لها أبعاد ثابتة (لا تكسر التخطيط)', /aspect-ratio:4\/3/.test(cssBlock('.prayer-cam-wrap')));
check('تنسيق الشاشات القصيرة (هاتف أفقي) موجود', /@media \(max-height:520px\)/.test(cssTxt));

/* ============================================================
   ٤) الموسيقى مُزالة نهائياً
   ============================================================ */
console.log('\n🔇 ٤) إزالة الموسيقى نهائياً');
const srcFiles = [];
for (const dir of ['public/js', 'public/shared', 'server']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (f.endsWith('.js')) srcFiles.push(path.join(dir, f));
  }
}
srcFiles.push('public/index.html', 'public/css/style.css');
const offenders = [];
for (const rel of srcFiles) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = txt.split('\n');
  lines.forEach((l, i) => {
    if (/startMusic\s*\(\s*['"]/.test(l)) offenders.push(`${rel}:${i + 1} ${l.trim().slice(0, 60)}`);
    if (/musicGain|musicTimer\s*=\s*setInterval/.test(l)) offenders.push(`${rel}:${i + 1} ${l.trim().slice(0, 60)}`);
    if (/set-music|id="set-music"/.test(l)) offenders.push(`${rel}:${i + 1} ${l.trim().slice(0, 60)}`);
  });
}
check('لا يوجد أي نداء لتشغيل موسيقى في الكود', offenders.length === 0, offenders.join(' | '));
check('لا يوجد شريط «الموسيقى» في الإعدادات', !/الموسيقى\s*<input/.test(html) && !/id="set-music"/.test(html));

const { Audio2, WEAPON_AUDIO_PROFILES } = await import(pathToFileURL(path.join(PUB, 'js', 'audio.js')).href);
const a = new Audio2();
check('لا مؤقت موسيقى في محرّك الصوت', a.musicTimer === null);
a.startMusic('menu'); a.startMusic('match'); a.setMusic(1);
check('startMusic لا تُنشئ أي شيء (دالة صامتة)', a.musicTimer === null && a.mood === null && !a.ctx);
a.stopMusic();
check('stopMusic آمنة بلا سياق صوت', true);

/* ============================================================
   ٥) أصوات الأسلحة الاحترافية
   ============================================================ */
console.log('\n🔫 ٥) بصمة صوتية احترافية لكل سلاح');
const { WEAPONS } = await import(pathToFileURL(path.join(PUB, 'shared', 'gamedata.js')).href);
const missing = Object.keys(WEAPONS).filter(id => !WEAPON_AUDIO_PROFILES[id]);
check('كل سلاح في اللعبة له بصمة صوتية خاصة', missing.length === 0, missing.join(','));
const fields = ['gain', 'body', 'crack', 'thump', 'dur', 'tail', 'mech', 'minGap'];
let okProfiles = true;
for (const id of Object.keys(WEAPONS)) {
  const p = a.profile(id);
  for (const f of fields) if (!Number.isFinite(p[f])) { okProfiles = false; console.log('     ⚠️', id, f, p[f]); }
}
check('كل البصمات تحتوي طبقات الصوت السبع بقيم صحيحة', okProfiles);
check('القناص أثقل وأقوى من المسدس', a.profile('awm').thump < a.profile('p92').thump && a.profile('awm').gain > a.profile('p92').gain);
check('الشوزن يطلق عدة خرطوشات في الصوت', a.profile('spas').pellets >= 6);
check('القناص ذو ترباس يدوي له صوت ترباس', a.profile('kar98').bolt > 0 && a.profile('awm').bolt > 0);
check('فاصل المنجل الدوار أسرع من القناصة', a.profile('minigun').minGap < a.profile('awm').minGap);
// الاستدعاء بلا AudioContext لا ينهار
let crashed = null;
try {
  a.shot('akm', 0, false); a.shot('awm', 1800, false); a.shot('vector', 200, true);
  a.shot('m1014', 40); a.shot('machete'); a.explosion(500); a.reload(); a.dryFire();
  a.hit(true); a.hit(false); a.crack(300); a.footstep(true); a.land(); a.athan();
  a.victory(); a.defeat(); a.vehicle(true); a.vehicle(false); a.stopAll();
} catch (e) { crashed = e; }
check('كل المؤثرات آمنة بلا جهاز صوت (لا انهيار)', !crashed, crashed?.message);

/* ---------- التقرير ---------- */
finish();
function finish() {
  console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
  process.exit(fail ? 1 : 0);
}
