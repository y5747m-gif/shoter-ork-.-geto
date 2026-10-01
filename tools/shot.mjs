/**
 * ORK ZONE — tools/shot.mjs
 * لقطات مقارنة ثابتة (نفس البذرة ونفس الكاميرا في كل تشغيل) لتقييم جودة الرسم بصرياً
 * قبل/بعد أي تعديل على المحرّك ثلاثي الأبعاد.
 *
 * التشغيل:  node tools/shot.mjs [مجلد الإخراج] [الجودة]
 * مثال:     node tools/shot.mjs /tmp/after high
 */
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, Path2D as NPath2D } from '@napi-rs/canvas';

register('../tests/loader-hook.mjs', import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'previews', 'shots');
const QUALITY = process.argv[3] || 'high';
fs.mkdirSync(OUT, { recursive: true });

const W = 1280, H = 720;
const mk = (w, h) => { const c = createCanvas(w, h); c.width = w; c.height = h; return c; };
globalThis.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.document = {
  getElementById: () => null,
  createElement: (t) => (t === 'canvas' ? mk(300, 300) : {}),
};
globalThis.HTMLCanvasElement = function () {};
globalThis.Path2D = NPath2D;
globalThis.innerWidth = W; globalThis.innerHeight = H;

/* عشوائية ثابتة: نفس المشهد تماماً في كل تشغيل */
let _seed = 20260101;
Math.random = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };

const sim = await import(pathToFileURL(path.join(ROOT, 'public/shared/sim.js')).href);
const { ARMORS } = await import(pathToFileURL(path.join(ROOT, 'public/shared/gamedata.js')).href);
const { Renderer3D } = await import(pathToFileURL(path.join(ROOT, 'public/js/render3d.js')).href);

const pv = (p) => {
  const w = sim.curW(p);
  return {
    id: p.id, n: p.name, t: p.team, x: p.x, y: p.y, a: p.aim, hp: Math.round(p.hp), sh: Math.round(p.shield),
    al: p.alive ? 1 : 0, k: p.kills, kn: 0, c: p.charId, s: p.skinId, w: w ? w.id : null, veh: null,
    st: 'landed', z: 0, sp: 0, cr: p.crouch ? 1 : 0, pr: 0, ai: 0, hl: 0, rl: 0, bot: p.bot ? 1 : 0,
    walking: !!p.walking, vestLvl: p.vest ? ARMORS[p.vest].lvl : 0, helmLvl: p.helmet ? ARMORS[p.helmet].lvl : 0,
    bagLvl: p.bag ? ARMORS[p.bag].lvl : 0, zoom: 1, fireFx: 0, vx: 0, vy: 0,
  };
};

function scene(mapId, seed) {
  const match = sim.createMatch({ mapId, seed, mode: 'squad', teams: true });
  const me = sim.addPlayer(match, { id: 'you', name: 'ملك أورك', team: 0, charId: 'tannin', skinId: 'out_flame' });
  me.dropState = 'landed'; me.z = 0;
  // ابحث عن أوسع بقعة مفتوحة قرب المركز (بلا بيوت/أشجار/ماء) حتى تُظهر اللقطة العالم لا جداراً
  let spot = { x: 0, y: 0 }, bestClear = -1;
  for (let gx = -1200; gx <= 1200; gx += 100) {
    for (let gy = -1200; gy <= 1200; gy += 100) {
      const near = match.world.grid.query(gx, gy, 420, []);
      let clear = 420;
      for (const o of near) {
        const d = Math.hypot(gx - o.x, gy - o.y) - (o.r || Math.max(o.w || 0, o.h || 0) / 2);
        if (d < clear) clear = d;
      }
      const wet = (match.world.decals || []).some(d => (d.kind === 'water' || d.kind === 'lava') &&
        (d.r ? Math.hypot(gx - d.x, gy - d.y) < d.r + 300 : Math.abs(gx - d.x) < d.w / 2 + 300 && Math.abs(gy - d.y) < d.h / 2 + 300));
      if (wet) continue;
      if (clear > bestClear) { bestClear = clear; spot = { x: gx, y: gy }; }
    }
  }
  me.x = spot.x; me.y = spot.y;
  me.weapons = [{ id: 'akm', ammo: 30, attachments: [] }];
  me.curWeapon = 0; me.vest = 'vest3'; me.helmet = 'helm3'; me.bag = 'bag3';
  // ضع الزملاء أمام الكاميرا بمسافات مختلفة لتقييم نموذج اللاعب عن قرب وبعيد
  const chars = ['fahd', 'khaled', 'shadi', 'asad', 'rami', 'amer'];
  const skins = ['out_shadow', 'out_urban', 'out_neon', 'out_snow', 'out_storm', 'out_basic'];
  const mates = [];
  for (let i = 0; i < 6; i++) {
    const b = sim.addPlayer(match, { id: 'b' + i, name: 'مقاتل ' + (i + 1), bot: true, team: 1, charId: chars[i], skinId: skins[i] });
    b.dropState = 'landed'; b.z = 0;
    b.x = me.x + 150 + i * 150; b.y = me.y + (i % 2 ? 80 : -80);
    b.aim = Math.PI; b.weapons = [{ id: i % 2 ? 'm416' : 'kar98', ammo: 30, attachments: [] }]; b.curWeapon = 0;
    b.vest = i % 2 ? 'vest2' : 'vest3'; b.helmet = i % 3 ? 'helm2' : 'helm3'; b.bag = 'bag2';
    b.walking = i % 2 === 0;
    mates.push(b);
  }
  match.vehicles.length = 0;
  return { match, me, mates };
}

const view = (match, me, opts = {}) => ({
  world: match.world, biome: match.world.biome,
  loot: match.loot.filter(l => !l.taken).slice(0, 40),
  players: match.players.map(pv), bullets: [], grenades: [], airdrops: match.airdrops,
  vehicles: match.vehicles, zone: match.zone, plane: null,
  myId: 'you', myTeam: 0, teams: true, damageFlash: 0, shotDirs: [], smokes: [],
  dropPhase: false, weaponSkins: {}, fogOfWar: false, scope: 1,
  firstPerson: opts.tps ? false : true, view3d: opts.tps ? 'tps' : 'fps',
  camYaw: opts.yaw ?? 0, camPitch: opts.pitch ?? -0.04, ads: false,
});

const cv = mk(W, H);
const r = new Renderer3D(cv, null);
r.setQuality(QUALITY);
r.dpr = 1; r.w = W; r.h = H; cv.width = W; cv.height = H;
r.resize = () => {};

const shots = [
  { map: 'ork_island', seed: 111, name: 'world-island' },
  { map: 'sand_storm', seed: 444, name: 'world-desert' },
  { map: 'snow_peak', seed: 555, name: 'world-snow' },
  { map: 'neo_city', seed: 222, name: 'world-city' },
];
for (const s of shots) {
  _seed = 20260101;
  const { match, me } = scene(s.map, s.seed);
  const v = view(match, me, { yaw: 0, pitch: -0.05, tps: false });
  r.cam.x = me.x - 150; r.cam.y = me.y; r.cam.yaw = 0; r.cam.pitch = -0.05;
  for (let i = 0; i < 4; i++) r.frame(v, 1 / 60);
  fs.writeFileSync(path.join(OUT, s.name + '.png'), cv.toBuffer('image/png'));
  console.log('🖼️ ', s.name);
}
// لقطة قريبة جداً للاعبين (تقييم نموذج الشخصية)
_seed = 20260101;
const { match, me } = scene('ork_island', 111);
const v = view(match, me, { yaw: 0, pitch: -0.02, tps: true });
r.cam.x = me.x - 40; r.cam.y = me.y; r.cam.yaw = 0; r.cam.pitch = -0.02;
for (let i = 0; i < 4; i++) r.frame(v, 1 / 60);
fs.writeFileSync(path.join(OUT, 'players-close.png'), cv.toBuffer('image/png'));
console.log('🖼️  players-close');
// لقطة قريبة في وضح النهار (الصحراء) لتقييم الشخصية بالتفصيل
_seed = 20260101;
{
  const sc = scene('sand_storm', 444);
  // أزل العوائق الملاصقة للكاميرا حتى تظهر الشخصيات بوضوح في لقطة التقييم
  for (const o of (sc.match.world.obstacles || [])) {
    if (Math.hypot(o.x - sc.me.x, o.y - sc.me.y) < 520) o.destroyed = true;
  }
  for (let i = 0; i < sc.mates.length; i++) {
    const b = sc.mates[i];
    b.x = sc.me.x + 150 + (i % 3) * 170; b.y = sc.me.y + (i < 3 ? -70 : 80); b.aim = Math.PI;
  }
  const v2 = view(sc.match, sc.me, { yaw: 0, pitch: -0.06, tps: true });
  r.cam.x = sc.me.x - 120; r.cam.y = sc.me.y; r.cam.yaw = 0; r.cam.pitch = -0.06;
  for (let i = 0; i < 4; i++) r.frame(v2, 1 / 60);
  fs.writeFileSync(path.join(OUT, 'player-daylight.png'), cv.toBuffer('image/png'));
  console.log('🖼️  player-daylight');
}
console.log('✅ اللقطات في:', OUT);
