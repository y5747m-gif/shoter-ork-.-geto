/**
 * ORK ZONE — shared/ai.js
 * ذكاء اصطناعي للبوتات: هبوط، جمع غنائم، قتال، علاج، إحياء الزملاء، استخدام المركبات والعاصفة.
 * يُستخدم في السيرفر (أونلاين) وفي المتصفح (أوفلاين).
 */
import { WEAPONS, HEALS } from './gamedata.js';
import {
  dist, clamp, curSlot, curW, lineBlocked, spreadOf, inWater, lerpAngle,
} from './sim.js';

export const DIFFICULTY = {
  rookie:  { ar: 'مبتدئ',   react: 1.15, aimErr: 0.46, viewDist: 540,  aggression: 0.35, lootSkill: 0.5, healAt: 45, useSkill: 0.35, speedPref: 0.9,  burstMiss: 0.42 },
  normal:  { ar: 'عادي',    react: 0.80, aimErr: 0.30, viewDist: 700,  aggression: 0.5,  lootSkill: 0.7, healAt: 55, useSkill: 0.55, speedPref: 1,    burstMiss: 0.3 },
  veteran: { ar: 'محترف',   react: 0.48, aimErr: 0.18, viewDist: 880,  aggression: 0.68, lootSkill: 0.85,healAt: 65, useSkill: 0.75, speedPref: 1.05, burstMiss: 0.2 },
  pro:     { ar: 'أسطوري',  react: 0.30, aimErr: 0.09, viewDist: 1080, aggression: 0.85, lootSkill: 1,   healAt: 75, useSkill: 0.95, speedPref: 1.1,  burstMiss: 0.12 },
};

export function makeBotBrain(difficulty = 'normal') {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  return {
    diff: difficulty, d,
    target: null, targetT: 0, reactT: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
    goal: 'loot', goalT: 0, dest: { x: 0, y: 0 }, wanderT: 0, lastSeen: null, lastSeenT: 0,
    skillT: Math.random() * 10, emoteT: Math.random() * 60, jumpChosen: false, dropPoint: null,
    vehicleTarget: null, panicT: 0, healCooldown: 0, voiceT: Math.random() * 30,
  };
}

const HEAL_ORDER = ['medkit', 'bandage', 'energy'];

function hasUsableWeapon(p) {
  const slot = curSlot(p);
  return !!(slot && WEAPONS[slot.id] && WEAPONS[slot.id].type !== 'melee');
}
function ammoOf(p) {
  const slot = curSlot(p); if (!slot) return 0;
  const w = WEAPONS[slot.id]; if (w.type === 'melee') return 0;
  return (p.ammo[w.ammo] || 0) + slot.ammo;
}
function threatScore(p, e, d) {
  let s = 1;
  if (e.hp < 45) s += 0.5;
  if (!hasUsableWeapon(p)) s -= 0.6;
  if (p.hp < 40) s -= 0.5;
  if (d < 300) s += 0.3;
  return s;
}

function brainstormHeal(input, bot) {
  if (bot.healT > 0) return false;
  const pickIt = bot.heals.medkit > 0 ? 'medkit' : bot.heals.bandage > 0 ? 'bandage' : bot.heals.energy > 0 ? 'energy' : null;
  if (!pickIt) return false;
  input.heal = pickIt; input.shoot = false; input.mx = 0; input.my = 0;
  return true;
}

export function botThink(match, bot, dt) {
  const brain = bot.ai || (bot.ai = makeBotBrain());
  const d = brain.d, world = match.world;
  const input = {
    mx: 0, my: 0, aim: bot.aim, shoot: false, reload: false, heal: null, aiming: false,
    sprint: false, pickup: null, interact: null, skill: false, swap: null,
    vehicleAngle: bot.aim, vehicleThrottle: 0, reviving: false, grenade: false,
  };
  if (!bot.alive) return input;
  brain.skillT += dt; brain.healCooldown = Math.max(0, brain.healCooldown - dt);

  /* ---- أثناء الطيران ---- */
  if (bot.dropState === 'plane' || bot.dropState === 'wait') {
    if (!brain.jumpChosen) {
      const r = Math.random();
      const loot = match.world.loot;
      let pt;
      if (r < 0.35 && match.world.hotDrops.length) {
        const hd = match.world.hotDrops[Math.floor(Math.random() * match.world.hotDrops.length)];
        pt = { x: hd.x, y: hd.y };
      } else if (r < 0.7 && loot.length) {
        const l = loot[Math.floor(Math.random() * loot.length)];
        pt = { x: l.x, y: l.y };
      } else pt = match.world.spawnPoints[Math.floor(Math.random() * match.world.spawnPoints.length)];
      const jitter = 220 * (1.2 - d.lootSkill);
      brain.dropPoint = { x: pt.x + (Math.random() - 0.5) * jitter, y: pt.y + (Math.random() - 0.5) * jitter };
      brain.jumpChosen = true;
      // يقفز عندما تمر الطائرة قريباً من نقطته
      const dp = dist(match.plane.x, match.plane.y, brain.dropPoint.x, brain.dropPoint.y);
      const ahead = dist(match.plane.x, match.plane.y, match.plane.bx, match.plane.by);
      if (dp < 260 + (1 - d.lootSkill) * 500 || ahead < 60 || match.plane.t > 0.95) {
        return { ...input, jump: { x: brain.dropPoint.x, y: brain.dropPoint.y } };
      }
    }
    return input;
  }
  if (bot.dropState === 'freefall' || bot.dropState === 'parachute') {
    const t = brain.dropPoint || { x: bot.x, y: bot.y };
    const a = Math.atan2(t.y - bot.y, t.x - bot.x);
    const dd = dist(t.x, t.y, bot.x, bot.y);
    input.mx = dd > 30 ? Math.cos(a) : 0; input.my = dd > 30 ? Math.sin(a) : 0;
    input.aim = a;
    return input;
  }
  if (bot.knocked) return input;

  /* ---- اختيار الهدف (مع تخزين مؤقت للأداء) ---- */
  brain.detectT = (brain.detectT || 0) - dt;
  if (brain.detectT <= 0) {
    brain.detectT = 0.16 + Math.random() * 0.14;
    const canSee = (e) => {
      const dd = dist(bot.x, bot.y, e.x, e.y);
      if (dd > d.viewDist) return false;
      if (e.effects && e.effects.stealth) return false;
      if (dd < 110) return true;          // قريب جداً: يُرى دائماً
      return !lineBlocked(world, bot.x, bot.y, e.x, e.y);
    };
    const vis = [];
    for (const e of match.players) {
      if (e === bot || !e.alive || e.knocked) continue;
      if (match.teams && match.mode !== 'ffa' && e.team === bot.team) continue;
      if (canSee(e)) vis.push(e);
    }
    brain.visible = vis;
  }
  let enemy = null, enemyD = 1e9;
  for (const e of (brain.visible || [])) {
    if (!e.alive || e.knocked) continue;
    const dd = dist(bot.x, bot.y, e.x, e.y);
    if (dd < enemyD) { enemyD = dd; enemy = e; }
  }
  // زميل مصاب (أولوية عالية)
  let downedMate = null, mateD = 1e9;
  for (const m of match.players) {
    if (m === bot || !m.alive || !m.knocked) continue;
    if (!match.teams || m.team !== bot.team) continue;
    const dd = dist(bot.x, bot.y, m.x, m.y);
    if (dd < 900 && dd < mateD) { mateD = dd; downedMate = m; }
  }

  // بوت بلا سلاح ناري: يفضل البحث عن سلاح على الاندفاع للقتال
  if (enemy && !hasUsableWeapon(bot) && enemyD > 160) enemy = null;

  const zone = match.zone;
  const zd = dist(bot.x, bot.y, zone.x, zone.y);
  const outside = zd > zone.r - 60;
  const farFromZone = zd > zone.r * 1.35;

  /* ---- قتال ---- */
  if (enemy) {
    brain.lastSeen = { x: enemy.x, y: enemy.y }; brain.lastSeenT = 0;
    const w = curW(bot);
    const dd = enemyD;
    const effRange = w ? (w.type === 'shotgun' ? 260 : w.type === 'sniper' || w.type === 'dmr' ? 900 : w.type === 'pistol' ? 300 : 520) : 60;
    const wantDist = w ? (w.type === 'shotgun' ? 130 : w.type === 'sniper' ? 560 : 320) : 200;
    // التنقل
    const a = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);
    brain.strafeT -= dt;
    if (brain.strafeT <= 0) { brain.strafe = -brain.strafe; brain.strafeT = 0.6 + Math.random() * 1.1; }
    let mx = 0, my = 0;
    if (dd > wantDist * 1.25) { mx = Math.cos(a); my = Math.sin(a); }
    else if (dd < wantDist * 0.6) { mx = -Math.cos(a); my = -Math.sin(a); }
    mx += Math.cos(a + Math.PI / 2) * brain.strafe * 0.9;
    my += Math.sin(a + Math.PI / 2) * brain.strafe * 0.9;
    input.mx = mx; input.my = my;
    // التصويب مع تفويت
    const lead = w && w.speed ? dd / w.speed : 0;
    const px = enemy.x + enemy.vx * lead, py = enemy.y + enemy.vy * lead;
    const aimA = Math.atan2(py - bot.y, px - bot.x);
    const err = d.aimErr * (1 + dd / 1200) * (enemy.inVehicle ? 2 : 1);
    const jitter = Math.sin(match.time * 2.3 + brain.strafe * 3) * err * 0.4;
    input.aim = aimA + (Math.random() - 0.5) * err + jitter;
    input.aiming = dd > 220 && bot.char.skill.kind !== 'speed';
    // رد فعل
    if (brain.reactT <= 0) brain.reactT = d.react * (0.7 + Math.random() * 0.6);
    brain.reactT -= dt;
    const confident = threatScore(bot, enemy, dd) > 0.35;
    if (brain.reactT <= 0 && dd < effRange * 1.15 && confident && hasUsableWeapon(bot) && bot.healT <= 0) {
      const wpn = curW(bot);
      const slot = curSlot(bot);
      if (slot && slot.ammo > 0) input.shoot = true;
      else input.reload = true;
      // رشقات للبندقيات
      if (wpn && wpn.type === 'shotgun' && dd > 260) input.shoot = false;
    }
    if (hasUsableWeapon(bot) && curSlot(bot) && curSlot(bot).ammo <= 0) input.reload = true;
    // مهارة
    if (brain.skillT > 8 && Math.random() < d.useSkill * dt * 2) { brain.skillT = 0; input.skill = true; }
    // هروب وعلاج عند انخفاض الصحة
    if (bot.hp < 35 && (bot.heals.medkit > 0 || bot.heals.bandage > 0)) {
      const fleeA = Math.atan2(bot.y - enemy.y, bot.x - enemy.x);
      input.mx = Math.cos(fleeA); input.my = Math.sin(fleeA); input.sprint = true;
      input.shoot = false;
      if (bot.hp < 25 && brainstormHeal(input, bot)) { }
    }
    // قنبلة
    if (bot.heals.grenade > 0 && dd > 260 && dd < 460 && Math.random() < 0.02 && lineBlocked(world, bot.x, bot.y, enemy.x, enemy.y)) {
      input.grenade = true; input.shoot = true;
    }
  } else {
    /* ---- بدون عدو ---- */
    brain.reactT = 0;
    let target = null;
    // في نمط الساحة: ابحث عن أقرب عدو حتى لو لم تره (بشرط أن يكون مسلحاً)
    if (match.arena && hasUsableWeapon(bot)) {
      let nearest = null, nd = 1e9;
      for (const e of match.players) {
        if (e === bot || !e.alive || e.knocked) continue;
        if (match.teams && e.team === bot.team) continue;
        const dd = dist(bot.x, bot.y, e.x, e.y);
        if (dd < nd) { nd = dd; nearest = e; }
      }
      if (nearest) { target = { x: nearest.x, y: nearest.y }; brain.goal = 'hunt'; }
    }
    // التحقيق في أصوات الطلقات (باتل رويال)
    if (!target && match.shots && match.shots.length) {
      let bestS = null, bd2 = 1e9;
      for (const s2 of match.shots) {
        if (s2.by === bot.id || (match.teams && s2.team === bot.team)) continue;
        if (match.time - s2.t > 7) continue;
        const dd = dist(bot.x, bot.y, s2.x, s2.y);
        if (dd < 1000 && dd < bd2) { bd2 = dd; bestS = s2; }
      }
      if (bestS) { target = { x: bestS.x, y: bestS.y }; brain.goal = 'investigate'; }
    }
    // إحياء زميل
    if (downedMate) {
      if (mateD < 70) { input.reviving = true; input.mx = 0; input.my = 0; }
      else { target = { x: downedMate.x, y: downedMate.y }; input.sprint = true; }
      brain.goal = 'revive';
    }
    // علاج
    const needHeal = bot.hp < d.healAt && !bot.healT && brain.healCooldown <= 0;
    if (!target && needHeal) {
      for (const h of HEAL_ORDER) {
        if ((bot.heals[h] || 0) > 0) { input.heal = h; brain.healCooldown = HEALS[h].time + 1; break; }
      }
      if (input.heal) { brain.goal = 'heal'; }
    }
    // دخول العاصفة
    if (outside) {
      const a = Math.atan2(zone.y - bot.y, zone.x - bot.x);
      target = { x: bot.x + Math.cos(a) * 400, y: bot.y + Math.sin(a) * 400 };
      brain.goal = 'run';
    }
    // جمع الغنائم
    if (!target) {
      const wantWeapon = !hasUsableWeapon(bot);
      const wantAmmo = ammoOf(bot) < 40;
      const wantHeal = bot.heals.bandage + bot.heals.medkit < 2;
      const wantArmor = !bot.vest || !bot.helmet || !bot.bag;
      let best = null, bd = 1e9;
      if (wantWeapon || wantAmmo || wantHeal || wantArmor) {
        for (const l of match.loot) {
          if (l.taken) continue;
          if (l.kind === 'weapon' && !wantWeapon && Math.random() > 0.15) continue;
          if (l.kind === 'ammo' && !wantAmmo) continue;
          if (l.kind === 'heal' && !wantHeal) continue;
          if (l.kind === 'armor' && !wantArmor) continue;
          const dd = dist(bot.x, bot.y, l.x, l.y);
          if (dd < bd && dd < 900 && zone.insideLoot !== false) {
            // لا يجمع خارج الدائرة الآمنة كثيراً
            if (dist(l.x, l.y, zone.x, zone.y) > zone.r * 1.1 && !wantWeapon) continue;
            bd = dd; best = l;
          }
        }
      }
      if (best) {
        brain.goal = 'loot'; brain.dest = { x: best.x, y: best.y }; target = brain.dest;
        if (bd < 55) input.pickup = best.id;
        // جمع تلقائي لما يقترب منه
        if (bd < 70) {
          const near = match.loot.filter(l => !l.taken && dist(l.x, l.y, bot.x, bot.y) < 70);
          if (near.length) input.pickup = near[0].id;
        }
      }
    }
    // تمشيط داخل الدائرة
    if (!target) {
      brain.wanderT -= dt;
      const cur = brain.dest;
      const out = dist(cur.x, cur.y, zone.x, zone.y) > zone.r * 0.9;
      if (brain.wanderT <= 0 || out) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * zone.r * 0.85;
        brain.dest = { x: zone.x + Math.cos(a) * rr, y: zone.y + Math.sin(a) * rr };
        brain.wanderT = 5 + Math.random() * 6;
      }
      target = brain.dest;
      brain.goal = 'patrol';
    }
    // مركبة للمسافات البعيدة
    if (target && dist(bot.x, bot.y, target.x, target.y) > 900 && !bot.inVehicle && farFromZone) {
      let bv = null, bvd = 1e9;
      for (const v of match.vehicles) {
        if (v.dead || v.occupants.length >= 2) continue;
        const dd = dist(bot.x, bot.y, v.x, v.y);
        if (dd < 500 && dd < bvd && !inWater(world, v.x, v.y)) { bvd = dd; bv = v; }
      }
      if (bv) { target = { x: bv.x, y: bv.y }; brain.vehicleTarget = bv.id; }
    }
    // تنقّل نحو الهدف
    if (target) {
      const a = Math.atan2(target.y - bot.y, target.x - bot.x);
      const dd = dist(target.x, target.y, bot.x, bot.y);
      input.mx = dd > 40 ? Math.cos(a) : 0; input.my = dd > 40 ? Math.sin(a) : 0;
      input.sprint = dd > 320 || brain.goal === 'run' || brain.goal === 'hunt';
      input.aim = a;
      if (bot.healT > 0) { input.mx = 0; input.my = 0; }
    }
    // التقاط الغنائم المارّة
    if (!input.pickup) {
      const near = match.loot.filter(l => !l.taken && dist(l.x, l.y, bot.x, bot.y) < 55);
      if (near.length) input.pickup = near[0].id;
    }
    // أدوات
    if (brain.skillT > 14 && Math.random() < 0.3) { brain.skillT = 0; input.skill = true; }
    if (bot.effects.stealth && bot.hp < 70) { /* لا شيء */ }
  }

  /* ---- المركبات ---- */
  if (bot.inVehicle) {
    const v = match.vehicles.find(x => x.id === bot.inVehicle);
    if (v) {
      const goTarget = enemy ? enemy : (brain.dest || { x: v.x, y: v.y });
      const a = Math.atan2(goTarget.y - v.y, goTarget.x - v.x);
      input.vehicleAngle = a;
      const wantDrive = enemy ? dist(enemy.x, enemy.y, v.x, v.y) > 300 + d.aimErr * 800 : dist(goTarget.x, goTarget.y, v.x, v.y) > 80;
      input.vehicleThrottle = wantDrive ? 1 : 0;
      if (enemy && dist(enemy.x, enemy.y, v.x, v.y) < 150 && Math.random() < 0.03) {
        return { ...input, exitVehicle: true, vehicleThrottle: 0 };
      }
      if (!wantDrive && Math.random() < 0.05) return { ...input, exitVehicle: true, vehicleThrottle: 0 };
    }
    return input;
  } else if (brain.vehicleTarget) {
    const v = match.vehicles.find(x => x.id === brain.vehicleTarget);
    if (v && !v.dead && dist(bot.x, bot.y, v.x, v.y) < 110) { input.interact = { vehicle: v.id }; brain.vehicleTarget = null; }
  }

  /* ---- الانحشار داخل الحواجز: تفادٍ بسيط ---- */
  if (input.mx || input.my) {
    const nx = bot.x + input.mx * 40, ny = bot.y + input.my * 40;
    if (lineBlocked(world, bot.x, bot.y, nx, ny)) {
      const a = Math.atan2(input.my, input.mx) + (Math.random() < 0.5 ? 0.9 : -0.9);
      input.mx = Math.cos(a); input.my = Math.sin(a);
    }
  }
  return input;
}

/** ترتيب قدرات البوت: يعطيه عتاداً افتراضياً حول قدراته */
export function botLoadout(bot, difficulty) {
  const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const r = Math.random();
  if (r < d.lootSkill * 0.25) { bot.vest = 'vest2'; bot.helmet = 'helm2'; bot.bag = 'bag2'; }
  else if (r < d.lootSkill * 0.6) { bot.vest = 'vest1'; bot.helmet = 'helm1'; bot.bag = 'bag1'; }
  return bot;
}

export default { DIFFICULTY, makeBotBrain, botThink, botLoadout };
