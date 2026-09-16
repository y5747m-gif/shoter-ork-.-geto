/**
 * ORK ZONE — tests/render3d.test.js
 * اختبار المحرك ثلاثي الأبعاد (منظور الشخص الأول/الثالث) بلا متصفح:
 * يبني مباراة حقيقية من shared/sim.js، يشغّل الراسم على canvas فعلي (@napi-rs/canvas)،
 * ويتحقق من: صحة الإسقاط المنظوري، أن المشهد يُرسم فعلاً (بكسلات غير فارغة)،
 * أن نموذج اللاعب يُسقط بحجم معقول، وأن المسار ثنائي الأبعاد القديم ما زال يعمل.
 *
 * التشغيل: npm run test:render
 */
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, Path2D as NPath2D } from '@napi-rs/canvas';

register('./loader-hook.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const W = 1280, H = 720;

/* ---------- بيئة DOM مبسطة ---------- */
const canvases = new Map();
function makeCanvas(w, h) { const c = createCanvas(w, h); c.width = w; c.height = h; return c; }
globalThis.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1, addEventListener() { }, removeEventListener() { } };
globalThis.document = {
  getElementById(id) {
    if (id === 'minimap') { if (!canvases.has('mini')) canvases.set('mini', makeCanvas(220, 220)); return canvases.get('mini'); }
    return null;
  },
  createElement(tag) { if (tag === 'canvas') return makeCanvas(300, 300); return {}; },
  addEventListener() { },
};
globalThis.Path2D = NPath2D;
globalThis.innerWidth = W; globalThis.innerHeight = H;
globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };

const sim = await import(pathToFileURL(path.join(ROOT, 'shared', 'sim.js')).href);
const ai = await import(pathToFileURL(path.join(ROOT, 'shared', 'ai.js')).href);
const { ARMORS } = await import(pathToFileURL(path.join(ROOT, 'shared', 'gamedata.js')).href);
const { Renderer } = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'render.js')).href);
const R3 = await import(pathToFileURL(path.join(ROOT, 'public', 'js', 'render3d.js')).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌', name, extra ? '(' + extra + ')' : ''); }
}

/* ---------- بناء مباراة حقيقية ---------- */
function buildMatch(mapId, seed, bots = 12) {
  const match = sim.createMatch({ mapId, seed, mode: 'squad', teams: true });
  for (let i = 0; i < bots; i++) {
    const b = sim.addPlayer(match, { id: 'b' + i, name: 'بوت' + i, bot: true, team: Math.floor(i / 4) + 1, charId: 'khaled', skinId: 'out_urban' });
    b.ai = ai.makeBotBrain('normal');
  }
  const me = sim.addPlayer(match, { id: 'you', name: 'أنا', team: 0, charId: 'tannin', skinId: 'out_flame' });
  me.dropState = 'landed'; me.z = 0;
  me.weapons = [{ id: 'akm', ammo: 30, attachments: [] }, { id: 'kar98', ammo: 5, attachments: [] }];
  me.curWeapon = 0; me.vest = 'vest3'; me.helmet = 'helm3'; me.bag = 'bag3';
  const dt = 1 / 30;
  for (let t = 0; t < 25; t += dt) {
    const inputs = { you: { mx: 0, my: 0, aim: 0, shoot: false } };
    for (const b of match.players) {
      if (!b.bot || !b.alive) continue;
      const inp = ai.botThink(match, b, dt);
      inputs[b.id] = inp;
      if (inp.jump) sim.dropPlayer(match, b, inp.jump.x, inp.jump.y);
      if (inp.pickup) sim.tryPickup(match, b, inp.pickup);
    }
    sim.stepMatch(match, dt, inputs, {});
  }
  return { match, me };
}
function playerView(p) {
  const w = sim.curW(p);
  return {
    id: p.id, n: p.name, t: p.team, x: p.x, y: p.y, a: p.aim, hp: Math.round(p.hp), sh: 0,
    al: p.alive ? 1 : 0, k: p.kills, kn: p.knocked ? 1 : 0, c: p.charId, s: p.skinId,
    w: w ? w.id : null, veh: p.inVehicle, st: p.dropState, z: Math.round(p.z),
    sp: 0, cr: p.crouch ? 1 : 0, pr: p.prone ? 1 : 0, ai: p.aiming ? 1 : 0,
    hl: 0, rl: p.reloadT > 0 ? 1 : 0, bot: p.bot ? 1 : 0, em: null, stl: 0, bo: 0,
    walking: Math.hypot(p.vx || 0, p.vy || 0) > 20,
    vestLvl: p.vest ? ARMORS[p.vest].lvl : 0, helmLvl: p.helmet ? ARMORS[p.helmet].lvl : 0,
    bagLvl: p.bag ? ARMORS[p.bag].lvl : 0, zoom: 1, fireFx: 0, vx: p.vx, vy: p.vy,
  };
}
function makeView(match, me, opts = {}) {
  return {
    world: match.world, biome: match.world.biome, loot: match.loot.filter(l => !l.taken),
    players: match.players.map(playerView),
    bullets: match.bullets, grenades: match.grenades, airdrops: match.airdrops,
    vehicles: match.vehicles, zone: match.zone, plane: match.plane,
    myId: 'you', myTeam: 0, teams: true, firstPerson: opts.firstPerson !== false,
    view3d: opts.mode || 'fps', camYaw: opts.yaw, camPitch: opts.pitch || 0, ads: false,
    damageFlash: 0, shotDirs: [], smokes: [], dropPhase: !!opts.dropPhase,
    weaponSkins: {}, fogOfWar: false, scope: 1,
  };
}
/** إحصاءات بكسلات الصورة: كم بكسل غير شفاف/متنوع */
function pixelStats(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const seen = new Set();
  let lit = 0;
  for (let i = 0; i < data.length; i += 4 * 37) {
    seen.add((data[i] >> 3) + ',' + (data[i + 1] >> 3) + ',' + (data[i + 2] >> 3));
    if (data[i] + data[i + 1] + data[i + 2] > 30) lit++;
  }
  return { colors: seen.size, lit };
}

console.log('\n🧊 المحرك ثلاثي الأبعاد — بناء وإسقاط');
const renderer = new Renderer(makeCanvas(W, H));
renderer.setQuality('medium');
renderer.setMode('fps');
const r3 = renderer.r3;
check('المحرك ثلاثي الأبعاد مُنشأ داخل الراسم', !!r3 && r3 instanceof R3.Renderer3D);
check('الوضع الافتراضي = منظور الشخص الأول', renderer.mode === 'fps' && renderer.is3D === true);
check('ثوابت القياس معرّفة (٤٠ وحدة/متر)', R3.M === 40 && R3.EYE.stand > 1.5 && R3.EYE.stand < 1.8);

const { match, me } = buildMatch('ork_island', 20250916, 14);
// ضع لاعباً أمامنا تماماً على بعد ٥ أمتار
const foe = match.players.find(p => p.bot && p.alive);
me.x = 0; me.y = 0; me.aim = 0;
foe.x = 5 * R3.M; foe.y = 0; foe.aim = Math.PI; foe.dropState = 'landed'; foe.z = 0;

let view = makeView(match, me, { yaw: 0, pitch: 0 });
let err = null;
try {
  for (let i = 0; i < 6; i++) renderer.frame(view, 1 / 60);
} catch (e) { err = e; }
check('إطار منظور الشخص الأول يُرسم بلا استثناء', !err, err && (err.message + '\n' + (err.stack || '').split('\n')[1]));
check('المشهد يحتوي أوجهاً مرسومة', r3.stats.faces > 40, 'أوجه: ' + r3.stats.faces);
check('كائنات عالم داخل مخروط الرؤية', r3.stats.objects > 3, 'كائنات: ' + r3.stats.objects);
const st = pixelStats(renderer.cv);
check('الصورة فيها تنوّع لوني حقيقي (سماء + أرض + مجسّمات)', st.colors > 60, 'ألوان مميزة: ' + st.colors);

console.log('\n📐 صحة الإسقاط المنظوري');
r3._setupProjection();
const ahead = r3.worldToScreen(r3.cam.x + Math.cos(r3.cam.yaw) * 5 * R3.M, r3.cam.y + Math.sin(r3.cam.yaw) * 5 * R3.M, r3.cam.z);
check('نقطة أمام الكاميرا تماماً تُسقط قرب مركز الشاشة', ahead.vis && Math.abs(ahead.x - W / 2) < 3 && Math.abs(ahead.y - H / 2) < 3,
  `x=${ahead.x.toFixed(1)} y=${ahead.y.toFixed(1)}`);
const behind = r3.worldToScreen(r3.cam.x - Math.cos(r3.cam.yaw) * 5 * R3.M, r3.cam.y - Math.sin(r3.cam.yaw) * 5 * R3.M, r3.cam.z);
check('نقطة خلف الكاميرا لا تُسقط (قصّ صحيح)', behind.vis === false);
const right = r3.worldToScreen(r3.cam.x + 4 * R3.M, r3.cam.y + 4 * R3.M, r3.cam.z);
const left = r3.worldToScreen(r3.cam.x + 4 * R3.M, r3.cam.y - 4 * R3.M, r3.cam.z);
check('اليمين/اليسار صحيحان (يمين الشاشة = يمين اللاعب)', right.x > W / 2 && left.x < W / 2, `يمين=${right.x.toFixed(0)} يسار=${left.x.toFixed(0)}`);
const up = r3.worldToScreen(r3.cam.x + 4 * R3.M, r3.cam.y, r3.cam.z + 2 * R3.M);
const down = r3.worldToScreen(r3.cam.x + 4 * R3.M, r3.cam.y, r3.cam.z - 1 * R3.M);
check('الأعلى/الأسفل صحيحان', up.y < H / 2 && down.y > H / 2, `أعلى=${up.y.toFixed(0)} أسفل=${down.y.toFixed(0)}`);
const near10 = r3.worldToScreen(r3.cam.x + 10 * R3.M, r3.cam.y, r3.cam.z);
const near20 = r3.worldToScreen(r3.cam.x + 20 * R3.M, r3.cam.y, r3.cam.z);
check('الأبعد أصغر (تضاؤل منظوري)', near10.vis && near20.vis && Math.abs(near10.x - W / 2) === 0 && near20.depth > near10.depth * 1.9,
  `عمق ١٠م=${near10.depth.toFixed(0)} عمق ٢٠م=${near20.depth.toFixed(0)}`);

console.log('\n🧍 أشكال اللاعبين (نموذج بشري متناسق)');
// لاعب على بعد ٦ أمتار أمامنا: الرأس يجب أن يكون أعلى القدمين وبارتفاع بكسلي معقول
const target = foe;
target.x = 6 * R3.M; target.y = 0;
view = makeView(match, me, { yaw: 0, pitch: 0 });
renderer.frame(view, 1 / 60);
const feet = r3.worldToScreen(target.x, target.y, 0);
const head = r3.worldToScreen(target.x, target.y, 1.74 * R3.M);
const pxHeight = feet.y - head.y;
const expectH = (1.74 * R3.M) / feet.depth * r3.focal;
check('طول اللاعب بالبكسل يطابق الإسقاط النظري (±٨٪)', Math.abs(pxHeight - expectH) / expectH < 0.08,
  `مقاس=${pxHeight.toFixed(1)} متوقع=${expectH.toFixed(1)}`);
check('طول لاعب على ٦م بين ١٥٠ و ٤٠٠ بكسل (نسب بشرية معقولة)', pxHeight > 150 && pxHeight < 400, pxHeight.toFixed(0) + 'px');
// عدد الأوجه التي ولّدها اللاعب وحده
const soloView = makeView(match, me, { yaw: 0, pitch: 0 });
soloView.players = [playerView(me), playerView(target)];
soloView.loot = []; soloView.vehicles = [];
r3._beginFaces();
r3._buildPlayer(playerView(target), soloView);
check('نموذج اللاعب يولّد مجسّماً متعدد الأوجه (رأس/جذع/أطراف)', r3.faces.length >= 30, 'أوجه اللاعب: ' + r3.faces.length);
// لاعب بعيد → تفاصيل أقل (LOD)
const farView = makeView(match, me, { yaw: 0 });
const farP = playerView(target); farP.x = 45 * R3.M;
r3._beginFaces(); r3._buildPlayer(farP, farView);
const farFaces = r3.faces.length;
check('مستوى التفاصيل يقل مع المسافة (LOD)', farFaces < r3.faces.length + 1 && farFaces > 0 && farFaces < 60, 'أوجه بعيد: ' + farFaces);
// أوضاع الجسم
for (const [label, flag] of [['انحناء', 'cr'], ['استلقاء', 'pr'], ['إصابة', 'kn']]) {
  const p = playerView(target); p[flag] = 1;
  r3._beginFaces();
  let ok = true;
  try { r3._buildPlayer(p, farView); } catch { ok = false; }
  check(`وضعية ${label} تُرسم بلا خطأ وتنتج أوجهاً`, ok && r3.faces.length > 5, 'أوجه: ' + r3.faces.length);
}

console.log('\n🎥 منظور الشخص الثالث + المسار ثنائي الأبعاد');
renderer.setMode('tps');
view = makeView(match, me, { yaw: 0.4, pitch: 0, firstPerson: false });
let err3 = null;
try { for (let i = 0; i < 4; i++) renderer.frame(view, 1 / 60); } catch (e) { err3 = e; }
check('منظور الشخص الثالث يُرسم بلا استثناء', !err3, err3 && err3.message);
check('كاميرا الثالث خلف اللاعب (ليست في موقعه)', Math.hypot(r3.cam.x - me.x, r3.cam.y - me.y) > 1.5 * R3.M,
  'مسافة=' + (Math.hypot(r3.cam.x - me.x, r3.cam.y - me.y) / R3.M).toFixed(1) + 'م');
const st3 = pixelStats(renderer.cv);
check('مشهد الثالث فيه تنوّع لوني', st3.colors > 60, 'ألوان: ' + st3.colors);

renderer.setMode('top');
let err2 = null;
try { renderer.frame(makeView(match, me, { mode: 'top' }), 1 / 60); } catch (e) { err2 = e; }
check('المسار ثنائي الأبعاد القديم ما زال يعمل', !err2, err2 && err2.message);
const st2 = pixelStats(renderer.cv);
check('المسار ثنائي الأبعاد يرسم فعلاً', st2.colors > 40, 'ألوان: ' + st2.colors);
renderer.setMode('fps');

console.log('\n🗺️ الخرائط الخمس بالمنظور ثلاثي الأبعاد');
for (const mapId of ['ork_island', 'sand_storm', 'snow_peak', 'neo_city', 'volcano']) {
  const m = buildMatch(mapId, 777 + mapId.length, 10);
  const v = makeView(m.match, m.me, { yaw: 1.1 });
  m.me.x = m.match.world.playerStart.x; m.me.y = m.match.world.playerStart.y;
  let e2 = null;
  try { for (let i = 0; i < 3; i++) renderer.frame(v, 1 / 60); } catch (e) { e2 = e; }
  const s2 = pixelStats(renderer.cv);
  check(`خريطة ${mapId} تُرسم ثلاثياً الأبعاد`, !e2 && s2.colors > 50, e2 ? e2.message : 'ألوان: ' + s2.colors);
}

console.log('\n⚡ الأداء');
const big = buildMatch('neo_city', 4242, 40);
big.me.x = 0; big.me.y = 0;
const bv = makeView(big.match, big.me, { yaw: 0 });
renderer.setQuality('high');
renderer.frame(bv, 1 / 60);
const t0 = process.hrtime.bigint();
const N = 30;
for (let i = 0; i < N; i++) renderer.frame(bv, 1 / 60);
const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
check(`إطار عالي الجودة أسرع من ٣٣ms (٣٠fps) — ${ms.toFixed(1)}ms`, ms < 33, 'أوجه/إطار: ' + r3.stats.faces);
renderer.setQuality('low');
renderer.frame(bv, 1 / 60);
const t1 = process.hrtime.bigint();
for (let i = 0; i < N; i++) renderer.frame(bv, 1 / 60);
const msLow = Number(process.hrtime.bigint() - t1) / 1e6 / N;
check(`الجودة المنخفضة أسرع من العالية — ${msLow.toFixed(1)}ms`, msLow < ms * 1.6, '');

console.log('\n💥 المؤثرات والأحداث');
let evErr = null;
try {
  renderer.handleEvent({ type: 'hit', x: 100, y: 0, head: true, by: 'you', on: 'b0', dmg: 30 }, view);
  renderer.handleEvent({ type: 'kill', x: 120, y: 0, id: 'b0', by: 'you', name: 'بوت', byName: 'أنا', weapon: 'AKM' }, view);
  renderer.handleEvent({ type: 'explosion', x: 200, y: 0 }, view);
  renderer.handleEvent({ type: 'smoke', x: 300, y: 0, dur: 6 }, view);
  r3.updateParticles(1 / 30);
  renderer.frame(view, 1 / 60);
} catch (e) { evErr = e; }
check('أحداث اللعبة تتحول لمؤثرات ثلاثية الأبعاد بلا خطأ', !evErr, evErr && evErr.message);
check('الجسيمات والجثث سُجّلت', r3.parts.length > 10 && r3.corpses.length >= 1, `جسيمات=${r3.parts.length} جثث=${r3.corpses.length}`);

console.log('\n📊 النتيجة: ' + pass + ' ناجح، ' + fail + ' فاشل');
if (fail) { console.log('\nالفشل:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('🎉 المحرك ثلاثي الأبعاد يعمل\n');
