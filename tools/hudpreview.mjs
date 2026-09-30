/**
 * ORK ZONE — tools/hudpreview.mjs
 * يرسم لقطة حقيقية من اللعبة (٨٥٤×٤٠٠ — هاتف أفقي) مع تخطيط أزرار اللمس الجديد
 * فوقها بنفس إحداثيات CSS تماماً — للتأكد بصرياً من أن كل زر في مكانه الصحيح
 * ولا يوجد أي تداخل بين العناصر.
 * التشغيل: node tools/hudpreview.mjs   →  previews/11-تخطيط-اللمس-الأفقي.png
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, Path2D as NPath2D } from '@napi-rs/canvas';

register('../tests/loader-hook.mjs', import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'previews');

/* أبعاد هاتف أفقي نموذجي (Android متوسط) */
const W = 854, H = 400;
/* نفس حسابات clamp في style.css عند الارتفاع ٤٠٠ */
const TB = 50, TBS = 38, TBXS = 34, TBFIRE = 76, TGAP = 7.2, STICK = 120;

const canvases = new Map();
function makeCanvas(w, h) { const c = createCanvas(w, h); c.width = w; c.height = h; return c; }
globalThis.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1, addEventListener() { }, removeEventListener() { } };
globalThis.document = {
  getElementById(id) { if (id === 'minimap') { if (!canvases.has('mini')) canvases.set('mini', makeCanvas(110, 110)); return canvases.get('mini'); } return null; },
  createElement(tag) { if (tag === 'canvas') return makeCanvas(300, 300); return {}; },
};
globalThis.HTMLCanvasElement = function () { };
globalThis.Path2D = NPath2D;
globalThis.innerWidth = W; globalThis.innerHeight = H;

const sim = await import(pathToFileURL(path.join(ROOT, 'public', 'shared', 'sim.js')).href);
const ai = await import(pathToFileURL(path.join(ROOT, 'public', 'shared', 'ai.js')).href);
const { Renderer } = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'render.js')).href);

/* ---------- مباراة سريعة ---------- */
const match = sim.createMatch({ mapId: 'ork_island', seed: 777, mode: 'squad', teams: true });
const brains = [];
for (let i = 0; i < 23; i++) {
  const team = Math.floor(i / 4) + 1;
  const b = sim.addPlayer(match, { id: 'b' + i, name: 'بوت' + i, bot: true, team, charId: 'fahd', skinId: 'out_urban' });
  b.ai = ai.makeBotBrain('normal'); brains.push(b);
}
const me = sim.addPlayer(match, { id: 'you', name: 'ملك أورك', team: 0, charId: 'orkking', skinId: 'out_flame' });
me.dropState = 'landed'; me.z = 0;
me.weapons = [{ id: 'akm', ammo: 27, attachments: ['scope4', 'extmag'] }, { id: 'kar98', ammo: 5, attachments: ['scope8'] }];
me.curWeapon = 0; me.vest = 'vest3'; me.helmet = 'helm3'; me.bag = 'bag3';
me.heals = { bandage: 3, medkit: 1, energy: 2, grenade: 2, smoke: 1 };
const dt = 1 / 30;
for (let t = 0; t < 100; t += dt) {
  const inputs = { you: { mx: 0, my: 0, aim: 0.5, shoot: false } };
  for (const b of brains) {
    if (!b.alive || b.knocked) continue;
    const inp = ai.botThink(match, b, dt);
    inputs[b.id] = inp;
    if (inp.jump) sim.dropPlayer(match, b, inp.jump.x, inp.jump.y);
  }
  sim.stepMatch(match, dt, inputs, {});
}
/* ضع اللاعب قرب أعداء وانظر نحوهم */
const enemy = match.players.find(p => p.alive && p.bot) || me;
me.x = enemy.x - 420; me.y = enemy.y + 60;
const aim = Math.atan2(enemy.y - me.y, enemy.x - me.x);
me.aim = aim;

const renderer = new Renderer(makeCanvas(W, H));
renderer.dpr = 1; renderer.r3.dpr = 1;
renderer.setQuality('high');

function simPlayerView(p) {
  const w = sim.curW(p);
  return {
    id: p.id, n: p.name, t: p.team, x: p.x, y: p.y, a: p.aim, hp: Math.round(p.hp), sh: Math.round(p.shield),
    al: p.alive ? 1 : 0, k: p.kills, kn: p.knocked ? 1 : 0, c: p.charId, s: p.skinId,
    w: w ? w.id : null, veh: p.inVehicle, st: p.dropState, z: Math.round(p.z),
    sp: 0, cr: 0, pr: 0, ai: 0, hl: 0, rl: 0, bot: p.bot ? 1 : 0, em: null,
    stl: 0, bo: Math.round(p.boost), walking: Math.hypot(p.vx || 0, p.vy || 0) > 20,
    vestLvl: p.vest ? 3 : 0, helmLvl: p.helmet ? 3 : 0, bagLvl: p.bag ? 3 : 0,
    zoom: 1, fireFx: 0, vx: p.vx, vy: p.vy,
  };
}
const view = {
  world: match.world, biome: match.world.biome,
  loot: match.loot.filter(l => !l.taken && sim.dist(l.x, l.y, me.x, me.y) < 2000),
  players: match.players.map(simPlayerView),
  bullets: match.bullets, grenades: match.grenades, airdrops: match.airdrops,
  vehicles: match.vehicles, zone: match.zone, plane: match.plane,
  myId: 'you', myTeam: me.team, teams: true,
  damageFlash: 0, shotDirs: [], smokes: [], dropPhase: false, weaponSkins: {}, fogOfWar: false, scope: 1,
  firstPerson: true, view3d: 'fps', camYaw: aim, camPitch: -0.04, ads: false,
};
renderer.r3.cam.yaw = aim; renderer.r3.cam.pitch = -0.04;
for (let i = 0; i < 6; i++) renderer.frame(view, 1 / 60);

/* ---------- الآن نرسم الـ HUD اللمسي فوق اللقطة بنفس هندسة CSS ---------- */
const ctx = renderer.cv.getContext('2d');

function circleBtn(x, y, d, emoji, opt = {}) {
  ctx.save();
  ctx.globalAlpha = opt.faint ? 0.5 : 1;
  const g = ctx.createRadialGradient(x + d * .32, y + d * .3, d * .1, x + d / 2, y + d / 2, d * .62);
  g.addColorStop(0, opt.c0 || 'rgba(255,255,255,.16)');
  g.addColorStop(1, opt.c1 || 'rgba(255,255,255,.05)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, 6.283); ctx.fill();
  ctx.strokeStyle = opt.stroke || 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `${Math.round(d * 0.46)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(emoji, x + d / 2, y + d / 2 + 1);
  ctx.restore();
}
function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

/* ١) العصا العائمة أسفل اليسار (وضع الراحة) */
{
  const x = 22, y = H - 20 - STICK;
  ctx.save(); ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(255,255,255,.09)';
  ctx.beginPath(); ctx.arc(x + STICK / 2, y + STICK / 2, STICK / 2, 0, 6.283); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2.5; ctx.stroke();
  const kg = ctx.createRadialGradient(x + STICK / 2 - 12, y + STICK / 2 - 14, 6, x + STICK / 2, y + STICK / 2, 34);
  kg.addColorStop(0, '#fff6d5'); kg.addColorStop(1, '#ff8a1f');
  ctx.fillStyle = kg;
  ctx.beginPath(); ctx.arc(x + STICK / 2, y + STICK / 2, 26, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '700 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('تحرّك — تظهر مكان إبهامك', x + STICK / 2, y + STICK + 16);
  ctx.restore();
}
/* ٢) زر الرمي الإضافي — الحافة اليسرى */
circleBtn(14, H * 0.40, 52, '🔥', { faint: true, c0: 'rgba(255,110,70,.4)', c1: 'rgba(255,60,40,.14)', stroke: 'rgba(255,140,90,.4)' });
ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('رمي أيسر', 40, H * 0.40 + 62); ctx.restore();

/* ٣) عنقود القتال أسفل اليمين: reload/jump/aim فوق · prone/crouch/fire تحت */
{
  const right = 14, bottom = 14;
  const cw = TB + TGAP + TB + TGAP + TBFIRE, ch = TB + TGAP + TB;
  const x0 = W - right - cw, yRow0 = H - bottom - TGAP - TB, yRow1 = H - bottom - TB;
  const c0 = x0, c1 = x0 + TB + TGAP, c2 = x0 + TB + TGAP + TB + TGAP;
  circleBtn(c0, yRow0, TB, '🔄');
  circleBtn(c1, yRow0, TB, '🦘');
  circleBtn(c2, yRow0, TB, '🎯', { c0: 'rgba(120,200,255,.4)', c1: 'rgba(60,140,220,.2)', stroke: 'rgba(140,200,255,.5)' });
  circleBtn(c0, yRow1, TB, '🛌');
  circleBtn(c1, yRow1, TB, '🧎');
  circleBtn(c2, yRow1, TBFIRE, '🔥', { c0: 'rgba(255,110,70,.6)', c1: 'rgba(255,60,40,.25)', stroke: 'rgba(255,140,90,.6)' });
}
/* ٤) عمود الأدوات ٢×٣ على الحافة اليمنى فوق العنقود */
{
  const g = TGAP * 0.7;
  const cw = TBS * 2 + g, chh = TBS * 3 + g * 2;
  const x0 = W - 14 - cw, y0 = H - (14 + TB * 2 + TGAP + 10) - chh;
  const items = ['🎒', '💊', '💣', '✨', '🔀', '🚙'];   // RTL: الأول يمين
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 2), col = i % 2;
    const bx = x0 + (col === 0 ? TBS + g : 0);   // العمود الأول (يمين) للعناصر الفردية
    circleBtn(bx, y0 + row * (TBS + g), TBS, items[i], { faint: true });
  }
  ctx.save(); ctx.globalAlpha = .6; ctx.fillStyle = '#fff'; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('أدوات', W - 14 - (TBS * 2 + g) / 2, y0 - 8); ctx.restore();
}
/* ٥) أزرار النتائج وملء الشاشة أعلى اليسار */
circleBtn(10, 8, TBXS, '📊', { faint: true });
circleBtn(10 + TBXS + 8, 8, TBXS, '⛶', { faint: true });
/* ٦) سجل الإقصاءات تحتها */
{
  ctx.save(); ctx.globalAlpha = .85;
  const kx = 12, ky = 8 + TBXS + 14;
  const feeds = [['سيف الشرق', 'أبو الفهد'], ['ظل الرمال', 'جوكر']];
  feeds.forEach(([k, v], i) => {
    roundRect(kx, ky + i * 26, 190, 22, 6, 'rgba(0,0,0,.62)', 'rgba(255,255,255,.12)');
    ctx.fillStyle = '#ff8080'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(k + ' ☠️ ' + v, kx + 8, ky + i * 26 + 11);
  });
  ctx.restore();
}
/* ٧) الميني ماب أعلى اليمين + معلومات المباراة والكومباس أعلى الوسط */
{
  const size = 110, pad = 6;
  const bx = W - 10 - size - pad * 2, by = 10;
  roundRect(bx, by, size + pad * 2, size + pad * 2, 10, 'rgba(16,22,31,.82)', 'rgba(255,255,255,.1)');
  const mini = canvases.get('mini');
  if (mini) ctx.drawImage(mini, bx + pad, by + pad, size, size);
  roundRect(bx + (size + pad * 2) / 2 - 46, by + size + pad * 2 - 6, 92, 16, 8, 'rgba(0,0,0,.78)', 'rgba(255,198,61,.4)');
  ctx.fillStyle = '#ffc63d'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('الدائرة 2 · 24ث', bx + (size + pad * 2) / 2, by + size + pad * 2 + 2);

  const cw2 = 300;
  roundRect(W / 2 - cw2 / 2, 10, cw2, 24, 8, 'rgba(0,0,0,.5)', 'rgba(255,255,255,.12)');
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 9; i++) ctx.fillRect(W / 2 - cw2 / 2 + 14 + i * 32, 14, 1, 16);
  ctx.fillStyle = '#ffc63d'; ctx.fillRect(W / 2 - 1, 12, 2, 20);
  ctx.fillStyle = '#cfe0f0'; ctx.font = '800 10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('ش', W / 2 - 90, 26); ctx.fillText('ق', W / 2 + 90, 26);

  const iw = 340;
  roundRect(W / 2 - iw / 2, 42, iw, 26, 13, 'rgba(16,22,31,.82)', 'rgba(255,255,255,.1)');
  ctx.font = '800 12px sans-serif'; ctx.textBaseline = 'middle';
  const segs = [['👤 32', '#8fe3a4', 46], ['☠️ 4', '#ffd166', 46], ['04:12', '#fff', 56], ['58 FPS', '#9fe8a8', 62], ['فردي', '#ffc63d', 44]];
  let sx = W / 2 - iw / 2 + 16;
  for (const [txt, col, ww] of segs) {
    ctx.fillStyle = col; ctx.textAlign = 'left';
    ctx.fillText(txt, sx, 55);
    sx += ww;
  }
}
/* ٨) أشرطة الصحة/الدرع/الطاقة أسفل الوسط + الأسلحة والذخيرة تحتها */
{
  const bw = 240, bx = W / 2 - bw / 2;
  const gearY = H - 122 - 76;
  const bars = [['#41e06a', '64', 0.64], ['#3ea6ff', '42', 0.42], ['#ffd23d', '55', 0.55]];
  bars.forEach(([col, txt, k], i) => {
    const y = gearY + i * (14 + 3);
    roundRect(bx, y, bw, 14, 7, 'rgba(0,0,0,.6)', 'rgba(255,255,255,.14)');
    ctx.save(); ctx.beginPath(); roundRect(bx, y, bw * k, 14, 7, col); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, bx + bw / 2, y + 7);
  });
  ctx.font = '800 10px sans-serif'; ctx.fillStyle = '#cfd9e6'; ctx.textAlign = 'center';
  ctx.fillText('🦺3  ⛑️3  🎒3', W / 2, gearY + 3 * 17 + 10);

  /* صناديق الأسلحة */
  const wy = H - 10 - 96;
  roundRect(W / 2 - 130, wy, 118, 24, 8, 'rgba(255,198,61,.16)', 'rgba(255,198,61,.5)');
  ctx.fillStyle = '#fff'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('🔫 AKM', W / 2 - 120, wy + 12);
  roundRect(W / 2 + 12, wy, 118, 24, 8, 'rgba(0,0,0,.6)', 'rgba(255,255,255,.16)');
  ctx.fillStyle = '#9aa8ba';
  ctx.fillText('🔫 KAR98', W / 2 + 22, wy + 12);
  /* الذخيرة */
  roundRect(W / 2 - 70, wy + 32, 140, 36, 10, 'rgba(0,0,0,.6)', 'rgba(255,198,61,.35)');
  ctx.fillStyle = '#ffc63d'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('27', W / 2 - 18, wy + 50);
  ctx.fillStyle = '#9aa8ba'; ctx.font = '800 13px sans-serif';
  ctx.fillText('/ 120', W / 2 + 16, wy + 50);
  ctx.fillStyle = '#9aa8ba'; ctx.font = '800 10px sans-serif';
  ctx.fillText('AKM · 4×', W / 2 + 52, wy + 50);
  /* الأدوات */
  ctx.font = '800 10px sans-serif'; ctx.fillStyle = '#cfd9e6'; ctx.textAlign = 'center';
  ctx.fillText('💊 3 · 💉 1 · ⚡ 2 · 💣 2 · 🌫️ 1', W / 2, wy + 82);
}
/* ٩) علامة التصويب في المنتصف */
{
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
  const o = 9, l = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - o - l); ctx.lineTo(cx, cy - o);
  ctx.moveTo(cx, cy + o); ctx.lineTo(cx, cy + o + l);
  ctx.moveTo(cx - o - l, cy); ctx.lineTo(cx - o, cy);
  ctx.moveTo(cx + o, cy); ctx.lineTo(cx + o + l, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffc63d'; ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, 6.283); ctx.fill();
}
/* ١٠) تلميح منطقة النظر يمين */
ctx.save();
ctx.globalAlpha = .35; ctx.fillStyle = '#fff'; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center';
ctx.fillText('اسحب هنا للنظر ↕️↔️', W - 150, H * 0.30);
ctx.restore();

/* ---------- شريط شرح أسفل الصورة ---------- */
const FH = 92;
const full = createCanvas(W, H + FH);
const fc = full.getContext('2d');
fc.fillStyle = '#070a0f'; fc.fillRect(0, 0, W, H + FH);
fc.drawImage(renderer.cv, 0, 0, W, H);
fc.strokeStyle = 'rgba(255,198,61,.35)'; fc.lineWidth = 2;
fc.strokeRect(1, 1, W - 2, H - 2);
fc.fillStyle = '#0d1219'; fc.fillRect(0, H, W, FH);
fc.textBaseline = 'middle';
fc.fillStyle = '#ffc63d'; fc.font = '900 16px sans-serif'; fc.textAlign = 'center';
fc.fillText('أورك زون — التخطيط الأفقي الجديد (هاتف ٨٥٤×٤٠٠)', W / 2, H + 16);
fc.fillStyle = '#9aa8ba'; fc.font = '700 11px sans-serif';
fc.fillText('يسار أسفل: عصا عائمة · يمين أسفل: عنقود قتال (رمي + تصويب) · يمين فوق العنقود: أدوات ٢×٣', W / 2, H + 38);
fc.fillText('أسفل الوسط: الأسلحة والذخيرة وفوقها الصحة · أعلى اليسار: النتائج وملء الشاشة · العمودي ممنوع نهائياً', W / 2, H + 56);
fc.fillStyle = '#41e06a'; fc.font = '800 11px sans-serif';
fc.fillText('الأحجام كلها clamp/vh — تعمل من ٣٢٠ ارتفاعاً حتى التابلت · جودة تلقائية حسب الجهاز و FPS', W / 2, H + 74);

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const png = await full.encode('png');
fs.writeFileSync(path.join(OUT, '11-تخطيط-اللمس-الأفقي.png'), png);
console.log('✅ previews/11-تخطيط-اللمس-الأفقي.png (' + png.length + ' bytes)');
