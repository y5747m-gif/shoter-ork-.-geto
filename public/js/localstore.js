/**
 * ORK ZONE — client/localstore.js
 * نظام الحسابات المحلي: نسخة متصفحية من منطق server/accounts.js — نفس الأشكال
 * ونفس القواعد تماماً (مستويات، ذهب، متجر، عجلة، صناديق، باس، مهام، جوائز المباريات).
 * يعمل تلقائياً عندما لا يوجد سيرفر (استضافة ثابتة مثل Vercel/GitHub Pages):
 * كل شيء يُحفظ في localStorage على جهاز اللاعب، واللعب الأوفلاين يعمل ١٠٠٪.
 */
import {
  CHARACTERS, SKINS, WEAPON_SKINS, VEHICLE_SKINS, PARACHUTES, EMOTES, CRATES, WHEEL, BUNDLES,
  BATTLEPASS, MISSIONS, LEVEL_XP, REWARD, RARITY_ORDER, RARITY,
} from '/shared/gamedata.js';

const DB_KEY = 'orkz_local_db';

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      if (db && db.accounts && db.tokens) return db;
    }
  } catch { }
  return { accounts: {}, tokens: {}, rankings: { kills: [], wins: [], damage: [] }, guestSeq: 1 };
}
function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { }
}

const hash = (s) => {
  // تجزئة بسيطة (لا حاجة لتشفير حقيقي — الحساب محلي على الجهاز نفسه)
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  const str = String(s) + '|orkzone';
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ str.charCodeAt(i), 2246822519) >>> 0);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
};
const newToken = () => {
  let t = '';
  for (let i = 0; i < 40; i++) t += Math.floor(Math.random() * 16).toString(16);
  return t;
};

export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

function defaultAccount(name, pwHash = null) {
  return {
    id: 'u' + newToken().slice(0, 12),
    name: String(name).slice(0, 16),
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
    settings: { sfx: 0.8, quality: 'high', sens: 1, autoFire: false },   // لا موسيقى في اللعبة
  };
}

function checkResets(acc) {
  const today = dayKey(), week = weekKey();
  for (const m of MISSIONS) {
    const isDaily = m.type === 'daily' && acc.missionsDate.daily !== today;
    const isWeekly = m.type === 'weekly' && acc.missionsDate.weekly !== week;
    if (isDaily || isWeekly) {
      delete acc.missions.progress[m.id];
      delete acc.missions.claimed[m.id];
    }
  }
  acc.missionsDate.daily = today;
  acc.missionsDate.weekly = week;
}

/* ============================= الحسابات ============================= */
function createAccount(db, name, password) {
  if (!name || name.trim().length < 2) return { error: 'الاسم قصير جداً' };
  const exists = Object.values(db.accounts).some(a => a.name.toLowerCase() === name.trim().toLowerCase() && !a.guest);
  if (exists) return { error: 'الاسم مستخدم بالفعل' };
  const acc = defaultAccount(name.trim(), password ? hash(password) : null);
  db.accounts[acc.id] = acc;
  const token = newToken();
  db.tokens[token] = acc.id;
  saveDB(db);
  return { account: acc, token };
}
function login(db, name, password) {
  const acc = Object.values(db.accounts).find(a => a.name.toLowerCase() === String(name || '').trim().toLowerCase() && !a.guest);
  if (!acc) return { error: 'لا يوجد حساب بهذا الاسم' };
  if (acc.pw !== hash(password || '')) return { error: 'كلمة المرور غير صحيحة' };
  const token = newToken();
  db.tokens[token] = acc.id;
  saveDB(db);
  return { account: acc, token };
}
function guest(db, name) {
  db.guestSeq = (db.guestSeq || 1) + 1;
  const acc = defaultAccount(name ? String(name).slice(0, 12) : 'زائر' + Math.floor(Math.random() * 9000 + 1000), null);
  db.accounts[acc.id] = acc;
  const token = newToken();
  db.tokens[token] = acc.id;
  saveDB(db);
  return { account: acc, token };
}
function byToken(db, token) {
  const id = db.tokens[token];
  if (!id) return null;
  const acc = db.accounts[id];
  if (!acc) return null;
  checkResets(acc);
  saveDB(db);
  return acc;
}

/* ============================= العرض ============================= */
function missionView(acc) {
  return MISSIONS.map(m => ({
    id: m.id, type: m.type, ar: m.ar, goal: m.goal, reward: m.reward,
    progress: Math.min(acc.missions.progress[m.id] || 0, m.goal),
    claimed: !!acc.missions.claimed[m.id],
  }));
}
function publicProfile(acc) {
  return {
    id: acc.id, name: acc.name, guest: acc.guest, level: acc.level, xp: acc.xp, xpNeed: LEVEL_XP(acc.level),
    gold: acc.gold, gems: acc.gems, bpXp: acc.bpXp, bpPremium: acc.bpPremium,
    bpTier: Math.min(BATTLEPASS.tiers, Math.floor(acc.bpXp / BATTLEPASS.xpPerTier) + 1),
    owned: acc.owned, equipped: acc.equipped, stats: acc.stats,
    missions: missionView(acc), settings: acc.settings, friends: acc.friends,
    daily: { available: !acc.daily || acc.daily.day !== dayKey(), streak: (acc.daily && acc.daily.streak) || 0 },
    local: true,
  };
}
function addXp(acc, xp) {
  acc.xp += xp;
  let ups = 0;
  while (acc.xp >= LEVEL_XP(acc.level)) { acc.xp -= LEVEL_XP(acc.level); acc.level++; ups++; acc.gems += 5; }
  return ups;
}
function progressMission(acc, id, value = 1) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m) return;
  acc.missions.progress[id] = (acc.missions.progress[id] || 0) + value;
}
function claimMission(db, acc, id) {
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
  saveDB(db);
  return { ok: true, profile: publicProfile(acc) };
}
function claimDaily(db, acc) {
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
  saveDB(db);
  return { ok: true, gold, gems, xp, streak: acc.daily.streak, profile: publicProfile(acc) };
}

/* ============================= المتجر ============================= */
function buyItem(db, acc, kind, id) {
  const table = {
    char: CHARACTERS, skin: SKINS, wskin: WEAPON_SKINS, vskin: VEHICLE_SKINS,
    parachute: PARACHUTES, emote: EMOTES,
  };
  const list = table[kind]; if (!list) return { error: 'نوع غير معروف' };
  const item = list.find(i => i.id === id); if (!item) return { error: 'عنصر غير موجود' };
  const bucket = kind === 'char' ? 'chars' : kind === 'skin' ? 'skins' : kind === 'wskin' ? 'wskins' : kind === 'vskin' ? 'vskins' : kind === 'parachute' ? 'parachutes' : 'emotes';
  if (acc.owned[bucket].includes(id)) return { error: 'تملكه بالفعل' };
  const cost = { gold: item.price || 0, gems: item.gems || 0 };
  if (cost.gems > 0) { if (acc.gems < cost.gems) return { error: 'جواهرك غير كافية' }; acc.gems -= cost.gems; }
  if (cost.gold > 0) { if (acc.gold < cost.gold) return { error: 'ذهبك غير كافٍ' }; acc.gold -= cost.gold; }
  acc.owned[bucket].push(id);
  saveDB(db);
  return { ok: true, profile: publicProfile(acc), item };
}
function equip(db, acc, slot, id) {
  const map = { char: 'chars', skin: 'skins', wskin: 'wskins', vskin: 'vskins', parachute: 'parachutes', emote: 'emotes' };
  const bucket = map[slot]; if (!bucket) return { error: 'خانة غير معروفة' };
  if (id !== null && !acc.owned[bucket].includes(id)) return { error: 'لا تملك هذا العنصر' };
  if (slot === 'char') {
    const c = CHARACTERS.find(x => x.id === id);
    if (!c) return { error: 'شخصية غير موجودة' };
    acc.equipped.char = id;
  } else if (slot === 'skin') acc.equipped.skin = id;
  else if (slot === 'vskin') acc.equipped.vskin = acc.equipped.vskin || {};
  else acc.equipped[slot] = id;
  saveDB(db);
  return { ok: true, profile: publicProfile(acc) };
}
function buyBundle(db, acc, bundleId) {
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
  saveDB(db);
  return { ok: true, gained, profile: publicProfile(acc) };
}
function openCrate(db, acc, crateId) {
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
  if (!item) { saveDB(db); return { ok: true, item: crate.pool.length ? { ar: 'غنيمة', rarity: 'rare', id: chosenId } : null, duplicate: false, profile: publicProfile(acc) }; }
  let duplicate = false;
  const bucket = SKINS.includes(item) ? 'skins' : WEAPON_SKINS.includes(item) ? 'wskins' : EMOTES.includes(item) ? 'emotes' : 'parachutes';
  if (acc.owned[bucket].includes(item.id)) {
    duplicate = true;
    acc.gold += Math.round((item.price || 1000) * 0.35);
  } else acc.owned[bucket].push(item.id);
  saveDB(db);
  return { ok: true, item, duplicate, profile: publicProfile(acc) };
}
function spinWheel(db, acc) {
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
  saveDB(db);
  return { ok: true, slot, extra, profile: publicProfile(acc) };
}
function buyBattlePass(db, acc) {
  if (acc.bpPremium) return { error: 'تملك الباس بالفعل' };
  if (acc.gems < BATTLEPASS.premiumPrice) return { error: 'جواهر غير كافية' };
  acc.gems -= BATTLEPASS.premiumPrice; acc.bpPremium = true;
  saveDB(db);
  return { ok: true, profile: publicProfile(acc) };
}
function claimBattlePass(db, acc, tier, track) {
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
  saveDB(db);
  return { ok: true, rw, profile: publicProfile(acc) };
}
function setSettings(db, acc, s) {
  acc.settings = { ...acc.settings, ...s };
  saveDB(db);
  return acc.settings;
}
function addFriend(db, acc, name) {
  // محلياً: كل الأصدقاء على هذا الجهاز — نضيف الاسم مباشرة
  if (!name) return { error: 'اكتب اسم اللاعب' };
  if (name === acc.name) return { error: 'لا يمكنك إضافة نفسك' };
  if (!acc.friends.includes(name)) acc.friends.push(name);
  saveDB(db);
  return { ok: true, friends: acc.friends, profile: publicProfile(acc) };
}

/* ============================= نتائج المباريات ============================= */
function pushRank(db, entry, board) {
  db.rankings = db.rankings || { kills: [], wins: [], damage: [] };
  const list = db.rankings[board] || (db.rankings[board] = []);
  const found = list.find(e => e.id === entry.id);
  if (found) { found.v += entry.v; found.name = entry.name; }
  else list.push({ ...entry });
  list.sort((a, b) => b.v - a.v);
  db.rankings[board] = list.slice(0, 100);
}
function applyMatchResult(db, acc, res) {
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

  pushRank(db, { name: acc.name, id: acc.id, v: res.kills }, 'kills');
  if (isWin) pushRank(db, { name: acc.name, id: acc.id, v: 1 }, 'wins');
  pushRank(db, { name: acc.name, id: acc.id, v: Math.round(res.damage) }, 'damage');

  saveDB(db);
  return { gold, gems, xp, levelUps: ups, bpXp: Math.round(xp * 0.8 + res.kills * 12), profile: publicProfile(acc) };
}

/* ============================= موجّه الطلبات ============================= */
function needAcc(db, body) {
  const acc = byToken(db, body?.token);
  if (!acc) return null;
  return acc;
}

export const LocalStore = {
  /** POST محلي — نفس أشكال استجابات السيرفر تماماً */
  handle(path, body = {}) {
    const db = loadDB();
    try {
      switch (path) {
        case '/api/auth/register': {
          const r = createAccount(db, body.name, body.password);
          if (r.error) return r;
          return { token: r.token, profile: publicProfile(r.account) };
        }
        case '/api/auth/login': {
          const r = login(db, body.name, body.password);
          if (r.error) return r;
          return { token: r.token, profile: publicProfile(r.account) };
        }
        case '/api/auth/guest': {
          const r = guest(db, body.name);
          return { token: r.token, profile: publicProfile(r.account) };
        }
        case '/api/shop/buy': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return buyItem(db, acc, body.kind, body.id);
        }
        case '/api/shop/equip': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return equip(db, acc, body.slot, body.id);
        }
        case '/api/shop/bundle': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return buyBundle(db, acc, body.bundleId);
        }
        case '/api/shop/crate': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return openCrate(db, acc, body.crateId);
        }
        case '/api/shop/wheel': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return spinWheel(db, acc);
        }
        case '/api/bp/buy': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return buyBattlePass(db, acc);
        }
        case '/api/bp/claim': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return claimBattlePass(db, acc, Number(body.tier), body.track);
        }
        case '/api/missions/claim': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return claimMission(db, acc, body.id);
        }
        case '/api/daily/claim': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return claimDaily(db, acc);
        }
        case '/api/settings': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return { settings: setSettings(db, acc, body.settings || {}) };
        }
        case '/api/friends/add': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          return addFriend(db, acc, String(body.name || ''));
        }
        case '/api/offline/result': {
          const acc = needAcc(db, body); if (!acc) return { error: 'جلسة غير صالحة' };
          const r0 = body.result || {};
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
          const rewards = applyMatchResult(db, acc, result);
          return { rewards, result };
        }
        default:
          return { error: 'طلب غير مدعوم محلياً: ' + path };
      }
    } catch (e) {
      return { error: 'خطأ محلي: ' + (e?.message || e) };
    }
  },
  /** GET محلي */
  handleGet(path) {
    const db = loadDB();
    try {
      if (path.startsWith('/api/profile')) {
        const q = path.split('?')[1] || '';
        const token = new URLSearchParams(q).get('token');
        const acc = token ? byToken(db, token) : null;
        if (!acc) return { error: 'جلسة غير صالحة' };
        return { profile: publicProfile(acc) };
      }
      if (path.startsWith('/api/rankings')) {
        return db.rankings || { kills: [], wins: [], damage: [] };
      }
      return { error: 'طلب غير مدعوم محلياً: ' + path };
    } catch (e) {
      return { error: 'خطأ محلي: ' + (e?.message || e) };
    }
  },
  /** هل يوجد حساب محلي محفوظ؟ (لتسريع الدخول التلقائي) */
  hasAccount() {
    try { return Object.keys(loadDB().accounts).length > 0; } catch { return false; }
  },
};
export default LocalStore;
