/**
 * ORK ZONE — client/ui.js
 * واجهة اللاعب: القوائم، الخزنة، المتجر، باس المعركة، المهام، الترتيب، الغرف، النتائج.
 * تتضمن رسم بورتريه الشخصيات (رجال فقط) وأشكال الخرائط.
 */
import {
  CHARACTERS, SKINS, WEAPON_SKINS, VEHICLE_SKINS, PARACHUTES, EMOTES, CRATES, WHEEL, BUNDLES,
  BATTLEPASS, MISSIONS, MODES, MAPS, RARITY, RARITY_ORDER, WEAPONS, VEHICLES, BIOMES, LEVEL_XP, GAME, AMMO, ARMORS, HEALS,
} from '/shared/gamedata.js';
import { API, Net } from './net.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHAR_MAP = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));
const SKIN_MAP = Object.fromEntries(SKINS.map(s => [s.id, s]));

/* ============================= رسم البورتريه (مقاتل ذكر) ============================= */
export function drawPortrait(ctx, W, H, opts = {}) {
  if (!ctx || !W || !H || W <= 0 || H <= 0) return;
  const { charId = 'fahd', skinId = 'out_basic', weaponId = null, t = 0, hp = 1, weaponTint = null } = opts;
  const skin = SKIN_MAP[skinId];
  const char = CHAR_MAP[charId] || CHAR_MAP.fahd || CHARACTERS[0];
  const body = skin ? skin.body : '#4a5b6e';
  const pants = skin ? skin.pants : '#2f3a46';
  const accent = skin ? skin.accent : '#8fa3b8';
  const effect = skin ? skin.effect : 'none';
  const cx = W / 2, breathe = Math.sin(t * 2) * 2.5;
  ctx.clearRect(0, 0, W, H);
  // هالة الندرة
  const rar = RARITY[skin ? skin.rarity : char.rarity] || RARITY.common;
  const bg = ctx.createRadialGradient(cx, H * 0.55, 10, cx, H * 0.6, W * 0.72);
  bg.addColorStop(0, rar.glow); bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // تأثيرات محيطة
  if (effect && effect !== 'none') {
    const col = { fire: '#ff8b2e', ice: '#8fe8ff', lightning: '#69a8ff', void: '#c74bff', glow: '#ffc63d', crown: '#ffc63d', trail: accent, smoke: '#8a93a8', sand: '#e6c98a', laser: '#b7d67a', glitch: '#00e0a0', dash: '#ff2f6d' }[effect] || accent;
    for (let i = 0; i < 14; i++) {
      const a = t * 0.9 + i * 0.45, rr = W * (0.22 + 0.05 * Math.sin(t + i));
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3 + i);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr * 1.6, H * 0.62 + Math.sin(a * 1.3) * rr * 1.1, 2 + (i % 3), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const scale = Math.min(W / 240, H / 340);
  ctx.save();
  ctx.translate(cx, H * 0.98);
  ctx.scale(scale, scale);
  // ظل أرضي
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 62, 12, 0, 0, 6.283); ctx.fill();
  const sY = -breathe * 0.3;
  // الساقان
  ctx.fillStyle = pants;
  rr(ctx, -34, -96 + sY, 26, 96, 9); ctx.fill();
  rr(ctx, 8, -96 + sY, 26, 96, 9); ctx.fill();
  ctx.fillStyle = '#2a2118';
  rr(ctx, -38, -14 + sY, 34, 16, 6); ctx.fill();
  rr(ctx, 4, -14 + sY, 34, 16, 6); ctx.fill();
  // وسائد الركبة
  ctx.fillStyle = accent; rr(ctx, -33, -60 + sY, 24, 12, 5); ctx.fill(); rr(ctx, 9, -60 + sY, 24, 12, 5); ctx.fill();
  // الجسم: جذع مخصر مع أكتاف عريضة (شكل مقاتل)
  const g = ctx.createLinearGradient(-42, -170, 42, -70);
  g.addColorStop(0, shade(body, 24)); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -28));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-40, -166 + sY);
  ctx.quadraticCurveTo(-46, -166 + sY, -44, -150 + sY);   // كتف أيمن
  ctx.lineTo(-32, -104 + sY);                              // خصر
  ctx.quadraticCurveTo(-30, -88 + sY, -20, -88 + sY);
  ctx.lineTo(20, -88 + sY);
  ctx.quadraticCurveTo(30, -88 + sY, 32, -104 + sY);
  ctx.lineTo(44, -150 + sY);
  ctx.quadraticCurveTo(46, -166 + sY, 40, -166 + sY);
  ctx.closePath(); ctx.fill();
  // حمالات ودرع صدري
  ctx.fillStyle = shade(body, -18); rr(ctx, -36, -160 + sY, 72, 44, 12); ctx.fill();
  ctx.fillStyle = accent; rr(ctx, -30, -156 + sY, 60, 8, 4); ctx.fill();
  rr(ctx, -14, -146 + sY, 28, 20, 6); ctx.fill();
  ctx.fillStyle = shade(body, -34); rr(ctx, -22, -126 + sY, 44, 12, 5); ctx.fill();
  ctx.fillStyle = accent; ctx.globalAlpha = 0.6; rr(ctx, -6, -144 + sY, 12, 16, 4); ctx.fill(); ctx.globalAlpha = 1;
  // شارات حسب الشخصية
  if (charId === 'hakim') { ctx.fillStyle = '#e03b3b'; rr(ctx, -8, -152 + sY, 16, 6, 2); ctx.fill(); rr(ctx, -3, -157 + sY, 6, 16, 2); ctx.fill(); }
  if (charId === 'tannin' || effect === 'fire') {
    ctx.fillStyle = '#ff8b2e';
    ctx.beginPath(); ctx.moveTo(-40, -168 + sY); ctx.lineTo(-62, -186 + sY); ctx.lineTo(-36, -148 + sY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, -168 + sY); ctx.lineTo(62, -186 + sY); ctx.lineTo(36, -148 + sY); ctx.closePath(); ctx.fill();
  }
  if (charId === 'orkking' || effect === 'crown') {
    ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.moveTo(-38, -160 + sY); ctx.lineTo(-62, -110 + sY); ctx.lineTo(-38, -120 + sY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(38, -160 + sY); ctx.lineTo(62, -110 + sY); ctx.lineTo(38, -120 + sY); ctx.closePath(); ctx.fill();
  }
  if (charId === 'zaid') { ctx.fillStyle = '#7d7d7d'; rr(ctx, -44, -164 + sY, 12, 40, 5); ctx.fill(); rr(ctx, 32, -164 + sY, 12, 40, 5); ctx.fill(); }
  // الذراعان
  ctx.fillStyle = shade(body, 8);
  rr(ctx, -50, -164 + sY, 18, 66, 9); ctx.fill();
  rr(ctx, 32, -164 + sY, 18, 66, 9); ctx.fill();
  ctx.fillStyle = '#c9905f';
  ctx.beginPath(); ctx.arc(-41, -96 + sY, 10, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(41, -96 + sY, 10, 0, 6.283); ctx.fill();
  // الرقبة والرأس
  ctx.fillStyle = '#b07f52'; rr(ctx, -10, -186 + sY, 20, 18, 6); ctx.fill();
  const hg = ctx.createLinearGradient(-22, -232, 22, -178);
  hg.addColorStop(0, '#e0a878'); hg.addColorStop(1, '#b8855b');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, -206 + sY, 24, 0, 6.283); ctx.fill();
  // ملامح
  ctx.fillStyle = '#2a1c12';
  ctx.beginPath(); ctx.arc(-8, -210 + sY, 2.6, 0, 6.283); ctx.fill();
  ctx.beginPath(); ctx.arc(8, -210 + sY, 2.6, 0, 6.283); ctx.fill();
  ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, -198 + sY, 7, 0.15, Math.PI - 0.15); ctx.stroke();
  // غطاء الرأس / القناع
  const hat = { fahd: 'scarf', amer: 'cap', hakim: 'medic', khaled: 'hood', shadi: 'beret', rami: 'engineer', zaid: 'bandana', yaser: 'ninja', majhool: 'mask', tannin: 'dragon', asad: 'fur', orkking: 'crown' }[charId] || 'none';
  ctx.fillStyle = '#1f1a15';
  ctx.beginPath(); ctx.arc(0, -212 + sY, 24, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  switch (hat) {
    case 'cap': ctx.fillStyle = accent; rr(ctx, -26, -236 + sY, 52, 18, 8); ctx.fill(); rr(ctx, 10, -224 + sY, 30, 8, 4); ctx.fill(); break;
    case 'beret': ctx.fillStyle = accent; rr(ctx, -30, -238 + sY, 58, 16, 8); ctx.fill(); break;
    case 'medic': ctx.fillStyle = '#f2f6fa'; rr(ctx, -26, -240 + sY, 52, 22, 10); ctx.fill(); ctx.fillStyle = '#e03b3b'; rr(ctx, -4, -234 + sY, 8, 12, 2); ctx.fill(); rr(ctx, -8, -230 + sY, 16, 5, 2); ctx.fill(); break;
    case 'engineer': ctx.fillStyle = '#e8a03c'; rr(ctx, -28, -242 + sY, 56, 24, 12); ctx.fill(); ctx.fillStyle = '#3a2a12'; rr(ctx, -30, -226 + sY, 60, 8, 4); ctx.fill(); break;
    case 'hood': ctx.fillStyle = shade(body, -20); ctx.beginPath(); ctx.arc(0, -208 + sY, 28, Math.PI, 6.283); ctx.fill(); rr(ctx, -28, -216 + sY, 56, 26, 12); ctx.fill(); break;
    case 'ninja': ctx.fillStyle = shade(body, -18); ctx.beginPath(); ctx.arc(0, -206 + sY, 27, 0, 6.283); ctx.fill(); ctx.fillStyle = '#c93030'; rr(ctx, -24, -212 + sY, 48, 14, 6); ctx.fill(); ctx.fillStyle = '#ff2f6d'; rr(ctx, -20, -209 + sY, 14, 5, 2); ctx.fill(); rr(ctx, 6, -209 + sY, 14, 5, 2); ctx.fill(); break;
    case 'mask': ctx.fillStyle = '#2b3038'; ctx.beginPath(); ctx.arc(0, -206 + sY, 26, 0, 6.283); ctx.fill(); ctx.fillStyle = '#00e0a0'; rr(ctx, -18, -212 + sY, 36, 9, 4); ctx.fill(); break;
    case 'scarf': ctx.fillStyle = '#e6c98a'; ctx.beginPath(); ctx.arc(0, -210 + sY, 26, Math.PI, 6.283); ctx.fill(); rr(ctx, -30, -204 + sY, 60, 16, 8); ctx.fill(); break;
    case 'dragon': ctx.fillStyle = '#ff8b2e'; ctx.beginPath(); ctx.arc(0, -214 + sY, 26, Math.PI, 6.283); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(-26, -218 + sY); ctx.lineTo(-40, -246 + sY); ctx.lineTo(-16, -236 + sY); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(26, -218 + sY); ctx.lineTo(40, -246 + sY); ctx.lineTo(16, -236 + sY); ctx.closePath(); ctx.fill(); break;
    case 'fur': ctx.fillStyle = '#e8f4ff'; ctx.beginPath(); ctx.arc(0, -212 + sY, 29, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.fillStyle = '#bcd8ea'; ctx.beginPath(); ctx.arc(-24, -200 + sY, 12, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(24, -200 + sY, 12, 0, 6.283); ctx.fill(); break;
    case 'crown': ctx.fillStyle = '#ffc63d';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 16 - 6, -234 + sY); ctx.lineTo(i * 16, -256 + sY); ctx.lineTo(i * 16 + 6, -234 + sY); ctx.closePath(); ctx.fill(); }
      rr(ctx, -26, -236 + sY, 52, 8, 3); ctx.fill(); break;
    case 'bandana': ctx.fillStyle = accent; rr(ctx, -26, -232 + sY, 52, 14, 6); ctx.fill(); rr(ctx, -34, -228 + sY, 16, 8, 3); ctx.fill(); break;
    default: break;
  }
  // السلاح في اليد
  const wid = weaponId;
  if (wid && WEAPONS[wid]) {
    const w = WEAPONS[wid];
    const tint = weaponTint ? weaponTint.tint : '#23262a';
    const acc = weaponTint ? weaponTint.accent : '#3d434b';
    ctx.save(); ctx.translate(52, -108 + sY); ctx.rotate(-0.15);
    const L = w.type === 'sniper' ? 108 : w.type === 'pistol' ? 40 : w.type === 'melee' ? 46 : 76;
    // جسم السلاح
    ctx.fillStyle = tint; rr(ctx, -14, -8, L + 8, 15, 4); ctx.fill();
    ctx.fillStyle = acc; rr(ctx, 0, -12, L * 0.44, 7, 3); ctx.fill();
    // السبطانة
    ctx.fillStyle = shade(tint, -30); rr(ctx, L - 16, -4.5, 24, 8, 2); ctx.fill();
    // الأخمص
    ctx.fillStyle = shade(tint, -18); rr(ctx, -34, -9, 22, 17, 4); ctx.fill();
    // المخزن
    ctx.fillStyle = '#1a1d21';
    if (w.type === 'pistol') rr(ctx, -9, 5, 11, 24, 3); else rr(ctx, 8, 5, 15, 26, 4);
    ctx.fill();
    // المقبض
    ctx.fillStyle = '#15181c'; rr(ctx, -4, 6, 12, 20, 4); ctx.fill();
    if (w.type === 'sniper' || w.type === 'dmr') { ctx.fillStyle = '#101418'; rr(ctx, 14, -22, 34, 12, 4); ctx.fill(); }
    if (w.type === 'lmg') { ctx.fillStyle = '#2a2f36'; rr(ctx, 8, 6, 22, 18, 4); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) {
  const rr2 = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr2, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr2);
  ctx.arcTo(x + w, y + h, x, y + h, rr2);
  ctx.arcTo(x, y + h, x, y, rr2);
  ctx.arcTo(x, y, x + w, y, rr2);
  ctx.closePath();
}
function shade(hex, amt) {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  } catch { return hex; }
}

/* ============================= واجهة اللاعب ============================= */
export class UI {
  constructor(app) {
    this.app = app;
    this.storeTab = 'featured';
    this.lockerTab = 'chars';
    this.missionTab = 'daily';
    this.rankTab = 'kills';
    this.rankData = null;
    this.selectedMode = 'solo';
    this.selectedMap = MAPS[0].id;
    this.onlineSelect = true;
    this.portraitT = 0;
    this.animOn = true;
    this._anim();
  }
  get profile() { return this.app.profile; }

  _anim() {
    const step = () => {
      this.portraitT += 0.033;
      if (this.animOn) {
        try {
          const hero = $('hero-canvas');
          if (hero && $('scr-menu')?.classList.contains('active')) {
            const ctx = hero.getContext('2d');
            if (ctx) {
              const eq = this.profile?.equipped || {};
              const p = this.getEquippedProfile();
              drawPortrait(ctx, hero.width, hero.height, { charId: eq.char || 'fahd', skinId: eq.skin || 'out_basic', weaponId: p.weapon, t: this.portraitT, weaponTint: p.ws });
            }
          }
          const lk = $('locker-canvas');
          if (lk && $('scr-menu')?.classList.contains('active')) {
            const ctx = lk.getContext('2d');
            if (ctx) {
              const eq = this.profile?.equipped || {};
              const p = this.getEquippedProfile();
              drawPortrait(ctx, lk.width, lk.height, { charId: eq.char || 'fahd', skinId: eq.skin || 'out_basic', weaponId: p.weapon, t: this.portraitT, weaponTint: p.ws });
            }
          }
          const mini = $('mini-avatar');
          if (mini && $('scr-menu')?.classList.contains('active')) {
            const ctx = mini.getContext('2d');
            if (ctx) {
              const eq = this.profile?.equipped || {};
              drawPortrait(ctx, mini.width, mini.height, { charId: eq.char || 'fahd', skinId: eq.skin || 'out_basic', t: this.portraitT });
            }
          }
        } catch {
          // ignore portrait render errors during animation
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  getEquippedProfile() {
    const eq = this.profile?.equipped || {};
    const wskins = this.profile?.owned?.wskins || [];
    let ws = null, weapon = 'akm';
    for (const id of wskins) {
      const item = WEAPON_SKINS.find(w => w.id === id);
      if (item) { ws = item; weapon = item.w; break; }
    }
    return { ws, weapon };
  }

  /* ---------- تنبيهات ونوافذ ---------- */
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('toast-wrap').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 2600);
  }
  showModal(html, onOpen) {
    $('modal-body').innerHTML = html;
    $('modal-wrap').classList.remove('hidden');
    if (onOpen) onOpen($('modal-body'));
  }
  closeModal() { $('modal-wrap').classList.add('hidden'); }
  async refreshProfile() {
    if (!this.app.token) return;
    const r = await API.get('/api/profile?token=' + encodeURIComponent(this.app.token));
    if (r.profile) { this.app.profile = r.profile; this.updateProfile(); }
  }
  updateProfile() {
    const p = this.profile;
    if (!p) return;
    try {
      if ($('mini-name')) $('mini-name').textContent = p.name || 'لاعب';
      if ($('mini-lvl')) $('mini-lvl').textContent = p.level || 1;
      if ($('cur-gold')) $('cur-gold').textContent = fmt(p.gold);
      if ($('cur-gems')) $('cur-gems').textContent = fmt(p.gems);
      if ($('cur-bp')) $('cur-bp').textContent = 'مستوى ' + (p.bpTier || 1);
      if ($('mini-xp')) $('mini-xp').style.width = Math.min(100, ((p.xp || 0) / (p.xpNeed || 250)) * 100) + '%';
      if ($('mini-xptxt')) $('mini-xptxt').textContent = `${fmt(p.xp || 0)} / ${fmt(p.xpNeed || 250)}`;
      if ($('hero-season')) $('hero-season').textContent = `${BATTLEPASS.seasonAr} · المستوى ${p.bpTier || 1}`;
      if (p.stats) {
        if ($('st-games')) $('st-games').textContent = fmt(p.stats.games);
        if ($('st-wins')) $('st-wins').textContent = fmt(p.stats.wins);
        if ($('st-kills')) $('st-kills').textContent = fmt(p.stats.kills);
        if ($('st-dmg')) $('st-dmg').textContent = fmt(p.stats.damage);
        if ($('st-hs')) $('st-hs').textContent = fmt(p.stats.headshots);
        if ($('st-best')) $('st-best').textContent = fmt(p.stats.bestKills);
      }
      this.renderLocker(); this.renderBP(); this.renderMissions();
      const dailyBtn = $('btn-daily');
      if (dailyBtn) {
        const d = p.daily || { available: true, streak: 0 };
        dailyBtn.textContent = d.available ? `🎁 مكافأة اليوم (يوم ${(d.streak || 0) + 1})` : `✅ مكافأة اليوم مستلمة (سلسلة ${d.streak || 1} أيام)`;
        dailyBtn.disabled = !d.available;
        dailyBtn.style.opacity = d.available ? '1' : '.6';
      }
    } catch (e) {
      console.error('[updateProfile] error:', e);
    }
  }
  hideAll() {
    for (const el of document.querySelectorAll('.screen')) el.classList.remove('active');
    $('hud').classList.add('hidden');
    $('modal-wrap').classList.add('hidden');
  }
  showMenu() {
    this.hideAll();
    $('scr-menu').classList.add('active');
    this.updateProfile();
  }
  openPane(name) {
    for (const b of document.querySelectorAll('.side-btn')) b.classList.toggle('active', b.dataset.nav === name);
    for (const p of document.querySelectorAll('.pane')) p.classList.toggle('active', p.dataset.paneId === name);
    if (name === 'store') this.renderStore();
    if (name === 'rank') this.renderRank();
    if (name === 'friends') this.renderFriends();
    if (name === 'locker') this.renderLocker();
  }

  /* ---------- الخزنة ---------- */
  renderLocker() {
    const p = this.profile; if (!p) return;
    const tab = this.lockerTab;
    const eq = p.equipped;
    $('nickname').value = p.name;
    let html = '';
    const cardTpl = (opts) => `
      <div class="card r-${opts.rarity} ${opts.owned ? '' : 'locked'}" data-kind="${opts.kind}" data-id="${opts.id}">
        <span class="rar rar-${opts.rarity}">${RARITY[opts.rarity].ar}</span>
        ${opts.equipped ? '<span class="eq">مُجهّز ✓</span>' : opts.owned ? '<span class="owned">مملوك</span>' : ''}
        <div class="thumb"><canvas width="200" height="150" data-thumb="${opts.kind}:${opts.id}"></canvas></div>
        <div class="name">${esc(opts.name)}</div>
        <div class="desc">${esc(opts.desc || '')}</div>
        <div class="price">
          ${opts.owned ? `<button class="${opts.equipped ? 'btn-ghost' : 'btn-gold'}" data-eq="${opts.kind}:${opts.id}">${opts.equipped ? 'مُجهّز' : 'تجهيز'}</button>`
        : `<span class="tag">${opts.gems ? opts.gems + ' 💎' : opts.price + ' 🪙'}</span><button class="btn-gold" data-buy="${opts.kind}:${opts.id}">شراء</button>`}
        </div>
      </div>`;
    if (tab === 'chars') {
      for (const c of CHARACTERS) {
        const owned = p.owned.chars.includes(c.id);
        html += cardTpl({ kind: 'char', id: c.id, rarity: c.rarity, name: c.ar, desc: `مهارة: ${c.skill.ar} — ${c.skill.desc}`, owned, equipped: eq.char === c.id, price: c.price, gems: c.gems || 0 });
      }
    } else if (tab === 'skins') {
      for (const s of SKINS) {
        const owned = p.owned.skins.includes(s.id);
        const forChar = s.char === '*' ? 'لكل المقاتلين' : `خاص بـ${CHAR_MAP[s.char]?.ar || ''}`;
        html += cardTpl({ kind: 'skin', id: s.id, rarity: s.rarity, name: s.ar, desc: `${forChar} · تأثير: ${effName(s.effect)}`, owned, equipped: eq.skin === s.id, price: s.price || 0, gems: s.gems || 0 });
      }
    } else if (tab === 'wskins') {
      for (const s of WEAPON_SKINS) {
        const owned = p.owned.wskins.includes(s.id);
        html += cardTpl({ kind: 'wskin', id: s.id, rarity: s.rarity, name: s.ar, desc: `سكن لسلاح ${WEAPONS[s.w]?.ar || s.w}`, owned, equipped: (eq.wskin || {})[s.w] === s.id, price: s.price || 0, gems: s.gems || 0 });
      }
    } else if (tab === 'parachutes') {
      for (const s of PARACHUTES) {
        const owned = p.owned.parachutes.includes(s.id);
        html += cardTpl({ kind: 'parachute', id: s.id, rarity: s.rarity, name: s.ar, desc: 'مظهر المظلة عند الهبوط', owned, equipped: eq.parachute === s.id, price: s.price || 0, gems: s.gems || 0 });
      }
    } else {
      for (const s of EMOTES) {
        const owned = p.owned.emotes.includes(s.id);
        html += cardTpl({ kind: 'emote', id: s.id, rarity: s.rarity, name: s.ar, desc: 'رقصة/تعبير في المعركة (زر M)', owned, equipped: eq.emote === s.id, price: s.price || 0, gems: s.gems || 0 });
      }
    }
    $('locker-grid').innerHTML = html;
    this.renderThumbs();
    const char = CHAR_MAP[eq.char] || CHARACTERS[0];
    const skin = SKIN_MAP[eq.skin];
    $('locker-info').innerHTML = `<div>${char.ar} — ${RARITY[char.rarity].ar}</div><div style="color:#cfd9e6;font-size:13px">مهارة: ${char.skill.ar} · ${char.skill.desc}</div><div style="font-size:12.5px;color:#9aa8ba">الزي: ${skin ? skin.ar : '—'}</div>`;
  }

  /* ---------- المتجر ---------- */
  renderStore() {
    const p = this.profile; if (!p) return;
    const tabs = [['featured', '🔥 العروض'], ['bundles', '🎁 الحزم'], ['chars', '🧍 الشخصيات'], ['skins', '✨ الاسكنات'], ['weapons', '🔫 أسلحة'], ['vehicles', '🚙 مركبات'], ['crates', '📦 صناديق'], ['wheel', '🎡 عجلة الحظ']];
    $('store-tabs').innerHTML = tabs.map(([k, v]) => `<button class="${this.storeTab === k ? 'active' : ''}" data-store="${k}">${v}</button>`).join('');
    let html = '';
    const t = this.storeTab;
    if (t === 'featured') {
      const feat = [SKINS.find(s => s.id === 'out_gold'), SKINS.find(s => s.id === 'out_flame'), WEAPON_SKINS.find(w => w.id === 'ws_gold'), PARACHUTES.find(x => x.id === 'pc_gold')];
      html += feat.filter(Boolean).map(s => this.itemCard('skin_or_ws', s)).join('');
      html += `<div class="card r-mythic"><span class="rar rar-mythic">عرض محدود</span><div class="thumb"><canvas width="200" height="150" data-thumb="pack:bnd_king"></canvas></div>
        <div class="name">${BUNDLES[3].ar}</div><div class="desc">${BUNDLES[3].desc}</div>
        <div class="price"><span class="tag">${BUNDLES[3].gems} 💎</span><button class="btn-gold" data-bundle="bnd_king">شراء</button></div></div>`;
    } else if (t === 'bundles') {
      html += BUNDLES.map(b => `<div class="card r-${b.rarity}"><span class="rar rar-${b.rarity}">${RARITY[b.rarity].ar}</span>
        <div class="thumb"><canvas width="200" height="150" data-thumb="pack:${b.id}"></canvas></div>
        <div class="name">${b.ar}</div><div class="desc">${b.desc}</div>
        <div class="price"><span class="tag">${b.gems ? b.gems + ' 💎' : b.price + ' 🪙'}</span><button class="btn-gold" data-bundle="${b.id}">شراء</button></div></div>`).join('');
    } else if (t === 'chars') {
      html += CHARACTERS.map(c => this.itemCard('char', c)).join('');
    } else if (t === 'skins') {
      html += SKINS.map(s => this.itemCard('skin', s)).join('');
    } else if (t === 'weapons') {
      html += WEAPON_SKINS.map(s => this.itemCard('wskin', s)).join('');
    } else if (t === 'vehicles') {
      html += VEHICLE_SKINS.map(s => this.itemCard('vskin', s)).join('');
    } else if (t === 'crates') {
      html += CRATES.map(c => `<div class="card r-${c.rarity}"><span class="rar rar-${c.rarity}">${RARITY[c.rarity].ar}</span>
        <div class="thumb"><canvas width="200" height="150" data-thumb="crate:${c.id}"></canvas></div>
        <div class="name">${c.ar}</div><div class="desc">احتمالات: ${Object.entries(c.odds).map(([k, v]) => `${RARITY[k].ar} ${v}%`).join(' · ')}</div>
        <div class="price"><span class="tag">${c.gems ? c.gems + ' 💎' : c.price + ' 🪙'}</span><button class="btn-gold" data-crate="${c.id}">افتح</button></div></div>`).join('');
    } else if (t === 'wheel') {
      html += `<div class="card r-mythic" style="grid-column:1/-1">
        <div class="thumb" style="height:260px"><canvas id="wheel-canvas" width="320" height="320"></canvas></div>
        <div class="name">عجلة الحظ — ${WHEEL.price} 💎 للدوران</div>
        <div class="desc">${WHEEL.slots.map(s => s.ar).join(' · ')}</div>
        <div class="price"><button class="btn-gold" id="btn-spin">🎡 دوّر العجلة</button></div></div>`;
    }
    $('store-grid').innerHTML = html;
    this.renderThumbs();
    if (t === 'wheel') this.drawWheel(0);
  }
  itemCard(kind, item) {
    const p = this.profile;
    const map = { char: 'chars', skin: 'skins', wskin: 'wskins', vskin: 'vskins', parachute: 'parachutes', emote: 'emotes' };
    const bucket = map[kind];
    const owned = p.owned[bucket]?.includes(item.id);
    const eqMap = { char: 'char', skin: 'skin', parachute: 'parachute', emote: 'emote' };
    const equipped = kind === 'wskin' ? (p.equipped.wskin || {})[item.w] === item.id : p.equipped[eqMap[kind]] === item.id;
    return `<div class="card r-${item.rarity} ${owned ? '' : 'locked'}">
      <span class="rar rar-${item.rarity}">${RARITY[item.rarity].ar}</span>
      ${equipped ? '<span class="eq">مُجهّز ✓</span>' : owned ? '<span class="owned">مملوك</span>' : ''}
      <div class="thumb"><canvas width="200" height="150" data-thumb="${kind}:${item.id}"></canvas></div>
      <div class="name">${esc(item.ar)}</div>
      <div class="desc">${esc(item.skill?.desc || item.desc || (kind === 'wskin' ? 'سكن لسلاح ' + (WEAPONS[item.w]?.ar || '') : kind === 'vskin' ? 'سكن مركبة ' + (VEHICLES[item.v]?.ar || '') : ''))}</div>
      <div class="price">
        ${owned ? `<button class="${equipped ? 'btn-ghost' : 'btn-gold'}" data-eq="${kind}:${item.id}">${equipped ? 'مُجهّز' : 'تجهيز'}</button>`
      : `<span class="tag">${item.gems ? item.gems + ' 💎' : (item.price || 0) + ' 🪙'}</span><button class="btn-gold" data-buy="${kind}:${item.id}">شراء</button>`}
      </div></div>`;
  }
  renderThumbs() {
    for (const cv of document.querySelectorAll('canvas[data-thumb]')) {
      try {
        const [kind, id] = (cv.dataset.thumb || '').split(':');
        const ctx = cv.getContext('2d');
        if (!ctx) continue;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const eq = this.profile?.equipped || {};
        if (kind === 'char' || kind === 'skin') {
          drawPortrait(ctx, cv.width, cv.height, { charId: kind === 'char' ? id : (eq.char || 'fahd'), skinId: kind === 'skin' ? id : 'out_basic', t: 0.4, weaponId: this.getEquippedProfile().weapon });
        } else if (kind === 'wskin') {
          const it = WEAPON_SKINS.find(x => x.id === id); if (!it) continue;
          const w = WEAPONS[it.w];
          ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.save(); ctx.translate(16, cv.height / 2); ctx.rotate(-0.12);
          const L = w.type === 'sniper' ? 150 : w.type === 'pistol' ? 74 : 120;
          ctx.fillStyle = it.tint; ctx.fillRect(0, -9, L, 18);
          ctx.fillStyle = it.accent; ctx.fillRect(10, -16, L * 0.45, 9);
          ctx.fillStyle = '#1a1d21'; ctx.fillRect(14, 6, 22, 30);
          if (w.type === 'sniper' || w.type === 'dmr') { ctx.fillStyle = '#101418'; ctx.fillRect(30, -30, 44, 14); }
          ctx.restore();
          ctx.fillStyle = '#fff'; ctx.font = '700 12px Cairo'; ctx.fillText(w.ar, 8, cv.height - 8);
        } else if (kind === 'vskin') {
          const it = VEHICLE_SKINS.find(x => x.id === id); if (!it) continue;
          ctx.save(); ctx.translate(cv.width / 2, cv.height / 2);
          ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -52, -34, 110, 74, 16); ctx.fill();
          ctx.fillStyle = it.tint; rr(ctx, -56, -38, 112, 76, 16); ctx.fill();
          ctx.fillStyle = it.accent; rr(ctx, -34, -26, 52, 52, 10); ctx.fill();
          ctx.fillStyle = '#20262e'; rr(ctx, 10, -28, 34, 56, 8); ctx.fill();
          ctx.restore();
          ctx.fillStyle = '#fff'; ctx.font = '700 12px Cairo'; ctx.fillText(VEHICLES[it.v]?.ar || '', 8, cv.height - 8);
        } else if (kind === 'parachute') {
          const it = PARACHUTES.find(x => x.id === id); if (!it) continue;
          ctx.save(); ctx.translate(cv.width / 2, cv.height * 0.42);
          ctx.fillStyle = it.colors[0]; ctx.beginPath(); ctx.ellipse(0, 0, 66, 44, 0, Math.PI, 6.283); ctx.fill();
          ctx.fillStyle = it.colors[1]; ctx.beginPath(); ctx.ellipse(0, 0, 66, 44, 0, Math.PI, Math.PI * 1.5); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 22, 8); ctx.lineTo(i * 6, 60); ctx.stroke(); }
          ctx.fillStyle = '#c93030'; rr(ctx, -16, 60, 32, 26, 4); ctx.fill();
          ctx.restore();
        } else if (kind === 'emote') {
          const it = EMOTES.find(x => x.id === id); if (!it) continue;
          ctx.font = '64px serif'; ctx.textAlign = 'center'; ctx.fillText(it.icon, cv.width / 2, cv.height * 0.68);
        } else if (kind === 'crate' || kind === 'pack') {
          const list = kind === 'pack' ? BUNDLES : CRATES;
          const it = list.find(x => x.id === id); if (!it) continue;
          const col = RARITY[it.rarity].color;
          ctx.save(); ctx.translate(cv.width / 2, cv.height / 2 + 8);
          ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -44, -34, 92, 74, 8); ctx.fill();
          ctx.fillStyle = '#7a5a2e'; rr(ctx, -46, -38, 92, 74, 8); ctx.fill();
          ctx.fillStyle = col; ctx.fillRect(-46, -12, 92, 16); ctx.fillRect(-6, -38, 12, 74);
          ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 14, 8, 0, 6.283); ctx.fill();
          ctx.restore();
        }
      } catch {
        // ignore thumb render errors
      }
    }
  }
  /* ---------- باس المعركة ---------- */
  renderBP() {
    const p = this.profile; if (!p) return;
    $('bp-title').textContent = BATTLEPASS.seasonAr;
    const need = BATTLEPASS.xpPerTier, total = p.bpXp;
    const tier = p.bpTier;
    $('bp-tier-num').textContent = tier;
    const inTier = total - (tier - 1) * need;
    $('bp-fill').style.width = Math.min(100, (inTier / need) * 100) + '%';
    $('bp-xptxt').textContent = `${Math.min(inTier, need)} / ${need} نقطة باس`;
    $('btn-bp-buy').textContent = p.bpPremium ? '✅ الباس المميز مُفعّل' : `شراء الباس المميز (${BATTLEPASS.premiumPrice} 💎)`;
    $('btn-bp-buy').disabled = !!p.bpPremium;
    const claimed = p.claimedBP || {};
    const node = (track, t, rw) => {
      const unlocked = total >= (t - 1) * need;
      const isClaimed = !!claimed[track + t];
      const label = this.rewardLabel(rw);
      return `<div class="bp-node ${unlocked ? '' : 'locked'}"><div class="t">مستوى ${t}</div><div class="rw">${label}</div>
        <button class="${isClaimed ? 'done' : ''}" data-bp="${track}:${t}">${isClaimed ? 'تم ✓' : unlocked ? (track === 'premium' && !p.bpPremium ? 'مميز فقط' : 'استلام') : 'مقفل'}</button></div>`;
    };
    $('bp-free').innerHTML = Object.entries(BATTLEPASS.free).map(([t, rw]) => node('free', +t, rw)).join('');
    $('bp-prem').innerHTML = Object.entries(BATTLEPASS.premium).map(([t, rw]) => node('premium', +t, rw)).join('');
  }
  rewardLabel(rw) {
    switch (rw.kind) {
      case 'gold': return `🪙 ${rw.value}`;
      case 'skin': return `✨ ${SKINS.find(s => s.id === rw.value)?.ar || 'زي'}`;
      case 'wskin': return `🔫 ${WEAPON_SKINS.find(s => s.id === rw.value)?.ar || 'سكن'}`;
      case 'emote': return `😄 ${EMOTES.find(s => s.id === rw.value)?.ar || 'رقصة'}`;
      case 'char': return `🧍 ${CHARACTERS.find(s => s.id === rw.value)?.ar || 'شخصية'}`;
      default: return '🎁';
    }
  }
  /* ---------- المهام ---------- */
  renderMissions() {
    const p = this.profile; if (!p) return;
    const list = (p.missions || []).filter(m => m.type === this.missionTab);
    $('mission-list').innerHTML = list.map(m => {
      const done = m.progress >= m.goal;
      return `<div class="mission"><div class="m-ar">${m.ar}</div>
        <div class="m-prog">${fmt(m.progress)} / ${fmt(m.goal)}</div>
        <div class="m-bar"><i style="width:${Math.min(100, m.progress / m.goal * 100)}%"></i></div>
        <div class="m-prog">🪙${m.reward.gold || 0} ${m.reward.gems ? '💎' + m.reward.gems : ''} ${m.reward.bp ? '🎖️' + m.reward.bp : ''}</div>
        <button class="${m.claimed ? 'done' : done ? '' : 'wait'}" data-mission="${m.id}" ${m.claimed ? 'disabled' : ''}>${m.claimed ? 'تم ✓' : 'استلام'}</button></div>`;
    }).join('') || '<div class="hint">لا توجد مهام.</div>';
  }
  /* ---------- الترتيب ---------- */
  async renderRank() {
    if (!this.rankData) this.rankData = await API.get('/api/rankings');
    const rows = (this.rankData || {})[this.rankTab] || [];
    $('rank-list').innerHTML = rows.length ? rows.map((r, i) => `<div class="rank-row ${r.id === this.profile?.id ? 'me' : ''}"><div class="pos">${i + 1}</div><div>${esc(r.name)}</div><div style="margin-inline-start:auto;color:var(--gold)">${fmt(r.v)}</div></div>`).join('')
      : '<div class="hint">لا توجد نتائج بعد — كن أول الأبطال!</div>';
  }
  renderFriends() {
    const p = this.profile; if (!p) return;
    $('friend-list').innerHTML = (p.friends || []).map(f => `<div class="friend"><span class="dot"></span><b>${esc(f)}</b><span style="margin-inline-start:auto;color:var(--dim)">اضغط لغرفة معه لاحقاً</span></div>`).join('') || '<div class="hint">لا أصدقاء بعد — أضف أصدقاءك بالاسم.</div>';
  }

  /* ---------- اختيار النمط والخريطة ---------- */
  openModes(online) {
    this.onlineSelect = online;
    this.hideAll();
    $('scr-modes').classList.add('active');
    $('modes-title').textContent = online ? '🌐 معركة أونلاين — اختر النمط والخريطة' : '📴 معركة أوفلاين — اختر النمط والخريطة';
    $('offline-opts').classList.toggle('hidden', online);
    this.renderModeCards();
    this.renderMapCards();
  }
  renderModeCards() {
    $('mode-grid').innerHTML = MODES.map(m => `<div class="mode-card ${this.selectedMode === m.id ? 'active' : ''}" data-mode="${m.id}">
      <div class="ic">${m.icon}</div><b>${m.ar}</b><span>${m.desc}</span></div>`).join('');
  }
  renderMapCards() {
    $('map-grid').innerHTML = MAPS.map(m => `<div class="map-card ${this.selectedMap === m.id ? 'active' : ''}" data-map="${m.id}">
      <canvas width="220" height="150" data-mapcanvas="${m.id}"></canvas><b>${m.ar}</b><span>${m.desc}</span></div>`).join('');
    for (const cv of document.querySelectorAll('canvas[data-mapcanvas]')) this.drawMapPreview(cv, cv.dataset.mapcanvas);
  }
  drawMapPreview(cv, mapId) {
    const m = MAPS.find(x => x.id === mapId);
    const ctx = cv.getContext('2d');
    const biome = BIOMES[m.biome];
    ctx.fillStyle = '#070f16'; ctx.fillRect(0, 0, cv.width, cv.height);
    const cw = cv.width, ch = cv.height, k = Math.min(cw, ch) / (m.size * 1.06);
    ctx.save(); ctx.translate(cw / 2, ch / 2);
    // الشكل
    const path = new Path2D();
    const N = 96;
    const shapeAt = (a) => {
      switch (m.shape.type) {
        case 'circle': return m.shape.r;
        case 'roundrect': return Math.min(m.shape.w, m.shape.h) / 2 * 1.02;
        case 'blob': return m.shape.r * (1 + m.shape.amp * Math.sin(a * m.shape.lobes) * 0.6 + m.shape.amp * 0.4 * Math.cos(a * (m.shape.lobes * 2 + 1)));
        case 'cross': return (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) ? (m.shape.armW / 2) / Math.abs(Math.sin(a) || 1e-3) : (m.shape.armW / 2) / Math.abs(Math.cos(a) || 1e-3);
        case 'ring': return m.shape.r;
        default: return m.size / 2;
      }
    };
    if (m.shape.type === 'roundrect') {
      const w = m.shape.w * k, h = m.shape.h * k, r = m.shape.r * k;
      path.moveTo(-w / 2 + r, -h / 2);
      path.lineTo(w / 2 - r, -h / 2); path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      path.lineTo(w / 2, h / 2 - r); path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      path.lineTo(-w / 2 + r, h / 2); path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      path.lineTo(-w / 2, -h / 2 + r); path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    } else if (m.shape.type === 'cross') {
      const L = m.shape.len * k, A = m.shape.armW / 2 * k, R = m.shape.r * k;
      path.moveTo(-L, -A); path.lineTo(-A - R * 0, -A); path.lineTo(-A, -A); path.lineTo(-A, -L);
      path.lineTo(A, -L); path.lineTo(A, -A); path.lineTo(L, -A); path.lineTo(L, A);
      path.lineTo(A, A); path.lineTo(A, L); path.lineTo(-A, L); path.lineTo(-A, A);
      path.lineTo(-L, A); path.closePath();
    } else {
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, r = shapeAt(a) * k;
        if (i === 0) path.moveTo(Math.cos(a) * r, Math.sin(a) * r); else path.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      path.closePath();
    }
    ctx.fillStyle = biome.ground; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    // تفاصيل
    ctx.strokeStyle = biome.road; ctx.lineWidth = 4;
    for (const rd of (m.terrain.roads || [])) { ctx.beginPath(); ctx.moveTo(rd[0] * k, rd[1] * k); ctx.lineTo(rd[2] * k, rd[3] * k); ctx.stroke(); }
    ctx.fillStyle = biome.water;
    for (const w of (m.terrain.water || [])) ctx.fillRect(w[0] * k - w[2] * k / 2, w[1] * k - w[3] * k / 2, w[2] * k, w[3] * k);
    if (m.terrain.lava) { ctx.fillStyle = '#ff6a1f'; ctx.beginPath(); ctx.arc(0, 0, m.shape.hole * k, 0, 6.283); ctx.fill(); }
    // غابات/مباني
    ctx.fillStyle = biome.detail;
    let sd = 12345;
    const rand = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return (sd / 0x7fffffff); };
    for (let i = 0; i < m.trees / 3; i++) { const a = rand() * 6.283, r2 = Math.sqrt(rand()) * shapeAt(a) * k; ctx.beginPath(); ctx.arc(Math.cos(a) * r2, Math.sin(a) * r2, 2.2, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = 'rgba(15,10,6,.8)';
    for (let i = 0; i < 16 * m.buildDensity; i++) { const a = rand() * 6.283, r2 = Math.sqrt(rand()) * shapeAt(a) * k * 0.86; ctx.fillRect(Math.cos(a) * r2 - 3, Math.sin(a) * r2 - 3, 6, 6); }
    if (m.shape.type === 'ring') { ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.arc(0, 0, m.shape.hole * k * 0.9, 0, 6.283); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,198,61,.7)'; ctx.lineWidth = 2; ctx.stroke(path);
    ctx.restore();
  }

  /* ---------- الغرفة ---------- */
  onLobby(room) {
    if (!$('scr-room').classList.contains('active')) { this.hideAll(); $('scr-room').classList.add('active'); }
    $('room-code').textContent = room.code;
    $('room-count').textContent = room.countdown;
    $('room-players').innerHTML = room.players.map(p => `<div class="rp ${p.ready ? 'ready' : ''}"><span>🧍 ${esc(p.name)}</span><span class="tag">م${p.level}${p.bot ? ' · بوت' : ''}${p.ready ? ' · جاهز' : ''}</span></div>`).join('')
      || '<div class="hint">بانتظار لاعبين... شارك رمز الغرفة مع أصدقائك.</div>';
  }
  onChat(msg) {
    const log = msg.lobby ? $('room-chat') : $('chat-live');
    if (!log) return;
    log.classList.remove('hidden');
    const div = document.createElement('div');
    div.innerHTML = `<b>${esc(msg.from)}:</b> ${esc(msg.text)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 40) log.removeChild(log.firstChild);
  }

  /* ---------- عجلة الحظ ---------- */
  drawWheel(angle) {
    const cv = $('wheel-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const cx = cv.width / 2, cy = cv.height / 2, R = Math.min(cx, cy) - 8;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const n = WHEEL.slots.length, step = 6.283 / n;
    for (let i = 0; i < n; i++) {
      const a0 = angle + i * step;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + step); ctx.closePath();
      const col = ['#3a2a12', '#4a3418', '#5c3f1a', '#7a4f14', '#a8651a', '#d08a1c', '#ffb02e', '#ff4757', '#b45bff'][i % 9];
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,198,61,.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + step / 2);
      ctx.fillStyle = '#fff8e0'; ctx.font = '700 11px Cairo'; ctx.textAlign = 'right';
      ctx.fillText(WHEEL.slots[i].ar, R - 12, 4);
      ctx.restore();
    }
    ctx.fillStyle = '#0c1219'; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#ffc63d'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffc63d'; ctx.font = '700 14px Cairo'; ctx.textAlign = 'center'; ctx.fillText('أورك', cx, cy + 5);
    ctx.fillStyle = '#ffc63d'; ctx.beginPath(); ctx.moveTo(cx, cy - R - 6); ctx.lineTo(cx - 12, cy - R + 14); ctx.lineTo(cx + 12, cy - R + 14); ctx.closePath(); ctx.fill();
  }
  spin(prizeIndex) {
    const n = WHEEL.slots.length, step = 360 / n;
    const target = 360 * 5 + (360 - prizeIndex * step - step / 2);
    let start = null;
    const dur = 3400;
    const cv = $('wheel-canvas');
    const anim = (ts) => {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      const ease = 1 - Math.pow(1 - k, 3);
      this.drawWheel((target * ease) * Math.PI / 180);
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  /* ---------- إجراءات المتجر ---------- */
  async buy(kind, id) {
    const r = await API.post('/api/shop/buy', { token: this.app.token, kind, id });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast('تم الشراء: ' + (r.item?.ar || ''), 'ok'); this.app.audio.buy();
    this.renderLocker(); this.renderStore();
  }
  async equip(slot, id) {
    const r = await API.post('/api/shop/equip', { token: this.app.token, slot, id });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast('تم التجهيز ✓', 'ok'); this.app.audio.ui();
    this.renderLocker(); this.renderStore();
  }
  async buyBundle(id) {
    const r = await API.post('/api/shop/bundle', { token: this.app.token, bundleId: id });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast('🎁 حصلت على: ' + (r.gained || []).join(' · '), 'prize'); this.app.audio.buy();
    this.renderStore();
  }
  async openCrate(id) {
    const r = await API.post('/api/shop/crate', { token: this.app.token, crateId: id });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    const item = r.item;
    this.showModal(`<h2 class="title-gold">${r.duplicate ? 'عنصر مكرر — حوّلناه ذهباً' : '🎉 مبروك!'}</h2>
      <div style="display:grid;place-items:center"><canvas width="260" height="200" data-thumb="${SKINS.find(s => s.id === item.id) ? 'skin' : WEAPON_SKINS.find(s => s.id === item.id) ? 'wskin' : EMOTES.find(s => s.id === item.id) ? 'emote' : 'parachute'}:${item.id}"></canvas></div>
      <div class="reward-chip ${item.rarity === 'mythic' ? 'gems' : 'gold'}">${item.ar} — ${RARITY[item.rarity].ar}</div>
      <div class="row end"><button class="btn-gold" onclick="document.getElementById('modal-wrap').classList.add('hidden')">تمام</button></div>`);
    this.renderThumbs();
    this.app.audio.buy();
  }
  async spinWheel() {
    const r = await API.post('/api/shop/wheel', { token: this.app.token });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    const idx = WHEEL.slots.findIndex(s => s.id === r.slot.id);
    this.spin(idx);
    setTimeout(() => this.toast('🎡 ربحت: ' + r.slot.ar + (r.extra ? ' + ' + r.extra : ''), 'prize'), 3200);
  }
  async buyBP() {
    const r = await API.post('/api/bp/buy', { token: this.app.token });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile(); this.toast('🎖️ تم تفعيل الباس المميز!', 'prize'); this.app.audio.buy();
  }
  async claimBP(track, tier) {
    const r = await API.post('/api/bp/claim', { token: this.app.token, track, tier });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast('🎁 ' + this.rewardLabel(r.rw), 'prize'); this.app.audio.buy();
  }
  async claimMission(id) {
    const r = await API.post('/api/missions/claim', { token: this.app.token, id });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast('🎁 تم استلام الجائزة', 'ok'); this.app.audio.buy();
  }
  async claimDaily() {
    const r = await API.post('/api/daily/claim', { token: this.app.token });
    if (r.error) return this.toast(r.error, 'err');
    this.app.profile = r.profile; this.updateProfile();
    this.toast(`🎁 مكافأة اليوم ${r.streak}: +${r.gold} 🪙 +${r.gems} 💎 +${r.xp} خبرة`, 'prize');
    this.app.audio.levelUp();
  }
  async addFriend(name) {
    const r = await API.post('/api/friends/add', { token: this.app.token, name });
    if (r.error) return this.toast(r.error, 'err');
    await this.refreshProfile();
    this.toast('تمت الإضافة ✓', 'ok');
  }
  async saveSettings(s) {
    const r = await API.post('/api/settings', { token: this.app.token, settings: s });
    if (r.settings) { this.profile.settings = r.settings; this.toast('تم الحفظ ✓', 'ok'); }
  }
}
function effName(e) {
  return { none: 'بدون', glow: 'توهج', fire: 'لهب', ice: 'جليد', lightning: 'برق', void: 'فراغ', crown: 'تاج', trail: 'أثر', smoke: 'دخان', sand: 'رمل', laser: 'ليزر', glitch: 'تشويش', dash: 'انطلاقة' }[e] || e;
}
function fmt(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('ar-EG');
}
export default UI;
