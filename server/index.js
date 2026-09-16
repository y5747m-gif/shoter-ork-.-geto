/**
 * ORK ZONE — server/index.js
 * السيرفر: يخدم اللعبة (ملفات ثابتة) + واجهة REST للحسابات والمتجر + WebSocket للمباريات الأونلاين.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as store from './accounts.js';
import * as rooms from './rooms.js';
import {
  GAME, WEAPONS, CHARACTERS, SKINS, MAPS, MODES, WEAPON_SKINS, VEHICLE_SKINS,
  PARACHUTES, EMOTES, CRATES, WHEEL, BATTLEPASS, MISSIONS, RARITY, AMMO, ATTACHMENTS, ARMORS, HEALS, BIOMES, REWARD, BUNDLES,
} from '../shared/gamedata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

store.initStore();

const app = express();
app.use(express.json({ limit: '256kb' }));

/* ---------- كتالوج اللعبة (يستهلكه العميل) ---------- */
app.get('/api/catalog', (req, res) => {
  res.json({
    game: GAME, weapons: WEAPONS, chars: CHARACTERS, skins: SKINS, maps: MAPS, modes: MODES,
    wskins: WEAPON_SKINS, vskins: VEHICLE_SKINS, parachutes: PARACHUTES, emotes: EMOTES,
    crates: CRATES, wheel: WHEEL, battlepass: BATTLEPASS, missions: MISSIONS, rarity: RARITY, bundles: BUNDLES,
    ammo: AMMO, attachments: ATTACHMENTS, armors: ARMORS, heals: HEALS, biomes: BIOMES, reward: REWARD,
    stats: rooms.roomStats(),
  });
});
app.get('/api/health', (req, res) => res.json({ ok: true, version: GAME.version, rooms: rooms.roomStats(), uptime: process.uptime() }));
app.get('/api/rankings', (req, res) => res.json(store.getRankings()));

/* ---------- الحسابات ---------- */
app.post('/api/auth/register', (req, res) => {
  const { name, password } = req.body || {};
  const r = store.createAccount(name, password);
  if (r.error) return res.status(400).json(r);
  res.json({ token: r.token, profile: store.publicProfile(r.account) });
});
app.post('/api/auth/login', (req, res) => {
  const r = store.login(req.body?.name, req.body?.password);
  if (r.error) return res.status(400).json(r);
  res.json({ token: r.token, profile: store.publicProfile(r.account) });
});
app.post('/api/auth/guest', (req, res) => {
  const r = store.guest(req.body?.name);
  res.json({ token: r.token, profile: store.publicProfile(r.account) });
});
app.get('/api/profile', (req, res) => {
  const acc = store.byToken(req.query.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  res.json({ profile: store.publicProfile(acc) });
});

/* ---------- المتجر ---------- */
app.post('/api/shop/buy', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.buyItem(acc, req.body.kind, req.body.id);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/shop/equip', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.equip(acc, req.body.slot, req.body.id);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/shop/bundle', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.buyBundle(acc, req.body.bundleId);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/shop/crate', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.openCrate(acc, req.body.crateId);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/shop/wheel', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.spinWheel(acc);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/bp/buy', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.buyBattlePass(acc);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/bp/claim', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.claimBattlePass(acc, Number(req.body.tier), req.body.track);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/daily/claim', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.claimDaily(acc);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/missions/claim', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.claimMission(acc, req.body.id);
  res.status(r.error ? 400 : 200).json(r);
});
app.post('/api/settings', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  res.json({ settings: store.setSettings(acc, req.body.settings || {}) });
});
app.post('/api/friends/add', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r = store.addFriend(acc, String(req.body?.name || ''));
  res.status(r.error ? 400 : 200).json(r);
});
/** مباراة أوفلاين: تُمنح الجوائز بنفس قواعد الأونلاين (تحقق بسيط من صحة النتيجة) */
app.post('/api/offline/result', (req, res) => {
  const acc = store.byToken(req.body?.token);
  if (!acc) return res.status(401).json({ error: 'جلسة غير صالحة' });
  const r0 = req.body?.result || {};
  const result = {
    placement: Math.max(1, Math.min(50, Math.round(+r0.placement || 1))),
    kills: Math.max(0, Math.min(60, Math.round(+r0.kills || 0))),
    damage: Math.max(0, Math.min(12000, Math.round(+r0.damage || 0))),
    headshots: Math.max(0, Math.min(40, Math.round(+r0.headshots || 0))),
    time: Math.max(0, Math.min(1800, Math.round(+r0.time || 0))),
    revives: Math.max(0, Math.min(20, Math.round(+r0.revives || 0))),
    mode: String(r0.mode || 'solo').slice(0, 8),
    won: !!r0.won,
  };
  const rewards = store.applyMatchResult(acc, result);
  res.json({ rewards, result });
});

/* ---------- ملفات اللعبة الثابتة ---------- */
app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', maxAge: 0, etag: true }));
app.get(/^\/(?!api|shared|ws).*/, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let clientSeq = 1;
wss.on('connection', (ws, req) => {
  const client = {
    id: 'c' + (clientSeq++), ws, account: null, room: null, playerId: null, input: {},
    ready: false, team: 0, joinedAt: Date.now(), alive: true,
    applyResult(res) {
      if (!client.account) return;
      try {
        const rewards = store.applyMatchResult(client.account, res);
        sendTo(client, { t: 'rewards', rewards });
      } catch (e) { console.warn('reward error', e.message); }
    },
  };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  sendTo(client, { t: 'hello', version: GAME.version, stats: rooms.roomStats() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      switch (msg.t) {
        case 'auth': {
          const acc = msg.token ? store.byToken(msg.token) : null;
          if (acc) { client.account = acc; sendTo(client, { t: 'authOk', profile: store.publicProfile(acc) }); }
          else sendTo(client, { t: 'authFail', error: 'جلسة غير صالحة' });
          return;
        }
        case 'authGuest': {
          const r = store.guest(msg.name);
          client.account = r.account;
          sendTo(client, { t: 'authOk', profile: store.publicProfile(r.account), token: r.token });
          return;
        }
        case 'queue': {
          if (!client.account) return sendTo(client, { t: 'error', error: 'سجّل الدخول أولاً' });
          if (client.room) rooms.leaveRoom(client);
          rooms.enqueue(client, msg.mode, msg.mapId);
          return;
        }
        case 'createRoom': {
          if (!client.account) return sendTo(client, { t: 'error', error: 'سجّل الدخول أولاً' });
          if (client.room) rooms.leaveRoom(client);
          const room = rooms.createPrivate(client, msg.mode, msg.mapId);
          sendTo(client, { t: 'queued', roomId: room.id, code: room.code, private: true });
          return;
        }
        case 'joinCode': {
          if (!client.account) return sendTo(client, { t: 'error', error: 'سجّل الدخول أولاً' });
          const room = rooms.findRoom(String(msg.code || '').trim());
          if (!room) return sendTo(client, { t: 'error', error: 'لا توجد غرفة بهذا الرمز' });
          if (client.room) rooms.leaveRoom(client);
          const r = rooms.joinRoom(room, client);
          if (r.error) sendTo(client, { t: 'error', error: r.error });
          return;
        }
        case 'lobbyChat': {
          if (!client.room) return;
          for (const c of client.room.clients) sendTo(c, { t: 'chat', from: client.account?.name || 'لاعب', text: String(msg.text || '').slice(0, 120), lobby: true });
          return;
        }
        case 'stats': return sendTo(client, { t: 'stats', stats: rooms.roomStats() });
        default: return rooms.handleMessage(client, msg);
      }
    } catch (e) { console.warn('[ws] handler error', msg.t, e.message); }
  });

  ws.on('close', () => {
    if (client.room) {
      const room = client.room;
      // إن كانت المباراة جارية: حوّل اللاعب إلى بوت حتى تستمر المباراة
      if (room.state === 'playing' && room.match) {
        // اللاعب المنقطع يتحول إلى بوت حتى تستمر المباراة للبقية
        const p = room.match.players.find(pp => pp.id === client.playerId);
        if (p && !p.bot) { p.bot = true; p.disconnected = true; room.bots.push(p); }
        room.clients = room.clients.filter(c => c !== client);
        if (room.clients.length === 0) rooms.destroyRoom(room, 3000);
      } else rooms.leaveRoom(client);
    }
  });
});

function sendTo(client, obj) {
  try { if (client.ws.readyState === 1) client.ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

// نبضة القلب + دورة اللعبة
setInterval(() => {
  for (const c of wss.clients) {
    if (c.isAlive === false) { c.terminate(); continue; }
    c.isAlive = false;
    try { c.ping(); } catch { }
  }
}, 30000);

setInterval(() => {
  try { rooms.tick(); } catch (e) { console.error('[tick]', e.stack || e.message); }
}, 1000 / 30);

process.on('uncaughtException', (e) => { console.error('[uncaught]', e.stack || e.message); });
process.on('unhandledRejection', (e) => { console.error('[unhandled]', (e && (e.stack || e.message)) || e); });

process.on('SIGINT', () => { store.flush(); process.exit(0); });
process.on('SIGTERM', () => { store.flush(); process.exit(0); });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚔️  ORK ZONE v${GAME.version}`);
  console.log(`  🎮  اللعبة:      http://localhost:${PORT}`);
  console.log(`  🌐  WebSocket:   ws://localhost:${PORT}/ws`);
  console.log(`  🗺️  الخرائط:     ${MAPS.map(m => m.ar).join(' · ')}`);
  console.log(`  🔫  الأسلحة:     ${Object.keys(WEAPONS).length}`);
  console.log(`  🧍  الشخصيات:    ${CHARACTERS.length}  |  ✨ الاسكنات: ${SKINS.length}\n`);
});
export default app;
