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
  };
}

const renderer = new Renderer(makeCanvas(W, H));
renderer.dpr = 1;

/* ---------- ١) مشاهد المعركة ---------- */
const scenes = [
  { map: 'ork_island', seed: 111, name: '01-معركة-جزيرة-أورك', zoomNearEnemies: true },
  { map: 'neo_city', seed: 222, name: '02-مدينة-النيون', zoomNearEnemies: true },
  { map: 'volcano', seed: 333, name: '03-قلب-البركان', zoomNearEnemies: true },
  { map: 'sand_storm', seed: 444, name: '04-صحراء-العواصف', zoomNearEnemies: true },
  { map: 'snow_peak', seed: 555, name: '05-قمة-الجليد', zoomNearEnemies: true },
];
for (const sc of scenes) {
  const { match, me } = runMatch(sc.map, 150, 39, sc.seed);
  // انقل الكاميرا إلى مجموعة أعداء أحياء لأفضل مشهد
  const aliveEnemies = match.players.filter(p => p.alive && p.bot && p.team !== me.team);
  let cluster = null, bestN = 0;
  for (const e of aliveEnemies) {
    const n = aliveEnemies.filter(o => sim.dist(o.x, o.y, e.x, e.y) < 700).length;
    if (n > bestN) { bestN = n; cluster = e; }
  }
  if (cluster) { me.x = cluster.x + 220; me.y = cluster.y + 160; }
  me.aim = Math.atan2(cluster ? cluster.y - me.y : 1, cluster ? cluster.x - me.x : 1);
  me.walking = true;
  // رصاص وشرارات لتزيين المشهد
  for (let i = 0; i < 6; i++) {
    match.bullets.push({ id: 'pb' + i, x: me.x + Math.cos(me.aim + i * 0.05) * (100 + i * 40), y: me.y + Math.sin(me.aim + i * 0.05) * (100 + i * 40), vx: 0, vy: 0, dmg: 45, owner: 'you', team: 0, weapon: 'akm', ttl: 1, silent: false, a: me.aim });
  }
  const view = viewFor(match, me, { scope: 1 });
  renderer.cam.x = me.x; renderer.cam.y = me.y;
  renderer.frame(view, 1 / 60);
  renderer.frame(view, 1 / 60);
  fs.writeFileSync(path.join(OUT, sc.name + '.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️ ', sc.name + '.png   | لاعبون أحياء:', match.aliveCount, '| عوائق:', match.world.obstacles.length, '| غنائم:', match.loot.length);
}

/* ---------- ٢) مشهد الهبوط بالمظلة ---------- */
{
  const { match, me } = runMatch('ork_island', 20, 30, 999);
  me.dropState = 'parachute'; me.z = 240; me.x = 300; me.y = -200;
  const view = viewFor(match, me, { dropPhase: true });
  renderer.cam.x = me.x; renderer.cam.y = me.y;
  renderer.frame(view, 1 / 60);
  fs.writeFileSync(path.join(OUT, '06-هبوط-بالمظلة.png'), renderer.cv.toBuffer('image/png'));
  console.log('🖼️  06-هبوط-بالمظلة.png');
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
  fs.writeFileSync(path.join(OUT, '07-شخصيات-واسكنات.png'), sheet.toBuffer('image/png'));
  console.log('🖼️  07-شخصيات-واسكنات.png (12 شخصية باسكناتها)');
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
  fs.writeFileSync(path.join(OUT, '08-الخرائط-الخمس.png'), sheet.toBuffer('image/png'));
  console.log('🖼️  08-الخرائط-الخمس.png');
}
console.log('\n✅ كل الصور في:', OUT);
