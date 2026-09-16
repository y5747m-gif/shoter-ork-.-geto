/**
 * ORK ZONE — server/rooms.js
 * الغرف + الدورة اللعبة على السيرفر (سلطة كاملة على المحاكاة) + مطابقة اللاعبين + البوتات.
 */
import {
  createMatch, addPlayer, dropPlayer, stepMatch, tryPickup, enterVehicle, exitVehicle,
  snapshot, killPlayer, useSkill, curSlot, zoomOf,
} from '../shared/sim.js';
import { botThink, makeBotBrain, botLoadout, DIFFICULTY } from '../shared/ai.js';
import { MODES, MAPS, CHARACTERS, SKINS, WEAPONS, GAME } from '../shared/gamedata.js';

export const TICK_MS = 1000 / GAME.tickRate;
export const SNAP_MS = 1000 / GAME.snapshotRate;

export const rooms = new Map();
const queue = { solo: [], duo: [], squad: [], tdm: [] };
let roomSeq = 1;
const BOT_NAMES = [
  'أبو الفهد', 'سيف الشرق', 'صقر الليل', 'قناص بغداد', 'ظل الرمال', 'ذيب الشمال', 'عاصفة', 'فارس',
  'النسر', 'حجر الرحى', 'بركان', 'خنجر', 'المرعب', 'جبل النار', 'شبح الصحراء', 'طيف',
  'الأمير', 'جوكر', 'عقرب', 'رعد', 'سهم', 'صخرة', 'الملك', 'تنين الليل',
  'أبو مروان', 'الجبل', 'مدفع', 'خفاش', 'دبابة', 'زئير', 'وصلة نار', 'الأسود',
  'جحدر', 'الحصان', 'شقاع', 'ملثم', 'بندقية', 'كمين', 'مقاتل', 'الأشهب',
  'أبو خالد', 'سلاش', 'فهد الليل', 'زعيم الحارة', 'سيد الساحة', 'نمر الجنوب', 'الحوت', 'صاعق',
];

function send(client, obj) {
  try { if (client.ws && client.ws.readyState === 1) client.ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

/* ============================= الغرف ============================= */
export function createRoom(opts = {}) {
  const mode = MODES.find(m => m.id === opts.mode) || MODES[0];
  const mapId = MAPS.find(m => m.id === opts.mapId) ? opts.mapId : MAPS[Math.floor(Math.random() * MAPS.length)].id;
  const room = {
    id: 'room' + (roomSeq++), code: String(Math.floor(1000 + Math.random() * 8999)),
    mode: mode.id, modeDef: mode, mapId, private: !!opts.private, owner: opts.owner || null,
    clients: [], bots: [], match: null, state: 'lobby', countdown: 8, phaseT: 0,
    lastTick: Date.now(), lastSnap: 0, teamSeq: 0, createdAt: Date.now(), filled: false,
  };
  rooms.set(room.id, room);
  return room;
}

/** إغلاق غرفة وحذفها بأمان بعد انتهاء مباراتها */
export function destroyRoom(id, delay = 2500) {
  const room = typeof id === 'object' ? id : rooms.get(id);
  if (!room) return;
  room.state = 'closed';
  const t = setTimeout(() => { rooms.delete(room.id); }, delay);
  t.unref?.();
}

export function findRoom(code) {
  for (const r of rooms.values()) if (r.code === code) return r;
  return null;
}

export function joinRoom(room, client) {
  if (room.clients.length >= 8) return { error: 'الغرفة ممتلئة' };
  if (room.state === 'playing') return { error: 'المباراة بدأت' };
  client.room = room;
  room.clients.push(client);
  client.team = assignTeam(room, client);
  broadcastLobby(room);
  return { ok: true, room };
}

function assignTeam(room, client) {
  if (room.mode === 'solo') return (room.teamSeq = (room.teamSeq || 0) + 1);
  const mode = room.modeDef.players || 4;
  const counts = {};
  for (const c of room.clients) counts[c.team] = (counts[c.team] || 0) + 1;
  let best = 0, bestCount = 1e9;
  for (let t = 0; t < mode; t++) { const n = counts[t] || 0; if (n < bestCount) { bestCount = n; best = t; } }
  return best;
}

export function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  room.clients = room.clients.filter(c => c !== client);
  client.room = null;
  const q = queue[room.mode]; if (q) queue[room.mode] = q.filter(c => c !== client);
  if (room.clients.length === 0) destroyRoom(room, 2000);
  else broadcastLobby(room);
}

function broadcastLobby(room) {
  const info = {
    id: room.id, code: room.code, mode: room.mode, mapId: room.mapId, private: room.private,
    state: room.state, countdown: Math.ceil(room.countdown),
    players: room.clients.map(c => ({
      name: c.account.name, id: c.id, team: c.team, ready: !!c.ready,
      char: c.account.equipped.char, skin: c.account.equipped.skin, level: c.account.level, bot: false,
    })),
  };
  for (const c of room.clients) send(c, { t: 'lobby', room: info });
}

/* ============================= المطابقة ============================= */
export function enqueue(client, mode, mapId) {
  const m = MODES.find(x => x.id === mode) ? mode : 'solo';
  // ابحث عن غرفة مفتوحة
  for (const r of rooms.values()) {
    if (r.state === 'lobby' && !r.private && r.mode === m && r.clients.length < 8 && Date.now() - r.createdAt < 60000 && r.countdown > 3) {
      const res = joinRoom(r, client);
      if (res.ok) { send(client, { t: 'queued', roomId: r.id, code: r.code }); return r; }
    }
  }
  const room = createRoom({ mode: m, mapId, owner: client.id });
  joinRoom(room, client);
  send(client, { t: 'queued', roomId: room.id, code: room.code });
  return room;
}

export function createPrivate(client, mode, mapId) {
  const room = createRoom({ mode, mapId, private: true, owner: client.id });
  joinRoom(room, client);
  return room;
}

/* ============================= بدء المباراة ============================= */
export function startMatch(room) {
  const seed = Math.floor(Math.random() * 1e9);
  const match = createMatch({ mapId: room.mapId, seed, mode: room.mode, teams: room.mode !== 'ffa', id: room.id + '-' + seed });
  match.mode = room.mode;
  match.teams = room.mode !== 'ffa';
  room.match = match;
  room.state = 'playing';
  const modeDef = room.modeDef;
  const humans = room.clients;
  // سعة المباراة
  const squadSize = modeDef.players || 1;
  const targetTeams = room.mode === 'tdm' ? 2 : (room.mode === 'solo' ? 40 : room.mode === 'duo' ? 22 : 14);
  const targetPlayers = room.mode === 'tdm' ? 8 : targetTeams * (room.mode === 'solo' ? 1 : squadSize);
  // اللاعبون الحقيقيون
  const playerTeams = new Map();
  for (const c of humans) {
    if (room.mode !== 'tdm') playerTeams.set(c.id, room.mode === 'solo' ? (playerTeams.size) : (c.team % targetTeams));
    else playerTeams.set(c.id, c.team);
    const acc = c.account;
    const p = addPlayer(match, {
      id: c.id, name: acc.name, team: playerTeams.get(c.id), bot: false,
      charId: acc.equipped.char, skinId: acc.equipped.skin,
      weaponSkin: (acc.equipped.wskin && acc.equipped.wskin[WEAPONS[curSlotWeapon(acc)]?.id]) || null,
      parachute: acc.equipped.parachute || 'pc_basic',
    });
    p.account = acc;
    p.client = c;
    c.playerId = p.id;
    c.match = match;
    if (room.mode === 'tdm') {
      const a2 = Math.random() * Math.PI * 2, r2 = 150 + Math.random() * 420;
      p.x = Math.cos(a2) * r2; p.y = Math.sin(a2) * r2; p.dropState = 'landed'; p.z = 0; p.shield = 50;
      giveStarterKitLocal(p, match);
    }
  }
  // البوتات
  const usedTeams = new Set([...playerTeams.values()]);
  const botCount = Math.max(0, targetPlayers - humans.length);
  const diffPool = ['rookie', 'normal', 'normal', 'veteran', 'veteran', 'pro'];
  for (let i = 0; i < botCount; i++) {
    let team;
    if (room.mode === 'tdm') team = i % 2;
    else if (room.mode === 'solo') team = 1000 + i;
    else {
      const spots = [];
      for (let t = 0; t < targetTeams; t++) {
        const inTeam = match.players.filter(p => p.team === t).length;
        if (inTeam < squadSize) spots.push(t);
      }
      if (!spots.length) break;
      team = spots[Math.floor(Math.random() * spots.length)];
    }
    const diff = diffPool[Math.floor(Math.random() * diffPool.length)];
    const char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    const skins = SKINS.filter(s => s.char === '*' || s.char === char.id);
    const skin = skins[Math.floor(Math.random() * skins.length)];
    const bot = addPlayer(match, {
      id: 'bot' + i + '_' + seed, name: BOT_NAMES[(i + room.id.length) % BOT_NAMES.length] + (i > BOT_NAMES.length ? i : ''),
      team, bot: true, charId: char.id, skinId: skin ? skin.id : 'out_basic',
    });
    bot.ai = makeBotBrain(diff);
    bot.difficulty = diff;
    botLoadout(bot, diff);
    bot.botName = bot.name;
    room.bots.push(bot);
  }
  match.totalTeams = new Set(match.players.map(p => p.team)).size;
  match.inputs = {};
  for (const c of room.clients) send(c, {
    t: 'start',
    info: { matchId: match.id, mapId: room.mapId, mode: room.mode, seed, youId: c.playerId, team: c.team },
  });
  room.lastTick = Date.now();
  return match;
}
function curSlotWeapon(acc) { return acc.equipped.wskin ? Object.keys(acc.equipped.wskin)[0] : null; }
function giveStarterKitLocal(p, match) {
  const opts2 = ['mp40', 'ump', 'akm', 'm416', 'scar'];
  const w = opts2[Math.floor(Math.random() * opts2.length)];
  p.weapons = [{ id: w, ammo: WEAPONS[w].mag, attachments: [] }, { id: 'p92', ammo: 15, attachments: [] }];
  p.curWeapon = 0;
  p.ammo = { '9mm': 120, '556': 120, '762': 120, '12g': 16, '45': 40, 'sniper': 10 };
  p.heals = { bandage: 3, energy: 1, medkit: 1, grenade: 2, smoke: 1 };
}

/* ============================= حلقة اللعبة ============================= */
export function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state === 'lobby') {
      room.countdown -= (1 / GAME.tickRate);
      if (room.countdown <= 0 || (room.clients.length > 0 && room.clients.every(c => c.ready))) {
        startMatch(room);
      }
      continue;
    }
    if (room.state === 'playing') {
      const dt = Math.min(0.1, (now - room.lastTick) / 1000);
      room.lastTick = now;
      const match = room.match;
      if (!match) continue;
      // مدخلات اللاعبين الحقيقيين
      const inputs = {};
      for (const c of room.clients) {
        const p = match.players.find(pp => pp.id === c.playerId);
        if (!p) continue;
        const inp = { ...(c.input || {}) };
        if (!p.alive && match.mode === 'tdm' && p.respawnT > 0) {
          p.respawnT -= dt;
          if (p.respawnT <= 0) respawnPlayer(match, p);
        }
        inputs[c.playerId] = inp;
        c.input = { mx: inp.mx, my: inp.my, aim: inp.aim, shoot: inp.shoot, reload: inp.reload, heal: inp.heal, aiming: inp.aiming, sprint: inp.sprint, vehicleAngle: inp.vehicleAngle, vehicleThrottle: inp.vehicleThrottle, reviving: inp.reviving };
      }
      // البوتات
      for (const bot of room.bots) {
        if (!bot.alive) {
          if (match.mode === 'tdm' && bot.respawnT > 0) { bot.respawnT -= dt; if (bot.respawnT <= 0) respawnPlayer(match, bot); }
          continue;
        }
        if (bot.client) continue;
        const inp = botThink(match, bot, dt);
        inputs[bot.id] = inp;
        if (inp.jump) dropPlayer(match, bot, inp.jump.x, inp.jump.y);
        if (inp.pickup) tryPickup(match, bot, inp.pickup);
        if (inp.interact?.vehicle) enterVehicle(match, bot, inp.interact.vehicle);
        if (inp.exitVehicle) exitVehicle(match, bot);
      }
      match.inputs = inputs;
      const beforeEvents = match.events.length;
      // خطوات فرعية لثبات أعلى (٦٦ هرتز داخلياً)
      const sub = Math.max(1, Math.min(3, Math.round(dt / 0.02)));
      for (let i = 0; i < sub; i++) stepMatch(match, dt / sub, inputs, {
        onKill: (victim, killer) => {
          if (victim.client) send(victim.client, { t: 'youDied', by: killer ? killer.name : 'البيئة', placement: victim.placement });
        },
      });
      // إحياء يدوي من اللاعبين: reviving
      handleRevives(match, room);
      // دمج أحداث
      const newEvents = match.events.slice(beforeEvents);
      if (newEvents.length) {
        for (const c of room.clients) {
          send(c, { t: 'ev', list: newEvents.filter(e => !e.silent || e.by === c.playerId) });
        }
      }
      // لقطة
      if (now - room.lastSnap >= SNAP_MS) {
        room.lastSnap = now;
        const snap = snapshot(match, { bullets: true });
        for (const c of room.clients) {
          const p = match.players.find(pp => pp.id === c.playerId);
          send(c, {
            t: 'snap', s: snap,
            you: p ? {
              hp: Math.round(p.hp), sh: Math.round(p.shield), ammo: ammoView(p), heals: p.heals,
              boost: Math.round(p.boost), bag: p.bag, vest: p.vest, helmet: p.helmet, knocked: p.knocked ? 1 : 0,
              skills: { cd: +p.skill.cd.toFixed(1), active: +p.skill.active.toFixed(1), total: 40, kind: p.char.skill.kind, ar: p.char.skill.ar },
              alive: p.alive ? 1 : 0, kills: p.kills, revives: p.revives || 0, cur: p.curWeapon,
              weapons: p.weapons.map(w => ({ id: w.id, ammo: w.ammo, att: w.attachments })),
              vestLvl: p.vest ? 1 : 0, scope: +zoomOf(p).toFixed(2),
            } : null,
          });
        }
      }
      // نهاية
      if (match.state === 'over') {
        room.state = 'over';
        room.phaseT = 0;
        finishMatch(room);
      }
    } else if (room.state === 'over') {
      room.phaseT += (1 / GAME.tickRate);
      if (room.phaseT > 22) {
        // العودة إلى الغرفة
        room.state = 'lobby';
        room.countdown = 15;
        room.match = null;
        room.bots = [];
        room.teamSeq = 0;
        for (const c of room.clients) { c.ready = false; c.playerId = null; c.match = null; }
        broadcastLobby(room);
      }
    }
  }
}
function ammoView(p) {
  const slot = curSlot(p);
  const w = slot ? WEAPONS[slot.id] : null;
  return { inMag: slot ? slot.ammo : 0, reserve: w && w.ammo !== 'melee' ? (p.ammo[w.ammo] || 0) : 0, type: w ? w.ammo : 'melee' };
}
function handleRevives(match, room) {
  for (const c of room.clients) {
    if (!c.input?.reviving) continue;
    const p = match.players.find(pp => pp.id === c.playerId);
    if (!p || !p.alive) continue;
    for (const t of match.players) {
      if (t === p || !t.knocked || t.team !== p.team) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) < 70) {
        t.reviveProgress += 0.05;
        if (t.reviveProgress >= 3) {
          t.knocked = false; t.hp = 40; t.reviveProgress = 0;
          match.events.push({ t: match.time, type: 'revive', id: t.id, by: p.id });
          if (p.account) p.revived = (p.revived || 0) + 1;
          p.revives = (p.revives || 0) + 1;
        }
      }
    }
  }
}
function respawnPlayer(match, p) {
  const a0 = Math.random() * Math.PI * 2, r0 = Math.random() * match.zone.r * 0.8;
  const zx = match.zone.x + Math.cos(a0) * r0;
  const zy = match.zone.y + Math.sin(a0) * r0;
  p.x = zx; p.y = zy; p.hp = 100; p.shield = 50; p.alive = true; p.knocked = false;
  p.bleed = 100; p.effects = {}; p.weapons = [];
  p.ammo = { '9mm': 90, '556': 90, '762': 90, '12g': 12, '45': 30, 'sniper': 8 };
  p.heals = { bandage: 2, energy: 1, medkit: 0, grenade: 1, smoke: 0 };
  addPlayerWeapon(p);
  match.events.push({ t: match.time, type: 'respawn', id: p.id, x: p.x, y: p.y });
}
function addPlayerWeapon(p) {
  const opts = ['mp40', 'ump', 'akm', 'm416', 'scar'];
  const w = opts[Math.floor(Math.random() * opts.length)];
  p.weapons = [{ id: w, ammo: WEAPONS[w].mag, attachments: [] }, { id: 'machete', ammo: 0, attachments: [] }];
  p.curWeapon = 0;
}

function finishMatch(room) {
  const match = room.match;
  for (const c of room.clients) {
    const p = match.players.find(pp => pp.id === c.playerId);
    if (!p) continue;
    const res = {
      placement: p.placement || (p.alive ? 1 : 0) || 0,
      kills: p.kills, damage: Math.round(p.damage), headshots: p.headshots,
      time: match.time, mode: room.mode, revives: p.revives || 0,
      won: match.winnerTeam !== null && p.team === match.winnerTeam,
      assists: 0,
    };
    c.lastResult = res;
    send(c, { t: 'matchEnd', res, winner: match.winnerName, winnerTeam: match.winnerTeam, tdmScore: match.tdmScore });
    if (c.applyResult) c.applyResult(res);
  }
}

/* ============================= مدخلات ============================= */
export function handleMessage(client, msg) {
  const room = client.room;
  switch (msg.t) {
    case 'input': {
      if (!room || room.state !== 'playing') return;
      client.input = {
        mx: clampNum(msg.mx, -1, 1), my: clampNum(msg.my, -1, 1), aim: num(msg.aim),
        shoot: !!msg.shoot, reload: !!msg.reload, heal: msg.heal || null, aiming: !!msg.aiming,
        sprint: !!msg.sprint, crouch: !!msg.crouch, prone: !!msg.prone, swap: msg.swap,
        skill: !!msg.skill, emote: msg.emote, vehicleAngle: num(msg.vehicleAngle),
        vehicleThrottle: msg.vehicleThrottle ? 1 : 0, reviving: !!msg.reviving, grenade: !!msg.grenade,
        seq: msg.seq,
      };
      return;
    }
    case 'action': {
      if (!room || room.state !== 'playing') return;
      const match = room.match;
      const p = match?.players.find(pp => pp.id === client.playerId);
      if (!p || !p.alive) return;
      const a = msg.a;
      if (a === 'jump') { dropPlayer(match, p, clampNum(msg.x, -match.world.half, match.world.half), clampNum(msg.y, -match.world.half, match.world.half)); client.input = { ...(client.input || {}), mx: 0, my: 0 }; }
      else if (a === 'pickup') tryPickup(match, p, msg.id);
      else if (a === 'pickupNear') {
        let best = null, bd = 1e9;
        for (const l of match.loot) { if (l.taken) continue; const d = Math.hypot(l.x - p.x, l.y - p.y); if (d < 70 && d < bd) { bd = d; best = l; } }
        if (best) tryPickup(match, p, best.id);
      }
      else if (a === 'vehicle') enterVehicle(match, p, msg.id);
      else if (a === 'exitVehicle') exitVehicle(match, p);
      else if (a === 'skill') useSkill(match, p);
      else if (a === 'swap') { if (p.weapons[msg.i]) { p.curWeapon = msg.i; } }
      else if (a === 'grenadeMode') { p.grenadeMode = msg.mode; }
      else if (a === 'emote') { p.emote = msg.id; p.emoteT = 4; }
      else if (a === 'drop') { /* تجاهل */ }
      client.lastAction = a;
      return;
    }
    case 'ready': client.ready = true; if (room) broadcastLobby(room); return;
    case 'chat': {
      if (!room) return;
      const text = String(msg.text || '').slice(0, 120);
      if (!text) return;
      for (const c of room.clients) send(c, { t: 'chat', from: client.account.name, text, team: client.team });
      return;
    }
    case 'ping': send(client, { t: 'pong', id: msg.id, ts: msg.ts }); return;
    case 'leave': leaveRoom(client); return;
    default: return;
  }
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const clampNum = (v, a, b) => Math.max(a, Math.min(b, num(v)));

/* ============================= إحصاءات ============================= */
export function roomStats() {
  let playing = 0, lobby = 0, humans = 0;
  for (const r of rooms.values()) {
    if (r.state === 'playing') playing++; else if (r.state === 'lobby') lobby++;
    humans += r.clients.length;
  }
  return { rooms: rooms.size, playing, lobby, humans, bots: [...rooms.values()].reduce((s, r) => s + r.bots.length, 0), queue: Object.values(queue).reduce((s, q) => s + q.length, 0) };
}
export default { createRoom, findRoom, destroyRoom, joinRoom, leaveRoom, enqueue, createPrivate, startMatch, tick, handleMessage, roomStats, rooms };
