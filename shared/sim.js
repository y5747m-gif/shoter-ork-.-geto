/**
 * ORK ZONE — shared/sim.js
 * محرك المحاكاة المشترك: توليد الخرائط، الفيزياء، الرصاص، الضرر، العاصفة، الغنائم.
 * يعمل بنفس الكود في السيرفر (أونلاين) وفي المتصفح (أوفلاين / توقع محلي).
 */
import {
  MAP_BY_ID, BIOMES, WEAPONS, ZONE_PHASES, LOOT_TABLE, HEALS, ARMORS,
  ATTACHMENTS, CHARACTERS, SKINS, GAME, AIRDROP_WEAPONS,
} from './gamedata.js';

/* ============================= أدوات عامة ============================= */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFrom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export function pickWeighted(rng, entries) {
  let total = 0; for (const e of entries) total += e.w;
  let r = rng() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.v; }
  return entries[entries.length - 1].v;
}

/* ============================= الأشكال ============================= */
export function makeShape(shape) {
  const s = shape;
  const inside = (x, y) => {
    switch (s.type) {
      case 'circle': return x * x + y * y <= s.r * s.r;
      case 'roundrect': {
        const hw = s.w / 2 - s.r, hh = s.h / 2 - s.r;
        const dx = Math.max(Math.abs(x) - hw, 0), dy = Math.max(Math.abs(y) - hh, 0);
        return dx * dx + dy * dy <= s.r * s.r;
      }
      case 'blob': {
        const a = Math.atan2(y, x), r = Math.hypot(x, y);
        const rr = s.r * (1 + s.amp * Math.sin(a * s.lobes) * 0.6 + s.amp * 0.4 * Math.cos(a * (s.lobes * 2 + 1)));
        return r <= rr;
      }
      case 'cross': {
        const inH = Math.abs(x) <= s.len && Math.abs(y) <= s.armW / 2;
        const inV = Math.abs(y) <= s.len && Math.abs(x) <= s.armW / 2;
        const corner = (xx, yy) => Math.hypot(Math.abs(xx) - s.armW / 2, Math.abs(yy) - s.armW / 2) <= s.r;
        return inH || inV || (Math.abs(x) <= s.armW / 2 && corner(x, y)) || (Math.abs(y) <= s.armW / 2 && corner(x, y));
      }
      case 'ring': {
        const r = Math.hypot(x, y);
        return r <= s.r && r >= s.hole;
      }
      default: return true;
    }
  };
  const radius = (a) => { // نصف القطر بزاوية معينة (للرسم والميني ماب)
    let lo = 0, hi = (s.r || 2000) * 1.6;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inside(Math.cos(a) * mid, Math.sin(a) * mid)) lo = mid; else hi = mid;
    }
    return lo;
  };
  return { ...s, inside, radius };
}

/* ============================= توليد العالم ============================= */
function makeGrid(cell) {
  const map = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  return {
    insert(o) {
      const minx = Math.floor((o.x - o.r) / cell), maxx = Math.floor((o.x + o.r) / cell);
      const miny = Math.floor((o.y - o.r) / cell), maxy = Math.floor((o.y + o.r) / cell);
      for (let cx = minx; cx <= maxx; cx++) for (let cy = miny; cy <= maxy; cy++) {
        const k = key(cx, cy); let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(o);
      }
    },
    query(x, y, r, out) {
      out.length = 0;
      const minx = Math.floor((x - r) / cell), maxx = Math.floor((x + r) / cell);
      const miny = Math.floor((y - r) / cell), maxy = Math.floor((y + r) / cell);
      for (let cx = minx; cx <= maxx; cx++) for (let cy = miny; cy <= maxy; cy++) {
        const a = map.get(key(cx, cy)); if (!a) continue;
        for (const o of a) if (!out.includes(o)) out.push(o);
      }
      return out;
    },
  };
}

export function genWorld(mapId, seed) {
  const map = MAP_BY_ID[mapId] || MAP_BY_ID.ork_island;
  const rng = rngFrom(seed + ':' + mapId);
  const shape = makeShape(map.shape);
  const half = map.size / 2;
  const biome = BIOMES[map.biome] || BIOMES.grass;
  const world = {
    mapId, map, seed, shape, biome, half,
    obstacles: [], loot: [], vehicles: [], hotDrops: [], grid: makeGrid(120), roads: [], waters: [], lava: null,
    decals: [], decor: [],
  };

  const addObstacle = (o) => { world.obstacles.push(o); world.grid.insert(o); return o; };
  let lid = 0;
  const newLoot = (tbl, x, y) => { const it = makeLootItem(rng, tbl, x, y, world, seed + ':' + mapId + '#' + (lid++)); world.loot.push(it); return it; };
  const randIn = (pad = 120) => {
    for (let i = 0; i < 200; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (map.size / 2 - pad);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (shape.inside(x, y)) return { x, y };
    }
    return { x: 0, y: 0 };
  };

  // مياه
  for (const w of (map.terrain?.water || [])) {
    const water = { x: w[0], y: w[1], w: w[2], h: w[3], r: w[4] || 60 };
    world.waters.push(water);
    world.decals.push({ kind: 'water', ...water });
  }
  // طرق
  for (const rd of (map.terrain?.roads || [])) {
    const road = { x1: rd[0], y1: rd[1], x2: rd[2], y2: rd[3], width: 130 };
    world.roads.push(road);
    world.decals.push({ kind: 'road', ...road });
  }
  // بحيرة الحمم
  if (map.terrain?.lava) {
    world.lava = { x: 0, y: 0, r: map.shape.hole * 0.98, dps: 26 };
    world.decals.push({ kind: 'lava', x: 0, y: 0, r: world.lava.r });
  }

  // الأشجار
  for (let i = 0; i < map.trees * (map.buildDensity > 1.2 ? 0.4 : 1); i++) {
    const p = randIn(160);
    const r = 22 + rng() * 16;
    addObstacle({ id: 't' + i, kind: 'tree', x: p.x, y: p.y, r, w: r * 2, h: r * 2, solid: true, blocksBullets: false, hp: 0, biome: map.biome });
  }
  // صخور
  for (let i = 0; i < map.rocks; i++) {
    const p = randIn(160);
    const r = 26 + rng() * 30;
    addObstacle({ id: 'r' + i, kind: 'rock', x: p.x, y: p.y, r, w: r * 2, h: r * 2, solid: true, blocksBullets: true, hp: 0 });
  }
  // بيوت
  const buildCount = Math.floor(16 * map.buildDensity) + 8;
  const buildingSpots = [];
  for (let i = 0; i < buildCount; i++) {
    const p = randIn(300);
    const bw = 160 + rng() * 220, bh = 150 + rng() * 200;
    if (world.waters.some(w => Math.hypot(p.x - w.x, p.y - w.y) < Math.max(w.w, w.h) * 0.6)) continue;
    buildingSpots.push({ x: p.x, y: p.y, w: bw, h: bh });
    const doorSide = Math.floor(rng() * 4), doorW = 62;
    const wallT = 14;
    const mk = (x, y, w, h, kind) => addObstacle({ kind: 'wall', x, y, w, h, r: Math.max(w, h) / 2, solid: true, blocksBullets: true, hp: 0, id: kind + i + Math.round(x + y), bw, bh, cx: p.x, cy: p.y });
    // الجدران الأربعة مع باب
    const hw = bw / 2, hh = bh / 2;
    const seg = (side) => {
      if (side === 0) { // أعلى
        if (doorSide === 0) { mk(p.x - (hw + doorW / 2) / 2 - 0, p.y - hh, hw - doorW / 2, wallT, 'w'); mk(p.x + (hw + doorW / 2) / 2, p.y - hh, hw - doorW / 2, wallT, 'w'); }
        else mk(p.x, p.y - hh, bw, wallT, 'w');
      } else if (side === 1) {
        if (doorSide === 1) { mk(p.x, p.y - (hh + doorW / 2) / 2 - 0, wallT, hh - doorW / 2, 'w'); mk(p.x, p.y + (hh + doorW / 2) / 2, wallT, hh - doorW / 2, 'w'); }
        else mk(p.x + hw, p.y, wallT, bh, 'w');
      } else if (side === 2) {
        if (doorSide === 2) { mk(p.x - (hw + doorW / 2) / 2, p.y + hh, hw - doorW / 2, wallT, 'w'); mk(p.x + (hw + doorW / 2) / 2, p.y + hh, hw - doorW / 2, wallT, 'w'); }
        else mk(p.x, p.y + hh, bw, wallT, 'w');
      } else {
        if (doorSide === 3) { mk(p.x - hw, p.y - (hh + doorW / 2) / 2, wallT, hh - doorW / 2, 'w'); mk(p.x - hw, p.y + (hh + doorW / 2) / 2, wallT, hh - doorW / 2, 'w'); }
        else mk(p.x - hw, p.y, wallT, bh, 'w');
      }
    };
    for (let s = 0; s < 4; s++) seg(s);
    world.decals.push({ kind: 'building', x: p.x, y: p.y, w: bw, h: bh, door: doorSide });
    // ديكور داخلي (سجاد + أثاث) لمظهر أغنى
    world.decor.push({ kind: 'rug', x: p.x, y: p.y, w: bw * 0.34, h: bh * 0.34 });
    const fn = 1 + Math.floor(rng() * 3);
    for (let fi = 0; fi < fn; fi++) {
      const fx = p.x + (rng() - 0.5) * (bw * 0.7), fy = p.y + (rng() - 0.5) * (bh * 0.7);
      world.decor.push({ kind: rng() < 0.5 ? 'table' : 'shelf', x: fx, y: fy, w: 30 + rng() * 46, h: 22 + rng() * 34, a: rng() < 0.5 ? 0 : Math.PI / 2 });
    }
    // غنائم داخل البيت
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      newLoot('floor', p.x + (rng() - 0.5) * bw * 0.7, p.y + (rng() - 0.5) * bh * 0.7);
    }
  }
  // نقاط غنائم حرة
  for (let i = 0; i < map.lootSpots; i++) {
    const p = randIn(200);
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) newLoot(rng() < 0.25 ? 'crate' : 'floor', p.x + (rng() - 0.5) * 120, p.y + (rng() - 0.5) * 120);
    if (rng() < 0.22) world.hotDrops.push({ x: p.x, y: p.y, r: 260 });
  }
  // صناديق خشبية قابلة للتدمير
  for (let i = 0; i < Math.floor(20 * map.buildDensity); i++) {
    const p = randIn(200);
    addObstacle({ id: 'c' + i, kind: 'crate', x: p.x, y: p.y, w: 54, h: 54, r: 38, solid: true, blocksBullets: true, hp: 80, maxHp: 80, dropLoot: true, lootCount: 2 + Math.floor(rng() * 2) });
  }
  // مركبات
  for (let i = 0; i < map.vehicleSpots; i++) {
    const p = randIn(260);
    const nearWater = world.waters.some(w => Math.hypot(p.x - w.x, p.y - w.y) < Math.max(w.w, w.h));
    const type = nearWater && rng() < 0.6 ? 'boat' : (rng() < 0.28 ? 'bike' : 'jeep');
    world.vehicles.push({ id: 'v' + i, type, x: p.x, y: p.y, angle: rng() * Math.PI * 2, hp: 500, speed: 0, driver: null, occupants: [], dead: false });
  }
  // نقاط هبوط
  world.spawnPoints = [];
  for (let i = 0; i < 80; i++) world.spawnPoints.push(randIn(300));
  world.buildingSpots = buildingSpots;
  world.playerStart = randIn(400);
  return world;
}

/* ============================= الغنائم ============================= */
let LOOT_ID = 1;
export function makeLootItem(rng, table, x, y, world, forcedId) {
  const t = LOOT_TABLE[table] || LOOT_TABLE.floor;
  const kind = pickWeighted(rng, [
    { v: 'weapon', w: t.weapon.weight }, { v: 'ammo', w: t.ammo.weight },
    { v: 'armor', w: t.armor.weight }, { v: 'heal', w: t.heal.weight },
    { v: 'attach', w: t.attach ? t.attach.weight : 0 },
  ]);
  const item = { id: forcedId || ('L' + (LOOT_ID++)), table, kind, x, y, taken: false };
  if (kind === 'weapon') item.weapon = pick(rng, t.weapon.pool);
  else if (kind === 'armor') item.armor = pick(rng, t.armor.pool);
  else if (kind === 'heal') item.heal = pick(rng, t.heal.pool);
  else if (kind === 'attach') item.attach = pick(rng, t.attach.pool);
  else {
    const types = Object.keys(t.ammo.counts);
    const k = pick(rng, types);
    const [a, b] = t.ammo.counts[k];
    item.ammoType = k; item.count = Math.floor(a + rng() * (b - a));
  }
  return item;
}

/* ============================= اللاعبون ============================= */
export function makePlayer(opts) {
  const char = CHARACTERS.find(c => c.id === opts.charId) || CHARACTERS[0];
  const p = {
    id: opts.id, name: opts.name || 'لاعب', team: opts.team ?? 0, bot: !!opts.bot,
    charId: char.id, skinId: opts.skinId || 'out_basic', weaponSkin: opts.weaponSkin || null,
    parachute: opts.parachute || 'pc_basic',
    x: 0, y: 0, vx: 0, vy: 0, aim: 0, face: 0,
    hp: 100, maxHp: 100, shield: 0, maxShield: 100,
    alive: true, knocked: false, bleed: 100, reviveProgress: 0,
    kills: 0, assists: 0, damage: 0, headshots: 0, distance: 0, placement: 0,
    ammo: { '9mm': 90, '556': 90, '762': 90, '12g': 12, '45': 30, 'sniper': 8 },
    weapons: [], curWeapon: 0,
    vest: null, helmet: null, bag: null, bagCap: 1,
    heals: { bandage: 2, energy: 1, medkit: 0, grenade: 1, smoke: 0 },
    attachments: [],
    reloadT: 0, fireT: 0, healT: 0, healItem: null, action: 'idle',
    boost: 0, sprint: false, crouch: false, prone: false, aiming: false,
    inVehicle: null, seat: 0, swim: false,
    dropState: 'plane', z: 900, jumpT: 0, landedT: 0,
    skill: { id: char.skill.kind, cd: 0, active: 0, value: char.skill.value },
    effects: {}, stats: { shots: 0, hits: 0 },
    lastDamageBy: null, lastDamageT: 0, footT: 0, emote: null, emoteT: 0,
    respawnT: 0, tdmKills: 0, disconnected: false, ping: 0,
  };
  applyCharPassive(p, char);
  return p;
}

export function applyCharPassive(p, char) {
  p.char = char;
  const k = char.skill.kind, v = char.skill.value;
  switch (k) {
    case 'speed': p.speedMul = (p.speedMul || 1) + v; break;
    case 'reload': p.reloadMul = (1 - v); break;
    case 'heal': p.healMul = (1 - v); p.regen = 0.6; break;
    case 'accuracy': p.accMul = (1 - v); break;
    case 'tank': p.dr = (p.dr || 0) + v; break;
    case 'bonus': p.shield = Math.max(p.shield, v); p.maxShield = 100 + v; break;
    case 'all': p.speedMul = 1.12; p.reloadMul = 0.82; p.healMul = 0.75; p.accMul = 0.8; p.dr = 0.12; p.regen = 0.5; break;
    default: break;
  }
}

export function giveWeapon(p, weaponId, world) {
  const w = WEAPONS[weaponId]; if (!w) return false;
  if (p.weapons.length >= 2) p.weapons[p.curWeapon] = { id: weaponId, ammo: w.mag, attachments: [] };
  else { p.weapons.push({ id: weaponId, ammo: w.mag, attachments: [] }); p.curWeapon = p.weapons.length - 1; }
  return true;
}
export function curW(p) { const s = p.weapons[p.curWeapon]; return s ? WEAPONS[s.id] : null; }
export function curSlot(p) { return p.weapons[p.curWeapon] || null; }
export function magSize(p, slot) {
  const w = WEAPONS[slot.id]; let m = w.mag;
  for (const a of slot.attachments) { const at = ATTACHMENTS[a]; if (at && at.magMul) m = Math.round(m * at.magMul); }
  return m;
}
export function spreadOf(p) {
  const slot = curSlot(p); if (!slot) return 3;
  const w = WEAPONS[slot.id]; let s = w.spread;
  for (const a of slot.attachments) { const at = ATTACHMENTS[a]; if (at && at.spreadMul) s *= at.spreadMul; }
  if (p.aiming) s *= 0.55;
  if (p.accMul) s *= p.accMul;
  if (p.prone) s *= 0.6; else if (p.crouch) s *= 0.78;
  s *= (1 + Math.min(p.moving ? 0.5 : 0, 0.5));
  return s;
}
export function zoomOf(p) {
  const slot = curSlot(p); if (!slot) return 1;
  let z = WEAPONS[slot.id].scope || 1;
  for (const a of slot.attachments) { const at = ATTACHMENTS[a]; if (at && at.zoom > 1) z = Math.max(z, at.zoom); }
  return z;
}

/* ============================= المباراة ============================= */
export function createMatch(opts = {}) {
  const mapId = opts.mapId || 'ork_island';
  const seed = opts.seed || Math.floor(Math.random() * 1e9);
  const world = genWorld(mapId, seed);
  const rng = rngFrom(seed + ':match');
  const spawnA = { x: -world.half * 0.95, y: (rng() - 0.5) * world.half * 0.7 };
  const spawnB = { x: world.half * 0.95, y: (rng() - 0.5) * world.half * 0.7 };
  world.loot = world.loot || [];
  const match = {
    id: opts.id || 'm' + seed, mapId, seed, world, mode: opts.mode || 'solo', teams: opts.teams ?? true,
    players: [], bullets: [], grenades: [], airdrops: [], events: [], vehicles: world.vehicles,
    loot: world.loot,
    time: 0, state: 'plane', aliveCount: 0, teamCount: 0, totalTeams: 0,
    plane: { ax: spawnA.x, ay: spawnA.y, bx: spawnB.x, by: spawnB.y, t: 0, speed: 8, duration: 55, done: false, x: spawnA.x, y: spawnA.y, angle: 0 },
    zone: null, nextAirdrop: 60, airdropCount: 0, kills: 0, winnerTeam: null, winnerName: null,
    tdmScore: { 0: 0, 1: 0 }, tdmLimit: 30, chat: [],
  };
  const arena = match.mode === 'tdm';
  const R = arena ? 620 : Math.max(600, world.half * 1.25);
  match.zone = {
    x: 0, y: 0, r: R, tx: 0, ty: 0, tr: arena ? R : R * 0.6, rng,
    phase: 0, state: 'hold', timer: ZONE_PHASES[0].hold, dps: 0, shrinking: false, done: arena,
  };
  if (!arena) { const a = rng() * Math.PI * 2, rr = rng() * world.half * 0.4; match.zone.x = Math.cos(a) * rr; match.zone.y = Math.sin(a) * rr; }
  if (arena) {
    match.tdmLimit = 30;
    match.tdmTimeLimit = 600;
    match.arena = true;
    // ساحة قتال: إعطاء كل اللاعبين عتاداً فورياً داخل الساحة
    for (const p of match.players) {
      const a = Math.random() * Math.PI * 2, rr2 = 180 + Math.random() * 420;
      p.x = Math.cos(a) * rr2; p.y = Math.sin(a) * rr2;
      p.dropState = 'landed'; p.z = 0;
      giveStarterKit(p, match);
      p.shield = 50;
    }
  }
  return match;
}

export function addPlayer(match, opts) {
  const p = makePlayer(opts);
  let pt = null;
  if (match.arena) {
    const a0 = Math.random() * Math.PI * 2, r0 = 150 + Math.random() * 440;
    pt = { x: match.zone.x + Math.cos(a0) * r0, y: match.zone.y + Math.sin(a0) * r0 };
    p.x = pt.x; p.y = pt.y; p.dropState = 'landed'; p.z = 0; p.shield = 50;
    giveStarterKit(p, match);
    p.ai = p.ai || null;
    match.players.push(p);
    return p;
  }
  if (opts.bot) {
    const w = match.world;
    if (w.hotDrops.length && Math.random() < 0.45) {
      const hd = w.hotDrops[Math.floor(Math.random() * w.hotDrops.length)];
      pt = { x: hd.x + (Math.random() - 0.5) * hd.r, y: hd.y + (Math.random() - 0.5) * hd.r };
    } else {
      const sp = w.spawnPoints[Math.floor(Math.random() * w.spawnPoints.length)];
      pt = { x: sp.x, y: sp.y };
    }
  }
  p.x = pt ? pt.x : match.plane.ax; p.y = pt ? pt.y : match.plane.ay;
  p.dropState = opts.bot ? 'wait' : 'plane';
  p.z = 0; p.aim = Math.random() * Math.PI * 2;
  if (opts.bot) { giveStarterKit(p, match); p.dropState = 'landed'; }
  match.players.push(p);
  return p;
}

export function giveStarterKit(p, match) {
  giveWeapon(p, 'machete');
  const starter = Math.random() < 0.5 ? 'mp40' : Math.random() < 0.6 ? 'ump' : 'p92';
  giveWeapon(p, starter);
  p.curWeapon = 1;
  p.heals.bandage = 2; p.heals.energy = 1;
  p.vest = null; p.helmet = null; p.bag = null; p.bagCap = 1;
}

export function dropPlayer(match, p, x, y) {
  if (p.dropState !== 'plane' && p.dropState !== 'wait') return false;
  p.x = clamp(x, -match.world.half, match.world.half);
  p.y = clamp(y, -match.world.half, match.world.half);
  p.dropState = 'freefall'; p.z = 780; p.jumpT = 0;
  match.events.push({ t: match.time, type: 'jump', id: p.id, x: p.x, y: p.y });
  return true;
}

export function teamAlive(match, team) { return match.players.filter(p => p.team === team && p.alive).length; }
export function alivePlayers(match) { return match.players.filter(p => p.alive); }

/* ============================= التصادم ============================= */
function collideCircleRect(px, py, r, o) {
  const hx = o.w / 2, hy = o.h / 2;
  const dx = px - o.x, dy = py - o.y;
  const cx = clamp(dx, -hx, hx), cy = clamp(dy, -hy, hy);
  const ddx = dx - cx, ddy = dy - cy;
  const d2 = ddx * ddx + ddy * ddy;
  if (d2 > r * r) return null;
  const d = Math.sqrt(d2) || 0.0001;
  return { nx: ddx / d, ny: ddy / d, pen: r - d };
}
export function resolveCollisions(world, p, radius, obstacles) {
  const list = obstacles || world.grid.query(p.x, p.y, radius + 80, []);
  for (const o of list) {
    if (!o.solid) continue;
    if (o.kind === 'tree') {
      const d = dist(p.x, p.y, o.x, o.y), rr = o.r + radius * 0.7;
      if (d < rr && d > 0) { const k = (rr - d) / d; p.x += (p.x - o.x) * k; p.y += (p.y - o.y) * k; }
    } else if (o.kind === 'rock' || o.kind === 'crate') {
      const d = dist(p.x, p.y, o.x, o.y), rr = o.r + radius * 0.55;
      if (d < rr && d > 0) { const k = (rr - d) / d; p.x += (p.x - o.x) * k; p.y += (p.y - o.y) * k; }
    } else {
      const c = collideCircleRect(p.x, p.y, radius, o);
      if (c) { p.x += c.nx * c.pen; p.y += c.ny * c.pen; }
    }
  }
  // حدود الخريطة
  const half = world.half;
  if (!world.shape.inside(p.x, p.y)) {
    // ادفع للداخل
    for (let i = 0; i < 12; i++) {
      const a = Math.atan2(p.y, p.x);
      const r = world.shape.radius(a);
      const d = Math.hypot(p.x, p.y);
      if (d > r) { const k = r / d; p.x *= k; p.y *= k; }
      else break;
    }
    p.x = clamp(p.x, -half, half); p.y = clamp(p.y, -half, half);
  }
  return p;
}
export function inWater(world, x, y) {
  for (const w of world.waters) {
    const dx = Math.abs(x - w.x) - (w.w / 2 - w.r), dy = Math.abs(y - w.y) - (w.h / 2 - w.r);
    const d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
    if (d <= w.r) return true;
  }
  return false;
}
export function inLava(world, x, y) {
  return world.lava ? dist(x, y, world.lava.x, world.lava.y) < world.lava.r : false;
}
const _scratch = [];
export function lineBlocked(world, x1, y1, x2, y2) {
  const steps = Math.ceil(dist(x1, y1, x2, y2) / 48);
  const tmp = _scratch;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = lerp(x1, x2, t), y = lerp(y1, y2, t);
    world.grid.query(x, y, 20, tmp);
    for (const o of tmp) {
      if (o.kind === 'wall' || o.kind === 'rock' || o.kind === 'crate') {
        if (collideCircleRect(x, y, 2, o)) return true;
      }
    }
  }
  return false;
}

/* ============================= خطوة المباراة ============================= */
export function stepMatch(match, dt, inputs, hooks) {
  dt = Math.min(dt, 0.05);
  match.inputs = inputs || {};
  match.time += dt;
  const world = match.world;
  stepPlane(match, dt);
  stepZone(match, dt);
  stepAirdrops(match, dt);
  for (const p of match.players) stepPlayer(match, p, dt, inputs ? inputs[p.id] : null, hooks);
  stepBullets(match, dt, hooks);
  stepGrenades(match, dt, hooks);
  stepVehicles(match, dt);
  // إحصاء
  const alive = match.players.filter(p => p.alive);
  match.aliveCount = alive.length;
  const teams = new Set(alive.map(p => p.team));
  match.teamCount = teams.size;
  if (teams.size > (match.totalTeams || 0)) match.totalTeams = teams.size;
  if (match.state === 'plane' && (match.plane.done || match.players.some(p => p.dropState === 'landed'))) match.state = 'playing';
  if (match.state !== 'over') {
    if (match.mode === 'tdm') {
      const s0 = match.tdmScore[0] || 0, s1 = match.tdmScore[1] || 0;
      if (s0 >= match.tdmLimit || s1 >= match.tdmLimit || match.time > (match.tdmTimeLimit || 600)) {
        match.state = 'over';
        match.winnerTeam = s0 === s1 ? null : (s0 > s1 ? 0 : 1);
        const w = match.players.find(p => p.team === match.winnerTeam && p.alive);
        match.winnerName = w ? w.name : (match.winnerTeam === null ? 'تعادل' : null);
      }
    } else if (match.teams) {
      if (match.teamCount <= 1 && match.time > 12) {
        match.state = 'over';
        const w = alive[0];
        match.winnerTeam = w ? w.team : null;
        match.winnerName = w ? w.name : null;
        for (const p of match.players) if (p.alive) p.placement = 1;
      }
    }
    if (match.time > GAME.matchTimeLimit) { match.state = 'over'; const w = alive[0]; match.winnerName = w ? w.name : null; match.winnerTeam = w ? w.team : null; }
  }
  if (match.state === 'over' && !match._placementDone) {
    match._placementDone = true;
    const alive2 = match.players.filter(p => p.alive);
    alive2.sort((a, b) => b.kills - a.kills);
    alive2.forEach((p, i) => { p.placement = 1; });
    let place = alive2.length + 1;
    const dead = match.players.filter(p => !p.alive).sort((a, b) => (b.deathT || 0) - (a.deathT || 0));
    for (const d of dead) { d.placement = place; place++; }
    match.events.push({ t: match.time, type: 'gameover', winner: match.winnerName, team: match.winnerTeam });
  }
  return match;
}

function stepPlane(match, dt) {
  const pl = match.plane;
  if (pl.done) return;
  pl.t += dt / (pl.duration || 55);
  pl.x = lerp(pl.ax, pl.bx, Math.min(pl.t, 1));
  pl.y = lerp(pl.ay, pl.by, Math.min(pl.t, 1));
  pl.angle = Math.atan2(pl.by - pl.ay, pl.bx - pl.ax);
  if (pl.t >= 1.16) {
    pl.done = true;
    for (const p of match.players) if (p.dropState === 'plane') {
      // إنزال تلقائي لأي لاعب لم يقفز
      dropPlayer(match, p, pl.bx + (Math.random() - 0.5) * 500, pl.by + (Math.random() - 0.5) * 500);
    }
  }
}

function stepZone(match, dt) {
  const z = match.zone;
  if (match.arena) { z.dps = 0; return; }
  if (match.state === 'over' && match.mode !== 'tdm') { z.dps = 0; return; }
  z.timer -= dt;
  if (z.state === 'hold') {
    z.dps = 0;
    if (z.timer <= 0) {
      if (z.phase >= ZONE_PHASES.length) { z.done = true; return; }
      const ph = ZONE_PHASES[z.phase];
      // دائرة جديدة عشوائية داخل الحالية
      const maxOff = Math.max(0, z.r - z.r * ph.factor);
      const a = z.rng() * Math.PI * 2, rr = z.rng() * maxOff;
      z.tx = z.x + Math.cos(a) * rr; z.ty = z.y + Math.sin(a) * rr;
      z.tr = Math.max(60, z.r * ph.factor);
      z.state = 'shrink'; z.timer = ph.shrink; z.shrinkDur = ph.shrink;
      z.sx = z.x; z.sy = z.y; z.sr = z.r;
      z.dpsActive = ph.dps;
      match.events.push({ t: match.time, type: 'zone', phase: z.phase, x: z.tx, y: z.ty, r: z.tr });
    }
  } else if (z.state === 'shrink') {
    const k = 1 - clamp(z.timer / z.shrinkDur, 0, 1);
    z.x = lerp(z.sx, z.tx, k); z.y = lerp(z.sy, z.ty, k); z.r = lerp(z.sr, z.tr, k);
    z.dps = z.dpsActive;
    if (z.timer <= 0) {
      z.state = 'hold'; z.phase++;
      const ph = ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)];
      z.timer = ph.hold;
      if (z.phase >= ZONE_PHASES.length) z.done = true;
      match.events.push({ t: match.time, type: 'zoneHold', phase: z.phase });
    }
  }
}

function stepAirdrops(match, dt) {
  if (match.state === 'over') return;
  match.nextAirdrop -= dt;
  if (match.nextAirdrop <= 0 && match.airdropCount < 8) {
    match.airdropCount++;
    match.nextAirdrop = 95;
    const z = match.zone;
    const a = Math.random() * Math.PI * 2, rr = Math.random() * z.r * 0.75;
    const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr;
    const w = match.world;
    if (!w.shape.inside(x, y)) return;
    const crate = { id: 'ad' + match.airdropCount, x, y, z: 1400, landed: false, opened: false, vy: 0, smoke: 0 };
    match.airdrops.push(crate);
    match.events.push({ t: match.time, type: 'airdrop', x, y });
  }
  for (const a of match.airdrops) {
    if (!a.landed) {
      a.z -= dt * 140;
      if (inWater(match.world, a.x, a.y)) a.z -= dt * 260;
      if (a.z <= 0) {
        a.z = 0; a.landed = true; a.smoke = 1;
        match.events.push({ t: match.time, type: 'airdropLand', x: a.x, y: a.y });
        const spawned = [];
        for (let i = 0; i < 4; i++) {
          const it = makeLootItem(Math.random, 'airdrop', a.x + (Math.random() - 0.5) * 90, a.y + (Math.random() - 0.5) * 90, match.world, 'AD' + match.airdropCount + '_' + i);
          match.loot.push(it); spawned.push(it);
        }
        match.events.push({ t: match.time, type: 'spawnLoot', items: spawned.map(briefLoot) });
      }
    }
  }
}

/* ============================= حلقة اللاعب ============================= */
export function stepPlayer(match, p, dt, input, hooks) {
  const world = match.world;
  const active = match.state !== 'over';
  // الهبوط بالمظلة
  if (p.dropState === 'freefall' || p.dropState === 'parachute') {
    p.jumpT += dt;
    const steerSpeed = p.dropState === 'freefall' ? 190 : 250;
    let mx = input ? input.mx : 0, my = input ? input.my : 0;
    const m = Math.hypot(mx, my) || 1;
    p.x += (mx / m) * steerSpeed * dt; p.y += (my / m) * steerSpeed * dt;
    const sink = p.dropState === 'freefall' ? (p.z > 260 ? 165 : 120) : 105;
    p.z = Math.max(0, p.z - sink * dt);
    if (p.dropState === 'freefall' && p.z <= 320) { p.dropState = 'parachute'; p.z = 320; }
    if (p.z <= 0) {
      p.dropState = 'landed'; p.z = 0; p.landedT = match.time;
      resolveCollisions(world, p, 16);
      giveStarterKit(p, match);
      match.events.push({ t: match.time, type: 'land', id: p.id, x: p.x, y: p.y });
    }
    return;
  }
  if (p.dropState === 'plane' || p.dropState === 'wait') { p.z = 900; return; }

  // مؤقتات
  p.fireT = Math.max(0, p.fireT - dt);
  p.skill.cd = Math.max(0, p.skill.cd - dt);
  if (p.skill.active > 0) { p.skill.active = Math.max(0, p.skill.active - dt); if (p.skill.active === 0 && (p.char.skill.kind === 'shield')) p.shieldWall = null; }
  for (const k of Object.keys(p.effects)) { p.effects[k] -= dt; if (p.effects[k] <= 0) delete p.effects[k]; }
  if (p.deathT) p.deathT += dt;

  if (!p.alive) { if (p.bot) return; return; }
  if (p.knocked) {
    p.bleed -= dt * 2.4;
    if (p.bleed <= 0) killPlayer(match, p, null, 'bleed');
    if (p.reviveProgress > 0 && !input?.reviving) p.reviveProgress = 0;
    return;
  }

  // تجدد الدم
  if (p.regen && p.hp < p.maxHp && match.time - (p.lastHitT || 0) > 5) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

  const slot = curSlot(p);
  const wpn = slot ? WEAPONS[slot.id] : null;

  // السيارة
  if (p.inVehicle) { stepInVehicle(match, p, dt, input); return; }

  // الإدخال
  let mx = 0, my = 0, aim = p.aim;
  if (input) {
    mx = input.mx || 0; my = input.my || 0;
    const mm = Math.hypot(mx, my); if (mm > 1) { mx /= mm; my /= mm; }
    if (typeof input.aim === 'number') aim = input.aim;
    p.sprint = !!input.sprint && mm > 0.1 && !input.aiming;
    p.aiming = !!input.aiming && !!wpn && wpn.type !== 'melee';
    if (typeof input.crouch === 'boolean') { p.crouch = input.crouch; p.prone = false; }
    if (typeof input.prone === 'boolean') { p.prone = input.prone; p.crouch = false; }
    if (input.swap !== undefined && input.swap !== null && p.weapons[input.swap]) { p.curWeapon = input.swap; p.reloadT = 0; p.healT = 0; }
    if (input.reload) startReload(p);
    if (input.heal && !p.healT) startHeal(p, input.heal);
    if (input.cancelAction && p.healT) { p.healT = 0; p.healItem = null; p.action = 'idle'; }
    if (input.skill && p.skill.cd <= 0) useSkill(match, p);
    if (input.emote !== undefined && input.emote !== null) { p.emote = input.emote; p.emoteT = 4; }
    if (input.pickup) tryPickup(match, p, input.pickup);
  }
  p.moving = mx !== 0 || my !== 0;
  p.aim = aim; p.face = aim;

  // الحركة
  let speed = 225;
  if (wpn) speed *= wpn.move;
  if (p.speedMul) speed *= p.speedMul;
  if (p.sprint) speed *= 1.42;
  if (p.aiming) speed *= 0.55;
  if (p.crouch) speed *= 0.62;
  if (p.prone) speed *= 0.36;
  if (p.healT > 0) speed *= 0.55;
  if (p.effects.slow) speed *= (1 - p.effects.slow);
  if (p.effects.dash) { speed *= 2.6; }
  const wasWater = p.swim;
  p.swim = inWater(world, p.x, p.y);
  if (p.swim) speed *= 0.45;
  if (world.map.slippery) { /* أرض زلقة: تسارع أبطأ */ }
  p.vx = lerp(p.vx, mx * speed, dt * 14);
  p.vy = lerp(p.vy, my * speed, dt * 14);
  const prevX = p.x, prevY = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  resolveCollisions(world, p, 15);
  p.distance += dist(prevX, prevY, p.x, p.y);

  // آثار الأقدام + صوت
  if (p.moving && !p.swim) {
    p.footT -= dt;
    if (p.footT <= 0) { p.footT = p.sprint ? 0.26 : 0.4; if (hooks?.onStep) hooks.onStep(p); }
  }
  // ساحة الفريق: لا يخرج أحد بعيداً
  if (match.arena) {
    const az = match.zone;
    const dd2 = dist(p.x, p.y, az.x, az.y);
    if (dd2 > az.r * 1.08) {
      const a = Math.atan2(p.y - az.y, p.x - az.x);
      const k = (az.r * 1.08) / dd2;
      p.x = az.x + (p.x - az.x) * k; p.y = az.y + (p.y - az.y) * k;
    }
  }
  // حمم
  if (inLava(world, p.x, p.y)) damagePlayer(match, p, 26 * dt, null, 'lava', hooks, true);
  // داخل العاصفة
  if (active) {
    const d = dist(p.x, p.y, match.zone.x, match.zone.y);
    if (d > match.zone.r) damagePlayer(match, p, match.zone.dps * dt, null, 'zone', hooks, true);
  }

  // العلاج
  if (p.healT > 0) {
    p.healT -= dt * (p.healMul ? 1 / p.healMul : 1);
    if (p.healT <= 0) completeHeal(match, p);
  }
  if (p.reloadT > 0) {
    p.reloadT -= dt * (p.reloadMul ? 1 / p.reloadMul : 1);
    if (p.reloadT <= 0) finishReload(p);
  }

  // الرمي
  if (input?.shoot && !p.healT && p.reloadT <= 0) {
    if (input.grenade) throwGrenade(match, p, aim);
    else fire(match, p, input, hooks);
  }
  // التقاط تلقائي سريع عند عدم وجود سلاح
  if (!slot && input?.shoot) { p.autoPickT = (p.autoPickT || 0) - dt; if (p.autoPickT <= 0) { p.autoPickT = 0.5; tryPickupNearby(match, p); } }
  if (p.fireT === 0 && input?.shoot === false) p.autoBurst = 0;
}

function startReload(p) {
  const slot = curSlot(p); if (!slot) return;
  const w = WEAPONS[slot.id]; if (w.type === 'melee') return;
  if (slot.ammo >= magSize(p, slot)) return;
  if (p.ammo[w.ammo] <= 0) return;
  p.reloadT = w.reload; p.action = 'reload';
}
function finishReload(p) {
  const slot = curSlot(p); if (!slot) return;
  const w = WEAPONS[slot.id];
  const need = magSize(p, slot) - slot.ammo;
  const take = Math.min(need, p.ammo[w.ammo] || 0);
  slot.ammo += take; p.ammo[w.ammo] -= take;
  p.action = 'idle';
}
function startHeal(p, item) {
  const data = HEALS[item]; if (!data) return;
  if ((p.heals[item] || 0) <= 0) return;
  if (item === 'grenade' || item === 'smoke') return;
  p.heals[item]--; p.healItem = item; p.healT = data.time; p.action = 'heal';
}
function completeHeal(match, p) {
  const item = p.healItem; p.healItem = null; p.healT = 0; p.action = 'idle';
  const d = HEALS[item]; if (!d) return;
  if (d.hp) p.hp = Math.min(p.maxHp, p.hp + d.heal);
  if (d.boost) { p.boost = Math.min(100, p.boost + d.boost); }
}

export function fire(match, p, input, hooks) {
  const slot = curSlot(p); if (!slot) return false;
  const w = WEAPONS[slot.id];
  if (w.type === 'melee') {
    if (p.fireT > 0) return false;
    p.fireT = 60 / w.rpm;
    // ضربة قريبة
    for (const o of match.players) {
      if (o === p || !o.alive || o.team === p.team || o.knocked) continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < w.range + 20 && Math.abs(Math.atan2(o.y - p.y, o.x - p.x) - p.aim) < 0.9) {
        damagePlayer(match, o, w.dmg, p, 'melee', hooks);
        match.events.push({ t: match.time, type: 'hit', by: p.id, on: o.id, dmg: w.dmg, x: o.x, y: o.y, weapon: w.id });
      }
    }
    if (hooks?.onMelee) hooks.onMelee(p);
    return true;
  }
  if (p.fireT > 0) return false;
  if (slot.ammo <= 0) { startReload(p); return false; }
  p.fireT = 60 / w.rpm;
  slot.ammo--;
  p.stats.shots++;
  const sp = spreadOf(p) * (Math.PI / 180);
  const pellets = w.pellets || 1;
  const silent = slot.attachments.some(a => ATTACHMENTS[a]?.silent);
  for (let i = 0; i < pellets; i++) {
    const a = p.aim + (Math.random() - 0.5) * sp * 2 + (pellets > 1 ? (i - pellets / 2) * 0.045 : 0);
    const speed = w.speed;
    match.bullets.push({
      id: 'b' + Math.random().toString(36).slice(2, 9), x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg: w.dmg, owner: p.id, team: p.team,
      weapon: w.id, ttl: w.range / speed, silent, type: w.type, life: 0,
    });
  }
  if (!match.shots) match.shots = [];
  if (match.shots.length > 40) match.shots.shift();
  if (!silent) match.shots.push({ x: p.x, y: p.y, t: match.time, team: p.team, by: p.id });
  if (hooks?.onShot) hooks.onShot(p, w, silent);
  return true;
}

export function throwGrenade(match, p, aim) {
  if ((p.heals.grenade || 0) <= 0 && (p.heals.smoke || 0) <= 0) return;
  const smoke = (p.heals.smoke || 0) > 0 && p.grenadeMode === 'smoke';
  const item = smoke ? 'smoke' : 'grenade';
  if ((p.heals[item] || 0) <= 0) return;
  if (p.fireT > 0) return;
  p.heals[item]--; p.fireT = 1.1;
  const power = 620;
  match.grenades.push({ id: 'g' + Math.random().toString(36).slice(2, 8), x: p.x, y: p.y, vx: Math.cos(aim) * power, vy: Math.sin(aim) * power, t: item === 'smoke' ? 1.6 : 2.6, item, owner: p.id, team: p.team });
}

function stepGrenades(match, dt, hooks) {
  for (let i = match.grenades.length - 1; i >= 0; i--) {
    const g = match.grenades[i];
    g.x += g.vx * dt; g.y += g.vy * dt;
    g.vx *= 0.985; g.vy *= 0.985;
    resolveCollisions(match.world, g, 8);
    g.t -= dt;
    if (g.t <= 0) {
      if (g.item === 'grenade') {
        for (const p of match.players) {
          if (!p.alive) continue;
          const d = dist(p.x, p.y, g.x, g.y);
          if (d < HEALS.grenade.radius) {
            const dmg = HEALS.grenade.dmg * (1 - d / HEALS.grenade.radius);
            const owner = match.players.find(x => x.id === g.owner);
            damagePlayer(match, p, dmg, owner && owner.team !== p.team ? owner : null, 'grenade', hooks);
          }
        }
        match.events.push({ t: match.time, type: 'explosion', x: g.x, y: g.y });
      } else {
        match.events.push({ t: match.time, type: 'smoke', x: g.x, y: g.y, dur: HEALS.smoke.dur });
      }
      match.grenades.splice(i, 1);
    }
  }
}

export function useSkill(match, p) {
  const k = p.char.skill.kind;
  const dur = p.char.skill.kind === 'stealth' ? p.char.skill.value : 6;
  p.skill.cd = { stealth: 45, dash: 22, shield: 30, rage: 40, slow: 35, all: 30 }[k] || 35;
  p.skill.active = dur;
  switch (k) {
    case 'dash': p.effects.dash = 0.45; p.effects.dashSpeedBoost = 1; break;
    case 'shield': p.shieldWall = { active: true, until: match.time + 6 }; if (p.shield < 50) p.shield += 50; break;
    case 'stealth': p.effects.stealth = dur; break;
    case 'heal': p.hp = Math.min(p.maxHp, p.hp + 45); p.effects.regen = 8; break;
    case 'rage': p.effects.rage = dur; break;
    case 'slow': {
      for (const o of match.players) {
        if (o.team === p.team || !o.alive) continue;
        if (dist(o.x, o.y, p.x, p.y) < 260) o.effects.slow = 4;
      }
      break;
    }
    case 'all': p.shield = Math.min(150, p.shield + 50); p.effects.rage = 6; p.effects.dash = 0.6; break;
    case 'tank': p.effects.armor = 8; break;
    default: p.effects.boost = 6; break;
  }
  match.events.push({ t: match.time, type: 'skill', id: p.id, kind: k });
}

function segPointDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + dx * t, cy = y1 + dy * t;
  return { d: Math.hypot(px - cx, py - cy), t };
}

function stepBullets(match, dt, hooks) {
  const world = match.world;
  const tmp = [];
  const owner = (id) => match.players.find(x => x.id === id);
  for (let i = match.bullets.length - 1; i >= 0; i--) {
    const b = match.bullets[i];
    b.life += dt; b.ttl -= dt;
    const sx = b.x, sy = b.y;
    const nx = sx + b.vx * dt, ny = sy + b.vy * dt;
    if (b.ttl <= 0) {
      if (match.events.length < 6000) match.events.push({ t: match.time, type: 'impact', x: sx, y: sy, weapon: b.weapon });
      b.x = nx; b.y = ny;
      match.bullets.splice(i, 1); continue;
    }
    const ow = owner(b.owner);

    /* --- ١) إصابة اللاعبين: فحص المسار كاملاً (لا تخطي للرصاص السريع) --- */
    let hit = null, hitT = 2;
    for (const p of match.players) {
      if (!p.alive || p.knocked || p.id === b.owner) continue;
      if (ow && match.teams && match.mode !== 'ffa' && p.team === ow.team) continue;
      const r = p.inVehicle ? 26 : 17;
      const res = segPointDist(p.x, p.y, sx, sy, nx, ny);
      if (res.d <= r && res.t < hitT) { hit = p; hitT = res.t; }
    }

    /* --- ٢) العوائق: نقطة بنقطة على طول المسار (لا مرور من الجدران) --- */
    const segLen = Math.hypot(nx - sx, ny - sy);
    const steps = Math.max(1, Math.ceil(segLen / 7));
    let blockT = 2;
    for (let sIdx = 1; sIdx <= steps; sIdx++) {
      const t = sIdx / steps;
      const px = sx + (nx - sx) * t, py = sy + (ny - sy) * t;
      world.grid.query(px, py, 20, tmp);
      let blocked = false;
      for (const o of tmp) {
        if (o.kind !== 'wall' && o.kind !== 'rock' && o.kind !== 'crate') continue;
        if (o.kind === 'crate' && (o.hp <= 0 || o.destroyed)) continue;
        if (!collideCircleRect(px, py, 2, o)) continue;
        blocked = true;
        if (o.kind === 'crate') {
          o.hp -= b.dmg;
          if (o.hp <= 0 && o.dropLoot) {
            const sp = [];
            for (let k = 0; k < (o.lootCount || 2); k++) {
              const it = makeLootItem(Math.random, Math.random() < 0.5 ? 'crate' : 'floor', o.x + (Math.random() - 0.5) * 70, o.y + (Math.random() - 0.5) * 70, world);
              match.loot.push(it); sp.push(briefLoot(it));
            }
            o.solid = false; o.destroyed = true;
            match.events.push({ t: match.time, type: 'spawnLoot', items: sp });
            match.events.push({ t: match.time, type: 'crateBreak', x: o.x, y: o.y });
          }
        }
        break;
      }
      if (blocked) { blockT = t; break; }
    }

    /* --- ٣) الحسم: الأقرب بين العائق والهدف --- */
    if (blockT < hitT && blockT <= 1) {
      b.x = sx + (nx - sx) * blockT; b.y = sy + (ny - sy) * blockT;
      if (match.events.length < 6000) match.events.push({ t: match.time, type: 'impact', x: Math.round(b.x), y: Math.round(b.y), weapon: b.weapon });
      match.bullets.splice(i, 1); continue;
    }
    if (hit) {
      const cd = segPointDist(hit.x, hit.y, sx, sy, nx, ny).d;
      const head = cd < 6 ? Math.random() < 0.5 : cd < 11 ? Math.random() < 0.22 : Math.random() < 0.06;
      let dmg = b.dmg * (head ? 2.1 : 1);
      if (ow) {
        ow.stats.hits++;
        if (head) ow.headshots++;
        if (ow.char.skill.kind === 'rage' && ow.effects.rage) dmg *= 1.5;
        if (ow.char.skill.kind === 'accuracy') dmg *= 1.08;
      }
      b.x = hit.x; b.y = hit.y;
      damagePlayer(match, hit, dmg, ow, 'bullet', hooks, false, { head });
      if (match.events.length < 6000) match.events.push({
        t: match.time, type: 'hit', by: b.owner, on: hit.id, dmg: Math.round(dmg), head,
        x: Math.round(b.x), y: Math.round(b.y), weapon: b.weapon, silent: b.silent,
        hp: Math.round(hit.hp), died: !hit.alive,
      });
      match.bullets.splice(i, 1); continue;
    }
    b.x = nx; b.y = ny;
  }
}

export function damagePlayer(match, p, dmg, attacker, source, hooks, isDot = false, bullet = null) {
  if (!p.alive) return;
  if (source === 'zone' || source === 'lava') {
    if (p.inVehicle === 'driving' && source === 'zone') dmg *= 0.5;
  }
  let dr = p.dr || 0;
  if (p.vest && (source === 'bullet' || source === 'melee' || source === 'grenade')) dr += ARMORS[p.vest].dr;
  if (p.char.skill.kind === 'tank' && p.effects.armor) dr += 0.15;
  if (p.effects.rageCdr) dr += 0.1;
  if (bullet && bullet.head && p.helmet) dr += ARMORS[p.helmet].dr;
  dmg *= (1 - Math.min(0.72, dr));
  p.lastHitT = match.time;
  if (attacker && attacker !== p) p.lastDamageBy = attacker.id;

  // الدرع يمتص أولاً
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg * 0.7);
    p.shield -= absorbed; dmg -= absorbed;
  }
  p.hp -= dmg;
  if (attacker && attacker !== p && attacker.team !== p.team) {
    attacker.damage += dmg;
    attacker.lastDamageT = match.time;
  }
  if (p.hp <= 0) {
    p.hp = 0;
    const teammates = match.teams && match.mode !== 'ffa' ? match.players.filter(o => o.team === p.team && o.alive && !o.knocked && o !== p) : [];
    if (teammates.length > 0 && !p.knocked) {
      p.knocked = true; p.bleed = 100; p.hp = 0;
      p.knockedBy = attacker && attacker.team !== p.team ? attacker.id : null;
      match.events.push({ t: match.time, type: 'knock', id: p.id, by: attacker ? attacker.id : null, x: p.x, y: p.y });
    } else {
      killPlayer(match, p, attacker, source, hooks);
    }
  }
}

export function killPlayer(match, p, attacker, source, hooks) {
  if (!p.alive) return;
  if (!attacker && p.knockedBy) { const k = match.players.find(x => x.id === p.knockedBy); if (k && k.alive) attacker = k; }
  p.alive = false; p.knocked = false; p.deathT = 0.001; p.deathSource = source;
  if (p.inVehicle) { const v = match.vehicles.find(x => x.id === p.inVehicle); if (v) { v.driver = null; v.occupants = []; v.dead = true; } p.inVehicle = null; }
  match.events.push({ t: match.time, type: 'kill', id: p.id, name: p.name, by: attacker ? attacker.id : null, byName: attacker ? attacker.name : (source === 'zone' ? 'العاصفة' : 'البيئة'), weapon: attacker ? (curW(attacker)?.ar || 'يد') : '—', x: p.x, y: p.y, source, head: false });
  if (attacker && attacker !== p && attacker.team !== p.team) {
    attacker.kills++;
    attacker.tdmKills++;
    if (match.mode === 'tdm') match.tdmScore[attacker.team] = (match.tdmScore[attacker.team] || 0) + 1;
    match.kills++;
    if (attacker.char.skill.kind === 'rage') { attacker.effects.rage = 6; attacker.hp = Math.min(attacker.maxHp, attacker.hp + 30); }
    // غنائم القتل (بويـه): استرداد بعض الذخيرة
    attacker.ammo['9mm'] += 30; attacker.ammo['556'] += 30; attacker.ammo['762'] += 30;
    if (attacker.heals.bandage < 5) attacker.heals.bandage++;
  }
  // إسقاط الغنائم
  const drops = [];
  for (const slot of p.weapons) { const it = { id: 'D' + Math.random().toString(36).slice(2, 9), kind: 'weapon', weapon: slot.id, x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 40, taken: false, table: 'floor' }; match.loot.push(it); drops.push(it); }
  if (p.vest) { const it = { id: 'D' + Math.random().toString(36).slice(2, 9), kind: 'armor', armor: p.vest, x: p.x + 20, y: p.y, taken: false, table: 'floor' }; match.loot.push(it); drops.push(it); }
  if (p.helmet) { const it = { id: 'D' + Math.random().toString(36).slice(2, 9), kind: 'armor', armor: p.helmet, x: p.x - 20, y: p.y, taken: false, table: 'floor' }; match.loot.push(it); drops.push(it); }
  if (drops.length) match.events.push({ t: match.time, type: 'spawnLoot', items: drops.map(briefLoot) });
  p.weapons = [];
  if (hooks?.onKill) hooks.onKill(p, attacker, source);
  // في TDM: إعادة إحياء بعد ٥ ثوان
  if (match.mode === 'tdm') { p.respawnT = 5; }
}

export function revivePlayer(match, reviver, target, dt) {
  if (!target.knocked) return false;
  target.reviveProgress += dt;
  if (target.reviveProgress >= 3) {
    target.knocked = false; target.hp = 40; target.bleed = 100; target.reviveProgress = 0;
    match.events.push({ t: match.time, type: 'revive', id: target.id, by: reviver.id });
    if (reviver.missions) reviver.missions.revive = (reviver.missions.revive || 0) + 1;
    return true;
  }
  return false;
}

/* ============================= الغنائم ============================= */
export function tryPickupNearby(match, p) {
  let best = null, bd = 1e9;
  for (const l of match.loot) {
    if (l.taken) continue;
    const d = dist(p.x, p.y, l.x, l.y);
    if (d < 60 && d < bd) { bd = d; best = l; }
  }
  if (best) tryPickup(match, p, best.id);
}
export function tryPickup(match, p, lootId) {
  const l = match.loot.find(x => x.id === lootId); if (!l || l.taken) return false;
  if (dist(p.x, p.y, l.x, l.y) > 75) return false;
  let ok = false;
  if (l.kind === 'weapon') {
    if (p.weapons.length < 2) { p.weapons.push({ id: l.weapon, ammo: WEAPONS[l.weapon].type === 'melee' ? 0 : WEAPONS[l.weapon].mag, attachments: [] }); p.curWeapon = p.weapons.length - 1; ok = true; }
    else { const idx = p.curWeapon; const old = p.weapons[idx].id; if (old !== l.weapon) { p.weapons[idx] = { id: l.weapon, ammo: WEAPONS[l.weapon].type === 'melee' ? 0 : WEAPONS[l.weapon].mag, attachments: [] }; match.loot.push({ id: 'X' + Math.random().toString(36).slice(2, 8), kind: 'weapon', weapon: old, x: p.x, y: p.y, taken: false, table: 'floor' }); ok = true; } }
  } else if (l.kind === 'ammo') {
    const cap = (p.bag ? ARMORS[p.bag].cap : 1) * 180;
    const cur = p.ammo[l.ammoType] || 0;
    const take = Math.min(l.count, Math.max(0, Math.round(cap - cur)));
    if (take > 0) { p.ammo[l.ammoType] = cur + take; ok = true; }
  } else if (l.kind === 'armor') {
    const a = ARMORS[l.armor];
    if (l.armor.startsWith('vest')) { if (!p.vest || ARMORS[p.vest].lvl < a.lvl) { if (p.vest) match.loot.push({ id: 'X' + Math.random().toString(36).slice(2, 8), kind: 'armor', armor: p.vest, x: p.x, y: p.y, taken: false, table: 'floor' }); p.vest = l.armor; ok = true; } }
    else if (l.armor.startsWith('helm')) { if (!p.helmet || ARMORS[p.helmet].lvl < a.lvl) { if (p.helmet) match.loot.push({ id: 'X' + Math.random().toString(36).slice(2, 8), kind: 'armor', armor: p.helmet, x: p.x, y: p.y, taken: false, table: 'floor' }); p.helmet = l.armor; ok = true; } }
    else if (l.armor.startsWith('bag')) { if (!p.bag || ARMORS[p.bag].lvl < a.lvl) { p.bag = l.armor; p.bagCap = a.cap; ok = true; } }
  } else if (l.kind === 'heal') {
    const cap = Math.round((l.heal === 'bandage' ? 8 : l.heal === 'medkit' ? 3 : l.heal === 'grenade' ? 5 : l.heal === 'smoke' ? 3 : 5) * (p.bag ? ARMORS[p.bag].cap : 1));
    if ((p.heals[l.heal] || 0) < cap) { p.heals[l.heal] = (p.heals[l.heal] || 0) + 1; ok = true; }
  } else if (l.kind === 'attach') {
    const slot = curSlot(p);
    if (slot) { const at = ATTACHMENTS[l.attach]; if (!slot.attachments.includes(l.attach) && !slot.attachments.some(a => ATTACHMENTS[a].slot === at.slot)) { slot.attachments.push(l.attach); ok = true; } }
    else if (p.weapons.length) { const s = p.weapons[0]; const at = ATTACHMENTS[l.attach]; if (!s.attachments.includes(l.attach) && !s.attachments.some(a => ATTACHMENTS[a].slot === at.slot)) { s.attachments.push(l.attach); ok = true; } }
  }
  if (ok) { l.taken = true; if (match.events.length < 6000) match.events.push({ t: match.time, type: 'pickup', id: p.id, loot: l.id, x: l.x, y: l.y }); }
  return ok;
}

/* ============================= المركبات ============================= */
export function enterVehicle(match, p, vId) {
  const v = match.vehicles.find(x => x.id === vId); if (!v || v.dead) return false;
  if (dist(p.x, p.y, v.x, v.y) > 130) return false;
  const vt = { jeep: 4, bike: 2, boat: 4, tank: 4 }[v.type] || 2;
  if (v.occupants.length >= vt) return false;
  p.inVehicle = v.id; p.seat = v.occupants.length;
  v.occupants.push(p.id);
  if (!v.driver) { v.driver = p.id; p.inVehicle = 'driving'; }
  match.events.push({ t: match.time, type: 'vehicle', id: p.id, v: v.id, enter: true });
  return true;
}
export function exitVehicle(match, p) {
  if (!p.inVehicle) return false;
  const v = match.vehicles.find(x => x.id === p.inVehicle); if (!v) { p.inVehicle = null; return false; }
  v.occupants = v.occupants.filter(o => o !== p.id);
  if (v.driver === p.id) v.driver = v.occupants[0] || null;
  p.inVehicle = null;
  p.x = v.x + Math.cos(v.angle + Math.PI / 2) * 60;
  p.y = v.y + Math.sin(v.angle + Math.PI / 2) * 60;
  resolveCollisions(match.world, p, 15);
  match.events.push({ t: match.time, type: 'vehicle', id: p.id, v: v.id, enter: false });
  return true;
}
function stepInVehicle(match, p, dt, input) {
  const v = match.vehicles.find(x => x.id === p.inVehicle); if (!v || v.dead) { p.inVehicle = null; return; }
  p.x = v.x; p.y = v.y;
  if (inLava(match.world, v.x, v.y)) v.hp -= 40 * dt;
  const d = dist(p.x, p.y, match.zone.x, match.zone.y);
  if (match.state !== 'over' && d > match.zone.r) damagePlayer(match, p, match.zone.dps * 0.5 * dt, null, 'zone', null, true);
  if (v.hp <= 0) { explodeVehicle(match, v); }
}
export function explodeVehicle(match, v) {
  v.dead = true;
  match.events.push({ t: match.time, type: 'vehicleBoom', x: v.x, y: v.y });
  for (const p of match.players) {
    if (!p.alive) continue;
    const d = dist(p.x, p.y, v.x, v.y);
    if (d < 190) damagePlayer(match, p, 90 * (1 - d / 190), null, 'explosion');
  }
  for (const id of v.occupants) {
    const p = match.players.find(x => x.id === id);
    if (p) { p.inVehicle = null; p.hp = Math.max(0, p.hp - 60); if (p.hp <= 0) killPlayer(match, p, null, 'explosion'); }
  }
  v.occupants = []; v.driver = null;
}
function stepVehicles(match, dt) {
  for (const v of match.vehicles) {
    if (v.dead) continue;
    const driver = match.players.find(p => p.id === v.driver);
    if (driver && driver.alive) {
      const inp = match.inputs ? match.inputs[driver.id] : null;
      const target = (inp && inp.vehicleAngle !== undefined) ? inp.vehicleAngle : driver.aim;
      const accel = (inp && inp.vehicleThrottle) ? 1 : 0;
      const spec = { jeep: 520, bike: 660, boat: 560, tank: 420 }[v.type];
      const wInWater = inWater(match.world, v.x, v.y);
      const canMove = (v.type === 'boat') ? wInWater : !wInWater || v.type === 'tank';
      v.speed = lerp(v.speed, accel * spec * (canMove ? 1 : 0), dt * 2);
      v.angle = lerpAngle(v.angle, target, dt * 3.2);
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;
      resolveVehicleCollisions(match.world, v);
      // دهس
      if (Math.abs(v.speed) > 120) {
        for (const p of match.players) {
          if (!p.alive || p.inVehicle === v.id) continue;
          if (dist(p.x, p.y, v.x, v.y) < 46) damagePlayer(match, p, 65 * dt * (Math.abs(v.speed) / 300), null, 'vehicle');
        }
      }
      if (Math.random() < dt * 3) {
        const tmp = match.world.grid.query(v.x, v.y, 40, []);
        for (const o of tmp) if (o.solid && (o.kind === 'tree' || o.kind === 'rock')) {
          if (dist(v.x, v.y, o.x, o.y) < o.r + 26) { v.hp -= 4; }
        }
      }
      if (v.hp <= 0) explodeVehicle(match, v);
    } else {
      v.speed = lerp(v.speed, 0, dt * 2);
    }
  }
}
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}
function resolveVehicleCollisions(world, v) {
  const half = world.half;
  const a = Math.atan2(v.y, v.x);
  if (!world.shape.inside(v.x, v.y)) {
    const r = world.shape.radius(a), d = Math.hypot(v.x, v.y) || 1;
    if (d > r) { v.x *= (r / d); v.y *= (r / d); }
  }
  v.x = clamp(v.x, -half, half); v.y = clamp(v.y, -half, half);
  const tmp = world.grid.query(v.x, v.y, 60, []);
  for (const o of tmp) {
    if (!o.solid) continue;
    if (o.kind === 'wall' || o.kind === 'crate') {
      const c = collideCircleRect(v.x, v.y, 30, o);
      if (c) { v.x += c.nx * c.pen; v.y += c.ny * c.pen; v.speed *= 0.4; if (o.kind === 'crate' && o.hp > 0) { o.hp -= 40; if (o.hp <= 0) { o.solid = false; o.destroyed = true; for (let k = 0; k < (o.lootCount || 2); k++) world.loot.push(makeLootItem(Math.random, 'floor', o.x + Math.random() * 60 - 30, o.y + Math.random() * 60 - 30, world)); } } }
    } else if (o.kind === 'rock' || o.kind === 'tree') {
      const d = dist(v.x, v.y, o.x, o.y);
      if (d < o.r + 22) { const k = (o.r + 22 - d) / (d || 1); v.x += (v.x - o.x) * k; v.y += (v.y - o.y) * k; v.speed *= 0.5; }
    }
  }
}

export function briefLoot(l) {
  return { id: l.id, x: Math.round(l.x), y: Math.round(l.y), k: l.kind, wp: l.weapon, ar: l.armor, hl: l.heal, at: l.attach, am: l.ammoType, c: l.count };
}
/* ============================= أدوات الشبكة ============================= */
export function playerPublic(p) {
  return {
    id: p.id, n: p.name, t: p.team, x: Math.round(p.x), y: Math.round(p.y), a: +p.aim.toFixed(2),
    hp: Math.round(p.hp), sh: Math.round(p.shield), al: p.alive ? 1 : 0, k: p.kills, kn: p.knocked ? 1 : 0,
    c: p.charId, s: p.skinId, w: curW(p)?.id || null, veh: p.inVehicle || null,
    st: p.dropState, z: Math.round(p.z), sp: p.sprint ? 1 : 0, cr: p.crouch ? 1 : 0, pr: p.prone ? 1 : 0,
    ai: p.aiming ? 1 : 0, hl: p.healT > 0 ? 1 : 0, rl: p.reloadT > 0 ? 1 : 0, bot: p.bot ? 1 : 0,
    em: p.emote, stl: p.effects.stealth ? 1 : 0, bo: Math.round(p.boost), dmg: Math.round(p.damage),
    ve: p.vest ? ARMORS[p.vest].lvl : 0, he: p.helmet ? ARMORS[p.helmet].lvl : 0, bg: p.bag ? ARMORS[p.bag].lvl : 0,
    sc: +zoomOf(p).toFixed(2), fw: p.fireT > 0 ? 1 : 0,
  };
}
export function snapshot(match, opts = {}) {
  const players = match.players.map(playerPublic);
  return {
    t: +match.time.toFixed(2), state: match.state, alive: match.aliveCount, teams: match.teamCount,
    zone: { x: Math.round(match.zone.x), y: Math.round(match.zone.y), r: Math.round(match.zone.r), tx: Math.round(match.zone.tx), ty: Math.round(match.zone.ty), tr: Math.round(match.zone.tr), phase: match.zone.phase, st: match.zone.state, timer: Math.ceil(match.zone.timer), dps: match.zone.dps },
    plane: { x: Math.round(match.plane.x), y: Math.round(match.plane.y), a: +match.plane.angle.toFixed(2), done: match.plane.done },
    players,
    bullets: opts.bullets ? match.bullets.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), w: b.weapon, a: Math.atan2(b.vy, b.vx) })) : [],
    grenades: match.grenades.map(g => ({ id: g.id, x: Math.round(g.x), y: Math.round(g.y), it: g.item })),
    airdrops: match.airdrops.map(a => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y), z: Math.round(a.z), l: a.landed ? 1 : 0 })),
    vehicles: match.vehicles.filter(v => !v.dead).map(v => ({ id: v.id, x: Math.round(v.x), y: Math.round(v.y), a: +v.angle.toFixed(2), t: v.type, hp: Math.round(v.hp), o: v.occupants.length, dr: v.driver })),
    events: opts.full ? match.events : [],
    winner: match.winnerName, winnerTeam: match.winnerTeam, kills: match.kills,
    tdmScore: match.tdmScore, mode: match.mode, limit: match.tdmLimit,
  };
}
export { startReload, startHeal, finishReload, completeHeal };
export default {
  clamp, startReload, startHeal, lerp, dist, dist2, angleTo, rngFrom, pick, pickWeighted, makeShape, genWorld, makeLootItem, briefLoot,
  makePlayer, createMatch, addPlayer, dropPlayer, stepMatch, stepPlayer, fire, damagePlayer, killPlayer,
  tryPickup, tryPickupNearby, enterVehicle, exitVehicle, explodeVehicle, revivePlayer, useSkill,
  curW, curSlot, magSize, giveWeapon, giveStarterKit, snapshot, playerPublic, inWater, inLava, lineBlocked,
  resolveCollisions, teamAlive, alivePlayers, zoomOf, spreadOf, lerpAngle,
};
