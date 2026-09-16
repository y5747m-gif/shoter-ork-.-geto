/**
 * ORK ZONE — tools/preview.mjs
 * أداة معاينة: ترسم اللعبة فعلياً (نفس كود العميل) وتُنتج صور PNG للتحقق من الشكل.
 * التشغيل: node tools/preview.mjs   →  مجلد previews/
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, Path2D as NPath2D } from '@napi-rs/canvas';

register('../tests/loader-hook.mjs', import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'previews');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const W = 1280, H = 720;
/* ---------- بيئة DOM مبسطة للراسم ---------- */
const canvases = new Map();
function makeCanvas(w, h) {
  const c = createCanvas(w, h);
  c.width = w; c.height = h;
  return c;
}
globalThis.window = {
  innerWidth: W, innerHeight: H, devicePixelRatio: 1,
  addEventListener() { }, removeEventListener() { },
};
globalThis.document = {
  getElementById(id) { if (id === 'minimap') { if (!canvases.has('mini')) canvases.set('mini', makeCanvas(220, 220)); return canvases.get('mini'); } return null; },
  createElement(tag) { if (tag === 'canvas') return makeCanvas(300, 300); return {}; },
};
globalThis.HTMLCanvasElement = function () { };
globalThis.Path2D = NPath2D;
globalThis.innerWidth = W; globalThis.innerHeight = H;

const sim = await import(pathToFileURL(path.join(ROOT, 'shared', 'sim.js')).href);
const ai = await import(pathToFileURL(path.join(ROOT, 'shared', 'ai.js')).href);
const { WEAPONS, ARMORS, CHAR_NAMES } = await import(pathToFileURL(path.join(ROOT, 'shared', 'gamedata.js')).href);
const { Renderer } = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'render.js')).href);
const uiMod = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'ui.js')).href);

function simPlayerView(p) {
  const slot = sim.curSlot(p), w = sim.curW(p);
  return {
    id: p.id, n: p.name, t: p.team, x: p.x, y: p.y, a: p.aim, hp: Math.round(p.hp), sh: Math.round(p.shield),
    al: p.alive ? 1 : 0, k: p.kills, kn: p.knocked ? 1 : 0, c: p.charId, s: p.skinId,
    w: w ? w.id : null, veh: p.inVehicle, st: p.dropState, z: Math.round(p.z),
    sp: p.sprint ? 1 : 0, cr: p.crouch ? 1 : 0, pr: p.prone ? 1 : 0, ai: p.aiming ? 1 : 0,
    hl: p.healT > 0 ? 1 : 0, rl: p.reloadT > 0 ? 1 : 0, bot: p.bot ? 1 : 0, em: p.emote,
    stl: p.effects.stealth ? 1 : 0, bo: Math.round(p.boost), walking: Math.hypot(p.vx || 0, p.vy || 0) > 20,
    vestLvl: p.vest ? ARMORS[p.vest].lvl : 0, helmLvl: p.helmet ? ARMORS[p.helmet].lvl : 0,
    bagLvl: p.bag ? ARMORS[p.bag].lvl : 0, zoom: 1, fireFx: Math.max(0, (p.fireT || 0) * 3), vx: p.vx, vy: p.vy,
  };
}

/** يشغّل مباراة بالبوتات ويعيد المباراة + اللاعب المحلي + العقل */
function runMatch(mapId, seconds = 120, bots = 39, seed = 4321, localChar = 'tannin', localSkin = 'out_flame') {
  const match = sim.createMatch({ mapId, seed, mode: 'squad', teams: true });
  const brains = [];
  for (let i = 0; i < bots; i++) {
    const team = Math.floor(i / 4) + 1;
    const b = sim.addPlayer(match, { id: 'b' + i, name: (CHAR_NAMES ? '' : '') + ai_names(i), bot: true, team, charId: ['fahd', 'khaled', 'shadi', 'zaid', 'yaser', 'asad'][i % 6], skinId: ['out_shadow', 'out_urban', 'out_neon', 'out_snow', 'out_storm', 'out_blood'][i % 6] });
    b.ai = ai.makeBotBrain(['normal', 'veteran', 'pro', 'rookie'][i % 4]);
    brains.push(b);
  }
  const me = sim.addPlayer(match, { id: 'you', name: 'ملك أورك', team: 0, charId: localChar, skinId: localSkin });
  me.dropState = 'landed'; me.z = 0;
  me.weapons = [{ id: 'akm', ammo: 30, attachments: ['scope4', 'extmag'] }, { id: 'kar98', ammo: 5, attachments: ['scope8'] }];
  me.curWeapon = 0; me.vest = 'vest3'; me.helmet = 'helm3'; me.bag = 'bag3';
  me.heals = { bandage: 3, medkit: 1, energy: 2, grenade: 2, smoke: 1 };
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    const inputs = { you: { mx: 0, my: 0, aim: 0.5, shoot: false } };
    for (const b of brains) {
      if (!b.alive || b.knocked) continue;
      const inp = ai.botThink(match, b, dt);
      inputs[b.id] = inp;
      if (inp.jump) sim.dropPlayer(match, b, inp.jump.x, inp.jump.y);
      if (inp.pickup) sim.tryPickup(match, b, inp.pickup);
      if (inp.interact?.vehicle) sim.enterVehicle(match, b, inp.interact.vehicle);
    }
    sim.stepMatch(match, dt, inputs, {});
  }
  return { match, me, brains };
}
function ai_names(i) {
  const names = ['أبو الفهد', 'سيف الشرق', 'صقر الليل', 'ظل الرمال', 'بركان', 'فارس', 'النسر', 'جوكر', 'عقرب', 'تنين', 'الملك', 'شبح', 'كمين', 'زعيم', 'صخرة'];
  return names[i % names.length] + (i > 15 ? i : '');
}

function viewFor(match, me, opts = {}) {
  const loot = match.loot.filter(l => !l.taken && sim.dist(l.x, l.y, me.x, me.y) < 2200);
  return {
    world: match.world, biome: match.world.biome, loot,
    players: match.players.map(simPlayerView),
    bullets: match.bullets, grenades: match.grenades, airdrops: match.airdrops,
    vehicles: match.vehicles, zone: match.zone, plane: match.plane,
    myId: 'you', myTeam: me.team, teams: true,
    damageFlash: opts.damageFlash || 0, shotDirs: opts.shotDirs || [], smokes: opts.smokes || [],
    dropPhase: !!opts.dropPhase, weaponSkins: {}, fogOfWar: false, scope: opts.scope || 1,
    // بيانات المنظور ثلاثي الأبعاد
    firstPerson: opts.firstPerson !== undefined ? opts.firstPerson : true,
    view3d: opts.view3d || 'fps',
    camYaw: opts.yaw !== undefined ? opts.yaw : me.aim,
    camPitch: opts.pitch || 0,
    ads: !!opts.ads,
  };
}

const renderer = new Renderer(makeCanvas(W, H));
renderer.dpr = 1;
renderer.r3.dpr = 1;
renderer.setQuality('high');
/** يرسم n إطاراً حتى تستقر الكاميرا */
function render3D(view, frames = 5) {
  renderer.r3.cam.yaw = view.camYaw; renderer.r3.cam.pitch = view.camPitch;
  renderer.r3.cam.fovX = 90;
  for (let i = 0; i < frames; i++) renderer.frame(view, 1 / 60);
}

/* ---------- ١) مشاهد المعركة بمنظور الشخص الأول (٣D) ---------- */
const scenes = [
  { map: 'ork_island', seed: 111, name: '01-معركة-جزيرة-أورك' },
  { map: 'neo_city', seed: 222, name: '02-مدينة-النيون' },
  { map: 'volcano', seed: 333, name: '03-قلب-البركان' },
  { map: 'sand_storm', seed: 444, name: '04-صحراء-العواصف' },
  { map: 'snow_peak', seed: 555, name: '05-قمة-الجليد' },
];
for (const sc of scenes) {
  const { match, me } = runMatch(sc.map, 150, 39, sc.seed);
  // ضع اللاعب وسط مجموعة أعداء أحياء وانظر نحوهم
  const aliveEnemies = match.players.filter(p => p.alive && p.bot && p.team !== me.team);
  let cluster = null, bestN = 0;
  for (const e of aliveEnemies) {
    const n = aliveEnemies.filter(o => sim.dist(o.x, o.y, e.x, e.y) < 700).length;
    if (n > bestN) { bestN = n; cluster = e; }
  }
  if (cluster) {
    const ang = Math.atan2(cluster.y - me.y, cluster.x - me.x);
    me.x = cluster.x - Math.cos(ang) * 420;
    me.y = cluster.y - Math.sin(ang) * 420;
    me.aim = ang;
  }
  me.dropState = 'landed'; me.z = 0; me.vx = 120; me.vy = 0;
  // ادفع الكاميرا خارج أي جدار/شجرة حتى لا يبدأ المشهد داخل عائق
  for (let i = 0; i < 4; i++) sim.resolveCollisions(match.world, me, 16);
  // رصاص وشرارات لتزيين المشهد
  for (let i = 0; i < 5; i++) {
    match.bullets.push({ id: 'pb' + i, x: me.x + Math.cos(me.aim) * (200 + i * 90), y: me.y + Math.sin(me.aim) * (200 + i * 90), vx: 0, vy: 0, dmg: 45, owner: 'you', team: 0, weapon: 'akm', ttl: 1, silent: false, a: me.aim });
  }
  const view = viewFor(match, me, { yaw: me.aim, pitch: -0.02, firstPerson: true, view3d: 'fps' });
  renderer.setMode('fps');
  render3D(view, 6);
  fs.writeFileSync(path.join(OUT, sc.name + '.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️ ', sc.name + '.png   | أحياء:', match.aliveCount, '| أوجه مرسومة:', renderer.r3.stats.faces, '| كائنات:', renderer.r3.stats.objects);
}

/* ---------- ١ب) أشكال اللاعبين عن قرب + منظور الشخص الثالث ---------- */
{
  const { match, me } = runMatch('neo_city', 909, 24, 909);
  me.dropState = 'landed'; me.z = 0;
  me.x = 0; me.y = 0; me.aim = 0;
  // ساحة مكشوفة: عطّل العوائق القريبة (وأسقفها) حتى تظهر الأشكال بوضوح
  for (const o of match.world.obstacles) {
    if (Math.hypot(o.x, o.y) < 1100) o.destroyed = true;
  }
  match.world.decals = match.world.decals.filter(d => !(d.kind === 'building' && Math.hypot(d.x, d.y) < 1400));
  // صُفّ مقاتلين أمامنا على مسافات مختلفة لإظهار الأشكال
  const chars = ['orkking', 'tannin', 'asad', 'yaser', 'majhool', 'shadi'];
  const skins = ['out_orkking', 'out_tannin', 'out_asad', 'out_yaser', 'out_majhool', 'out_shadi'];
  for (let i = 0; i < 6; i++) {
    const b = match.players[1 + i];
    b.alive = true; b.hp = 100 - i * 7; b.charId = chars[i]; b.skinId = skins[i];
    const ang = -0.55 + i * 0.22;
    const d = 160 + (i % 3) * 130;
    b.x = Math.sin(ang) * d; b.y = -Math.cos(ang) * d;
    b.aim = Math.atan2(me.y - b.y, me.x - b.x);
    b.dropState = 'landed'; b.z = 0; b.vest = 'vest3'; b.helmet = 'helm3'; b.bag = 'bag3';
    b.vx = 40; b.vy = 0; b.walking = i % 2 === 0;
  }
  me.aim = -Math.PI / 2;   // انظر شمالاً نحو المصطَفّين
  const view = viewFor(match, me, { yaw: me.aim, pitch: -0.03, firstPerson: true, view3d: 'fps' });
  renderer.setMode('fps');
  render3D(view, 6);
  fs.writeFileSync(path.join(OUT, '06-منظور-الشخص-الأول.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️  06-منظور-الشخص-الأول.png  | أوجه:', renderer.r3.stats.faces);

  // الثالث: نرى جسم شخصيتنا كاملاً
  const view3 = viewFor(match, me, { yaw: me.aim, pitch: 0.06, firstPerson: false, view3d: 'tps' });
  renderer.setMode('tps');
  render3D(view3, 10);
  fs.writeFileSync(path.join(OUT, '07-منظور-الشخص-الثالث.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️  07-منظور-الشخص-الثالث.png');
  renderer.setMode('fps');
}

/* ---------- ٢) مشهد الهبوط بالمظلة (ثلاثي الأبعاد) ---------- */
{
  const { match, me } = runMatch('ork_island', 20, 30, 999);
  me.dropState = 'parachute'; me.z = 320; me.x = 300; me.y = -200;
  const view = viewFor(match, me, { dropPhase: true, yaw: 0.6, pitch: -0.18, firstPerson: false, view3d: 'tps' });
  renderer.setMode('tps');
  render3D(view, 10);
  fs.writeFileSync(path.join(OUT, '08-هبوط-بالمظلة.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️  08-هبوط-بالمظلة.png');
  renderer.setMode('fps');
}

/* ---------- ٣) بورتريهات الشخصيات ---------- */
{
  const chars = ['orkking', 'tannin', 'asad', 'yaser', 'majhool', 'shadi', 'khaled', 'hakim', 'rami', 'zaid', 'fahd', 'amer'];
  const skins = ['out_orkking', 'out_tannin', 'out_asad', 'out_yaser', 'out_majhool', 'out_shadi', 'out_khaled', 'out_gold', 'out_neon', 'out_storm', 'out_flame', 'out_void'];
  const cw = 220, chh = 300, cols = 6, rows = 2;
  const sheet = createCanvas(cols * cw, rows * chh);
  const ctx = sheet.getContext('2d');
  for (let i = 0; i < chars.length; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * chh;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#0b1017'; ctx.fillRect(0, 0, cw, chh);
    ctx.strokeStyle = 'rgba(255,198,61,.25)'; ctx.strokeRect(0.5, 0.5, cw - 1, chh - 1);
    uiMod.drawPortrait(ctx, cw, chh, { charId: chars[i], skinId: skins[i], weaponId: 'akm', t: 1.1, weaponTint: { tint: '#7a2b12', accent: '#ff9a3d' } });
    ctx.restore();
  }
  fs.writeFileSync(path.join(OUT, '09-شخصيات-واسكنات.png'), sheet.toBuffer('image/png'));
  console.log('🖼️  09-شخصيات-واسكنات.png (12 شخصية باسكناتها)');
}

/* ---------- ٤) أشكال الخرائط الخمس (نستخدم نفس كود الواجهة) ---------- */
{
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => { };
  const ui = new uiMod.UI({ profile: null, audio: { ui() { } } });
  const { MAPS } = await import(pathToFileURL(path.join(ROOT, 'shared', 'gamedata.js')).href);
  const dw = 430, dh = 300;
  const sheet = createCanvas(dw * 3, dh * 2 + 30);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#070d14'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  const cells = [];
  MAPS.forEach((m, i) => {
    const cv = createCanvas(220, 150);
    ui.drawMapPreview(cv, m.id);
    cells.push({ cv, m });
  });
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffc63d';
  ctx.fillText('ORK ZONE — الخرائط الخمس بأشكالها المختلفة', sheet.width / 2, 22);
  cells.forEach(({ cv, m }, i) => {
    const x = (i % 3) * dw, y = Math.floor(i / 3) * (dh + 10) + 26;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#0b1119'; ctx.fillRect(6, 0, dw - 12, dh - 30);
    ctx.strokeStyle = 'rgba(255,198,61,.4)'; ctx.lineWidth = 1; ctx.strokeRect(6.5, 0.5, dw - 13, dh - 31);
    ctx.drawImage(cv, (dw - 220 * 1.6) / 2, 6, 220 * 1.6, 150 * 1.6);
    ctx.fillStyle = '#ffc63d'; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(m.ar, dw / 2, dh - 10);
    ctx.restore();
  });
  fs.writeFileSync(path.join(OUT, '10-الخرائط-الخمس.png'), sheet.toBuffer('image/png'));
  console.log('🖼️  10-الخرائط-الخمس.png');
}
console.log('\n✅ كل الصور في:', OUT);
