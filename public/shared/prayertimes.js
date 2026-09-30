/**
 * ORK ZONE — shared/prayertimes.js
 * ==============================================================
 * حساب مواقيت الصلاة فلكياً (بدون إنترنت وبدون أي خدمة خارجية).
 * الحساب قائم على معادلات موضع الشمس (Equation of Time + الميل)
 * وهي نفس المعادلات المعتمدة في المكتبات الفلكية المعروفة.
 *
 * كل الدوال هنا «نقية» (بدون DOM) حتى يمكن اختبارها في Node مباشرة.
 * ==============================================================
 */

/* ---------- رياضيات بالدرجات ---------- */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const dsin = (d) => Math.sin(d * D2R);
const dcos = (d) => Math.cos(d * D2R);
const dtan = (d) => Math.tan(d * D2R);
const dasin = (x) => Math.asin(x) * R2D;
const dacos = (x) => Math.acos(x) * R2D;
const datan2 = (y, x) => Math.atan2(y, x) * R2D;
const darccot = (x) => Math.atan(1 / x) * R2D;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
const fixAngle = (a) => fix(a, 360);
const fixHour = (a) => fix(a, 24);

/* ---------- طرق الحساب المعتمدة ---------- */
export const METHODS = {
  makkah:  { id: 'makkah',  ar: 'أم القرى — مكة المكرمة', fajr: 18.5, isha: { minutes: 90 } },
  gulf:    { id: 'gulf',    ar: 'هيئة الخليج',            fajr: 19.5, isha: { minutes: 90 } },
  mwl:     { id: 'mwl',     ar: 'رابطة العالم الإسلامي',  fajr: 18,   isha: { angle: 17 } },
  egypt:   { id: 'egypt',   ar: 'الهيئة المصرية العامة',  fajr: 19.5, isha: { angle: 17.5 } },
  karachi: { id: 'karachi', ar: 'جامعة كراتشي',           fajr: 18,   isha: { angle: 18 } },
  isna:    { id: 'isna',    ar: 'أمريكا الشمالية ISNA',   fajr: 15,   isha: { angle: 15 } },
  tehran:  { id: 'tehran',  ar: 'جامعة طهران',            fajr: 17.7, isha: { angle: 14 } },
};

/** أسماء الصلوات بالعربية */
export const PRAYER_AR = {
  fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر',
  maghrib: 'المغرب', isha: 'العشاء',
};

/** ترتيب الصلوات في اليوم */
export const PRAYER_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** الصلوات التي يقفل عندها الحارس افتراضياً (حسب طلب اللاعب) */
export const DEFAULT_WATCHED = ['dhuhr', 'asr', 'maghrib', 'isha'];

/* ---------- مدن جاهزة (إحداثيات + الطريقة المناسبة) ---------- */
export const CITIES = [
  { id: 'makkah',    ar: 'مكة المكرمة',   lat: 21.3891, lng: 39.8579, method: 'makkah' },
  { id: 'madinah',   ar: 'المدينة المنورة', lat: 24.5247, lng: 39.5692, method: 'makkah' },
  { id: 'riyadh',    ar: 'الرياض',        lat: 24.7136, lng: 46.6753, method: 'makkah' },
  { id: 'jeddah',    ar: 'جدة',           lat: 21.4858, lng: 39.1925, method: 'makkah' },
  { id: 'dammam',    ar: 'الدمام',        lat: 26.3927, lng: 49.9777, method: 'makkah' },
  { id: 'abha',      ar: 'أبها',          lat: 18.2465, lng: 42.5117, method: 'makkah' },
  { id: 'cairo',     ar: 'القاهرة',       lat: 30.0444, lng: 31.2357, method: 'egypt' },
  { id: 'alex',      ar: 'الإسكندرية',    lat: 31.2001, lng: 29.9187, method: 'egypt' },
  { id: 'dubai',     ar: 'دبي',           lat: 25.2048, lng: 55.2708, method: 'gulf' },
  { id: 'abudhabi',  ar: 'أبوظبي',        lat: 24.4539, lng: 54.3773, method: 'gulf' },
  { id: 'doha',      ar: 'الدوحة',        lat: 25.2854, lng: 51.5310, method: 'gulf' },
  { id: 'kuwait',    ar: 'الكويت',        lat: 29.3759, lng: 47.9774, method: 'gulf' },
  { id: 'manama',    ar: 'المنامة',       lat: 26.2285, lng: 50.5860, method: 'gulf' },
  { id: 'muscat',    ar: 'مسقط',          lat: 23.5880, lng: 58.3829, method: 'gulf' },
  { id: 'sanaa',     ar: 'صنعاء',         lat: 15.3694, lng: 44.1910, method: 'mwl' },
  { id: 'amman',     ar: 'عمّان',          lat: 31.9454, lng: 35.9284, method: 'mwl' },
  { id: 'jerusalem', ar: 'القدس',         lat: 31.7683, lng: 35.2137, method: 'mwl' },
  { id: 'gaza',      ar: 'غزة',           lat: 31.5017, lng: 34.4668, method: 'mwl' },
  { id: 'beirut',    ar: 'بيروت',         lat: 33.8938, lng: 35.5018, method: 'mwl' },
  { id: 'damascus',  ar: 'دمشق',          lat: 33.5138, lng: 36.2765, method: 'mwl' },
  { id: 'baghdad',   ar: 'بغداد',         lat: 33.3152, lng: 44.3661, method: 'mwl' },
  { id: 'basra',     ar: 'البصرة',        lat: 30.5081, lng: 47.7835, method: 'mwl' },
  { id: 'khartoum',  ar: 'الخرطوم',       lat: 15.5007, lng: 32.5599, method: 'egypt' },
  { id: 'tripoli',   ar: 'طرابلس (ليبيا)', lat: 32.8872, lng: 13.1913, method: 'mwl' },
  { id: 'tunis',     ar: 'تونس',          lat: 36.8065, lng: 10.1815, method: 'mwl' },
  { id: 'algiers',   ar: 'الجزائر',       lat: 36.7538, lng: 3.0588,  method: 'mwl' },
  { id: 'oran',      ar: 'وهران',         lat: 35.6971, lng: -0.6308, method: 'mwl' },
  { id: 'rabat',     ar: 'الرباط',        lat: 34.0209, lng: -6.8416, method: 'mwl' },
  { id: 'casa',      ar: 'الدار البيضاء', lat: 33.5731, lng: -7.5898, method: 'mwl' },
  { id: 'nouakchott',ar: 'نواكشوط',       lat: 18.0735, lng: -15.9582, method: 'mwl' },
  { id: 'mogadishu', ar: 'مقديشو',        lat: 2.0469,  lng: 45.3182, method: 'mwl' },
  { id: 'istanbul',  ar: 'إسطنبول',       lat: 41.0082, lng: 28.9784, method: 'mwl' },
  { id: 'karachi',   ar: 'كراتشي',        lat: 24.8607, lng: 67.0011, method: 'karachi' },
  { id: 'jakarta',   ar: 'جاكرتا',        lat: -6.2088, lng: 106.8456, method: 'mwl' },
  { id: 'kl',        ar: 'كوالالمبور',    lat: 3.1390,  lng: 101.6869, method: 'mwl' },
  { id: 'london',    ar: 'لندن',          lat: 51.5074, lng: -0.1278, method: 'mwl' },
  { id: 'paris',     ar: 'باريس',         lat: 48.8566, lng: 2.3522,  method: 'mwl' },
  { id: 'berlin',    ar: 'برلين',         lat: 52.5200, lng: 13.4050, method: 'mwl' },
  { id: 'newyork',   ar: 'نيويورك',       lat: 40.7128, lng: -74.0060, method: 'isna' },
  { id: 'toronto',   ar: 'تورنتو',        lat: 43.6532, lng: -79.3832, method: 'isna' },
];

/* ---------- موضع الشمس ---------- */
function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = datan2(dcos(e) * dsin(L), dcos(L)) / 15;
  const eqt = q / 15 - fixHour(RA);
  const decl = dasin(dsin(e) * dsin(L));
  return { declination: decl, equation: eqt };
}

/* ---------- المحرّك ---------- */
function makeEngine(jDate, lat) {
  const midDay = (t) => fixHour(12 - sunPosition(jDate + t).equation);
  const sunAngleTime = (angle, t, ccw) => {
    const decl = sunPosition(jDate + t).declination;
    const noon = midDay(t);
    const x = (-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
    if (!(x >= -1 && x <= 1)) return NaN;          // ليل/نهار قطبي
    const v = (1 / 15) * dacos(x);
    return noon + (ccw ? -v : v);
  };
  const asrTime = (factor, t) => {
    const decl = sunPosition(jDate + t).declination;
    const angle = -darccot(factor + dtan(Math.abs(lat - decl)));
    return sunAngleTime(angle, t);
  };
  return { midDay, sunAngleTime, asrTime };
}

/**
 * احسب مواقيت اليوم.
 * @param {object} o
 * @param {Date}   o.date    تاريخ اليوم المطلوب (محلي)
 * @param {number} o.lat     خط العرض
 * @param {number} o.lng     خط الطول
 * @param {number} [o.tz]    فرق التوقيت بالساعات عن UTC (افتراضي: توقيت الجهاز)
 * @param {string} [o.method] مفتاح من METHODS
 * @param {string} [o.asr]   'shafi' (ظل ١) أو 'hanafi' (ظل ٢)
 * @param {object} [o.offsets] تعديل يدوي بالدقائق لكل صلاة
 * @returns {{fajr:number,sunrise:number,dhuhr:number,asr:number,maghrib:number,isha:number}}
 *          القيم بالدقائق من منتصف الليل المحلي.
 */
export function prayerTimes(o = {}) {
  const date = o.date instanceof Date && !isNaN(o.date) ? o.date : new Date();
  const lat = clampNum(o.lat, 21.3891, -90, 90);
  const lng = clampNum(o.lng, 39.8579, -180, 180);
  const tz = Number.isFinite(o.tz) ? o.tz : -date.getTimezoneOffset() / 60;
  const method = METHODS[o.method] || METHODS.makkah;
  const asrFactor = o.asr === 'hanafi' ? 2 : 1;

  const jDate = julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
  const eng = makeEngine(jDate, lat);

  // تقديرات أولية (بالكسر من اليوم) ثم تكرار للتقارب
  let t = { fajr: 5 / 24, sunrise: 6 / 24, dhuhr: 12 / 24, asr: 13 / 24, sunset: 18 / 24 };
  for (let i = 0; i < 3; i++) {
    const n = {};
    n.fajr = eng.sunAngleTime(method.fajr, t.fajr, true);
    n.sunrise = eng.sunAngleTime(0.833, t.sunrise, true);
    n.dhuhr = eng.midDay(t.dhuhr);
    n.asr = eng.asrTime(asrFactor, t.asr);
    n.sunset = eng.sunAngleTime(0.833, t.sunset);
    t = {
      fajr: safe(n.fajr, t.fajr * 24) / 24,
      sunrise: safe(n.sunrise, t.sunrise * 24) / 24,
      dhuhr: safe(n.dhuhr, t.dhuhr * 24) / 24,
      asr: safe(n.asr, t.asr * 24) / 24,
      sunset: safe(n.sunset, t.sunset * 24) / 24,
    };
  }

  // القيم النهائية تُحسب مباشرة (بدون قيمة احتياطية) حتى نكتشف الحالات القطبية
  let dhuhr = eng.midDay(t.dhuhr) + 1 / 60;
  let sunrise = eng.sunAngleTime(0.833, t.sunrise, true);
  let sunset = eng.sunAngleTime(0.833, t.sunset);
  let fajr = eng.sunAngleTime(method.fajr, t.fajr, true);
  let asr = eng.asrTime(asrFactor, t.asr);
  let isha;
  if (method.isha && method.isha.minutes != null) isha = NaN;   // تُحسب بعد ضبط المغرب
  else isha = eng.sunAngleTime(method.isha.angle, t.sunset);

  // خطوط العرض العالية: قاعدة «سُبع الليل» عند غياب الشفق (شمس منتصف الليل)
  if (!Number.isFinite(dhuhr)) dhuhr = 12;
  if (!Number.isFinite(sunrise)) sunrise = dhuhr - 6;
  if (!Number.isFinite(sunset)) sunset = dhuhr + 6;
  if (sunset < sunrise) sunset = sunrise + 0.5;
  const nightLen = 24 - (sunset - sunrise);
  if (method.isha && method.isha.minutes != null) isha = sunset + method.isha.minutes / 60;
  if (!Number.isFinite(fajr) || fajr >= sunrise || fajr <= sunrise - nightLen) fajr = sunrise - nightLen / 7;
  if (!Number.isFinite(isha) || isha <= sunset || isha >= sunset + nightLen) isha = sunset + nightLen / 7;
  if (!Number.isFinite(asr) || asr <= dhuhr || asr >= sunset) asr = dhuhr + (sunset - dhuhr) * 0.66;

  // التحويل للتوقيت المحلي
  const adj = tz - lng / 15;
  const out = {
    fajr: fajr + adj, sunrise: sunrise + adj, dhuhr: dhuhr + adj,
    asr: asr + adj, maghrib: sunset + adj, isha: isha + adj,
  };

  const offsets = o.offsets || {};
  const res = {};
  for (const k of PRAYER_ORDER) {
    const mins = out[k] * 60 + (Number(offsets[k]) || 0);
    res[k] = Math.round(fix(mins, 1440) * 100) / 100;
  }
  // العشاء بعد المغرب دائماً حتى لو تجاوز منتصف الليل
  if (res.isha < res.maghrib) res.isha += 1440;
  return res;
}

function safe(v, fallback) { return Number.isFinite(v) ? v : fallback; }
function clampNum(v, def, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

/** تنسيق دقائق اليوم كـ "HH:MM" بأرقام لاتينية (قابلة للقراءة في كل المتصفحات) */
export function fmtTime(mins, use12 = true) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60), mm = m % 60;
  if (!use12) return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const suffix = h < 12 ? 'ص' : 'م';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

/** دقائق اليوم من كائن Date محلي */
export function minutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** مفتاح اليوم المحلي YYYY-MM-DD */
export function dayKey(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * نوافذ الصلوات المراقَبة لليوم: لكل صلاة بداية (وقتها) ونهاية (الصلاة التالية).
 * @returns {Array<{key:string, start:number, end:number}>} بالدقائق من منتصف الليل
 */
export function prayerWindows(times, watched = DEFAULT_WATCHED) {
  const all = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const list = [];
  for (const key of all) {
    if (!watched.includes(key)) continue;
    const i = all.indexOf(key);
    let end;
    if (key === 'isha') end = times.fajr + 1440;            // العشاء ينتهي بفجر اليوم التالي
    else end = times[all[i + 1]];
    if (!(end > times[key])) end = times[key] + 90;
    list.push({ key, start: times[key], end });
  }
  return list;
}

/**
 * الصلاة المستحقة الآن (دخل وقتها ولم تُؤكَّد بعد).
 * @param {object} times   مواقيت اليوم
 * @param {number} now     الدقائق الحالية من منتصف الليل
 * @param {function} isDone (key, dayShift) => boolean
 */
export function duePrayer(times, now, isDone = () => false, watched = DEFAULT_WATCHED) {
  const wins = prayerWindows(times, watched);
  // نافذة عشاء الأمس قد تمتد لما بعد منتصف الليل
  for (const w of wins) {
    if (w.end > 1440 && now + 1440 >= w.start && now + 1440 < w.end && !isDone(w.key, -1)) {
      return { key: w.key, start: w.start - 1440, end: w.end - 1440, dayShift: -1 };
    }
  }
  for (const w of wins) {
    if (now >= w.start && now < w.end && !isDone(w.key, 0)) {
      return { key: w.key, start: w.start, end: w.end, dayShift: 0 };
    }
  }
  return null;
}

/** الصلاة القادمة (مع عدد الدقائق المتبقية) */
export function nextPrayer(times, now, watched = PRAYER_ORDER) {
  let best = null;
  for (const key of watched) {
    if (key === 'sunrise') continue;
    let at = times[key];
    if (at < now) at += 1440;
    if (!best || at < best.at) best = { key, at, in: at - now };
  }
  if (best && best.at >= 1440) best.at -= 1440;
  return best;
}

export default { prayerTimes, METHODS, CITIES, PRAYER_AR, PRAYER_ORDER, DEFAULT_WATCHED, fmtTime, dayKey, duePrayer, nextPrayer, prayerWindows, minutesOfDay };
