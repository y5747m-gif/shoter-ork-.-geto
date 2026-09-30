#!/usr/bin/env node
/**
 * ORK ZONE — tools/review.mjs
 * ==============================================================
 * 🔍 دورة المراجعة الثلاثية
 * تفحص اللعبة ثلاث مرات كاملة للتأكد من خلوّها من الأخطاء والجلتشات:
 *
 *   المرحلة ١ — الفحص الساكن والبنية:
 *       صحة صياغة كل ملفات JS، سلامة HTML/CSS، وجود كل عنصر تستدعيه
 *       الشيفرة، عدم وجود موارد خارجية (CDN)، وخلوّ المشروع من الموسيقى.
 *
 *   المرحلة ٢ — الفحص الوظيفي:
 *       تشغيل كل مجموعات الاختبار (محاكاة، تحميل، رسم، هاتف، صلاة، عميل
 *       كامل في DOM، استضافة ثابتة) + السيرفر الأونلاين الحقيقي.
 *
 *   المرحلة ٣ — فحص الجلتشات والأداء:
 *       مباريات طويلة على كل الخرائط، محرّك الصوت تحت تشغيل فعلي، قفل
 *       الصلاة أثناء المباراة، وقياس الأداء (إطار/ثانية) وثبات الذاكرة.
 *
 * النتيجة تُكتب في REVIEW.md وتُطبع في الطرفية.
 * التشغيل: npm run review
 * ==============================================================
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const report = [];
let totalPass = 0, totalFail = 0;

function log(s = '') { console.log(s); }
function head(t) { log(`\n${C.b}${'═'.repeat(64)}\n${t}\n${'═'.repeat(64)}${C.x}`); }
function item(ok, name, extra = '') {
  if (ok) { totalPass++; log(`  ${C.g}✅${C.x} ${name}`); }
  else { totalFail++; log(`  ${C.r}❌${C.x} ${name} ${C.d}${extra}${C.x}`); }
  return ok;
}

/** تشغيل أمر وإرجاع {code, out} */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...(opts.env || {}) } });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
    p.on('error', (e) => resolve({ code: 1, out: String(e) }));
    if (opts.timeout) setTimeout(() => { try { p.kill('SIGKILL'); } catch { } }, opts.timeout);
  });
}

function walk(dir, ext, list = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p, ext, list); }
    else if (ext.some(e => f.name.endsWith(e))) list.push(p);
  }
  return list;
}

/* ==============================================================
   المرحلة ١ — الفحص الساكن والبنية
   ============================================================== */
async function stage1() {
  head('🧱 المرحلة ١ / ٣ — الفحص الساكن وبنية المشروع');
  const start = Date.now();
  const p0 = totalPass, f0 = totalFail;

  // ١-أ صحة صياغة كل ملفات JavaScript
  const jsFiles = [...walk(PUB, ['.js']), ...walk(path.join(ROOT, 'server'), ['.js']), ...walk(path.join(ROOT, 'tests'), ['.js', '.mjs']), ...walk(path.join(ROOT, 'tools'), ['.mjs'])];
  let syntaxBad = [];
  for (const f of jsFiles) {
    const r = await run(process.execPath, ['--check', f]);
    if (r.code !== 0) syntaxBad.push(path.relative(ROOT, f) + ': ' + r.out.split('\n')[2]);
  }
  item(syntaxBad.length === 0, `صياغة ${jsFiles.length} ملف JavaScript سليمة`, syntaxBad.join(' | '));

  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PUB, 'css', 'style.css'), 'utf8');

  // ١-ب كل معرّف يستدعيه الكود موجود في الصفحة
  const clientJs = walk(path.join(PUB, 'js'), ['.js']);
  // المعرّفات المتاحة = الموجودة في الصفحة + التي تبنيها الشيفرة ديناميكياً
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  for (const f of clientJs) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/id="([a-z0-9_-]+)"/gi)) ids.add(m[1]);
    for (const m of src.matchAll(/\.id\s*=\s*'([a-z0-9_-]+)'/gi)) ids.add(m[1]);
  }
  const missing = new Set();
  for (const f of clientJs) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\$\('([a-z0-9_-]+)'\)/gi)) if (!ids.has(m[1])) missing.add(path.basename(f) + '→#' + m[1]);
    for (const m of src.matchAll(/getElementById\('([a-z0-9_-]+)'\)/gi)) if (!ids.has(m[1])) missing.add(path.basename(f) + '→#' + m[1]);
  }
  item(missing.size === 0, 'كل عناصر الواجهة التي يستدعيها الكود موجودة في الصفحة', [...missing].join(', '));

  // ١-ج وسوم HTML الأساسية متوازنة
  const openDiv = (html.match(/<div[\s>]/g) || []).length, closeDiv = (html.match(/<\/div>/g) || []).length;
  item(openDiv === closeDiv, `وسوم <div> متوازنة (${openDiv}/${closeDiv})`, `${openDiv} مفتوح، ${closeDiv} مغلق`);
  const openSec = (html.match(/<section[\s>]/g) || []).length, closeSec = (html.match(/<\/section>/g) || []).length;
  item(openSec === closeSec, `وسوم <section> متوازنة (${openSec}/${closeSec})`);
  item((css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length, 'أقواس CSS متوازنة');

  // ١-د لا موارد خارجية (اللعبة تعمل بلا إنترنت)
  const ext = [];
  for (const f of [path.join(PUB, 'index.html'), path.join(PUB, 'css', 'style.css'), path.join(PUB, 'css', 'fonts.css'), ...clientJs]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(src|href)\s*=\s*["']https?:\/\/[^"']+/g)) ext.push(path.basename(f) + ': ' + m[0].slice(0, 50));
    for (const m of src.matchAll(/url\(\s*["']?https?:\/\/[^)]+/g)) ext.push(path.basename(f) + ': ' + m[0].slice(0, 50));
  }
  item(ext.length === 0, 'لا يوجد أي مورد خارجي (CDN) — اللعبة محلية ١٠٠٪', ext.join(' | '));

  // ١-هـ مسارات الاستيراد كلها موجودة
  const badImports = [];
  for (const f of [...clientJs, ...walk(path.join(PUB, 'shared'), ['.js'])]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      let target = null;
      if (spec.startsWith('/')) target = path.join(PUB, spec);
      else if (spec.startsWith('.')) target = path.join(path.dirname(f), spec);
      if (target && !fs.existsSync(target)) badImports.push(path.basename(f) + ' → ' + spec);
    }
  }
  item(badImports.length === 0, 'كل مسارات الاستيراد (import) موجودة فعلاً', badImports.join(' | '));

  // ١-و الموسيقى مُزالة نهائياً
  const musicHits = [];
  for (const f of [...clientJs, ...walk(path.join(ROOT, 'server'), ['.js']), path.join(PUB, 'index.html')]) {
    const src = fs.readFileSync(f, 'utf8');
    src.split('\n').forEach((l, i) => {
      if (/startMusic\s*\(\s*['"]|musicGain|musicTimer\s*=\s*setInterval|id="set-music"/.test(l)) {
        musicHits.push(`${path.basename(f)}:${i + 1}`);
      }
    });
  }
  item(musicHits.length === 0, '🔇 لا أثر لأي موسيقى في الكود أو الواجهة', musicHits.join(', '));

  // ١-ز ملفات الميزة الجديدة موجودة ومربوطة
  item(fs.existsSync(path.join(PUB, 'shared', 'prayertimes.js')), 'محرّك مواقيت الصلاة موجود');
  item(fs.existsSync(path.join(PUB, 'js', 'prayer.js')), 'حارس الصلاة موجود');
  item(/id="prayer-lock"/.test(html) && /prayer-yes/.test(html) && /prayer-cam/.test(html), 'طبقة قفل الصلاة والكاميرا مبنية في الصفحة');
  item(/data-nav="prayer"/.test(html), 'صفحة مواقيت الصلاة مضافة للقائمة');
  item(/PrayerGuard/.test(fs.readFileSync(path.join(PUB, 'js', 'main.js'), 'utf8')), 'الحارس مربوط بنقطة تشغيل اللعبة');
  item(/prayerFrozen/.test(fs.readFileSync(path.join(PUB, 'js', 'game.js'), 'utf8')), 'حلقة اللعب تحترم تجميد الصلاة');

  const dt = ((Date.now() - start) / 1000).toFixed(1);
  const ok = totalFail === f0;
  report.push({ stage: 'المرحلة ١ — الفحص الساكن والبنية', pass: totalPass - p0, fail: totalFail - f0, sec: dt, ok });
  log(`${ok ? C.g + '✔' : C.r + '✘'} انتهت المرحلة ١ في ${dt}ث${C.x}`);
  return ok;
}

/* ==============================================================
   المرحلة ٢ — الفحص الوظيفي (كل مجموعات الاختبار)
   ============================================================== */
async function stage2() {
  head('🎮 المرحلة ٢ / ٣ — الفحص الوظيفي الكامل');
  const start = Date.now();
  const p0 = totalPass, f0 = totalFail;

  const offline = [
    ['المحاكاة والخرائط والبوتات (smoke)', 'tests/smoke.test.js'],
    ['شاشة التحميل ومقاومة الأعطال (loading)', 'tests/loading.test.js'],
    ['الرسم ثلاثي الأبعاد (render3d)', 'tests/render3d.test.js'],
    ['اللعب على الهاتف واللمس (mobile)', 'tests/mobile.test.js'],
    ['واجهة النزول ومقاس النوافذ (drop)', 'tests/drop.test.js'],
    ['🕌 مواقيت الصلاة وحارس الصلاة (prayer)', 'tests/prayer.test.js'],
    ['الاستضافة الثابتة ومباراة كاملة (static)', 'tests/static.test.js'],
  ];
  for (const [name, file] of offline) {
    const r = await run(process.execPath, [file], { timeout: 600000 });
    const m = r.out.match(/النتيجة:\s*(\d+)\s*ناجح،\s*(\d+)\s*فاشل/) || r.out.match(/(\d+)\s*ناجح\s*·?،?\s*(\d+)\s*فاشل/);
    const detail = m ? `${m[1]} ناجح / ${m[2]} فاشل` : (r.code === 0 ? 'نجح' : 'فشل');
    if (!item(r.code === 0, `${name} — ${detail}`, r.out.split('\n').filter(l => l.includes('❌')).slice(0, 3).join(' | '))) {
      log(C.d + r.out.split('\n').slice(-18).join('\n') + C.x);
    }
  }

  // السيرفر الأونلاين الحقيقي
  const port = 3410;
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) } });
  let srvOut = '';
  srv.stdout.on('data', d => { srvOut += d; });
  srv.stderr.on('data', d => { srvOut += d; });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const res = await fetch(`http://127.0.0.1:${port}/api/rankings`); up = res.ok; } catch { }
  }
  item(up, `سيرفر اللعبة يعمل على المنفذ ${port}`, srvOut.slice(0, 160));
  if (up) {
    for (const [name, file] of [
      ['الأونلاين عبر WebSocket (online)', 'tests/online.test.js'],
      ['العميل الكامل مع سيرفر حقيقي (client)', 'tests/client.test.js'],
    ]) {
      const r = await run(process.execPath, [file], { timeout: 600000, env: { API: `http://127.0.0.1:${port}`, BASE_URL: `http://127.0.0.1:${port}` } });
      const m = r.out.match(/النتيجة:\s*(\d+)\s*ناجح،\s*(\d+)\s*فاشل/);
      const detail = m ? `${m[1]} ناجح / ${m[2]} فاشل` : (r.code === 0 ? 'نجح' : 'فشل');
      if (!item(r.code === 0, `${name} — ${detail}`, r.out.split('\n').filter(l => l.includes('❌')).slice(0, 3).join(' | '))) {
        log(C.d + r.out.split('\n').slice(-18).join('\n') + C.x);
      }
    }
  }
  try { srv.kill('SIGKILL'); } catch { }
  item(!/Error|throw|unhandled/i.test(srvOut.replace(/EADDRINUSE[\s\S]*/, '')), 'سجل السيرفر خالٍ من الأخطاء', srvOut.slice(0, 200));

  const dt = ((Date.now() - start) / 1000).toFixed(1);
  const ok = totalFail === f0;
  report.push({ stage: 'المرحلة ٢ — الفحص الوظيفي', pass: totalPass - p0, fail: totalFail - f0, sec: dt, ok });
  log(`${ok ? C.g + '✔' : C.r + '✘'} انتهت المرحلة ٢ في ${dt}ث${C.x}`);
  return ok;
}

/* ==============================================================
   المرحلة ٣ — الجلتشات والأداء
   ============================================================== */
async function stage3() {
  head('🐞 المرحلة ٣ / ٣ — صيد الجلتشات وقياس الأداء');
  const start = Date.now();
  const p0 = totalPass, f0 = totalFail;

  const r = await run(process.execPath, ['tests/glitch.test.js'], { timeout: 900000 });
  const m = r.out.match(/النتيجة:\s*(\d+)\s*ناجح،\s*(\d+)\s*فاشل/);
  if (!item(r.code === 0, `فحص الجلتشات الشامل — ${m ? m[1] + ' ناجح / ' + m[2] + ' فاشل' : (r.code === 0 ? 'نجح' : 'فشل')}`,
    r.out.split('\n').filter(l => l.includes('❌')).slice(0, 4).join(' | '))) {
    log(C.d + r.out.split('\n').slice(-20).join('\n') + C.x);
  }

  // قياس الأداء: كم إطاراً في الثانية تستطيع المحاكاة تنفيذه؟
  const sim = await import('../public/shared/sim.js');
  const ai = await import('../public/shared/ai.js');
  const match = sim.createMatch({ mapId: 'volcano_heart', seed: 777, mode: 'squad', teams: true });
  for (let i = 0; i < 40; i++) {
    const p = sim.addPlayer(match, { id: 'b' + i, name: 'بوت' + i, bot: true, charId: 'fahd', skinId: 'out_basic', team: Math.floor(i / 4) });
    p.ai = ai.makeBotBrain('pro');
    sim.dropPlayer(match, p, (Math.random() - 0.5) * 2200, (Math.random() - 0.5) * 2200);
  }
  const t0 = Date.now();
  const FRAMES = 3600;
  for (let f = 0; f < FRAMES; f++) {
    for (const p of match.players) if (p.bot && p.alive) ai.botThink(match, p, 1 / 60);
    sim.stepMatch(match, 1 / 60);
    match.events.length = 0;
  }
  const ms = Date.now() - t0;
  const perFrame = ms / FRAMES;
  item(perFrame < 6, `أداء المحاكاة: ${perFrame.toFixed(2)} مللي/إطار مع ٤٠ بوتاً (الحد ٦)`, `${ms}ms`);

  // ثبات الذاكرة
  const mem0 = process.memoryUsage().heapUsed;
  for (let f = 0; f < 1800; f++) { sim.stepMatch(match, 1 / 60); match.events.length = 0; }
  global.gc?.();
  const grow = (process.memoryUsage().heapUsed - mem0) / 1048576;
  item(grow < 60, `لا تسرّب ذاكرة واضح (+${grow.toFixed(1)} ميجابايت خلال ٣٠ ثانية لعب)`, grow.toFixed(1));

  // مقاومة المدخلات الفاسدة (جلتشات محتملة)
  let hardened = true, why = '';
  try {
    const bad = sim.createMatch({ mapId: 'لا-توجد-خريطة', seed: NaN, mode: 'وضع-غريب' });
    const p = sim.addPlayer(bad, { id: 'x', name: '', bot: false, charId: 'nope', skinId: 'nope', team: 0 });
    sim.dropPlayer(bad, p, NaN, Infinity);
    for (let i = 0; i < 300; i++) sim.stepMatch(bad, 1 / 60);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { hardened = false; why = `x=${p.x} y=${p.y}`; }
  } catch (e) { hardened = false; why = e.message; }
  item(hardened, 'مدخلات فاسدة (خريطة/إحداثيات غير صالحة) لا تكسر اللعبة', why);

  const dt = ((Date.now() - start) / 1000).toFixed(1);
  const ok = totalFail === f0;
  report.push({ stage: 'المرحلة ٣ — الجلتشات والأداء', pass: totalPass - p0, fail: totalFail - f0, sec: dt, ok });
  log(`${ok ? C.g + '✔' : C.r + '✘'} انتهت المرحلة ٣ في ${dt}ث${C.x}`);
  return ok;
}

/* ============================== التشغيل ============================== */
const started = Date.now();
log(`${C.y}🔍 دورة المراجعة الثلاثية — ORK ZONE${C.x}`);
const s1 = await stage1();
const s2 = await stage2();
const s3 = await stage3();
const mins = ((Date.now() - started) / 60000).toFixed(1);

head('📊 خلاصة المراجعة');
for (const r of report) log(`  ${r.ok ? C.g + '✅' : C.r + '❌'}${C.x} ${r.stage}: ${r.pass} ناجح، ${r.fail} فاشل (${r.sec}ث)`);
log(`\n  المجموع: ${C.g}${totalPass} ناجح${C.x} · ${totalFail ? C.r : C.g}${totalFail} فاشل${C.x} — خلال ${mins} دقيقة`);

const md = `# 🔍 تقرير دورة المراجعة الثلاثية — ORK ZONE

آخر تشغيل: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · المدة ${mins} دقيقة
الأمر: \`npm run review\`

| المرحلة | النتيجة | ناجح | فاشل | الزمن |
|---|---|---|---|---|
${report.map(r => `| ${r.stage} | ${r.ok ? '✅ سليمة' : '❌ فيها أخطاء'} | ${r.pass} | ${r.fail} | ${r.sec}ث |`).join('\n')}
| **المجموع** | ${totalFail === 0 ? '**✅ اللعبة خالية من الأخطاء المرصودة**' : '**❌ توجد أخطاء**'} | **${totalPass}** | **${totalFail}** | **${mins}د** |

## ماذا تفحص كل مرحلة؟

### المرحلة ١ — الفحص الساكن والبنية
صياغة كل ملفات JavaScript، توازن وسوم HTML وأقواس CSS، وجود كل عنصر واجهة
تستدعيه الشيفرة، خلوّ المشروع من أي مورد خارجي (CDN)، صحة كل مسارات الاستيراد،
والتأكد من إزالة الموسيقى نهائياً ومن ربط حارس الصلاة بنقطة التشغيل وحلقة اللعب.

### المرحلة ٢ — الفحص الوظيفي
تشغيل كل مجموعات الاختبار: المحاكاة والبوتات، شاشة التحميل ومقاومة الأعطال،
الرسم ثلاثي الأبعاد، اللعب باللمس على الهاتف، مواقيت الصلاة وحارس الصلاة،
الاستضافة الثابتة (مباراة كاملة من الدخول حتى الجوائز)، ثم سيرفر أونلاين حقيقي
مع عميلين عبر WebSocket.

### المرحلة ٣ — الجلتشات والأداء
مباريات طويلة على كل الخرائط والأنماط مع رصد أي NaN أو صحة خارج المدى أو تضخّم
في المصفوفات، مباراة كاملة حتى إعلان الفائز (منع المباريات الأبدية)، تشغيل محرّك
الصوت فعلياً عبر سياق صوتي وهمي للتأكد من بناء طبقات الطلقة وعدم إنتاج الموسيقى
لأي صوت، قفل الصلاة أثناء مباراة جارية ثم الاستئناف، قياس زمن الإطار، ثبات
الذاكرة، ومقاومة المدخلات الفاسدة.
`;
fs.writeFileSync(path.join(ROOT, 'REVIEW.md'), md, 'utf8');
log(`\n${C.b}📝 التقرير كُتب في REVIEW.md${C.x}\n`);
process.exit(totalFail ? 1 : 0);
