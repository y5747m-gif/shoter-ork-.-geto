/**
 * ORK ZONE — tests/browser.test.js
 * اختبار متصفح حقيقي (Puppeteer): يفتح اللعبة، يسجّل دخول، يتنقل بين الشاشات،
 * يلعب مباراة أوفلاين، ويرصد أي خطأ في الكونسول. يحفظ لقطات شاشة في tests/shots.
 * التشغيل: npm i puppeteer --no-save && node tests/browser.test.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, 'shots');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch { console.log('⚠️  puppeteer غير مثبت — npm i puppeteer --no-save'); process.exit(0); }

const errors = [];
const logs = [];
const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
page.on('console', (m) => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => { if (!r.url().includes('fonts.g')) errors.push('requestfailed: ' + r.url() + ' ' + r.failure()?.errorText); });

const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); console.log('   📸', name + '.png'); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

console.log('\n🌐 فتح اللعبة...');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await wait(3500);
await shot('01-loading');

// تسجيل دخول سريع
console.log('\n🔑 تسجيل دخول سريع');
await page.waitForSelector('#scr-auth.active', { timeout: 20000 }).catch(() => console.log('   (شاشة الدخول لم تظهر — ربما جلسة محفوظة)'));
if (await page.$('#scr-auth.active')) {
  await page.type('#guest-name', 'المحارب الأسطوري');
  await page.click('#btn-guest');
  await wait(2000);
}
const menuActive = await page.$('#scr-menu.active');
console.log('   القائمة الرئيسية:', menuActive ? '✅' : '❌');
await shot('02-menu');

// الخزنة
await page.click('[data-nav="locker"]'); await wait(1200); await shot('03-locker');
// المتجر بكل أقسامه
await page.click('[data-nav="store"]'); await wait(900); await shot('04-store-featured');
for (const tab of ['bundles', 'skins', 'weapons', 'crates', 'wheel', 'chars']) {
  const sel = `[data-store="${tab}"]`;
  if (await page.$(sel)) { await page.click(sel); await wait(700); await shot('05-store-' + tab); }
}
// باس المعركة + المهام + الترتيب
await page.click('[data-nav="bp"]'); await wait(900); await shot('06-battlepass');
await page.click('[data-nav="missions"]'); await wait(700); await shot('07-missions');
await page.click('[data-nav="rank"]'); await wait(900); await shot('08-rank');

// اختيار النمط والخريطة (أوفلاين)
console.log('\n🗺️  شاشة اختيار النمط والخريطة');
await page.click('[data-nav="home"]'); await wait(500);
await page.click('#btn-offline'); await wait(1200);
for (const m of ['sand_storm', 'snow_peak', 'neo_city', 'volcano', 'ork_island']) {
  await page.click(`[data-map="${m}"]`); await wait(400);
}
await shot('09-modes-maps');
// ابدأ مباراة أوفلاين سريعة
await page.click('[data-mode="solo"]');
await page.evaluate(() => { document.getElementById('off-bots').value = 24; document.getElementById('off-diff').value = 'normal'; });
await page.click('#btn-modes-go');
await wait(3000);
const inGame = await page.$('#hud:not(.hidden)');
console.log('   دخل المباراة:', inGame ? '✅' : '❌');
await shot('10-dropmap');

// اقفز وتحرك واقتل
console.log('\n🪂 اللعب: قفز + حركة + إطلاق نار');
await page.click('#btn-jump').catch(() => { });
await wait(6000);
await shot('11-parachute');
// انتظر الهبوط ثم العب
for (let i = 0; i < 12; i++) {
  await page.keyboard.down('KeyW');
  await page.mouse.move(900 + Math.sin(i) * 200, 400 + Math.cos(i) * 100);
  await page.mouse.down();
  await wait(700);
  await page.mouse.up();
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD');
  if (i === 4) { await page.keyboard.press('KeyF'); }        // التقاط
  if (i === 7) { await page.keyboard.press('KeyQ'); }        // مهارة
  if (i === 9) { await page.keyboard.press('KeyH'); }        // علاج
}
await shot('12-hud-gameplay');
const stats = await page.evaluate(() => {
  const s = window.ORK?.session;
  return {
    running: !!s?.running, online: !!s?.online, drop: !!s?.dropPhase,
    myHp: s?.you ? Math.round(s.you.hp) : null,
    weapons: s?.you?.weapons?.map(w => w.id),
    ammo: s?.you ? s.you.ammo : null,
    alive: s?.match?.aliveCount, kills: s?.you?.kills, time: s?.match?.time?.toFixed(1),
    lootTaken: s?.match?.loot?.filter(l => l.taken).length,
    botsWithGuns: s?.match?.players?.filter(p => p.bot && p.weapons.length > 1).length,
    camZ: s?.renderer?.cam?.z?.toFixed(2),
    errors: window.__err || 0,
  };
});
console.log('   حالة اللعب:', JSON.stringify(stats));

// لوحة النتائج
await page.keyboard.down('Tab'); await wait(600); await shot('13-scoreboard'); await page.keyboard.up('Tab');
// الميني ماب + العاصفة
await wait(4000); await shot('14-combat');

// جودة وخيارات أخرى
await page.keyboard.press('Escape'); await wait(500); await shot('15-pause');

await browser.close();
console.log('\n📊 النتيجة:');
const unique = [...new Set(errors)];
if (unique.length === 0) console.log('   ✅ لا أخطاء في الكونسول!');
else unique.slice(0, 25).forEach(e => console.log('   ❌', e));
console.log(`   عدد اللقطات: ${fs.readdirSync(SHOTS).length}`);
process.exit(unique.length ? 1 : 0);
