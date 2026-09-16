/**
 * ORK ZONE — server/accounts.js
 * حسابات اللاعبين: مستويات، ذهب، جواهر، متجر، باس المعركة، مهام، أصدقاء.
 * تخزين ملف JSON بسيط (يمكن استبداله بقاعدة بيانات لاحقاً).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CHARACTERS, SKINS, WEAPON_SKINS, VEHICLE_SKINS, PARACHUTES, EMOTES, CRATES, WHEEL, BUNDLES,
  BATTLEPASS, MISSIONS, LEVEL_XP, REWARD, RARITY_ORDER, RARITY,
} from '../shared/gamedata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.json');
const RANK_FILE = path.join(DATA_DIR, 'rankings.json');

let db = { accounts: {}, tokens: {}, guestSeq: 1 };
let rankings = { kills: [], wins: [], damage: [] };
let dirty = false;

export function initStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.tokens) db.tokens = {};
    if (fs.existsSync(RANK_FILE)) rankings = JSON.parse(fs.readFileSync(RANK_FILE, 'utf8'));
  } catch (e) { console.warn('[store] init failed:', e.message); }
  setInterval(flush, 5000).unref?.();
  return db;
}
export function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    fs.writeFileSync(RANK_FILE, JSON.stringify(rankings));
  } catch (e) { console.warn('[store] flush failed:', e.message); }
}
const markDirty = () => { dirty = true; };

const hash = (s) => crypto.createHash('sha256').update(String(s) + '|orkzone').digest('hex');
const newToken = () => crypto.randomBytes(20).toString('hex');

export function defaultAccount(name, pwHash = null) {
  const acc = {
    id: 'u' + crypto.randomBytes(6).toString('hex'),
    name: name.slice(0, 16),
    pw: pwHash,
    guest: pwHash === null,
    created: Date.now(),
    level: 1, xp: 0, gold: 2500, gems: 60,
    bpXp: 0, bpPremium: false,
    owned: {
      chars: ['fahd', 'amer'], skins: ['out_basic'], wskins: [], vskins: [], parachutes: ['pc_basic'], emotes: ['em_wave'],
    },
    equipped: { char: 'fahd', skin: 'out_basic', wskin: null, parachute: 'pc_basic', emote: 'em_wave', vskin: {} },
    stats: { games: 0, wins: 0, top10: 0, kills: 0, damage: 0, headshots: 0, revives: 0, timePlayed: 0, chickenDinners: 0, bestKills: 0 },
    missions: { progress: {}, claimed: {} },
    missionsDate: { daily: dayKey(), weekly: weekKey() },
    daily: { day: null, streak: 0 },
    friends: [],
    settings: { sfx: 0.8, music: 0.5, quality: 'high', sens: 1, autoFire: false },
  };
  return acc;
}

export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

function checkResets(acc) {
  const today = dayKey(), week = weekKey();
  let changed = false;
  for (const m of MISSIONS) {
    const isDaily = m.type === 'daily' && acc.missionsDate.daily !== today;
    const isWeekly = m.type === 'weekly' && acc.missionsDate.weekly !== week;
    if (isDaily || isWeekly) {
      delete acc.missions.progress[m.id];
      delete acc.missions.claimed[m.id];
      changed = true;
    }
  }
  if (acc.missionsDate.daily !== today) { acc.missionsDate.daily = today; changed = true; }
  if (acc.missionsDate.weekly !== week) { acc.missionsDate.weekly = week; changed = true; }
  return changed;
}

export function createAccount(name, password) {
  if (!name || name.trim().length < 2) return { error: 'الاسم قصير جداً' };
  const exists = Object.values(db.accounts).some(a => a.name.toLowerCase() === name.trim().toLowerCase() && !a.guest);
  if (exists) return { error: 'الاسم مستخدم بالفعل' };
  const acc = defaultAccount(name.trim(), password ? hash(password) : null);
  db.accounts[acc.id] = acc;
  const token = newToken();
  db.tokens[token] = acc.id;
  markDirty();
  return { account: acc, token };
}

export function login(name, password) {
  const acc = Object.values(db.accounts).find(a => a.name.toLowerCase() === String(name || '').trim().toLowerCase() && !a.guest);
  if (!acc) return { error: 'لا يوجد حساب بهذا الاسم' };
  if (acc.pw !== hash(password || '')) return { error: 'كلمة المرور غير صحيحة' };
  const token = newToken();
  db.tokens[token] = acc.id;
  markDirty();
  return { account: acc, token };
}

export function guest(name) {
  const acc = defaultAccount(name ? name.slice(0, 12) : 'زائر' + Math.floor(Math.random() * 9000 + 1000), null);
  db.accounts[acc.id] = acc;
  const token = newToken();
  db.tokens[token] = acc.id;
  markDirty();
  return { account: acc, token };
}

export function byToken(token) {
  const id = db.tokens[token];
  if (!id) return null;
  const acc = db.accounts[id];
  if (!acc) return null;
  if (checkResets(acc)) markDirty();
  return acc;
}
export function byId(id) { return db.accounts[id] || null; }
export function touch() { markDirty(); }

export function claimDaily(acc) {
  const today = dayKey();
  if (acc.daily && acc.daily.day === today) return { error: 'استلمت مكافأة اليوم بالفعل — عد غداً' };
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  acc.daily = acc.daily || { day: null, streak: 0 };
  acc.daily.streak = acc.daily.day === yesterday ? Math.min(7, acc.daily.streak + 1) : 1;
  acc.daily.day = today;
  const gold = 250 + acc.daily.streak * 150;
  const gems = 8 + acc.daily.streak * 4;
  const xp = 120 + acc.daily.streak * 60;
  acc.gold += gold; acc.gems += gems;
  addXp(acc, xp);
  markDirty();
  return { ok: true, gold, gems, xp, streak: acc.daily.streak, profile: publicProfile(acc) };
}

export function publicProfile(acc) {
  return {
    id: acc.id, name: acc.name, guest: acc.guest, level: acc.level, xp: acc.xp, xpNeed: LEVEL_XP(acc.level),
    gold: acc.gold, gems: acc.gems, bpXp: acc.bpXp, bpPremium: acc.bpPremium,
    bpTier: Math.min(BATTLEPASS.tiers, Math.floor(acc.bpXp / BATTLEPASS.xpPerTier) + 1),
    owned: acc.owned, equipped: acc.equipped, stats: acc.stats,
    missions: missionView(acc), settings: acc.settings, friends: acc.friends,
    daily: { available: !acc.daily || acc.daily.day !== dayKey(), streak: (acc.daily && acc.daily.streak) || 0 },
  };
}

export function missionView(acc) {
  return MISSIONS.map(m => ({
    id: m.id, type: m.type, ar: m.ar, goal: m.goal, reward: m.reward,
    progress: Math.min(acc.missions.progress[m.id] || 0, m.goal),
    claimed: !!acc.missions.claimed[m.id],
  }));
}

export function addXp(acc, xp) {
  acc.xp += xp;
  let ups = 0;
  while (acc.xp >= LEVEL_XP(acc.level)) { acc.xp -= LEVEL_XP(acc.level); acc.level++; ups++; acc.gems += 5; }
  markDirty();
  return ups;
}

export function progressMission(acc, id, value = 1) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m) return;
  acc.missions.progress[id] = (acc.missions.progress[id] || 0) + value;
  markDirty();
}

export function claimMission(acc, id) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m) return { error: 'مهمة غير موجودة' };
  const prog = acc.missions.progress[id] || 0;
  if (prog < m.goal) return { error: 'لم تكتمل المهمة بعد' };
  if (acc.missions.claimed[id]) return { error: 'تم استلام الجائزة' };
  acc.missions.claimed[id] = true;
  acc.gold += m.reward.gold || 0;
  acc.gems += m.reward.gems || 0;
  acc.bpXp += m.reward.bp || 0;
  addXp(acc, m.reward.xp || 0);
  markDirty();
  return { ok: true, profile: publicProfile(acc) };
}

/* ============================= المتجر ============================= */
export function priceOf(item) {
  return { gold: item.price || 0, gems: item.gems || 0 };
}
export function buyItem(acc, kind, id) {
  const table = {
    char: CHARACTERS, skin: SKINS, wskin: WEAPON_SKINS, vskin: VEHICLE_SKINS,
    parachute: PARACHUTES, emote: EMOTES,
  };
  const list = table[kind]; if (!list) return { error: 'نوع غير معروف' };
  const item = list.find(i => i.id === id); if (!item) return { error: 'عنصر غير موجود' };
  const bucket = kind === 'char' ? 'chars' : kind === 'skin' ? 'skins' : kind === 'wskin' ? 'wskins' : kind === 'vskin' ? 'vskins' : kind === 'parachute' ? 'parachutes' : 'emotes';
  if (acc.owned[bucket].includes(id)) return { error: 'تملكه بالفعل' };
  const cost = priceOf(item);
  if (cost.gems > 0) { if (acc.gems < cost.gems) return { error: 'جواهرك غير كافية' }; acc.gems -= cost.gems; }
  if (cost.gold > 0) { if (acc.gold < cost.gold) return { error: 'ذهبك غير كافٍ' }; acc.gold -= cost.gold; }
  acc.owned[bucket].push(id);
  markDirty();
  return { ok: true, profile: publicProfile(acc), item };
}

export function equip(acc, slot, id) {
  const map = { char: 'chars', skin: 'skins', wskin: 'wskins', vskin: 'vskins', parachute: 'parachutes', emote: 'emotes' };
  const bucket = map[slot]; if (!bucket) return { error: 'خانة غير معروفة' };
  if (id !== null && !acc.owned[bucket].includes(id)) return { error: 'لا تملك هذا العنصر' };
  if (slot === 'char') {
    const c = CHARACTERS.find(x => x.id === id);
    if (!c) return { error: 'شخصية غير موجودة' };
    acc.equipped.char = id;
    // الأزياء الخاصة بشخصيات أخرى تُبقى، لكن يُختار زي متوافق إن لزم
  } else if (slot === 'skin') {
    acc.equipped.skin = id;
  } else if (slot === 'vskin') {
    acc.equipped.vskin = acc.equipped.vskin || {};
  } else acc.equipped[slot] = id;
  markDirty();
  return { ok: true, profile: publicProfile(acc) };
}

export function buyBundle(acc, bundleId) {
  const b = BUNDLES.find(x => x.id === bundleId);
  if (!b) return { error: 'حزمة غير موجودة' };
  if (b.gems > 0) { if (acc.gems < b.gems) return { error: 'جواهر غير كافية' }; acc.gems -= b.gems; }
  if (b.price > 0) { if (acc.gold < b.price) return { error: 'ذهب غير كافٍ' }; acc.gold -= b.price; }
  const gained = [];
  for (const id of b.items) {
    const skin = SKINS.find(x => x.id === id), ws = WEAPON_SKINS.find(x => x.id === id),
      em = EMOTES.find(x => x.id === id), pc = PARACHUTES.find(x => x.id === id);
    if (skin) { if (!acc.owned.skins.includes(id)) { acc.owned.skins.push(id); gained.push(skin.ar); } else acc.gold += 600; }
    else if (ws) { if (!acc.owned.wskins.includes(id)) { acc.owned.wskins.push(id); gained.push(ws.ar); } else acc.gold += 800; }
    else if (em) { if (!acc.owned.emotes.includes(id)) { acc.owned.emotes.push(id); gained.push(em.ar); } else acc.gold += 400; }
    else if (pc) { if (!acc.owned.parachutes.includes(id)) { acc.owned.parachutes.push(id); gained.push(pc.ar); } else acc.gold += 500; }
  }
  if (b.bonusGold) acc.gold += b.bonusGold;
  markDirty();
  return { ok: true, gained, profile: publicProfile(acc) };
}
export function openCrate(acc, crateId) {
  const crate = CRATES.find(c => c.id === crateId);
  if (!crate) return { error: 'صندوق غير موجود' };
  if (crate.gems > 0) { if (acc.gems < crate.gems) return { error: 'جواهر غير كافية' }; acc.gems -= crate.gems; }
  if (crate.price > 0) { if (acc.gold < crate.price) return { error: 'ذهب غير كافٍ' }; acc.gold -= crate.price; }
  const rng = Math.random();
  let tier = 'rare';
  let acc2 = 0;
  for (const t of RARITY_ORDER) {
    const w = crate.odds[t] || 0;
    if (w === 0) continue;
    acc2 += w;
    if (rng * 100 <= acc2) { tier = t; break; }
  }
  const pool = crate.pool.filter(id => {
    const item = [...SKINS, ...WEAPON_SKINS, ...EMOTES, ...PARACHUTES].find(i => i.id === id);
    return item && (item.rarity === tier || RARITY[item.rarity]?.order >= RARITY[tier]?.order);
  });
  const chosenId = (pool.length ? pool : crate.pool)[Math.floor(Math.random() * (pool.length || crate.pool.length))];
  const item = [...SKINS, ...WEAPON_SKINS, ...EMOTES, ...PARACHUTES].find(i => i.id === chosenId);
  let duplicate = false;
  const bucket = SKINS.includes(item) ? 'skins' : WEAPON_SKINS.includes(item) ? 'wskins' : EMOTES.includes(item) ? 'emotes' : 'parachutes';
  if (acc.owned[bucket].includes(item.id)) {
    duplicate = true;
    acc.gold += Math.round((item.price || 1000) * 0.35);
  } else acc.owned[bucket].push(item.id);
  markDirty();
  return { ok: true, item, duplicate, profile: publicProfile(acc) };
}

export function spinWheel(acc) {
  if (acc.gems < WHEEL.price) return { error: 'تحتاج ' + WHEEL.price + ' جوهرة للدوران' };
  acc.gems -= WHEEL.price;
  const total = WHEEL.slots.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total, slot = WHEEL.slots[0];
  for (const s of WHEEL.slots) { r -= s.weight; if (r <= 0) { slot = s; break; } }
  let extra = null;
  switch (slot.kind) {
    case 'gold': acc.gold += slot.value; break;
    case 'xp': addXp(acc, slot.value); break;
    case 'gems': acc.gems += slot.value; break;
    case 'skin': if (!acc.owned.skins.includes(slot.value)) acc.owned.skins.push(slot.value); else acc.gold += 800; break;
    case 'char': if (!acc.owned.chars.includes(slot.value)) acc.owned.chars.push(slot.value); else acc.gold += 1500; break;
    case 'wskin': if (!acc.owned.wskins.includes(slot.value)) acc.owned.wskins.push(slot.value); else acc.gold += 1500; break;
    case 'jackpot': {
      acc.gems += 100; acc.gold += 5000;
      const myth = SKINS.filter(s => s.rarity === 'mythic').map(s => s.id);
      const pickId = myth[Math.floor(Math.random() * myth.length)];
      if (!acc.owned.skins.includes(pickId)) acc.owned.skins.push(pickId); else acc.gems += 200;
      extra = pickId;
      break;
    }
    default: break;
  }
  markDirty();
  return { ok: true, slot, extra, profile: publicProfile(acc) };
}

export function buyBattlePass(acc) {
  if (acc.bpPremium) return { error: 'تملك الباس بالفعل' };
  if (acc.gems < BATTLEPASS.premiumPrice) return { error: 'جواهر غير كافية' };
  acc.gems -= BATTLEPASS.premiumPrice; acc.bpPremium = true;
  markDirty();
  return { ok: true, profile: publicProfile(acc) };
}

export function claimBattlePass(acc, tier, track) {
  if (tier < 1 || tier > BATTLEPASS.tiers) return { error: 'مستوى غير صحيح' };
  const need = (tier - 1) * BATTLEPASS.xpPerTier;
  if (acc.bpXp < need) return { error: 'لم تصل لهذا المستوى' };
  if (track === 'premium' && !acc.bpPremium) return { error: 'تحتاج شراء الباس المميز' };
  const rewards = BATTLEPASS[track];
  const rw = rewards[tier];
  if (!rw) return { error: 'لا توجد جائزة هنا' };
  acc.claimedBP = acc.claimedBP || {};
  const key = track + tier;
  if (acc.claimedBP[key]) return { error: 'تم الاستلام' };
  acc.claimedBP[key] = true;
  switch (rw.kind) {
    case 'gold': acc.gold += rw.value; break;
    case 'skin': if (!acc.owned.skins.includes(rw.value)) acc.owned.skins.push(rw.value); else acc.gold += 700; break;
    case 'wskin': if (!acc.owned.wskins.includes(rw.value)) acc.owned.wskins.push(rw.value); else acc.gold += 900; break;
    case 'emote': if (!acc.owned.emotes.includes(rw.value)) acc.owned.emotes.push(rw.value); else acc.gold += 400; break;
    case 'char': if (!acc.owned.chars.includes(rw.value)) acc.owned.chars.push(rw.value); else acc.gems += 300; break;
    default: break;
  }
  markDirty();
  return { ok: true, rw, profile: publicProfile(acc) };
}

export function giftGold(acc, amount) { acc.gold += amount; markDirty(); }

/* ============================= نتائج المباراة ============================= */
export function applyMatchResult(acc, res) {
  const isWin = res.placement === 1 && res.mode !== 'tdm';
  let gold = REWARD.base + res.kills * REWARD.perKill + Math.floor(res.damage / 100) * REWARD.perDamage100 + res.headshots * REWARD.perHeadshot;
  if (res.placement === 1) gold += REWARD.place1;
  else if (res.placement <= 3) gold += REWARD.top3;
  else if (res.placement <= 10) gold += REWARD.top10;
  if (res.mode === 'tdm') gold += res.kills * 15;

  const xp = REWARD.xpBase + res.kills * REWARD.xpKill + Math.floor(res.damage / 100) * REWARD.xpDamage100 + (res.placement === 1 ? 400 : res.placement <= 10 ? 120 : 30);
  let gems = 0;
  if (isWin) gems += REWARD.gemsWin;
  else if (res.placement <= 3) gems += REWARD.gemsTop3;

  acc.gold += gold; acc.gems += gems;
  acc.bpXp += Math.round(xp * 0.8 + res.kills * 12);
  const ups = addXp(acc, xp);
  acc.stats.games++;
  acc.stats.kills += res.kills;
  acc.stats.damage += Math.round(res.damage);
  acc.stats.headshots += res.headshots;
  acc.stats.timePlayed += Math.round(res.time || 0);
  if (res.kills > acc.stats.bestKills) acc.stats.bestKills = res.kills;
  if (isWin) { acc.stats.wins++; acc.stats.chickenDinners++; }
  if (res.placement <= 10) acc.stats.top10++;
  if (res.revives) acc.stats.revives += res.revives;

  // المهام
  progressMission(acc, 'daily_play1', 1);
  if (res.kills) progressMission(acc, 'daily_kill3', res.kills);
  if (res.damage) progressMission(acc, 'daily_dmg500', Math.round(res.damage));
  if (res.placement <= 10) progressMission(acc, 'daily_top10', 1);
  if (isWin) progressMission(acc, 'daily_win', 1);
  if (res.kills) progressMission(acc, 'weekly_kill25', res.kills);
  if (isWin) progressMission(acc, 'weekly_win5', 1);
  if (res.damage) progressMission(acc, 'weekly_dmg8k', Math.round(res.damage));
  if (res.revives) progressMission(acc, 'weekly_revive', res.revives);
  if (res.headshots) progressMission(acc, 'ach_headshot', res.headshots);
  if (isWin) progressMission(acc, 'ach_chicken', 1);
  progressMission(acc, 'ach_100games', 1);

  // لوحات الترتيب
  pushRank({ name: acc.name, id: acc.id, v: res.kills }, 'kills');
  if (isWin) pushRank({ name: acc.name, id: acc.id, v: 1 }, 'wins');
  pushRank({ name: acc.name, id: acc.id, v: Math.round(res.damage) }, 'damage');

  markDirty();
  return { gold, gems, xp, levelUps: ups, bpXp: Math.round(xp * 0.8 + res.kills * 12), profile: publicProfile(acc) };
}

function pushRank(entry, board) {
  const list = rankings[board] || (rankings[board] = []);
  const found = list.find(e => e.id === entry.id);
  if (found) { found.v += entry.v; found.name = entry.name; }
  else list.push({ ...entry });
  list.sort((a, b) => b.v - a.v);
  rankings[board] = list.slice(0, 100);
  markDirty();
}
export function getRankings() { return rankings; }

export function setSettings(acc, s) {
  acc.settings = { ...acc.settings, ...s };
  markDirty();
  return acc.settings;
}
export function addFriend(acc, name) {
  const other = Object.values(db.accounts).find(a => a.name === name);
  if (!other) return { error: 'لاعب غير موجود' };
  if (other.id === acc.id) return { error: 'لا يمكنك إضافة نفسك' };
  if (!acc.friends.includes(name)) acc.friends.push(name);
  if (!other.friends.includes(acc.name)) other.friends.push(acc.name);
  markDirty();
  return { ok: true, friends: acc.friends };
}
export default {
  initStore, flush, createAccount, login, guest, byToken, byId, touch, publicProfile, addXp,
  buyItem, equip, buyBundle, openCrate, spinWheel, claimDaily, buyBattlePass, claimBattlePass, applyMatchResult,
  getRankings, setSettings, addFriend, claimMission, progressMission, missionView, giftGold, dayKey, weekKey,
};
