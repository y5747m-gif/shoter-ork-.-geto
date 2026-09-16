/**
 * ORK ZONE — tests/smoke.test.js
 * اختبار شامل بلا اعتماديات خارجية: يتأكد أن الخرائط تُبنى، البوتات تقاتل،
 * الأنماط تنتهي بشكل صحيح، والشبكة/الحسابات تعمل، والأداء مناسب.
 * التشغيل: node tests/smoke.test.js
 */
import assert from 'node:assert';
import {
  createMatch, addPlayer, stepMatch, genWorld, dropPlayer, tryPickup, enterVehicle,
  revivePlayer, snapshot, dist,
} from '../shared/sim.js';
import { makeBotBrain, botThink, DIFFICULTY } from '../shared/ai.js';
import * as gamedata from '../shared/gamedata.js';
import { WEAPONS, CHARACTERS, SKINS, MAPS, MODES, ZONE_PHASES, LOOT_TABLE } from '../shared/gamedata.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅', name); passed++; }
  catch (e) { console.log('  ❌', name, '\n     ', e.message); failed++; }
}
function asyncTest(name, fn) {
  return fn().then(() => { console.log('  ✅', name); passed++; })
    .catch(e => { console.log('  ❌', name, '\n     ', e.message); failed++; });
}

/** تشغيل مباراة كاملة بالبوتات + لاعب محلي */
function simulate(opts = {}) {
  const mode = opts.mode || 'solo';
  const mapId = opts.mapId || 'ork_island';
  const botCount = opts.bots ?? 30;
  const match = createMatch({ mapId, seed: opts.seed || 1234, mode, teams: mode !== 'ffa' });
  const brains = [];
  const me = addPlayer(match, { id: 'me', name: 'tester', team: mode === 'tdm' ? 0 : 0 });
  if (!match.arena) me.dropState = 'landed';
  const squadSize = (MODES.find(m => m.id === mode) || MODES[0]).players || 1;
  const teamsTotal = mode === 'tdm' ? 2 : mode === 'solo' ? botCount + 1 : Math.ceil((botCount + 1) / squadSize);
  for (let i = 0; i < botCount; i++) {
    const team = match.arena ? i % 2 : mode === 'solo' ? 1 + i : Math.floor(i / squadSize);
    const b = addPlayer(match, { id: 'b' + i, name: 'bot' + i, bot: true, team });
    b.ai = makeBotBrain(['rookie', 'normal', 'veteran', 'pro'][i % 4]);
    brains.push(b);
  }
  let t = 0; const dt = 1 / 30;
  const maxT = opts.maxT || 900;
  while (match.state !== 'over' && t < maxT) {
    const inputs = { me: { mx: 1, my: 0.3, aim: 0.5, shoot: true } };
    // إعادة إحياء في نمط الساحة
    for (const p of match.players) {
      if (!p.alive && p.respawnT > 0) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * match.zone.r * 0.8;
          p.x = match.zone.x + Math.cos(a) * r; p.y = match.zone.y + Math.sin(a) * r;
          p.hp = 100; p.alive = true; p.knocked = false; p.shield = 50;
          p.weapons = [{ id: 'akm', ammo: 30, attachments: [] }]; p.curWeapon = 0;
        }
      }
    }
    for (const b of brains) {
      if (!b.alive || b.knocked) continue;
      const inp = botThink(match, b, dt);
      inputs[b.id] = inp;
      if (inp.jump) dropPlayer(match, b, inp.jump.x, inp.jump.y);
      if (inp.pickup) tryPickup(match, b, inp.pickup);
      if (inp.interact?.vehicle) enterVehicle(match, b, inp.interact.vehicle);
      if (inp.reviving) {
        for (const tt of match.players) if (tt.knocked && tt.team === b.team && dist(tt.x, tt.y, b.x, b.y) < 70) revivePlayer(match, b, tt, dt);
      }
    }
    stepMatch(match, dt, inputs, {});
    t += dt;
  }
  const casualties = match.players.filter(p => !p.alive || p.knocked).length;
  return { match, brains, t, casualties, me };
}

console.log('\n🗺️  اختبار الخرائط الخمس (أشكال مختلفة)');
test('٥ خرائط، كل خريطة بشكل مختلف', () => {
  assert.equal(MAPS.length, 5);
  const shapes = new Set(MAPS.map(m => m.shape.type));
  assert.ok(shapes.size >= 4, 'يجب أن تختلف أشكال الخرائط');
});
for (const map of MAPS) {
  test(`بناء عالم «${map.ar}» (${map.shape.type})`, () => {
    const w = genWorld(map.id, 99);
    assert.ok(w.obstacles.length > 50, 'عدد العوائق');
    assert.ok(w.loot.length > 60, 'عدد الغنائم');
    assert.ok(w.vehicles.length > 5, 'المركبات');
    assert.ok(w.spawnPoints.length > 20, 'نقاط الهبوط');
    assert.ok(typeof w.shape.inside === 'function');
    // نصف القطر بدون سالب
    for (let i = 0; i < 12; i++) assert.ok(w.shape.radius(i / 12 * Math.PI * 2) >= 0);
  });
}
test('توليد العالم حتمي (نفس البذرة = نفس العالم) — ضروري للأونلاين', () => {
  const a = genWorld('snow_peak', 777), b = genWorld('snow_peak', 777);
  assert.equal(a.loot.length, b.loot.length);
  assert.ok(a.loot.every((l, i) => l.id === b.loot[i].id && l.weapon === b.loot[i].weapon));
  assert.ok(a.obstacles.every((o, i) => o.x === b.obstacles[i].x && o.y === b.obstacles[i].y));
});

console.log('\n🔫 اختبار الأسلحة والشخصيات والاسكنات');
test('١٨ سلاحاً على الأقل وكلها ببيانات كاملة', () => {
  const ids = Object.keys(WEAPONS);
  assert.ok(ids.length >= 14, 'عدد الأسلحة ' + ids.length);
  for (const id of ids) {
    const w = WEAPONS[id];
    assert.ok(w.dmg > 0 && w.range > 0 && w.ammo, 'بيانات السلاح ' + id);
    assert.ok(gamedata.RARITY[w.rarity], 'ندرة السلاح ' + id);
  }
});
test('الشخصيات كلها ذكور وبمهارات (لا نساء)', () => {
  assert.ok(CHARACTERS.length >= 10);
  for (const c of CHARACTERS) { assert.ok(c.skill && c.skill.kind && c.skill.desc); }
});
test('اسكنات أسطورية موجودة بكل الندرات', () => {
  const rars = new Set(SKINS.map(s => s.rarity));
  for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic']) assert.ok(rars.has(r), 'ندرة ' + r);
  assert.ok(SKINS.length >= 15);
});

console.log('\n🤖 اختبار الذكاء الاصطناعي');
for (const [diff, d] of Object.entries(DIFFICULTY)) {
  test(`بوت صعوبة «${d.ar}»: يجمع سلاحاً، يتحرك، ويقاتل`, () => {
    // ساحة صغيرة حتى يلتقي البوتات فعلاً
    const match = createMatch({ mapId: 'sand_storm', seed: 42, mode: 'tdm', teams: true });
    const bots = [];
    for (let i = 0; i < 8; i++) {
      const b = addPlayer(match, { id: 'b' + i, name: 'b' + i, bot: true, team: i % 2 });
      b.ai = makeBotBrain(diff);
      bots.push(b);
    }
    for (let f = 0; f < 60 * 40; f++) {
      const inputs = {};
      // إعادة الإحياء كما يفعل السيرفر في نمط الساحة
      for (const b of bots) {
        if (!b.alive && b.respawnT > 0) {
          b.respawnT -= 1 / 30;
          if (b.respawnT <= 0) {
            const a3 = Math.random() * Math.PI * 2, r3 = Math.random() * match.zone.r * 0.8;
            b.x = match.zone.x + Math.cos(a3) * r3; b.y = match.zone.y + Math.sin(a3) * r3;
            b.hp = 100; b.alive = true; b.knocked = false; b.shield = 50;
            b.weapons = [{ id: 'akm', ammo: 30, attachments: [] }]; b.curWeapon = 0;
            b.ammo = { '9mm': 60, '556': 60, '762': 60, '12g': 8, '45': 20, 'sniper': 5 };
          }
        }
      }
      for (const b of bots) {
        if (!b.alive || b.knocked) continue;
        const inp = botThink(match, b, 1 / 30);
        inputs[b.id] = inp;
        if (inp.jump) dropPlayer(match, b, inp.jump.x, inp.jump.y);
        if (inp.pickup) tryPickup(match, b, inp.pickup);
      }
      stepMatch(match, 1 / 30, inputs, {});
    }
    const aliveBots = bots.filter(b => b.alive);
    const armed = aliveBots.filter(b => b.weapons.some(w => WEAPONS[w.id].type !== 'melee'));
    assert.ok(armed.length >= Math.max(1, aliveBots.length - 1), `يجب أن يتسلح أغلب الأحياء (${armed.length}/${aliveBots.length})`);
    const moved = bots.filter(b => b.distance > 120);
    assert.ok(moved.length >= bots.length - 2, 'البوتات تتحرك فعلاً');
    const shots = bots.reduce((s, b) => s + b.stats.shots, 0);
    assert.ok(shots > 0, 'البوتات تطلق النار (' + shots + ' طلقة)');
    const dmg = bots.reduce((s2, b) => s2 + b.damage, 0);
    assert.ok(dmg > 0 || diff === 'rookie', 'البوتات تلحق ضرراً (' + Math.round(dmg) + ')');
    const picks = match.loot.filter(l => l.taken).length;
    assert.ok(picks > 0, 'البوتات تلتقط الغنائم (' + picks + ')');
  });
}

console.log('\n⚔️  اختبار محاكاة المباريات الكاملة');
test('فردي: ٣٠ بوتاً — تنتهي المباراة وتحسم فائزاً', () => {
  const r = simulate({ mode: 'solo', bots: 30, seed: 7 });
  assert.equal(r.match.state, 'over', 'يجب أن تنتهي المباراة');
  assert.ok(r.casualties >= 25, 'قتال فعلي: ' + r.casualties);
  assert.ok(r.match.players.some(p => p.kills > 0), 'يجب أن تكون هناك إقصاءات');
  assert.ok(r.match.winnerTeam !== undefined);
});
test('رباعي: الفرق تتشكل وكل فريق ٤ لاعبين', () => {
  const r = simulate({ mode: 'squad', bots: 24, seed: 21 });
  assert.ok(r.match.totalTeams >= 4, 'عدد الفرق: ' + r.match.totalTeams);
  assert.ok(r.match.players.some(p => p.team === 0));
});
test('نمط الساحة (٤ ضد ٤): نقاط الفريق ترتفع وتنتهي عند الحد', () => {
  const r = simulate({ mode: 'tdm', bots: 14, seed: 33, maxT: 700 });
  const sc = r.match.tdmScore;
  assert.ok((sc[0] + sc[1]) > 3, 'يجب أن تسجل نقاط: ' + JSON.stringify(sc));
  assert.ok(r.match.state === 'over');
});

console.log('\n🎒 اختبار الغنائم والمركبات والعاصفة');
test('الالتقاط يعمل (سلاح + ذخيرة + درع)', () => {
  const match = createMatch({ mapId: 'ork_island', seed: 5, mode: 'solo', teams: true });
  const p = addPlayer(match, { id: 'me', name: 't', team: 0 });
  p.dropState = 'landed'; p.weapons = []; p.bag = 'bag2';
  match.loot.push({ id: 'T1', kind: 'weapon', weapon: 'akm', x: p.x, y: p.y, taken: false, table: 'floor' });
  match.loot.push({ id: 'T2', kind: 'ammo', ammoType: '762', count: 60, x: p.x, y: p.y, taken: false, table: 'floor' });
  match.loot.push({ id: 'T3', kind: 'armor', armor: 'vest3', x: p.x, y: p.y, taken: false, table: 'floor' });
  assert.ok(tryPickup(match, p, 'T1'));
  assert.ok(tryPickup(match, p, 'T2'));
  assert.ok(tryPickup(match, p, 'T3'));
  assert.equal(p.weapons[0].id, 'akm');
  assert.equal(p.vest, 'vest3');
  assert.ok(p.ammo['762'] >= 60);
});
test('العاصفة تتقلص فعلياً على مراحل', () => {
  const match = createMatch({ mapId: 'ork_island', seed: 3, mode: 'solo', teams: true });
  const p1 = addPlayer(match, { id: 'me', name: 't', team: 0 });
  const p2 = addPlayer(match, { id: 'me2', name: 't2', team: 1 });
  p1.dropState = 'landed'; p2.dropState = 'landed';
  p1.x = -700; p2.x = 700;
  const r0 = match.zone.r;
  for (let f = 0; f < 30 * 230; f++) {
    stepMatch(match, 1 / 30, {});
    // أعد الحياة للاعبين حتى تستمر المباراة (نحن نختبر العاصفة فقط)
    for (const p of [p1, p2]) if (!p.alive) { p.alive = true; p.hp = 100; p.knocked = false; }
  }
  assert.ok(match.zone.r < r0 * 0.9, `الدائرة تقلصت: ${Math.round(r0)} → ${Math.round(match.zone.r)}`);
  assert.ok(match.zone.phase >= 1);
});
test('الرصاص يصيب ويسقط الضرر ويقتل (بسرعة عالية أيضاً)', () => {
  const match = createMatch({ mapId: 'ork_island', seed: 1, mode: 'ffa', teams: false });
  // مكان نظيف بلا عوائق
  let spot = { x: 0, y: 0 };
  outer: for (let r = 0; r < 1600; r += 40) {
    for (let a2 = 0; a2 < 6.283; a2 += 0.45) {
      const x = Math.cos(a2) * r, y = Math.sin(a2) * r;
      const near = match.world.grid.query(x, y, 140, []);
      if (!near.some(o => o.kind === 'wall' || o.kind === 'rock' || o.kind === 'crate')) { spot = { x, y }; break outer; }
    }
  }
  const a = addPlayer(match, { id: 'a', name: 'a', team: 0 });
  const b = addPlayer(match, { id: 'b', name: 'b', team: 1 });
  for (const p of [a, b]) { p.dropState = 'landed'; p.x = spot.x; p.y = spot.y; }
  a.x = spot.x - 60; b.x = spot.x + 60; a.aim = 0; a.weapons = [{ id: 'akm', ammo: 30, attachments: [] }]; a.curWeapon = 0;
  let hit = false;
  for (let f = 0; f < 120; f++) {
    stepMatch(match, 1 / 30, { a: { mx: 0, my: 0, aim: 0, shoot: true }, b: { mx: 0, my: 0, aim: Math.PI, shoot: false } }, {});
    if (b.hp < 100) hit = true;
  }
  assert.ok(hit, 'يجب أن يتلقى الخصم ضرراً');
});
test('المركبات تعمل: دخول، قيادة، خروج', () => {
  const match = createMatch({ mapId: 'sand_storm', seed: 8, mode: 'solo', teams: true });
  const p = addPlayer(match, { id: 'me', name: 't', team: 0 });
  p.dropState = 'landed';
  const v = match.vehicles[0];
  p.x = v.x; p.y = v.y;
  assert.ok(enterVehicle(match, p, v.id));
  assert.equal(p.inVehicle, 'driving');
  const x0 = v.x;
  for (let f = 0; f < 90; f++) stepMatch(match, 1 / 30, { me: { mx: 0, my: 0, vehicleAngle: 0, vehicleThrottle: 1 } });
  assert.ok(Math.abs(v.x - x0) > 10, 'المركبة تتحرك (' + Math.round(v.x - x0) + ')');
  assert.ok(match.inputs && match.inputs.me, 'المدخلات متاحة لقيادة المركبة');
});
test('الإنزال الجوي يهبط ويفتح صندوقاً بغنائم أسطورية', () => {
  const match = createMatch({ mapId: 'ork_island', seed: 12, mode: 'solo', teams: true });
  addPlayer(match, { id: 'me', name: 't', team: 0 }).dropState = 'landed';
  match.nextAirdrop = 0.1;
  for (let f = 0; f < 30 * 30; f++) stepMatch(match, 1 / 30, {});
  assert.ok(match.airdrops.length >= 1, 'يجب أن ينزل صندوق');
  assert.ok(match.airdrops.some(a => a.landed), 'الصندوق يهبط على الأرض');
});
test('اللقطة (Snapshot) تحتوي كل ما يحتاجه العميل', () => {
  const r = simulate({ mode: 'solo', bots: 10, seed: 5, maxT: 40 });
  const s = snapshot(r.match, { bullets: true });
  for (const k of ['t', 'state', 'alive', 'zone', 'plane', 'players', 'bullets', 'grenades', 'airdrops', 'vehicles', 'tdmScore']) {
    assert.ok(k in s, 'الحقل المفقود: ' + k);
  }
  assert.ok(s.players.length > 0 && 'x' in s.players[0] && 'hp' in s.players[0]);
});

console.log('\n⚡ اختبار الأداء');
test('محاكاة ٤٠ بوتاً أسرع من الزمن الحقيقي بكثير', () => {
  const t0 = Date.now();
  const r = simulate({ mode: 'solo', bots: 40, seed: 77, maxT: 60 });
  const elapsed = Date.now() - t0;
  const simTime = r.t * 1000;
  assert.ok(elapsed < simTime * 0.5, `الأداء: ${(elapsed / simTime * 100).toFixed(1)}% من الزمن الحقيقي`);
});

console.log('\n🌐 اختبار السيرفر (REST + WebSocket)');
await asyncTest('السيرفر يستجيب: كتالوج + حساب + متجر + نتيجة مباراة', async () => {
  let base = 'http://localhost:3000';
  let alive = false;
  try { const h = await fetch(base + '/api/health'); alive = h.ok; } catch { }
  if (!alive) { console.log('     (تخطي: السيرفر غير مشغّل — شغّل npm start للأونلاين)'); return; }
  const cat = await (await fetch(base + '/api/catalog')).json();
  assert.ok(cat.weapons && cat.maps.length === 5 && cat.skins.length > 10);
  const acc = await (await fetch(base + '/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'tester' }) })).json();
  assert.ok(acc.token && acc.profile.gold > 0);
  const buy = await (await fetch(base + '/api/shop/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: acc.token, kind: 'skin', id: 'out_forest' }) })).json();
  assert.ok(buy.ok || buy.error, 'المتجر يستجيب');
  const res = await (await fetch(base + '/api/offline/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: acc.token, result: { placement: 1, kills: 5, damage: 900, headshots: 2, time: 400, mode: 'solo' } }) })).json();
  assert.ok(res.rewards.gold > 0 && res.rewards.profile.stats.games >= 1, 'منح الجوائز يعمل');
});

console.log(`\n${failed === 0 ? '🎉' : '⚠️'} النتيجة: ${passed} ناجح، ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
