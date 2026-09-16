/**
 * ORK ZONE — client/render.js
 * مدير الرسم: يختار بين المحرك ثلاثي الأبعاد (منظور الشخص الأول/الثالث — render3d.js)
 * والمحرك ثنائي الأبعاد من الأعلى (المسار القديم). كما يدير الميني ماب والمؤثرات المشتركة.
 */
import { WEAPONS, BIOMES, SKINS, CHARACTERS, ARMORS, HEALS, RARITY, ATTACHMENTS } from '/shared/gamedata.js';
import Renderer3D, { CHAR_STYLE, M as UNITS_PER_M, EYE } from './render3d.js';

export { CHAR_STYLE, UNITS_PER_M, EYE };

const SKIN_MAP = Object.fromEntries(SKINS.map(s => [s.id, s]));
const CHAR_MAP = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

function hashN(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/* ============================= المؤثرات الجزيئية ============================= */
class Particles {
  constructor(max = 1400) { this.list = []; this.max = max; }
  spawn(p) {
    // تطبيع الحقول حتى لا تتحول القيم إلى NaN (كان يُفسد الرسم)
    p.vx = Number.isFinite(p.vx) ? p.vx : 0;
    p.vy = Number.isFinite(p.vy) ? p.vy : 0;
    p.grav = Number.isFinite(p.grav) ? p.grav : 0;
    p.drag = Number.isFinite(p.drag) ? p.drag : 0.9;
    p.r = Number.isFinite(p.r) ? p.r : 3;
    p.life = Number.isFinite(p.life) ? p.life : 0.5;
    p.max = Number.isFinite(p.max) ? p.max : p.life;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1.2) : Math.random() * Math.PI * 2;
      const sp = (opts.speed || 160) * (0.35 + Math.random() * 0.9);
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: opts.life || 0.55, max: opts.life || 0.55,
        r: (opts.size || 4) * (0.6 + Math.random() * 0.9), color: opts.color || '#ffb14a', kind: opts.kind || 'spark',
        drag: opts.drag ?? 0.86, grav: opts.grav || 0, text: opts.text, rot: Math.random() * 6.28,
      });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { this.list.splice(i, 1); continue; }
      if (p.kind === 'smoke') p.r += dt * 26;
    }
  }
  draw(ctx) {
    for (const p of this.list) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.r)) continue;
      const k = Math.max(0, p.life / p.max);
      ctx.globalAlpha = k;
      if (p.kind === 'smoke') {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k), 0, 6.283); ctx.stroke();
      } else if (p.kind === 'blood') {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================= الراسم الرئيسي ============================= */
export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mini = document.getElementById('minimap');
    this.mctx = this.mini ? this.mini.getContext('2d') : null;
    this.parts = new Particles();
    this.cam = { x: 0, y: 0, z: 0.72, shake: 0, shakeT: 0 };
    /** وضع العرض: 'fps' = أول ثلاثي الأبعاد (افتراضي) | 'tps' = ثالث | 'top' = ثنائي الأبعاد من الأعلى */
    this.mode = 'fps';
    try { const saved = localStorage.getItem('orkz_view'); if (saved === 'fps' || saved === 'tps' || saved === 'top') this.mode = saved; } catch { }
    this.r3 = new Renderer3D(canvas, this);
    this.r3.setMode(this.mode === 'tps' ? 'tps' : 'fps');
    this.quality = 'high';
    this.time = 0;
    this.footprints = [];
    this.corpses = [];
    this.tracers = [];
    this.flashes = [];
    this.miniStatic = null;
    this.miniKey = null;
    this.bloodFx = true;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.cv.width = Math.floor(w * this.dpr); this.cv.height = Math.floor(h * this.dpr);
    this.w = w; this.h = h;
  }
  setQuality(q) {
    this.quality = q;
    this.dpr = q === 'low' ? 1 : q === 'medium' ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    this.r3.setQuality(q);
  }
  /** تبديل منظور اللعب */
  setMode(m) {
    this.mode = (m === 'top' || m === 'tps') ? m : 'fps';
    this.r3.setMode(this.mode === 'tps' ? 'tps' : 'fps');
    try { localStorage.setItem('orkz_view', this.mode); } catch { }
  }
  get is3D() { return this.mode !== 'top'; }
  shake(amount) {
    this.cam.shake = Math.min(22, this.cam.shake + amount);
    if (this.is3D) this.r3.shake(amount);
  }
  /** إسقاط نقطة من العالم إلى الشاشة (يُستخدم لأرقام الضرر) */
  worldToScreen(x, y, z) {
    if (this.is3D) return this.r3.worldToScreen(x, y, z);
    return { x: (x - this.cam.x) * this.cam.z + this.w / 2, y: (y - this.cam.y) * this.cam.z + this.h / 2, depth: 1, vis: true };
  }

  /* ---------- الهيكل العام ---------- */
  frame(view, dt) {
    this.time += dt;
    try {
      if (this.is3D) {
        this.r3.frame(view, dt);
        this.r3.updateParticles(dt);
        const me = view.players.find(p => p.id === view.myId);
        if (this.mctx) this.drawMinimap(view, me);
      } else {
        this._frame(view, dt);
      }
    } catch (e) { console.warn('render', e && e.message); }
  }
  _frame(view, dt) {
    this.parts.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) { this.tracers[i].life -= dt; if (this.tracers[i].life <= 0) this.tracers.splice(i, 1); }
    for (let i = this.footprints.length - 1; i >= 0; i--) { this.footprints[i].life -= dt; if (this.footprints[i].life <= 0) this.footprints.splice(i, 1); }
    for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].life -= dt; if (this.flashes[i].life <= 0) this.flashes.splice(i, 1); }
    const ctx = this.ctx;
    const { world } = view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = view.biome.ground2; ctx.fillRect(0, 0, this.w, this.h);

    // الكاميرا (تدعم وضع المشاهدة بعد الموت)
    const me = view.players.find(p => p.id === view.myId);
    const camP = (view.camTarget && view.camTarget.al !== 0) ? view.camTarget : (me || view.camTarget);
    const tx = camP ? camP.x : 0;
    const ty = camP ? camP.y : 0;
    const zoom = this.zoomFor(view, camP);
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 9);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 9);
    this.cam.z += (zoom - this.cam.z) * Math.min(1, dt * 6);
    this.cam.shake *= Math.pow(0.0025, dt);
    const sx = (Math.random() - 0.5) * this.cam.shake, sy = (Math.random() - 0.5) * this.cam.shake;

    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(this.cam.z, this.cam.z);
    ctx.translate(-this.cam.x, -this.cam.y);
    this.viewRect = {
      x0: this.cam.x - this.w / 2 / this.cam.z - 60, x1: this.cam.x + this.w / 2 / this.cam.z + 60,
      y0: this.cam.y - this.h / 2 / this.cam.z - 60, y1: this.cam.y + this.h / 2 / this.cam.z + 60,
    };
    const vr = this.viewRect;
    const visible = (x, y, r = 0) => x + r > vr.x0 && x - r < vr.x1 && y + r > vr.y0 && y - r < vr.y1;

    this.drawGround(ctx, view, visible);
    this.drawDecals(ctx, view, visible);
    this.drawFootprints(ctx);
    this.drawLoot(ctx, view, visible);
    this.drawCorpses(ctx, visible);
    this.drawObstacles(ctx, view, visible, 'below');
    this.drawVehicles(ctx, view, visible);
    this.drawAirdrops(ctx, view, visible);
    this.drawPlayers(ctx, view, visible);
    this.drawBullets(ctx, view);
    this.drawGrenades(ctx, view);
    this.drawObstacles(ctx, view, visible, 'above');
    this.parts.draw(ctx);
    this.drawZone(ctx, view);
    ctx.restore();

    this.drawScreenEffects(ctx, view, me);
    if (this.mctx) this.drawMinimap(view, me);
  }

  zoomFor(view, me) {
    const base = Math.max(0.55, Math.min(this.w / 1500, this.h / 900)) * 0.98;
    if (!me) return base * 1.4;
    let z = base;
    if (view.dropPhase) z = base * 0.55;
    else if (me.ai) z = base * 0.92;
    if (me.ai && view.scope) z = base * 0.92 * Math.min(2.3, 1 + (view.scope - 1) * 0.22);
    if (me.ai && !view.scope) z = base * 1.06;
    return Math.max(0.35, z);
  }

  /* ---------- الأرض ---------- */
  drawGround(ctx, view, visible) {
    const { world, biome } = view;
    const shape = world.shape;
    // الشكل الرئيسي (أشكال مختلفة لكل خريطة)
    if (this.miniKey !== world.mapId) this.buildMapPath(world);
    ctx.save();
    ctx.fillStyle = biome.ground;
    ctx.fill(this.mapPath);
    // طبقة تظليل خفيفة لتباين
    ctx.clip(this.mapPath);
    ctx.fillStyle = biome.ground2; ctx.globalAlpha = 0.5;
    for (let gx = Math.floor(view.viewRect ? 0 : 0); gx < 4; gx++) { /* placeholder */ }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  buildMapPath(world) {
    const p = new Path2D();
    const s = world.shape;
    const N = 128;
    p.moveTo(0, 0);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = s.radius(a);
      p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
    this.mapPath = p;
    this.miniKey = world.mapId;
  }
  drawDecals(ctx, view, visible) {
    const { world, biome } = view;
    for (const d of world.decals) {
      if (d.kind === 'road') {
        if (!visible((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, 1400)) continue;
        ctx.strokeStyle = biome.road; ctx.lineWidth = d.width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3; ctx.setLineDash([26, 30]);
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke(); ctx.setLineDash([]);
      } else if (d.kind === 'water') {
        if (!visible(d.x, d.y, Math.max(d.w, d.h))) continue;
        ctx.fillStyle = biome.water;
        this.roundRect(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, d.r); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.stroke();
      } else if (d.kind === 'lava') {
        if (!visible(d.x, d.y, d.r)) continue;
        const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.15, d.x, d.y, d.r);
        g.addColorStop(0, '#fff2a8'); g.addColorStop(0.4, '#ff8a1f'); g.addColorStop(1, '#5a1c05');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
        for (let i = 0; i < 5; i++) {
          const a = this.time * 0.4 + i * 1.3, rr = d.r * 0.5;
          ctx.fillStyle = 'rgba(255,220,120,.35)';
          ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * rr, d.y + Math.sin(a * 1.2) * rr, 20 + Math.sin(this.time * 2 + i) * 8, 0, 6.283); ctx.fill();
        }
      } else if (d.kind === 'building') {
        if (!visible(d.x, d.y, Math.max(d.w, d.h))) continue;
        ctx.fillStyle = biome.build;
        this.roundRect(ctx, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h, 6); ctx.fill();
        // أرضية داخلية
        ctx.fillStyle = biome.floor || 'rgba(0,0,0,.25)';
        this.roundRect(ctx, d.x - d.w / 2 + 12, d.y - d.h / 2 + 12, d.w - 24, d.h - 24, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    // الديكور الداخلي (سجاد + أثاث)
    for (const dd of (world.decor || [])) {
      if (!visible(dd.x, dd.y, 90)) continue;
      if (dd.kind === 'rug') {
        ctx.fillStyle = biome.rug || 'rgba(120,70,60,.5)'; ctx.globalAlpha = 0.5;
        this.roundRect(ctx, dd.x - dd.w / 2, dd.y - dd.h / 2, dd.w, dd.h, 4); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.save(); ctx.translate(dd.x, dd.y); ctx.rotate(dd.a);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; this.roundRect(ctx, -dd.w / 2 + 3, -dd.h / 2 + 4, dd.w, dd.h, 3); ctx.fill();
        ctx.fillStyle = 'rgba(92,70,48,.95)'; this.roundRect(ctx, -dd.w / 2, -dd.h / 2, dd.w, dd.h, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
    }
  }
  drawFootprints(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    for (const f of this.footprints) { ctx.globalAlpha = Math.min(0.35, f.life / 6); ctx.beginPath(); ctx.ellipse(f.x, f.y, 4, 6, f.a, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  drawLoot(ctx, view, visible) {
    for (const l of view.loot) {
      if (l.taken || !visible(l.x, l.y, 40)) continue;
      const col = this.lootColor(l);
      ctx.save(); ctx.translate(l.x, l.y);
      const bob = Math.sin(this.time * 2.6 + l.x * 0.01) * 2;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(2, 6, 13, 7, 0, 0, 6.283); ctx.fill();
      ctx.shadowColor = col; ctx.shadowBlur = this.quality === 'low' ? 0 : 10;
      if (l.kind === 'weapon') {
        // شكل سلاح مصغّر
        ctx.fillStyle = 'rgba(18,20,24,.95)'; this.roundRect(ctx, -15, -3 + bob, 26, 6, 2); ctx.fill();
        ctx.fillStyle = col; this.roundRect(ctx, -6, -1.5 + bob, 13, 3, 1.5); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.6)'; this.roundRect(ctx, -13, 1 + bob, 6, 6, 1.5); ctx.fill();
      } else if (l.kind === 'armor') {
        ctx.fillStyle = col; this.roundRect(ctx, -9, -8 + bob, 18, 15, 4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.35)'; this.roundRect(ctx, -5, -5 + bob, 10, 9, 2); ctx.fill();
      } else if (l.kind === 'heal') {
        ctx.fillStyle = 'rgba(240,240,240,.95)'; this.roundRect(ctx, -8, -7 + bob, 16, 14, 3); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(-5, -1.5 + bob, 10, 3); ctx.fillRect(-1.5, -5 + bob, 3, 10); ctx.fill();
      } else if (l.kind === 'attach') {
        ctx.fillStyle = 'rgba(30,34,40,.95)'; this.roundRect(ctx, -9, -4 + bob, 18, 8, 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, bob, 3.2, 0, 6.283); ctx.fill();
      } else {
        // ذخيرة / عام
        ctx.fillStyle = 'rgba(20,22,26,.9)'; this.roundRect(ctx, -9, -6 + bob, 18, 12, 3); ctx.fill();
        ctx.fillStyle = col; this.roundRect(ctx, -6, -3 + bob, 12, 3, 1.5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-6, 2.5 + bob, 12, 1.5);
      }
      ctx.shadowBlur = 0;
      // وميض الندرة للغنائم النادرة فقط
      if (l.kind === 'weapon' && !this._lowFx) {
        const w = WEAPONS[l.weapon];
        if (w && (w.rarity === 'legendary' || w.rarity === 'mythic' || w.rarity === 'epic')) {
          ctx.globalAlpha = 0.25 + Math.sin(this.time * 4 + l.x) * 0.18;
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, bob, 20, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }
  }
  lootColor(l) {
    if (l.kind === 'weapon') { const w = WEAPONS[l.weapon]; return RARITY[w?.rarity || 'common'].color; }
    if (l.kind === 'armor') return RARITY[ARMORS[l.armor] ? 'rare' : 'common'].color;
    if (l.kind === 'heal') return l.heal === 'medkit' ? '#ff5d5d' : l.heal === 'grenade' ? '#4d6b3a' : '#e8e2d4';
    if (l.kind === 'attach') return RARITY[ATTACHMENTS[l.attach]?.rarity || 'rare'].color;
    return '#d9d2c3';
  }
  drawCorpses(ctx, visible) {
    for (const c of this.corpses) {
      if (!visible(c.x, c.y, 40)) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(90,10,10,.5)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 16, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = c.style.body; this.roundRect(ctx, -18, -9, 36, 18, 8); ctx.fill();
      ctx.fillStyle = '#8a6a52'; ctx.beginPath(); ctx.arc(16, 0, 8, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1; ctx.restore();
      if (c.loot) { ctx.fillStyle = 'rgba(255,198,61,.5)'; ctx.beginPath(); ctx.arc(c.x, c.y, 30, 0, 6.283); ctx.stroke(); }
    }
  }
  drawObstacles(ctx, view, visible, layer) {
    const biome = view.biome;
    for (const o of view.world.obstacles) {
      if (o.destroyed) continue;
      if (!visible(o.x, o.y, o.r + 30)) continue;
      if (layer === 'below') {
        if (o.kind === 'tree') {
          ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(o.x + 8, o.y + 10, o.r * 0.9, o.r * 0.6, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#5b3c22'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.32, 0, 6.283); ctx.fill();
        } else if (o.kind === 'rock') {
          ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(o.x + 6, o.y + 8, o.r, o.r * 0.7, 0, 0, 6.283); ctx.fill();
          const g = ctx.createLinearGradient(o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r);
          g.addColorStop(0, '#b9bec6'); g.addColorStop(1, '#6d747d');
          ctx.fillStyle = g; ctx.beginPath();
          for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; const rr = o.r * (0.82 + Math.sin(i * 2.1 + o.x) * 0.16); ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 2; ctx.stroke();
        } else if (o.kind === 'wall') {
          ctx.fillStyle = biome.build;
          this.roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, o.h, 3); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.1)';
          this.roundRect(ctx, o.x - o.w / 2, o.y - o.h / 2, o.w, Math.max(3, o.h * 0.35), 3); ctx.fill();
        } else if (o.kind === 'crate') {
          ctx.fillStyle = 'rgba(0,0,0,.3)'; this.roundRect(ctx, o.x - 26, o.y - 22, 56, 50, 5); ctx.fill();
          ctx.fillStyle = o.hp < 40 ? '#6b4a24' : '#9a6c33';
          this.roundRect(ctx, o.x - 27, o.y - 27, 54, 54, 5); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(o.x - 27, o.y - 12); ctx.lineTo(o.x + 27, o.y - 12); ctx.moveTo(o.x - 27, o.y + 12); ctx.lineTo(o.x + 27, o.y + 12); ctx.stroke();
          if (o.hp < o.maxHp) { ctx.fillStyle = '#ff5a5a'; ctx.fillRect(o.x - 27, o.y - 34, 54 * (o.hp / o.maxHp), 4); }
        }
      } else {
        if (o.kind === 'tree') {
          ctx.globalAlpha = 0.92;
          const g = ctx.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.2, o.x, o.y, o.r * 1.15);
          g.addColorStop(0, biome.tree || '#4d9a53');
          g.addColorStop(0.62, biome.treeDark || '#1e4426');
          g.addColorStop(1, 'rgba(6,16,10,.9)');
          ctx.fillStyle = g;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283 + o.x * 0.01; const rr = o.r * (0.95 + Math.sin(i * 1.7) * 0.1); ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /* ---------- المركبات والقنابل ---------- */
  drawVehicles(ctx, view, visible) {
    for (const v of view.vehicles) {
      if (v.dead || !visible(v.x, v.y, 70)) continue;
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; this.roundRect(ctx, -34, -24, 76, 54, 12); ctx.fill();
      const col = v.t === 'boat' ? '#2f6f92' : v.t === 'bike' ? '#b03a2e' : v.t === 'tank' ? '#4a4a4a' : '#5a6b3a';
      ctx.fillStyle = col; this.roundRect(ctx, -36, -26, 72, 52, 12); ctx.fill();
      // إطارات
      ctx.fillStyle = '#14171b';
      this.roundRect(ctx, -30, -31, 20, 9, 3); ctx.fill();
      this.roundRect(ctx, -30, 22, 20, 9, 3); ctx.fill();
      this.roundRect(ctx, 12, -31, 20, 9, 3); ctx.fill();
      this.roundRect(ctx, 12, 22, 20, 9, 3); ctx.fill();
      // زجاج + سقف
      ctx.fillStyle = 'rgba(150,200,240,.35)'; this.roundRect(ctx, -22, -18, 34, 36, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; this.roundRect(ctx, -14, -12, 22, 24, 4); ctx.fill();
      ctx.fillStyle = '#20262e'; this.roundRect(ctx, 8, -20, 22, 40, 5); ctx.fill();
      if (v.t === 'tank') { ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(40, 0); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,80,80,.85)'; ctx.fillRect(-36, -30, 72 * Math.max(0, v.hp / 900), 5);
      ctx.restore();
    }
  }
  drawAirdrops(ctx, view, visible) {
    for (const a of view.airdrops) {
      if (!visible(a.x, a.y, 240)) continue;
      if (!a.l) {
        // مظلة الصندوق
        ctx.strokeStyle = 'rgba(220,220,220,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y - a.z); ctx.lineTo(a.x - 26, a.y - a.z - 34); ctx.moveTo(a.x, a.y - a.z); ctx.lineTo(a.x + 26, a.y - a.z - 34); ctx.stroke();
        ctx.fillStyle = '#e04b4b'; ctx.beginPath(); ctx.ellipse(a.x, a.y - a.z - 40, 34, 18, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#c93030';
        this.roundRect(ctx, a.x - 16, a.y - a.z - 14, 32, 28, 4); ctx.fill();
        // ظل على الأرض
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(a.x, a.y, 16, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,80,60,.28)'; ctx.beginPath(); ctx.arc(a.x, a.y, 60, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#c93030'; this.roundRect(ctx, a.x - 18, a.y - 15, 36, 30, 5); ctx.fill();
        ctx.fillStyle = '#ffd166'; ctx.fillRect(a.x - 18, a.y - 4, 36, 8);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = `rgba(220,80,60,${0.25 - i * 0.04})`;
          ctx.beginPath(); ctx.arc(a.x + Math.sin(this.time + i) * 20, a.y + i * -14 - 10, 18 + i * 8, 0, 6.283); ctx.fill();
        }
      }
    }
  }
  drawBullets(ctx, view) {
    for (const b of view.bullets) {
      const len = b.w === 'awm' || b.w === 'kar98' || b.w === 'm249' ? 34 : 22;
      ctx.strokeStyle = b.silent ? 'rgba(255,255,200,.5)' : '#fff3b0';
      ctx.lineWidth = b.w === 'awm' ? 3 : 2;
      ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(b.a) * len, b.y - Math.sin(b.a) * len);
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (const t of this.tracers) {
      ctx.globalAlpha = Math.max(0, t.life / 0.12) * 0.7;
      ctx.strokeStyle = t.color || '#fff0a8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  drawGrenades(ctx, view) {
    for (const g of view.grenades) {
      ctx.fillStyle = g.it === 'smoke' ? '#c9c9c9' : '#4d6b3a';
      ctx.beginPath(); ctx.arc(g.x, g.y, 6, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,60,.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.x, g.y, 10 + Math.sin(this.time * 12) * 3, 0, 6.283); ctx.stroke();
    }
    for (const s of view.smokes || []) {
      for (let i = 0; i < 6; i++) {
        const a = this.time * 0.6 + i; const rr = s.r * 0.5;
        ctx.fillStyle = 'rgba(210,210,215,.5)';
        ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, s.r * 0.45, 0, 6.283); ctx.fill();
      }
    }
  }

  /* ---------- اللاعبون ---------- */
  drawPlayers(ctx, view, visible) {
    const sorted = view.players.slice().sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (!p.al && !p.dying) { continue; }
      if (!visible(p.x, p.y, 90)) continue;
      if (view.myId === p.id && view.firstPerson && !view.dropPhase) {
        // في المنظار: لا نرسم نفسك بالكامل
        this.drawCharacter(ctx, p, true, view);
        continue;
      }
      this.drawCharacter(ctx, p, p.id === view.myId, view);
    }
  }
  drawCharacter(ctx, p, isMe, view) {
    const skin = SKIN_MAP[p.s] || SKIN_MAP.out_basic;
    const charDef = CHAR_MAP[p.c] || CHAR_MAP.fahd;
    const style = CHAR_STYLE[p.c] || CHAR_STYLE.fahd;
    const body = skin ? skin.body : style.body;
    const pants = skin ? skin.pants : '#2f3a46';
    const accent = skin ? skin.accent : '#8fa3b8';
    ctx.save();
    ctx.translate(p.x, p.y);
    // ظل
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(4, 6, 16, 11, 0, 0, 6.283); ctx.fill();
    if (p.stl) ctx.globalAlpha = isMe ? 0.55 : 0.32;

    ctx.rotate(p.a || 0);
    const walk = p.walking ? Math.sin(this.time * 12) : 0;
    const prone = p.pr;

    if (prone) ctx.scale(1, 0.7);

    // الأرجل
    ctx.fillStyle = pants;
    this.roundRect(ctx, -12 + walk * 4, -11, 15, 9, 4); ctx.fill();
    this.roundRect(ctx, -12 - walk * 4, 2, 15, 9, 4); ctx.fill();
    // الحقيبة
    if (p.bagLvl) { ctx.fillStyle = '#4a4a3a'; this.roundRect(ctx, -17, -10, 12, 20, 5); ctx.fill(); }
    // الجسم
    const g = ctx.createLinearGradient(-14, -12, 10, 12);
    g.addColorStop(0, body); g.addColorStop(1, this.shade(body, -22));
    ctx.fillStyle = g; this.roundRect(ctx, -13, -12, 27, 24, 9); ctx.fill();
    // الدرع
    if (p.vestLvl) {
      ctx.fillStyle = p.vestLvl === 3 ? '#3a3a3a' : p.vestLvl === 2 ? '#4a4230' : '#5a5240';
      this.roundRect(ctx, -11, -11, 21, 22, 8); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // الذراعان + السلاح
    const wp = p.w ? WEAPONS[p.w] : null;
    const wpnSkin = view.weaponSkins?.[p.id];
    ctx.fillStyle = this.shade(body, 12);
    if (p.rl) { this.roundRect(ctx, 2, -14, 14, 6, 3); ctx.fill(); this.roundRect(ctx, 2, 8, 14, 6, 3); ctx.fill(); }
    else {
      this.roundRect(ctx, 4, -13, 16, 6, 3); ctx.fill();
      this.roundRect(ctx, 4, 7, 16, 6, 3); ctx.fill();
    }
    if (wp && wp.type !== 'melee') {
      const gunLen = wp.type === 'sniper' || wp.type === 'lmg' ? 34 : wp.type === 'pistol' ? 16 : 26;
      ctx.fillStyle = wpnSkin ? wpnSkin.tint : '#22262c';
      this.roundRect(ctx, 8, -3.5, gunLen, 7, 2.5); ctx.fill();
      ctx.fillStyle = wpnSkin ? wpnSkin.accent : '#3a4048';
      this.roundRect(ctx, 10, -6, gunLen * 0.42, 4, 2); ctx.fill();
      if (p.zoom > 1.3) { ctx.fillStyle = '#111'; this.roundRect(ctx, 14, -8, 12, 5, 2); ctx.fill(); }
      if (p.fireFx > 0) {
        ctx.fillStyle = 'rgba(255,220,120,.95)';
        ctx.beginPath(); ctx.ellipse(8 + gunLen + 8, 0, 12 * p.fireFx, 6 * p.fireFx, 0, 0, 6.283); ctx.fill();
      }
    } else if (wp && wp.type === 'melee') {
      ctx.fillStyle = '#c0c6cf'; this.roundRect(ctx, 10, -3, 22, 5, 2); ctx.fill();
    }
    // الرأس
    ctx.fillStyle = '#c9905f';
    ctx.beginPath(); ctx.arc(4, 0, 9.5, 0, 6.283); ctx.fill();
    // شعر / قبعة
    ctx.fillStyle = style.hair;
    ctx.beginPath(); ctx.arc(4, 0, 9.5, -2.2, 2.2, true); ctx.fill();
    if (style.hat === 'cap' || style.hat === 'beret') { ctx.fillStyle = accent; this.roundRect(ctx, -4, -10, 14, 20, 6); ctx.fill(); }
    if (style.hat === 'crown') {
      ctx.fillStyle = '#ffc63d';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 6 - 1, -10); ctx.lineTo(i * 6 + 2, -18); ctx.lineTo(i * 6 + 5, -10); ctx.closePath(); ctx.fill(); }
    }
    if (p.helmLvl) {
      const c = p.helmLvl === 3 ? '#2f2f2f' : p.helmLvl === 2 ? '#3d4a33' : '#4a4436';
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(4, 0, 11, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(2, -3, 5, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // تأثيرات الاسكن
    if (skin && skin.effect && skin.effect !== 'none' && Math.random() < (this.quality === 'low' ? 0.15 : 0.5)) {
      const e = skin.effect;
      const col = e === 'fire' ? '#ff8b2e' : e === 'ice' ? '#8fe8ff' : e === 'lightning' ? '#69a8ff' : e === 'void' ? '#c74bff' : e === 'glow' || e === 'crown' ? '#ffc63d' : accent;
      if (this.quality !== 'low' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.parts.spawn({ x: p.x + (Math.random() - 0.5) * 22, y: p.y + (Math.random() - 0.5) * 22, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30, life: 0.6, max: 0.6, r: 2 + Math.random() * 3, color: col, kind: 'spark', drag: 0.94, grav: 0 });
      }
    }
    // الاسم وشريط الصحة
    const showTag = !(isMe && view.firstPerson) || view.dropPhase;
    if (showTag) {
      const sameTeam = view.myTeam !== undefined && p.t === view.myTeam && view.teams;
      const col = isMe ? '#ffc63d' : sameTeam ? '#6ee7a0' : p.bot ? '#ff9a9a' : '#9fd0ff';
      ctx.font = '700 12px Cairo, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const w = ctx.measureText(p.n).width + 12;
      this.roundRect(ctx, p.x - w / 2, p.y - 44, w, 16, 6); ctx.fill();
      ctx.fillStyle = col; ctx.fillText(p.n, p.x, p.y - 32);
      const hpW = 44;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - hpW / 2, p.y - 27, hpW, 4);
      ctx.fillStyle = p.hp > 50 ? '#41e06a' : p.hp > 20 ? '#ffd23d' : '#ff4757';
      ctx.fillRect(p.x - hpW / 2, p.y - 27, hpW * (Math.max(0, p.hp) / 100), 4);
    }
    if (p.kn) {
      ctx.font = '700 11px Cairo'; ctx.fillStyle = '#ff8080'; ctx.textAlign = 'center';
      ctx.fillText('مصاب!', p.x, p.y - 48);
    }
    if (p.em && p.em !== null && view.emoteIcons) { }
  }

  /* ---------- العاصفة ---------- */
  drawZone(ctx, view) {
    const z = view.zone;
    const vr = this.viewRect || { x0: z.x - 3000, x1: z.x + 3000, y0: z.y - 3000, y1: z.y + 3000 };
    const pad = 3000;
    const x0 = vr.x0 - pad, x1 = vr.x1 + pad, y0 = vr.y0 - pad, y1 = vr.y1 + pad;
    const cx = z.x, cy = z.y, r = z.r;
    ctx.save();
    // المنطقة الواقعة خارج الدائرة (٤ مستطيلات — بلا أي اعتماد على قاعدة اللف)
    ctx.fillStyle = 'rgba(58,88,255,.24)';
    const topH = Math.max(0, (cy - r) - y0);
    if (topH > 0) ctx.fillRect(x0, y0, x1 - x0, topH);
    const botY = cy + r;
    if (y1 > botY) ctx.fillRect(x0, botY, x1 - x0, y1 - botY);
    const midY0 = Math.max(y0, cy - r), midH = Math.min(y1, cy + r) - midY0;
    if (midH > 0) {
      const leftW = Math.max(0, (cx - r) - x0);
      if (leftW > 0) ctx.fillRect(x0, midY0, leftW, midH);
      const rightX = cx + r;
      if (x1 > rightX) ctx.fillRect(rightX, midY0, x1 - rightX, midH);
    }
    // جدار العاصفة
    ctx.strokeStyle = 'rgba(130,190,255,.95)'; ctx.lineWidth = 5 / (this.cam.z || 1);
    ctx.shadowColor = '#5f8cff'; ctx.shadowBlur = 26;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke();
    // موجة طاقة داخلية
    ctx.globalAlpha = 0.35 + Math.sin(this.time * 3) * 0.15;
    ctx.lineWidth = 22 / (this.cam.z || 1);
    ctx.strokeStyle = 'rgba(90,140,255,.6)';
    ctx.beginPath(); ctx.arc(cx, cy, r - 10 / (this.cam.z || 1), 0, 6.283); ctx.stroke();
    ctx.globalAlpha = 1;
    // الدائرة القادمة
    if (z.st !== 'hold' || z.phase < 8) {
      ctx.setLineDash([16 / (this.cam.z || 1), 14 / (this.cam.z || 1)]);
      ctx.lineWidth = 3 / (this.cam.z || 1); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(z.tx, z.ty, z.tr, 0, 6.283); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* ---------- تأثيرات الشاشة ---------- */
  drawScreenEffects(ctx, view, me) {
    const w = this.w, h = this.h;
    // وميض الضرر
    if (view.damageFlash && view.damageFlash > 0) {
      ctx.fillStyle = `rgba(255,20,40,${0.35 * view.damageFlash})`;
      ctx.fillRect(0, 0, w, h);
    }
    // توهج منخفض الصحة
    if (me && me.hp <= 30 && me.al) {
      const p = 0.35 + Math.sin(this.time * 4) * 0.12;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, `rgba(255,0,30,${p})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    // داخل العاصفة
    if (me && Math.hypot(me.x - view.zone.x, me.y - view.zone.y) > view.zone.r) {
      ctx.fillStyle = 'rgba(90,130,255,.14)'; ctx.fillRect(0, 0, w, h);
    }
    // خطوط اتجاه الخطر (عند الإطلاق)
    if (view.shotDirs && view.shotDirs.length) {
      for (const s of view.shotDirs) {
        const a = Math.atan2(s.y - me.y, s.x - me.x);
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(a);
        ctx.fillStyle = `rgba(255,90,60,${0.5 * s.k})`;
        ctx.beginPath(); ctx.moveTo(60, -14); ctx.lineTo(120, 0); ctx.lineTo(60, 14); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // فلاشات
    for (const f of this.flashes) {
      ctx.globalAlpha = Math.max(0, f.life / f.max) * (f.a || 0.5);
      ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.sx, f.sy, f.r, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- الميني ماب ---------- */
  drawMinimap(view, me) {
    const ctx = this.mctx, S = this.mini.width;
    const world = view.world;
    if (this.miniKey !== world.mapId + S) {
      this.miniStatic = document.createElement('canvas');
      this.miniStatic.width = this.miniStatic.height = S;
      this.buildMini(world, this.miniStatic.getContext('2d'), S);
      this.miniKey = world.mapId + S;
    }
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.miniStatic, 0, 0);
    const k = (S * 0.94) / world.map.size, ox = S / 2, oy = S / 2;
    const W = (x) => ox + x * k, H = (y) => oy + y * k;
    const z = view.zone;
    // منطقة العاصفة
    ctx.fillStyle = 'rgba(60,90,255,.22)';
    ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.arc(W(z.x), H(z.y), z.r * k, 0, 6.283, true); ctx.fill();
    ctx.strokeStyle = 'rgba(140,190,255,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W(z.x), H(z.y), z.r * k, 0, 6.283); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(W(z.tx), H(z.ty), z.tr * k, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    // اللاعبون
    for (const p of view.players) {
      if (!p.al) continue;
      const isMe = p.id === view.myId;
      const sameTeam = view.teams && p.t === view.myTeam;
      if (!isMe && !sameTeam && !p.bot) continue;
      if (p.bot && !isMe && !sameTeam && view.fogOfWar) continue;
      ctx.fillStyle = isMe ? '#ffc63d' : sameTeam ? '#6ee7a0' : '#ff6b6b';
      ctx.beginPath(); ctx.arc(W(p.x), H(p.y), isMe ? 3.4 : 2.4, 0, 6.283); ctx.fill();
      if (!isMe && !sameTeam) { ctx.fillStyle = 'rgba(255,80,80,.3)'; ctx.beginPath(); ctx.arc(W(p.x), H(p.y), 6, 0, 6.283); ctx.fill(); }
    }
    for (const a of view.airdrops) { ctx.fillStyle = '#ff4d4d'; ctx.fillRect(W(a.x) - 3, H(a.y) - 3, 6, 6); }
    for (const v of view.vehicles) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(W(v.x) - 2, H(v.y) - 2, 4, 4); }
  }
  buildMini(world, ctx, S) {
    const k = (S * 0.94) / world.map.size, ox = S / 2, oy = S / 2;
    const W = (x) => ox + x * k, H = (y) => oy + y * k;
    const biome = BIOMES[world.map.biome] || BIOMES.grass;
    ctx.fillStyle = biome.ground2; ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) { const a = (i / 128) * 6.283, r = world.shape.radius(a); ctx.lineTo(W(Math.cos(a) * r), H(Math.sin(a) * r)); }
    ctx.closePath(); ctx.fillStyle = biome.ground; ctx.fill(); ctx.clip();
    for (const d of world.decals) {
      if (d.kind === 'road') { ctx.strokeStyle = biome.road; ctx.lineWidth = Math.max(2, d.width * k); ctx.beginPath(); ctx.moveTo(W(d.x1), H(d.y1)); ctx.lineTo(W(d.x2), H(d.y2)); ctx.stroke(); }
      else if (d.kind === 'water') { ctx.fillStyle = biome.water; ctx.fillRect(W(d.x - d.w / 2), H(d.y - d.h / 2), d.w * k, d.h * k); }
      else if (d.kind === 'lava') { ctx.fillStyle = '#ff6a1f'; ctx.beginPath(); ctx.arc(W(d.x), H(d.y), d.r * k, 0, 6.283); ctx.fill(); }
      else if (d.kind === 'building') { ctx.fillStyle = 'rgba(20,16,12,.75)'; ctx.fillRect(W(d.x - d.w / 2), H(d.y - d.h / 2), Math.max(2, d.w * k), Math.max(2, d.h * k)); }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,198,61,.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) { const a = (i / 128) * 6.283, r = world.shape.radius(a); ctx.lineTo(W(Math.cos(a) * r), H(Math.sin(a) * r)); }
    ctx.closePath(); ctx.stroke();
  }

  /* ---------- أدوات ---------- */
  roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
  }
  /* ربط أحداث اللعبة بالمؤثرات */
  handleEvent(e, view) {
    if (this.is3D) { this.r3.handleEvent(e, view); return; }
    switch (e.type) {
      case 'hit': {
        const p = view.players.find(x => x.id === e.on);
        const col = this.bloodFx === false ? (e.head ? '#dfe7f1' : '#aab4c2') : (e.head ? '#ff3355' : '#c42030');
        this.parts.burst(e.x, e.y, e.head ? 12 : 7, { color: col, speed: 200, life: 0.4, size: 3, kind: 'blood' });
        if (e.by === view.myId) this.hitFlash = 0.25;
        break;
      }
      case 'kill': {
        const v = view.players.find(x => x.id === e.id);
        if (v) this.corpses.push({ x: v.x, y: v.y, a: v.a, style: CHAR_STYLE[v.c] || CHAR_STYLE.fahd, loot: true });
        if (this.corpses.length > 24) this.corpses.shift();
        this.parts.burst(e.x, e.y, 16, { color: this.bloodFx === false ? '#8b93a1' : '#a01828', speed: 160, life: 0.7, size: 4, kind: 'blood' });
        break;
      }
      case 'explosion': {
        this.parts.burst(e.x, e.y, 46, { color: '#ffb14a', speed: 460, life: 0.7, size: 7 });
        this.parts.burst(e.x, e.y, 26, { color: '#ff5a20', speed: 300, life: 1.0, size: 12 });
        this.parts.burst(e.x, e.y, 18, { color: 'rgba(120,120,120,.7)', speed: 120, life: 1.6, size: 20, kind: 'smoke', drag: 0.9 });
        this.parts.spawn({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.4, max: 0.4, r: 30, color: '#ffd166', kind: 'ring', grav: 0, drag: 1 });
        if (view.players.find(p => p.id === view.myId)) this.shake(14);
        break;
      }
      case 'vehicleBoom': {
        this.parts.burst(e.x, e.y, 40, { color: '#ffb14a', speed: 420, life: 0.8, size: 8 });
        this.shake(16);
        break;
      }
      case 'pickup': this.parts.burst(e.x, e.y, 6, { color: '#ffd166', speed: 90, life: 0.4, size: 3 }); break;
      case 'airdropLand': this.parts.spawn({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.9, max: 0.9, r: 20, color: '#ff6a4a', kind: 'ring', grav: 0, drag: 1 }); break;
      case 'smoke': (view.smokes = view.smokes || []).push({ x: e.x, y: e.y, r: 180, t: e.dur }); break;
      case 'crateBreak': this.parts.burst(e.x, e.y, 14, { color: '#b98b4a', speed: 200, life: 0.6, size: 5 }); break;
      default: break;
    }
  }
}
export default Renderer;
