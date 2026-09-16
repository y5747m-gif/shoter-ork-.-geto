/**
 * ORK ZONE — client/render3d.js
 * محرّك الرسم ثلاثي الأبعاد: منظور الشخص الأول (FPS) ومنظور الشخص الثالث (TPS).
 *
 * لا يعتمد على أي مكتبة خارجية (لا Three.js ولا WebGL): rasterization برمجي على canvas 2D —
 * تحويل النقاط لفضاء الكاميرا → قصّ عند المستوى القريب → إسقاط منظور → ترتيب حسب العمق (Painter)
 * → تظليل مسطح مع ضوء شمس + ضباب مسافة.
 *
 * العالم ثنائي الأبعاد في المحاكاة (shared/sim.js) يبقى كما هو؛ هذا الملف يضيف له البُعد الثالث
 * (الارتفاع) ويبني منه مشهداً مجسّماً: جدران وأسقف للبيوت، صخور وأشجار مجسّمة، ولاعبين
 * بأجسام بشرية متناسقة (رأس/جذع/ذراعان/ساقان/حقيبة/خوذة/سلاح) بدل الأشكال المسطّحة القديمة.
 */
import { WEAPONS, SKINS, CHARACTERS, RARITY, ARMORS, ATTACHMENTS } from '/shared/gamedata.js';

/* ============================= ثوابت القياس ============================= */
/** كل ٤٠ وحدة عالم = متر واحد (سرعة اللاعب ٢٢٥ وحدة/ث ≈ ٥٫٦ م/ث أي عدو واقعي) */
export const M = 40;
const IM = 1 / M;
/** ارتفاع العين (بالمتر) لكل وضعية */
export const EYE = { stand: 1.66, crouch: 1.0, prone: 0.36, car: 1.95, air: 1.2 };
/** ارتفاع جدران وأسقف البيوت بالوحدات */
const WALL_H = 3.2 * M;
const ROOF_T = 0.28 * M;

/* ألوان ملابس افتراضية لكل شخصية (رجال بأزياء مختلفة) — مشتركة مع الراسم ثنائي الأبعاد */
export const CHAR_STYLE = {
  fahd:    { body: '#4a5b6e', hair: '#2b2b2b', hat: 'none' },
  amer:    { body: '#3f5d3a', hair: '#1f1f1f', hat: 'cap' },
  hakim:   { body: '#e8eef5', hair: '#333333', hat: 'medic' },
  khaled:  { body: '#232838', hair: '#111111', hat: 'hood' },
  shadi:   { body: '#4b5a35', hair: '#3a2a1a', hat: 'beret' },
  rami:    { body: '#7a6a3a', hair: '#2b2b2b', hat: 'helmet' },
  zaid:    { body: '#5c4a3a', hair: '#1a1a1a', hat: 'none' },
  yaser:   { body: '#1c2026', hair: '#0d0d0d', hat: 'hood' },
  majhool: { body: '#2f3440', hair: '#222222', hat: 'mask' },
  tannin:  { body: '#7a2b12', hair: '#101010', hat: 'none' },
  asad:    { body: '#cfe3f5', hair: '#d8d8d8', hat: 'hood' },
  orkking: { body: '#3a2408', hair: '#0d0d0d', hat: 'crown' },
};
/** لون البشرة حسب الشخصية (تنويع بسيط) */
const SKIN_TONE = {
  fahd: '#c9905f', amer: '#b9804f', hakim: '#d8a878', khaled: '#a8724a', shadi: '#c08a5c',
  rami: '#b57f52', zaid: '#8f5f3c', yaser: '#a06a44', majhool: '#b07a50', tannin: '#c48a58',
  asad: '#e0b48c', orkking: '#d0a070',
};

const SKIN_MAP = Object.fromEntries(SKINS.map(s => [s.id, s]));
const CHAR_MAP = Object.fromEntries(CHARACTERS.map(c => [c.id, c]));

/* ============================= أدوات الألوان ============================= */
const RGB_CACHE = new Map();
function _rgbOf(hex) {
  let c = RGB_CACHE.get(hex);
  if (c) return c;
  const str = String(hex);
  if (str.startsWith('rgb')) {
    const m = str.match(/([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
    c = m ? [+m[1], +m[2], +m[3]] : [255, 0, 255];
  } else {
    let s = str.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    c = Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 0, 255];
  }
  if (RGB_CACHE.size > 8000) RGB_CACHE.clear();
  RGB_CACHE.set(hex, c);
  return c;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** تعتيم/تفتيت لون سداسي (يعيد hex صالحاً للتظليل والتخزين) */
export function tint(hex, amt) {
  const [r, g, b] = rgbOf(hex);
  const f = (v) => clamp(Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)), 0, 255);
  const h = (v) => f(v).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
/** يقبل hex أو rgb(...) أو أسماء معروفة ويعيد [r,g,b] */
export function rgbOf(hex) { return _rgbOf(hex); }

/* اتجاه ضوء الشمس (مُوحَّد) */
const LX = -0.42, LY = -0.34, LZ = 0.84;

/* مستويات تفاصيل حسب الجودة */
const QUALITY = {
  low:    { dpr: 1,    dist: 2600, fog: [1500, 2900],  trees: 1, detail: 0, parts: 240 },
  medium: { dpr: 1.25, dist: 3600, fog: [2200, 4100],  trees: 1, detail: 1, parts: 500 },
  high:   { dpr: 2,    dist: 4600, fog: [2800, 5400], trees: 1, detail: 1, parts: 800 },
  ultra:  { dpr: 2,    dist: 5800, fog: [3500, 6600], trees: 1, detail: 1, parts: 1200 },
};

/* أوجه الصندوق: ٨ رؤوس مرتّبة بالبتات (x=1, y=2, z=4) */
const BOX_SIDES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 1, 5, 4], [2, 3, 7, 6]];
const BOX_TOP = [4, 5, 7, 6];
const BOX_BOTTOM = [0, 1, 3, 2];

/* ============================= الراسم ثلاثي الأبعاد ============================= */
export class Renderer3D {
  constructor(canvas, host) {
    this.cv = canvas;
    this.host = host || null;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 1; this.h = 1;
    this.dpr = 1;
    this.quality = 'high';
    this.bloodFx = true;
    this.mode = 'fps';            // 'fps' | 'tps'
    this.time = 0;
    this.frameNo = 0;
    /** كاميرا ثلاثية الأبعاد: الموقع بالوحدات، الارتفاع z، والاتجاهات بالراديان */
    this.cam = {
      x: 0, y: 0, z: EYE.stand * M, yaw: 0, pitch: 0, roll: 0,
      fovX: 90, fovT: 90, ads: 0, kick: 0, shake: 0, bob: 0, bobPhase: 0, sway: 0,
    };
    this.faces = [];
    this._pool = [];
    this.parts = [];
    this.corpses = [];
    this.smokes = [];
    this.flashes = [];
    this.beams = [];
    this._anim = new Map();
    this._shadeCache = new Map();
    this._fogKey = '';
    this.recoil = 0;
    this.hitFlash = 0;
    this.stats = { faces: 0, objects: 0, drawn: 0 };
    this.fogColor = '#0f1a24';
    this.fogNear = 1200; this.fogFar = 4400;
    this.drawDist = 4400;
    this.cfg = QUALITY.high;
    this._corners = new Float64Array(24);
    this._scratch = new Float64Array(4);
    this._clipA = new Float64Array(64);
    this._clipB = new Float64Array(64);
    this._v = new Float64Array(3);
    this.resize();
  }

  resize() {
    const w = (typeof window !== 'undefined' ? window.innerWidth : 1280) || 1280;
    const h = (typeof window !== 'undefined' ? window.innerHeight : 720) || 720;
    this.dpr = Math.min(this.cfg.dpr, (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1));
    this.cv.width = Math.max(2, Math.floor(w * this.dpr));
    this.cv.height = Math.max(2, Math.floor(h * this.dpr));
    this.w = w; this.h = h;
  }
  setQuality(q) {
    this.quality = q || 'high';
    this.cfg = QUALITY[this.quality] || QUALITY.high;
    this.drawDist = this.cfg.dist;
    this.fogNear = this.cfg.fog[0];
    this.fogFar = this.cfg.fog[1];
    this.resize();
  }
  setMode(m) { this.mode = m === 'tps' ? 'tps' : 'fps'; }
  shake(n) { this.cam.shake = Math.min(26, this.cam.shake + n); }
  addRecoil(n) { this.recoil = Math.min(1.4, this.recoil + n); }

  /* ------------------------------------------------------------------ */
  /* الإسقاط                                                             */
  /* ------------------------------------------------------------------ */
  _setupProjection() {
    const cam = this.cam;
    let f = (this.w / 2) / Math.tan((cam.fovX * Math.PI / 180) / 2);
    const fMax = (this.h / 2) / Math.tan((80 * Math.PI / 180) / 2);
    if (f < fMax) f = fMax;                        // الشاشات الطولية: لا نبالغ في الرأسية
    this.focal = f;
    this.cx0 = this.w / 2; this.cy0 = this.h / 2;
    this.tanHalfX = (this.w / 2) / f;
    this.tanHalfY = (this.h / 2) / f;
    this.cyaw = Math.cos(cam.yaw); this.syaw = Math.sin(cam.yaw);
    this.cpit = Math.cos(cam.pitch); this.spit = Math.sin(cam.pitch);
    this.near = 5;                                  // المستوى القريب (وحدات)
  }
  /** تحويل نقطة عالم → فضاء الكاميرا [يمين، عمق، أعلى] */
  _toCam(dx, dy, dz, out) {
    const xc = -dx * this.syaw + dy * this.cyaw;
    const yc = dx * this.cyaw + dy * this.syaw;
    out[0] = xc;
    out[1] = yc * this.cpit + dz * this.spit;
    out[2] = -yc * this.spit + dz * this.cpit;
    return out;
  }
  /** إسقاط نقطة عالم إلى الشاشة. يعيد null إن كانت خلف الكاميرا */
  worldToScreen(x, y, z) {
    const v = this._toCam(x - this.cam.x, y - this.cam.y, (z || 0) - this.cam.z, this._scratch);
    if (v[1] <= this.near) return { x: 0, y: 0, depth: v[1], vis: false };
    const k = this.focal / v[1];
    return { x: this.cx0 + v[0] * k, y: this.cy0 - v[2] * k, depth: v[1], vis: true };
  }
  /** اختبار سريع: هل الجسم داخل مخروط الرؤية؟ */
  _inFrustum(x, y, z, r) {
    const dx = x - this.cam.x, dy = y - this.cam.y, dz = (z || 0) - this.cam.z;
    if (dx * dx + dy * dy > this.drawDist * this.drawDist) return false;
    const yc = dx * this.cyaw + dy * this.syaw;
    if (yc < -r) return false;
    const xc = -dx * this.syaw + dy * this.cyaw;
    if (Math.abs(xc) > (yc + r) * this.tanHalfX + r) return false;
    if (Math.abs(dz) > (yc + r) * this.tanHalfY + r) return false;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* التظليل                                                             */
  /* ------------------------------------------------------------------ */
  _shade(hex, light, depth) {
    const li = clamp(Math.round((0.12 + light * 0.88) * 14), 0, 14);
    const fo = clamp(Math.round(((depth - this.fogNear) / Math.max(1, this.fogFar - this.fogNear)) * 10), 0, 10);
    const key = hex + '|' + li + '|' + fo + '|' + this._fogKey;
    let s = this._shadeCache.get(key);
    if (s !== undefined) return s;
    const [r, g, b] = rgbOf(hex);
    const k = 0.5 + 0.5 * (li / 14);
    const [fr, fg, fb] = this._fogRGB;
    const t = fo / 10;
    const R = Math.round((r * k) * (1 - t) + fr * t);
    const G = Math.round((g * k) * (1 - t) + fg * t);
    const B = Math.round((b * k) * (1 - t) + fb * t);
    s = `rgb(${R},${G},${B})`;
    if (this._shadeCache.size > 6000) this._shadeCache.clear();
    this._shadeCache.set(key, s);
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* بناء الأوجه                                                         */
  /* ------------------------------------------------------------------ */
  _beginFaces() {
    for (let i = 0; i < this.faces.length; i++) this._pool.push(this.faces[i]);
    this.faces.length = 0;
  }
  _newFace() {
    const f = this._pool.pop();
    if (f) return f;
    return { n: 0, sx: new Float64Array(16), sy: new Float64Array(16), depth: 0, color: '#000', alpha: 1 };
  }
  /**
   * رباعي في الفضاء ثلاثي الأبعاد.
   * p = [x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3]
   * opts: { alpha, nx,ny,nz (normal صريح), cx,cy,cz (نقطة مرجعية لتوجيه.Normal), twoSided, light }
   */
  _quad(p, color, opts) {
    const o = opts || EMPTY;
    // المتجه العمودي
    let nx = o.nx, ny = o.ny, nz = o.nz;
    const fcx = (p[0] + p[3] + p[6]) / 3, fcy = (p[1] + p[4] + p[7]) / 3, fcz = (p[2] + p[5] + p[8]) / 3;
    if (nx === undefined) {
      const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
      const bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
      nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
      const rx = (o.cx !== undefined ? o.cx : fcx) - fcx, ry = (o.cy !== undefined ? o.cy : fcy) - fcy, rz = (o.cz !== undefined ? o.cz : fcz) - fcz;
      if (nx * rx + ny * ry + nz * rz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    }
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // قصّ الوجه الخلفي
    const vx = this.cam.x - fcx, vy = this.cam.y - fcy, vz = this.cam.z - fcz;
    const facing = nx * vx + ny * vy + nz * vz;
    if (!o.twoSided && facing <= 0) return;
    const light = o.light !== undefined ? o.light : 0.45 + 0.55 * Math.max(0, nx * LX + ny * LY + nz * LZ);
    // تحويل الرؤوس
    const cn = this._clipA;
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const v = this._toCam(p[i * 3] - this.cam.x, p[i * 3 + 1] - this.cam.y, p[i * 3 + 2] - this.cam.z, this._v);
      cn[n++] = v[0]; cn[n++] = v[1]; cn[n++] = v[2];
    }
    // قصّ عند المستوى القريب
    const out = this._clipB;
    let m = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = i * 3, b = j * 3;
      const ain = cn[a + 1] > this.near, bin = cn[b + 1] > this.near;
      if (ain) { out[m++] = cn[a]; out[m++] = cn[a + 1]; out[m++] = cn[a + 2]; }
      if (ain !== bin) {
        const t = (this.near - cn[a + 1]) / (cn[b + 1] - cn[a + 1]);
        out[m++] = cn[a] + (cn[b] - cn[a]) * t;
        out[m++] = this.near;
        out[m++] = cn[a + 2] + (cn[b + 2] - cn[a + 2]) * t;
      }
    }
    if (m < 9) return;
    const f = this._newFace();
    const k = this.focal;
    let depth = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const cnt = m / 3;
    for (let i = 0; i < cnt; i++) {
      const d = out[i * 3 + 1];
      const sx = this.cx0 + out[i * 3] / d * k;
      const sy = this.cy0 - out[i * 3 + 2] / d * k;
      f.sx[i] = sx; f.sy[i] = sy;
      depth += d;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    }
    if (maxX < -40 || minX > this.w + 40 || maxY < -40 || minY > this.h + 40) return;
    f.n = cnt;
    f.depth = depth / cnt;
    f.color = o.raw ? color : this._shade(color, light, f.depth);
    f.alpha = o.alpha !== undefined ? o.alpha : 1;
    this.faces.push(f);
  }
  /** صندوق من ٨ رؤوس (مصفوفة ٢٤ رقماً) — يرسم الجوانب الأربعة + الأعلى (+ الأسفل اختياري) */
  _emitBox(c, cx, cy, cz, color, opts) {
    const o = opts || EMPTY;
    const alpha = o.alpha;
    for (let s = 0; s < 4; s++) {
      const q = BOX_SIDES[s];
      this._quad([
        c[q[0] * 3], c[q[0] * 3 + 1], c[q[0] * 3 + 2],
        c[q[1] * 3], c[q[1] * 3 + 1], c[q[1] * 3 + 2],
        c[q[2] * 3], c[q[2] * 3 + 1], c[q[2] * 3 + 2],
        c[q[3] * 3], c[q[3] * 3 + 1], c[q[3] * 3 + 2],
      ], o.colors ? o.colors[s] : color, { alpha, cx, cy, cz, nx: o.normals ? o.normals[s * 3] : undefined, ny: o.normals ? o.normals[s * 3 + 1] : undefined, nz: o.normals ? o.normals[s * 3 + 2] : undefined });
    }
    this._quad([
      c[BOX_TOP[0] * 3], c[BOX_TOP[0] * 3 + 1], c[BOX_TOP[0] * 3 + 2],
      c[BOX_TOP[1] * 3], c[BOX_TOP[1] * 3 + 1], c[BOX_TOP[1] * 3 + 2],
      c[BOX_TOP[2] * 3], c[BOX_TOP[2] * 3 + 1], c[BOX_TOP[2] * 3 + 2],
      c[BOX_TOP[3] * 3], c[BOX_TOP[3] * 3 + 1], c[BOX_TOP[3] * 3 + 2],
    ], o.topColor || color, { alpha, cx, cy, cz });
    if (o.bottom) {
      this._quad([
        c[BOX_BOTTOM[0] * 3], c[BOX_BOTTOM[0] * 3 + 1], c[BOX_BOTTOM[0] * 3 + 2],
        c[BOX_BOTTOM[1] * 3], c[BOX_BOTTOM[1] * 3 + 1], c[BOX_BOTTOM[1] * 3 + 2],
        c[BOX_BOTTOM[2] * 3], c[BOX_BOTTOM[2] * 3 + 1], c[BOX_BOTTOM[2] * 3 + 2],
        c[BOX_BOTTOM[3] * 3], c[BOX_BOTTOM[3] * 3 + 1], c[BOX_BOTTOM[3] * 3 + 2],
      ], o.bottomColor || color, { alpha, cx, cy, cz });
    }
  }
  /** رؤوس صندوق بمركز ومقاس، مع دوران أفقي (yaw) وانحناء حول محور س (pitch) حول نقطة ارتكاز */
  _boxCorners(cx, cy, cz, sx, sy, sz, yaw, pitch, px, py, pz, out) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cp = pitch ? Math.cos(pitch) : 1, sp = pitch ? Math.sin(pitch) : 0;
    const cyw = yaw ? Math.cos(yaw) : 1, syw = yaw ? Math.sin(yaw) : 0;
    const a = out || this._corners;
    for (let k = 0; k < 8; k++) {
      let x = cx + ((k & 1) ? hx : -hx);
      let y = cy + ((k & 2) ? hy : -hy);
      let z = cz + ((k & 4) ? hz : -hz);
      if (pitch) {
        const dy = y - py, dz = z - pz;
        const y2 = py + dy * cp - dz * sp;
        const z2 = pz + dy * sp + dz * cp;
        y = y2; z = z2;
      }
      const i = k * 3;
      if (yaw) { a[i] = x * cyw - y * syw; a[i + 1] = x * syw + y * cyw; }
      else { a[i] = x; a[i + 1] = y; }
      a[i + 2] = z;
    }
    return a;
  }
  /** صندوق عالمي مباشر: (x,y,z) = زاوية القاع/أسفل الصندوق + مقاس + دوران أفقي */
  _box(x, y, z, sx, sy, sz, yaw, color, opts) {
    const c = this._boxCorners(0, 0, 0, sx, sy, sz, yaw || 0, 0, 0, 0, 0, null);
    for (let i = 0; i < 24; i += 3) { c[i] += x; c[i + 1] += y; c[i + 2] += z + sz / 2; }
    this._emitBox(c, x, y, z + sz / 2, color, opts);
    return c;
  }
  /** رباعي أرضي (مستطيل أفقي) */
  _floorQuad(x, y, z, w, h, yaw, color, opts) {
    const cp = Math.cos(yaw || 0), sp = Math.sin(yaw || 0);
    const hw = w / 2, hh = h / 2;
    const pts = [];
    for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
      pts.push(x + lx * cp - ly * sp, y + lx * sp + ly * cp, z);
    }
    this._quad(pts, color, Object.assign({ nx: 0, ny: 0, nz: 1, alpha: 1 }, opts || {}));
  }

  /* ------------------------------------------------------------------ */
  /* الإطار الكامل                                                       */
  /* ------------------------------------------------------------------ */
  frame(view, dt) {
    this.frameNo++;
    this.time += dt;
    const ctx = this.ctx;
    this.view = view;
    const biome = view.biome || {};
    this.biome = biome;
    const map = view.world.map;
    this.map = map;
    this._fogKey = map.id;
    if (!this._fogRGB || this._fogKeyFor !== map.id) {
      this._fogRGB = rgbOf(this.fogColor = tint(biome.ground2 || '#223', 0.18));
      this._fogKeyFor = map.id;
      this._shadeCache.clear();
    }
    this.mode = view.firstPerson ? 'fps' : 'tps';
    this._updateCamera(view, dt);
    this._setupProjection();
    this._beginFaces();
    this._drawBackground(ctx, view);
    this._buildWorld(view);
    this._drawFaces(ctx);
    this._drawTracers(ctx, view);
    this._drawParticles(ctx);
    this._drawZoneRing(ctx, view);
    this._drawTags(ctx, view);
    this._drawScreenFx(ctx, view);
    if (this.mode === 'fps' && !view.dropPhase) this._drawViewModel(ctx, view);
    else if (view.dropPhase) this._drawDropOverlay(ctx, view);
    // تحديث كاميرا الراسم ثنائي الأبعاد (يُستخدم للـ HUD والتوافق)
    if (this.host) { this.host.cam.x = this.cam.x; this.host.cam.y = this.cam.y; }
  }

  /* ---------- الكاميرا ---------- */
  _updateCamera(view, dt) {
    const cam = this.cam;
    const me = view.players.find(p => p.id === view.myId);
    const target = (view.camTarget && view.camTarget.al !== 0) ? view.camTarget : (me || view.camTarget);
    if (!target) return;
    // ارتفاع العين حسب الوضعية
    let eye = EYE.stand;
    if (target.pr) eye = EYE.prone;
    else if (target.cr) eye = EYE.crouch;
    if (target.veh) eye = EYE.car;
    const airZ = (target.z || 0);                       // ارتفاع الهواء (هبوط/مظلة)
    // اتجاه النظر
    const wantYaw = view.camYaw !== undefined ? view.camYaw : (target.a || 0);
    const wantPitch = view.camPitch !== undefined ? view.camPitch : 0;
    // نعومة الدوران (أهم في منظور الشخص الثالث)
    const k = this.mode === 'fps' ? Math.min(1, dt * 40) : Math.min(1, dt * 12);
    cam.yaw += shortAngle(wantYaw - cam.yaw) * k;
    cam.pitch += (clamp(wantPitch, -0.42, 0.42) - cam.pitch) * k;
    // اهتزاز/ارتداد
    cam.shake *= Math.pow(0.0022, dt);
    this.recoil *= Math.pow(0.0009, dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    // تأرجح المشي
    const speed = Math.hypot(target.vx || 0, target.vy || 0);
    const moving = speed > 25 && !target.pr;
    cam.bobPhase += dt * (moving ? 6.5 + speed / 90 : 1.4);
    const bobAmt = (moving ? Math.min(1, speed / 260) : 0) * (this.mode === 'fps' ? 1 : 0.35);
    cam.bob += (bobAmt - cam.bob) * Math.min(1, dt * 6);
    const bobY = Math.sin(cam.bobPhase * 2) * 1.6 * cam.bob;
    const roll = Math.sin(cam.bobPhase) * 0.012 * cam.bob + Math.sin(this.time * 1.4) * 0.002;
    // مجال الرؤية: تصويب/منظار
    const adsWant = view.ads ? 1 : 0;
    cam.ads += (adsWant - cam.ads) * Math.min(1, dt * 14);
    const scope = view.scope > 1 ? view.scope : 1;
    const baseFov = 90 - 26 * cam.ads * (scope > 2 ? 1 : 1) - Math.min(52, (scope - 1) * 16) * cam.ads;
    cam.fovT = baseFov;
    cam.fovX += (baseFov - cam.fovX) * Math.min(1, dt * 16);
    // الموقع
    const shX = (Math.random() - 0.5) * cam.shake;
    const shY = (Math.random() - 0.5) * cam.shake;
    const eyeZ = airZ + eye * M + bobY * M * 0.35;
    if (this.mode === 'fps') {
      cam.x = target.x + shX;
      cam.y = target.y + shY;
      cam.z = eyeZ + this.recoil * 3;
      cam.roll = roll + (Math.random() - 0.5) * cam.shake * 0.0015;
      cam.pitch += this.recoil * 0.06;
    } else {
      // ثالث: الكاميرا خلف اللاعب مع تجنّب دخول الجدران
      const back = 4.2 * M, up = 1.7 * M;
      let bx = target.x - Math.cos(cam.yaw) * back;
      let by = target.y - Math.sin(cam.yaw) * back;
      const bz = airZ + up + EYE.stand * M * 0.35;
      const hit = this._rayBlocked(target.x, target.y, airZ + EYE.stand * M * 0.8, bx, by);
      if (hit < 1) { bx = target.x + (bx - target.x) * hit * 0.92; by = target.y + (by - target.y) * hit * 0.92; }
      cam.x = bx + shX; cam.y = by + shY; cam.z = bz;
      cam.roll = roll * 0.5;
      // انظر نحو جسم اللاعب (لأسفل قليلاً) مع حرية بسيطة للماوس
      cam.pitch = -0.13 + clamp(wantPitch, -0.3, 0.3) * 0.5;
    }
    if (!Number.isFinite(cam.x) || !Number.isFinite(cam.y) || !Number.isFinite(cam.z)) {
      cam.x = target.x || 0; cam.y = target.y || 0; cam.z = EYE.stand * M;
    }
  }
  /** هل يوجد عائق بين نقطتين؟ يعيد نسبة المسافة قبل أول عائق (١ = الطريق سالك) */
  _rayBlocked(x0, y0, z0, x1, y1) {
    const view = this.view;
    if (!view || !view.world || !view.world.grid) return 1;
    const out = this._q || (this._q = []);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      view.world.grid.query(x, y, 90, out);
      for (const o of out) {
        if (!o.solid || o.kind === 'tree') continue;
        if (o.kind === 'wall' || o.kind === 'crate') {
          if (Math.abs(x - o.x) < o.w / 2 + 6 && Math.abs(y - o.y) < o.h / 2 + 6) return t - 1 / steps;
        } else if (o.kind === 'rock') {
          if (Math.hypot(x - o.x, y - o.y) < o.r) return t - 1 / steps;
        }
      }
    }
    return 1;
  }

  /* ---------- الخلفية: سماء + أرض ---------- */
  _drawBackground(ctx, view) {
    const w = this.w, h = this.h;
    const sky = this.map.sky || '#12202c';
    const horizonY = this.cy0 + Math.tan(this.cam.pitch) * this.focal;
    // تدرّج السماء
    const g = ctx.createLinearGradient(0, Math.min(-h, horizonY - h), 0, Math.max(h, horizonY + h * 0.1));
    g.addColorStop(0, tint(sky, -0.42));
    g.addColorStop(0.55, tint(sky, 0.05));
    g.addColorStop(1, tint(sky, 0.42));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // نجوم خفيفة للخرائط الداكنة
    if (this.quality !== 'low') this._drawStars(ctx, horizonY);
    // الشمس/القمر
    this._drawSun(ctx, horizonY);
    // سلسلة جبال بعيدة (تعطي إحساس الأفق)
    this._drawRidge(ctx, horizonY);
    // البحر/الفراغ تحت الأفق
    const ocean = this.biome.water ? tint(this.biome.water, -0.45) : '#050a10';
    if (horizonY < h) { ctx.fillStyle = ocean; ctx.fillRect(0, Math.max(0, horizonY), w, h - Math.max(0, horizonY)); }
    // الجزيرة
    this._drawIsland(ctx, view);
  }
  _drawStars(ctx, horizonY) {
    const seed = this.map.id.charCodeAt(0) * 7 + this.map.id.length;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 70; i++) {
      const a = ((i * 97 + seed * 13) % 360) * Math.PI / 180;
      let rel = a - this.cam.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > this.tanHalfX * 1.2) continue;
      const sx = this.cx0 + Math.tan(rel) * this.focal;
      const elev = 0.25 + ((i * 37) % 50) / 100;
      const sy = horizonY - elev * this.h * (1 - this.cam.pitch);
      if (sy > horizonY - 4) continue;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.5 + i));
      ctx.globalAlpha = tw * 0.6;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }
  _drawSun(ctx, horizonY) {
    const sunYaw = 2.1;
    let rel = sunYaw - this.cam.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(rel) > this.tanHalfX + 0.3) return;
    const sx = this.cx0 + Math.tan(rel) * this.focal;
    const sy = horizonY - this.h * 0.34 + this.cam.pitch * this.focal;
    const r = Math.min(this.w, this.h) * 0.045;
    const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 4.5);
    g.addColorStop(0, 'rgba(255,240,200,.95)');
    g.addColorStop(0.18, 'rgba(255,205,120,.5)');
    g.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, r * 4.5, 0, 6.2832); ctx.fill();
  }
  _drawRidge(ctx, horizonY) {
    const w = this.w;
    const layers = this.quality === 'low' ? 1 : 2;
    for (let L = 0; L < layers; L++) {
      const amp = (L === 0 ? 0.07 : 0.04) * this.h;
      const base = horizonY + (L === 0 ? 2 : 4);
      const col = L === 0 ? tint(this.biome.ground2 || '#223', -0.55) : tint(this.biome.ground2 || '#223', -0.35);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-10, base + 4);
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const sx = (i / steps) * (w + 20) - 10;
        const rel = this.cam.yaw + Math.atan((sx - this.cx0) / this.focal);
        const n = 0.5 + 0.28 * Math.sin(rel * 3.1 + L) + 0.16 * Math.sin(rel * 7.7 + 1.3 + L * 2) + 0.08 * Math.sin(rel * 13.3 + 2.1);
        ctx.lineTo(sx, base - Math.max(0.05, n) * amp);
      }
      ctx.lineTo(w + 10, base + 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  _drawIsland(ctx, view) {
    const shape = view.world.shape;
    const R = (this.map.shape.r || 1800) * 1.15;
    const N = this.quality === 'low' ? 40 : 72;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.2832;
      const r = shape.radius(a);
      pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
    // نبني polygon مقصوصاً عند المستوى القريب ثم نملؤه
    const cn = [];
    for (let i = 0; i < N; i++) {
      const v = this._toCam(pts[i * 3] - this.cam.x, pts[i * 3 + 1] - this.cam.y, -this.cam.z, this._v);
      cn.push(v[0], v[1], v[2]);
    }
    const out = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a = i * 3, b = j * 3;
      const ain = cn[a + 1] > this.near, bin = cn[b + 1] > this.near;
      if (ain) out.push(cn[a], cn[a + 1], cn[a + 2]);
      if (ain !== bin) {
        const t = (this.near - cn[a + 1]) / (cn[b + 1] - cn[a + 1]);
        out.push(cn[a] + (cn[b] - cn[a]) * t, this.near, cn[a + 2] + (cn[b + 2] - cn[a + 2]) * t);
      }
    }
    if (out.length < 9) return;
    ctx.beginPath();
    for (let i = 0; i < out.length; i += 3) {
      const d = out[i + 1];
      const sx = this.cx0 + out[i] / d * this.focal;
      const sy = this.cy0 - out[i + 2] / d * this.focal;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = this.biome.ground;
    ctx.fillRect(0, 0, this.w, this.h);
    this._drawGroundDetail(ctx, view);
    ctx.restore();
  }
  /** تفاصيل الأرض: طرق، مياه، حمم، أرضيات البيوت، شبكة أمتار */
  _drawGroundDetail(ctx, view) {
    const world = view.world, biome = this.biome;
    const camX = this.cam.x, camY = this.cam.y;
    const near = (x, y, r) => Math.hypot(x - camX, y - camY) < (r + this.drawDist * 0.8);
    const proj = (x, y, z) => {
      const v = this._toCam(x - this.cam.x, y - this.cam.y, (z || 0) - this.cam.z, this._v);
      if (v[1] <= this.near) return null;
      return [this.cx0 + v[0] / v[1] * this.focal, this.cy0 - v[2] / v[1] * this.focal, v[1]];
    };
    // شبكة أمتار (إحساس بالحركة والعمق)
    if (this.quality !== 'low') {
      const step = 5 * M;
      const gx0 = Math.floor((camX - 900) / step) * step, gx1 = camX + 900;
      const gy0 = Math.floor((camY - 900) / step) * step, gy1 = camY + 900;
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = gx0; x <= gx1; x += step) {
        const a = proj(x, gy0, 1), b = proj(x, gy1, 1);
        if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      }
      for (let y = gy0; y <= gy1; y += step) {
        const a = proj(gx0, y, 1), b = proj(gx1, y, 1);
        if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      }
      ctx.stroke();
    }
    for (const d of world.decals) {
      if (d.kind === 'road') {
        if (!near((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, 1500)) continue;
        this._strokeGround(ctx, d.x1, d.y1, d.x2, d.y2, d.width, biome.road, 1);
        this._strokeGround(ctx, d.x1, d.y1, d.x2, d.y2, 4, 'rgba(255,255,255,.16)', 1.2);
      } else if (d.kind === 'water') {
        if (!near(d.x, d.y, Math.max(d.w, d.h))) continue;
        this._polyRect(ctx, d.x, d.y, d.w, d.h, 2, tint(biome.water, -0.12));
        this._polyRect(ctx, d.x, d.y, d.w, d.h, 2, 'rgba(255,255,255,.07)');
      } else if (d.kind === 'lava') {
        if (!near(d.x, d.y, d.r)) continue;
        this._polyCircle(ctx, d.x, d.y, d.r, 2, '#ff7a1e');
        this._polyCircle(ctx, d.x, d.y, d.r * 0.6, 2.4, 'rgba(255,220,120,.55)');
      } else if (d.kind === 'building') {
        if (!near(d.x, d.y, Math.max(d.w, d.h))) continue;
        this._polyRect(ctx, d.x, d.y, d.w, d.h, 1.5, biome.floor || '#5a4a3a');
      }
    }
    for (const dd of (world.decor || [])) {
      if (!near(dd.x, dd.y, 120)) continue;
      if (dd.kind === 'rug') this._polyRect(ctx, dd.x, dd.y, dd.w, dd.h, 2.2, biome.rug || '#7a4a3a');
    }
    // آثار الأقدام
    const fps = (this.host && this.host.footprints) || [];
    if (fps.length) {
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      for (const f of fps) {
        if (!near(f.x, f.y, 30)) continue;
        this._polyCircle(ctx, f.x, f.y, 7, 2.6, 'rgba(0,0,0,.25)');
      }
    }
    // نقاط ساخنة
    for (const hd of (world.hotDrops || [])) {
      if (!near(hd.x, hd.y, hd.r)) continue;
      this._polyCircle(ctx, hd.x, hd.y, hd.r, 3, 'rgba(255,60,60,.10)');
    }
  }
  _strokeGround(ctx, x1, y1, x2, y2, width, color, z) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * width / 2, ny = dx / len * width / 2;
    this._quad([x1 + nx, y1 + ny, z, x2 + nx, y2 + ny, z, x2 - nx, y2 - ny, z, x1 - nx, y1 - ny, z], color,
      { nx: 0, ny: 0, nz: 1, raw: String(color).startsWith('rgba') });
  }
  _polyRect(ctx, x, y, w, h, z, color) {
    this._floorQuad(x, y, z, w, h, 0, color, { raw: String(color).startsWith('rgba') });
  }
  _polyCircle(ctx, x, y, r, z, color, seg) {
    const N = seg ? 64 : (this.quality === 'low' ? 20 : 36);
    const pts = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * 6.2832; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r, z); }
    // نملؤه كـ polygon مباشر (بدون ترتيب عمق لأنه على الأرض)
    const scr = [];
    for (let i = 0; i < pts.length; i += 3) {
      const v = this._toCam(pts[i] - this.cam.x, pts[i + 1] - this.cam.y, pts[i + 2] - this.cam.z, this._v);
      if (v[1] <= this.near) { scr.push(null); continue; }
      scr.push([this.cx0 + v[0] / v[1] * this.focal, this.cy0 - v[2] / v[1] * this.focal]);
    }
    const c2 = this.ctx;
    c2.fillStyle = color;
    c2.beginPath();
    let started = false;
    for (const p of scr) {
      if (!p) { started = false; continue; }
      if (!started) { c2.moveTo(p[0], p[1]); started = true; } else c2.lineTo(p[0], p[1]);
    }
    c2.closePath();
    c2.fill();
  }

  /* ---------- بناء العالم ثلاثي الأبعاد ---------- */
  _buildWorld(view) {
    const world = view.world;
    const out = this._objs || (this._objs = []);
    this.stats.objects = 0;
    if (world.grid) {
      world.grid.query(this.cam.x, this.cam.y, this.drawDist, out);
      for (const o of out) this._buildObstacle(o, view);
    }
    // أسقف البيوت + الأثاث
    for (const d of world.decals) {
      if (d.kind !== 'building') continue;
      if (!this._inFrustum(d.x, d.y, WALL_H, Math.max(d.w, d.h))) continue;
      const col = this.biome.roof || '#8f4b3c';
      this._box(d.x, d.y, WALL_H, d.w + 16, d.h + 16, ROOF_T, 0, col, { bottom: true, bottomColor: tint(col, -0.45) });
      this.stats.objects++;
    }
    for (const dd of (world.decor || [])) {
      if (dd.kind === 'rug') continue;
      if (!this._inFrustum(dd.x, dd.y, 40, 90)) continue;
      const hgt = dd.kind === 'shelf' ? 1.5 * M : 0.75 * M;
      this._box(dd.x, dd.y, 0, dd.w, dd.h, hgt, dd.a || 0, '#6b5136', { topColor: '#7d6041' });
    }
    // الغنائم
    for (const l of view.loot) {
      if (l.taken) continue;
      if (!this._inFrustum(l.x, l.y, 20, 60)) continue;
      this._buildLoot(l, view);
      this.stats.objects++;
    }
    // المركبات
    for (const v of view.vehicles) {
      if (v.dead) continue;
      if (!this._inFrustum(v.x, v.y, 40, 200)) continue;
      this._buildVehicle(v, view);
      this.stats.objects++;
    }
    // الإنزال الجوي
    for (const a of view.airdrops) {
      if (!this._inFrustum(a.x, a.y, a.z || 0, 300)) continue;
      this._buildAirdrop(a, view);
      this.stats.objects++;
    }
    // الطائرة
    if (view.plane && !view.plane.done) this._buildPlane(view.plane);
    // اللاعبون
    for (const p of view.players) {
      if (!p.al && !p.dying) continue;
      if (p.id === view.myId && this.mode === 'fps') continue;      // لا نرسم أنفسنا في الأول
      if (!this._inFrustum(p.x, p.y, (p.z || 0) + 40, 140)) continue;
      this._buildPlayer(p, view);
      this.stats.objects++;
    }
    // الجثث
    for (const c of this.corpses) {
      if (!this._inFrustum(c.x, c.y, 0, 120)) continue;
      this._buildPlayer({ ...c, al: 1, dead: 1, walking: false, hp: 0 }, view);
    }
    // القنابل والدخان
    for (const g of view.grenades) {
      if (!this._inFrustum(g.x, g.y, 20, 40)) continue;
      const col = g.it === 'smoke' ? '#cfcfcf' : '#4d6b3a';
      this._box(g.x, g.y, 10, 14, 14, 18, 0, col, {});
    }
    for (const s of (view.smokes || [])) this._buildSmoke(s);
    for (const s of this.smokes) this._buildSmoke(s);
    // جدار العاصفة
    this._buildZone(view);
  }
  _buildObstacle(o, view) {
    const biome = this.biome;
    const d2 = (o.x - this.cam.x) ** 2 + (o.y - this.cam.y) ** 2;
    if (d2 > this.drawDist * this.drawDist) return;
    if (o.destroyed) return;
    const kind = o.kind;
    if (kind === 'wall') {
      if (!this._inFrustum(o.x, o.y, WALL_H / 2, Math.max(o.w, o.h))) return;
      const col = biome.build || '#7d6a52';
      this._box(o.x, o.y, 0, o.w, o.h, WALL_H, 0, col, { topColor: tint(col, -0.15) });
      // حافة علوية
      if (this.quality !== 'low' && d2 < 2500 * 2500) {
        this._box(o.x, o.y, WALL_H, o.w + 4, o.h + 4, 8, 0, tint(col, 0.12), {});
      }
      this.stats.objects++;
    } else if (kind === 'crate') {
      if (!this._inFrustum(o.x, o.y, 30, 60)) return;
      const s = Math.max(o.w || 54, 40);
      const col = o.hp < o.maxHp ? '#6b4a24' : '#9a6c33';
      this._box(o.x, o.y, 0, s, s, s, 0, col, { topColor: tint(col, 0.14) });
      // أشرطة خشبية
      if (this.quality !== 'low' && d2 < 2000 * 2000) {
        this._box(o.x, o.y, s * 0.45, s + 2, 8, 8, 0, '#5c3f1e', {});
        this._box(o.x, o.y, s * 0.45, 8, s + 2, 8, 0, '#5c3f1e', {});
      }
      this.stats.objects++;
    } else if (kind === 'rock') {
      if (!this._inFrustum(o.x, o.y, o.r, o.r * 2)) return;
      this._buildRock(o, d2);
      this.stats.objects++;
    } else if (kind === 'tree') {
      if (!this._inFrustum(o.x, o.y, o.r * 3, o.r * 4)) return;
      this._buildTree(o, d2);
      this.stats.objects++;
    }
  }
  _buildRock(o, d2) {
    const r = o.r * 1.15;
    const hgt = o.r * 0.8;
    const sides = (this.quality === 'low' || d2 > 2600 * 2600) ? 5 : 7;
    const base = '#8d939c';
    const seed = (o.x * 0.013 + o.y * 0.017);
    if (d2 > 3400 * 3400) {           // بعيد: بطاقة مسطّحة
      this._billboard(o.x, o.y, r * 1.6, hgt, tint(base, -0.25));
      return;
    }
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * 6.2832;
      const rr = r * (0.82 + Math.sin(i * 2.3 + seed) * 0.18);
      ring.push(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
    }
    // الجوانب
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const t = (i / sides);
      const col = tint(base, -0.18 + Math.sin(i * 1.7) * 0.08);
      this._quad([
        ring[i * 2], ring[i * 2 + 1], 0,
        ring[j * 2], ring[j * 2 + 1], 0,
        ring[j * 2] * 0.72 + o.x * 0.28, ring[j * 2 + 1] * 0.72 + o.y * 0.28, hgt,
        ring[i * 2] * 0.72 + o.x * 0.28, ring[i * 2 + 1] * 0.72 + o.y * 0.28, hgt,
      ], col, {});
    }
    // القمة
    const top = [];
    for (let i = 0; i < sides; i++) {
      top.push(ring[i * 2] * 0.72 + o.x * 0.28, ring[i * 2 + 1] * 0.72 + o.y * 0.28, hgt);
    }
    this._fan(o.x, o.y, hgt + 4, top, sides, tint(base, 0.18));
  }
  _buildTree(o, d2) {
    const biome = this.biome;
    const trunkH = Math.max(90, o.r * 3.4);
    const trunkR = Math.max(7, o.r * 0.2);
    const canR = Math.max(38, o.r * 1.9);
    const canZ = trunkH + canR * 0.55;
    const far = d2 > 3000 * 3000 || this.quality === 'low';
    // الكاميرا تحت التاج؟ لا ترسم الأوراق حتى لا تُحجب الرؤية
    const under = d2 < canR * canR;
    if (far) {
      this._billboard(o.x, o.y, trunkR * 2, trunkH, '#5b3c22', 0);
      if (!under) this._billboard(o.x, o.y + 0, canR * 2, canR * 2, biome.tree || '#3f7a45', trunkH);
      return;
    }
    // الجذع (منشور رباعي)
    this._box(o.x, o.y, 0, trunkR * 2, trunkR * 2, trunkH, 0, '#5b3c22', { topColor: '#4a3018' });
    // التاج: ثلاث طبقات
    const leaf = biome.tree || '#4d9a53';
    const leafDark = biome.treeDark || '#1e4426';
    const layers = [
      { z: trunkH * 0.82, r: canR * 0.95, h: canR * 0.55, c: leafDark },
      { z: trunkH * 0.82 + canR * 0.42, r: canR * 0.78, h: canR * 0.5, c: leaf },
      { z: trunkH * 0.82 + canR * 0.82, r: canR * 0.5, h: canR * 0.42, c: tint(leaf, 0.12) },
    ];
    const sides = 6;
    for (const L of layers) {
      if (under) break;
      const ring = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * 6.2832 + o.x * 0.01;
        ring.push(o.x + Math.cos(a) * L.r, o.y + Math.sin(a) * L.r, L.z);
      }
      const top = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * 6.2832 + o.x * 0.01;
        top.push(o.x + Math.cos(a) * L.r * 0.62, o.y + Math.sin(a) * L.r * 0.62, L.z + L.h);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        this._quad([ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2], ring[j * 3], ring[j * 3 + 1], ring[j * 3 + 2],
          top[j * 3], top[j * 3 + 1], top[j * 3 + 2], top[i * 3], top[i * 3 + 1], top[i * 3 + 2]], L.c, {});
      }
      this._fan(o.x, o.y, L.z + L.h + 2, top, sides, tint(L.c, 0.2));
    }
  }
  /** مروحة مثلثات لتغطية قمة مجسّم */
  _fan(cx, cy, cz, ring, n, color) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this._quad([cx, cy, cz, ring[i * 3], ring[i * 3 + 1], ring[i * 3 + 2], ring[j * 3], ring[j * 3 + 1], ring[j * 3 + 2], cx, cy, cz], color, { twoSided: true });
    }
  }
  /** بطاقة facing الكاميرا (للتفاصيل البعيدة) */
  _billboard(x, y, w, h, color, z0) {
    const dx = x - this.cam.x, dy = y - this.cam.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * w / 2, ny = dx / d * w / 2;
    const z = z0 || 0;
    this._quad([x + nx, y + ny, z, x - nx, y - ny, z, x - nx, y - ny, z + h, x + nx, y + ny, z + h], color,
      { nx: dx / d, ny: dy / d, nz: 0, twoSided: true });
  }
  _buildLoot(l, view) {
    const col = this._lootColor(l);
    const bob = 12 + Math.sin(this.time * 2.6 + l.x * 0.02) * 5;
    const s = 15;
    this._box(l.x, l.y, bob, s, s, s * 0.8, this.time * 0.6, col, { topColor: tint(col, 0.25) });
    // شعاع ضوء للنادرة
    const w = l.kind === 'weapon' ? WEAPONS[l.weapon] : null;
    if (w && (w.rarity === 'legendary' || w.rarity === 'mythic' || w.rarity === 'epic')) {
      const dx = l.x - this.cam.x, dy = l.y - this.cam.y, d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d * 10, ny = dx / d * 10;
      this._quad([l.x + nx, l.y + ny, 0, l.x - nx, l.y - ny, 0, l.x - nx, l.y - ny, 130, l.x + nx, l.y + ny, 130],
        col, { alpha: 0.16 + Math.sin(this.time * 3 + l.x) * 0.05, nx: dx / d, ny: dy / d, nz: 0, twoSided: true, raw: false });
      this.faces[this.faces.length - 1].color = col;
    }
  }
  _lootColor(l) {
    if (l.kind === 'weapon') { const w = WEAPONS[l.weapon]; return RARITY[(w && w.rarity) || 'common'].color; }
    if (l.kind === 'armor') return l.armor && l.armor.startsWith('vest') ? '#3ea6ff' : '#8fa3b8';
    if (l.kind === 'heal') return l.heal === 'medkit' ? '#ff5d5d' : l.heal === 'grenade' ? '#4d6b3a' : '#e8e2d4';
    if (l.kind === 'attach') return RARITY[(ATTACHMENTS[l.attach] && ATTACHMENTS[l.attach].rarity) || 'rare'].color;
    return '#d9d2c3';
  }
  _buildVehicle(v, view) {
    const t = v.t || v.type;
    const yaw = v.a !== undefined ? v.a : (v.angle || 0);
    const col = t === 'boat' ? '#2f6f92' : t === 'bike' ? '#b03a2e' : t === 'tank' ? '#4a4a4a' : '#5a6b3a';
    const L = t === 'bike' ? 2.1 * M : t === 'tank' ? 5.4 * M : t === 'boat' ? 4.6 * M : 4.1 * M;
    const W = t === 'bike' ? 0.8 * M : t === 'tank' ? 2.7 * M : t === 'boat' ? 2.0 * M : 1.85 * M;
    const H = t === 'bike' ? 0.9 * M : t === 'tank' ? 1.5 * M : t === 'boat' ? 1.0 * M : 1.15 * M;
    this._box(v.x, v.y, 0.25 * M, L, W, H, yaw, col, { topColor: tint(col, 0.12) });
    if (t !== 'bike' && t !== 'boat') {
      this._box(v.x + Math.cos(yaw) * -L * 0.12, v.y + Math.sin(yaw) * -L * 0.12, H + 0.2 * M, L * 0.5, W * 0.92, 0.75 * M, yaw, tint(col, -0.12), { topColor: tint(col, 0.05) });
      // زجاج
      this._box(v.x + Math.cos(yaw) * L * 0.16, v.y + Math.sin(yaw) * L * 0.16, H + 0.35 * M, L * 0.06, W * 0.86, 0.5 * M, yaw, '#9fd0ff', { alpha: 0.5 });
    }
    if (t === 'tank') {
      this._box(v.x, v.y, H + 0.7 * M, L * 0.36, W * 0.6, 0.5 * M, yaw, '#3a3a3a', {});
      this._box(v.x + Math.cos(yaw) * L * 0.42, v.y + Math.sin(yaw) * L * 0.42, H + 0.85 * M, L * 0.5, 0.18 * M, 0.18 * M, yaw, '#555', {});
    }
    // عجلات
    if (t !== 'boat') {
      for (const [fx, fy] of [[-0.32, -0.5], [-0.32, 0.5], [0.32, -0.5], [0.32, 0.5]]) {
        const px = v.x + Math.cos(yaw) * fx * L - Math.sin(yaw) * fy * W * 1.02;
        const py = v.y + Math.sin(yaw) * fx * L + Math.cos(yaw) * fy * W * 1.02;
        this._box(px, py, 0.02 * M, 0.75 * M, 0.3 * M, 0.7 * M, yaw, '#14171b', {});
      }
    }
    // شريط الصحة
    if (v.hp < 900) this._bar3d(v.x, v.y, H + 1.4 * M, 1.6 * M, Math.max(0, v.hp / 900), '#ff6b6b');
  }
  _buildAirdrop(a, view) {
    const z = a.z || 0;
    if (!a.l) {
      // المظلة
      const cz = z + 150;
      for (let i = 0; i < 8; i++) {
        const a1 = (i / 8) * 6.2832, a2 = ((i + 1) / 8) * 6.2832;
        const r = 90;
        this._quad([a.x, a.y, cz + 40,
          a.x + Math.cos(a1) * r, a.y + Math.sin(a1) * r, cz,
          a.x + Math.cos(a2) * r, a.y + Math.sin(a2) * r, cz,
          a.x, a.y, cz + 40], i % 2 ? '#e04b4b' : '#f0f0f0', { twoSided: true });
      }
      this._box(a.x, a.y, z, 34, 34, 30, 0, '#c93030', { topColor: '#e04b4b' });
    } else {
      this._box(a.x, a.y, 0, 40, 40, 34, 0, '#c93030', { topColor: '#ffd166' });
      this._billboard(a.x, a.y, 12, 90, 'rgba(255,80,60,.25)', 34);
    }
  }
  _buildPlane(pl) {
    const z = 900, yaw = pl.a || 0;
    if (!this._inFrustum(pl.x, pl.y, z, 900)) return;
    this._box(pl.x, pl.y, z, 34 * M * 0.3, 4 * M, 3 * M, yaw, '#3c434d', { topColor: '#4d5560' });
    this._box(pl.x, pl.y, z + 1.2 * M, 34 * M * 0.12, 26 * M, 0.8 * M, yaw, '#333a43', {});
  }
  _buildSmoke(s) {
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = this.time * 0.5 + i * 1.1;
      const rr = s.r * 0.55;
      const x = s.x + Math.cos(a) * rr, y = s.y + Math.sin(a * 1.3) * rr;
      const r = s.r * 0.5;
      this._billboard(x, y, r * 2, r * 2, 'rgba(215,215,220,.42)', 10 + i * 12);
    }
  }
  _buildZone(view) {
    const z = view.zone;
    if (!z) return;
    const H = 40 * M;
    const N = this.quality === 'low' ? 28 : 56;
    const inside = Math.hypot(this.cam.x - z.x, this.cam.y - z.y) < z.r;
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * 6.2832, a2 = ((i + 1) / N) * 6.2832;
      const x1 = z.x + Math.cos(a1) * z.r, y1 = z.y + Math.sin(a1) * z.r;
      const x2 = z.x + Math.cos(a2) * z.r, y2 = z.y + Math.sin(a2) * z.r;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = mx - this.cam.x, dy = my - this.cam.y;
      if (dx * dx + dy * dy > this.drawDist * this.drawDist * 2.2) continue;
      const nx = (mx - z.x) / z.r, ny = (my - z.y) / z.r;
      const pulse = 0.16 + Math.sin(this.time * 2.4 + i * 0.3) * 0.05;
      this._quad([x1, y1, 0, x2, y2, 0, x2, y2, H, x1, y1, H], '#5f8cff',
        { alpha: pulse, nx: inside ? -nx : nx, ny: inside ? -ny : ny, nz: 0, twoSided: true });
    }
    // (الدائرة القادمة تُرسم في _drawZoneRing فوق المشهد)
  }
  _strokePath(ctx, pts, color, width, dash) {
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    if (dash) ctx.setLineDash([12, 10]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i += 3) {
      const v = this._toCam(pts[i] - this.cam.x, pts[i + 1] - this.cam.y, pts[i + 2] - this.cam.z, this._v);
      if (v[1] <= this.near) { started = false; continue; }
      const sx = this.cx0 + v[0] / v[1] * this.focal, sy = this.cy0 - v[2] / v[1] * this.focal;
      if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* نموذج اللاعب ثلاثي الأبعاد (جسم بشري متناسق)                        */
  /* ------------------------------------------------------------------ */
  _buildPlayer(p, view) {
    const skin = SKIN_MAP[p.s] || SKIN_MAP.out_basic;
    const style = CHAR_STYLE[p.c] || CHAR_STYLE.fahd;
    const body = skin.body || style.body;
    const pants = skin.pants || '#2f3a46';
    const accent = skin.accent || '#8fa3b8';
    const tone = SKIN_TONE[p.c] || '#c9905f';
    const d = Math.hypot(p.x - this.cam.x, p.y - this.cam.y);
    // مستويات التفاصيل: ٠ قريب (كامل) · ١ متوسط · ٢ بعيد · ٣ بعيد جداً (بطاقة)
    const lod = d > 4000 ? 3 : d > 2400 ? 2 : d > 1100 ? 1 : 0;
    if (lod === 3 && !p.dead) { this._billboard(p.x, p.y, 0.6 * M, 1.8 * M, body, 0); return; }
    const yaw = (p.a || 0) + Math.PI / 2;   // النموذج مواجه لمحور +y المحلي
    // حركة المشي
    let ph = this._anim.get(p.id) || 0;
    if (p.walking) ph += 0.19;
    this._anim.set(p.id, ph);
    const sw = p.walking ? Math.sin(ph * 2) : Math.sin(this.time * 1.6 + (p.x % 3)) * 0.06;
    const sw2 = p.walking ? Math.sin(ph * 2 + Math.PI) : -sw;
    // الوضعيات
    const dead = !!p.dead || (!p.al && !p.kn);
    const knocked = !!p.kn && !dead;
    const prone = !!p.pr && !dead;
    const crouch = !!p.cr && !dead && !prone;
    const airZ = p.z || 0;
    const baseZ = airZ;
    // ارتفاع الحوض + انحناء الجسم
    let hipZ = 0.92 * M, bodyPitch = 0;
    if (crouch) { hipZ = 0.6 * M; bodyPitch = 0.22; }
    if (knocked) { hipZ = 0.42 * M; bodyPitch = 0.75; }
    if (prone) { hipZ = 0.24 * M; bodyPitch = 1.45; }
    if (dead) { hipZ = 0.2 * M; bodyPitch = 1.55; }
    const pivotZ = 0.9 * M;
    const m = M;
    // تحويل من فضاء الشخصية (القدمان = الأصل) إلى العالم
    const tf = (x, y, z, pitch, pz) => {
      let yy = y, zz = z;
      if (pitch) { const c = Math.cos(pitch), sn = Math.sin(pitch); const dy = yy, dz = zz - (pz || 0); yy = dy * c - dz * sn; zz = (pz || 0) + dy * sn + dz * c; }
      if (bodyPitch) { const c = Math.cos(bodyPitch), sn = Math.sin(bodyPitch); const dy = yy, dz = zz - pivotZ; yy = dy * c - dz * sn; zz = pivotZ + dy * sn + dz * c; }
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      return [p.x + x * c - yy * sn, p.y + x * sn + yy * c, baseZ + zz];
    };
    /** جزء مستطيل في فضاء الشخصية (انحناء حول محور x عند نقطة ارتكاز) */
    const part = (lx, ly, lz, sx, sy, sz, color, pitch, pz, opts) => {
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const pts = [];
      for (let k = 0; k < 8; k++) {
        const q = tf(lx + ((k & 1) ? hx : -hx), ly + ((k & 2) ? hy : -hy), lz + ((k & 4) ? hz : -hz), pitch, pz);
        pts.push(q[0], q[1], q[2]);
      }
      const c = tf(lx, ly, lz, pitch, pz);
      this._emitBox(pts, c[0], c[1], c[2], color, opts);
    };
    // ---------- الساقان ----------
    const legUp = 0.42 * m, legLo = 0.4 * m;
    if (lod === 0) {
      for (const [side, sgn] of [[-1, sw], [1, sw2]]) {
        const lx = side * 0.1 * m;
        const ta = sgn * 0.62, sa = -Math.max(0, sgn) * 0.5;
        part(lx, 0.02 * m, hipZ - legUp / 2, 0.14 * m, 0.16 * m, legUp, pants, ta, hipZ);
        const kneeZ = hipZ - legUp;
        part(lx, 0.02 * m - Math.sin(ta) * legUp * 0.5, kneeZ - legLo / 2, 0.12 * m, 0.14 * m, legLo, tint(pants, -0.12), ta + sa, kneeZ);
        part(lx, 0.02 * m - Math.sin(ta + sa) * (legUp + legLo) * 0.45 + 0.05 * m, 0.05 * m, 0.13 * m, 0.24 * m, 0.1 * m, '#20242a', (ta + sa) * 0.3, 0.05 * m);
      }
    } else if (lod === 1) {
      part(-0.09 * m, 0, hipZ / 2, 0.15 * m, 0.17 * m, hipZ, pants, sw * 0.3, hipZ);
      part(0.09 * m, 0, hipZ / 2, 0.15 * m, 0.17 * m, hipZ, pants, sw2 * 0.3, hipZ);
    } else {
      part(0, 0, hipZ / 2, 0.26 * m, 0.2 * m, hipZ, pants, 0, hipZ);
    }
    // ---------- الجذع ----------
    const torsoZ = hipZ + 0.28 * m;
    part(0, 0, hipZ + 0.04 * m, 0.3 * m, 0.2 * m, 0.16 * m, tint(pants, 0.06), 0, hipZ);
    part(0, 0, torsoZ, 0.4 * m, 0.23 * m, 0.44 * m, body, 0, torsoZ, { topColor: tint(body, 0.1) });
    if (p.vestLvl) {
      const vc = p.vestLvl === 3 ? '#3a3a3a' : p.vestLvl === 2 ? '#4a4230' : '#5a5240';
      part(0, 0, torsoZ + 0.02 * m, 0.43 * m, 0.26 * m, 0.36 * m, vc, 0, torsoZ);
      if (lod === 0) part(0, 0.02 * m, torsoZ + 0.14 * m, 0.2 * m, 0.02 * m, 0.1 * m, accent, 0, torsoZ);
    }
    if (p.bagLvl && lod < 2) {
      part(0, -0.19 * m, torsoZ + 0.02 * m, 0.3 * m, 0.16 * m, 0.4 * m, p.bagLvl === 3 ? '#3b3a2a' : '#4a4a3a', 0, torsoZ);
    }
    // ---------- الرأس ----------
    const headZ = torsoZ + 0.34 * m;
    if (lod === 0) part(0, 0, headZ - 0.05 * m, 0.11 * m, 0.11 * m, 0.1 * m, tone, 0, headZ);
    part(0, 0.01 * m, headZ + 0.08 * m, 0.2 * m, 0.22 * m, 0.24 * m, tone, 0, headZ);
    const hat = style.hat;
    if (p.helmLvl) {
      const hc = p.helmLvl === 3 ? '#2f2f2f' : p.helmLvl === 2 ? '#3d4a33' : '#4a4436';
      part(0, 0, headZ + 0.13 * m, 0.235 * m, 0.25 * m, 0.16 * m, hc, 0, headZ);
      if (lod === 0) part(0, 0.1 * m, headZ + 0.07 * m, 0.22 * m, 0.06 * m, 0.09 * m, tint(hc, -0.2), 0, headZ);
    } else if (hat === 'crown') {
      part(0, 0, headZ + 0.22 * m, 0.22 * m, 0.22 * m, 0.05 * m, '#ffc63d', 0, headZ);
      if (lod === 0) for (let i = -1; i <= 1; i++) part(i * 0.07 * m, 0, headZ + 0.28 * m, 0.04 * m, 0.04 * m, 0.07 * m, '#ffd75e', 0, headZ);
    } else if (hat === 'cap' || hat === 'beret') {
      part(0, 0.02 * m, headZ + 0.2 * m, 0.22 * m, 0.23 * m, 0.06 * m, accent, 0, headZ);
      if (lod === 0) part(0, 0.13 * m, headZ + 0.18 * m, 0.18 * m, 0.1 * m, 0.03 * m, tint(accent, -0.2), 0, headZ);
    } else if (hat === 'hood' || hat === 'mask' || hat === 'medic') {
      part(0, -0.02 * m, headZ + 0.1 * m, 0.25 * m, 0.27 * m, 0.26 * m, tint(body, -0.15), 0, headZ);
      if (lod === 0) part(0, 0.11 * m, headZ + 0.08 * m, 0.16 * m, 0.03 * m, 0.12 * m, tone, 0, headZ);
    } else if (hat === 'helmet') {
      part(0, 0, headZ + 0.14 * m, 0.24 * m, 0.25 * m, 0.14 * m, '#4a4436', 0, headZ);
    } else if (lod === 0) {
      part(0, -0.02 * m, headZ + 0.16 * m, 0.215 * m, 0.235 * m, 0.1 * m, style.hair, 0, headZ);
    }
    // ---------- الذراعان + السلاح ----------
    const wpn = p.w ? WEAPONS[p.w] : null;
    const shoulderZ = torsoZ + 0.16 * m;
    const hold = !!wpn && wpn.type !== 'melee' && !knocked && !dead && !prone;
    const armA = hold ? -1.15 : sw2 * 0.5;
    const foreA = hold ? -0.35 : (p.rl ? -1.2 : sw2 * 0.35);
    if (lod === 0) {
      for (const [side, sgn] of [[-1, sw2], [1, sw]]) {
        const a1 = hold ? armA : sgn * 0.5, a2 = hold ? foreA : (p.rl ? -1.2 : sgn * 0.35);
        const sx = side * 0.25 * m;
        part(sx, hold ? 0.06 * m : 0, shoulderZ - 0.15 * m, 0.11 * m, 0.12 * m, 0.3 * m, tint(body, 0.06), a1, shoulderZ);
        const elbowZ = shoulderZ - 0.3 * m;
        const ey = (hold ? 0.06 * m : 0) + Math.sin(-a1) * 0.3 * m;
        part(sx, ey + (hold ? 0.04 * m : 0), elbowZ - 0.13 * m, 0.1 * m, 0.11 * m, 0.27 * m, tone, a1 + a2, elbowZ);
        part(sx, ey + (hold ? 0.1 * m : 0) + Math.sin(-(a1 + a2)) * 0.27 * m * 0.5, elbowZ - 0.26 * m, 0.1 * m, 0.1 * m, 0.09 * m, tone, a1 + a2, elbowZ);
      }
    } else if (lod === 1) {
      for (const side of [-1, 1]) part(side * 0.25 * m, hold ? 0.1 * m : 0, shoulderZ - 0.22 * m, 0.12 * m, 0.14 * m, 0.52 * m, tint(body, 0.06), hold ? -1.1 : sw * 0.4, shoulderZ);
    }
    // السلاح
    if (hold) {
      const gunLen = (wpn.type === 'sniper' || wpn.type === 'lmg') ? 1.15 * m : wpn.type === 'pistol' ? 0.32 * m : wpn.type === 'shotgun' ? 0.95 * m : 0.8 * m;
      const gz = shoulderZ - 0.16 * m, gy = 0.34 * m;
      if (lod === 0) {
        part(0.06 * m, gy, gz, 0.07 * m, gunLen * 0.55, 0.1 * m, '#22262c', -1.5, gz);
        part(0.06 * m, gy + gunLen * 0.42, gz, 0.05 * m, gunLen * 0.5, 0.05 * m, '#3a4048', -1.5, gz);
        part(0.06 * m, gy - gunLen * 0.1, gz - 0.09 * m, 0.06 * m, 0.12 * m, 0.2 * m, '#1b1e23', -1.5, gz);
        if ((p.zoom || 1) > 1.3) part(0.06 * m, gy + 0.05 * m, gz + 0.09 * m, 0.05 * m, 0.16 * m, 0.06 * m, '#111111', -1.5, gz);
      } else {
        part(0.06 * m, gy + gunLen * 0.2, gz, 0.07 * m, gunLen * 0.9, 0.09 * m, '#22262c', -1.5, gz);
      }
      if (p.fireFx > 0) {
        const q = tf(0.06 * m, gy + gunLen * 0.75, gz + 0.02 * m, -1.5, gz);
        this._billboard(q[0], q[1], 0.5 * m * p.fireFx, 0.5 * m * p.fireFx, 'rgba(255,220,120,.9)', q[2] - 0.25 * m * p.fireFx);
      }
    } else if (wpn && wpn.type === 'melee' && lod === 0) {
      part(0.26 * m, 0.3 * m, shoulderZ - 0.3 * m, 0.04 * m, 0.55 * m, 0.08 * m, '#c0c6cf', -1.2, shoulderZ - 0.3 * m);
    }
    // مظلة أثناء الهبوط
    if (p.st === 'parachute' || p.st === 'freefall') {
      const pz = baseZ + 1.1 * m;
      for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * 6.2832, a2 = ((i + 1) / 6) * 6.2832;
        const r = 1.5 * m;
        this._quad([p.x, p.y, pz + 0.9 * m,
          p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r, pz,
          p.x + Math.cos(a2) * r, p.y + Math.sin(a2) * r, pz,
          p.x, p.y, pz + 0.9 * m], i % 2 ? (accent || '#e04b4b') : '#f2f2f2', { twoSided: true });
      }
    }
    // تأثير الاسكن
    if (lod === 0 && skin && skin.effect && skin.effect !== 'none' && Math.random() < 0.35 && this.quality !== 'low') {
      const col = skin.effect === 'fire' ? '#ff8b2e' : skin.effect === 'ice' ? '#8fe8ff' : skin.effect === 'lightning' ? '#69a8ff' : skin.effect === 'void' ? '#c74bff' : accent;
      this.spawnParticle(p.x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 40, baseZ + Math.random() * 70,
        (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 30, col, 0.6, 5, 'spark');
    }
    // ظل على الأرض
    if (airZ < 40 && lod < 3) this._polyCircle(this.ctx, p.x, p.y, 26, 1.5, 'rgba(0,0,0,.3)');
  }
  /** شريط صحة عائم في الفضاء */
  _bar3d(x, y, z, w, k, color) {
    const dx = x - this.cam.x, dy = y - this.cam.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d * w / 2, ny = dx / d * w / 2;
    this._quad([x + nx, y + ny, z, x - nx, y - ny, z, x - nx, y - ny, z + 6, x + nx, y + ny, z + 6], 'rgba(0,0,0,.6)', { nx: dx / d, ny: dy / d, nz: 0, twoSided: true, raw: true });
    const kx = x + nx * (1 - 2 * k), ky = y + ny * (1 - 2 * k);
    this._quad([x + nx, y + ny, z + 1, kx, ky, z + 1, kx, ky, z + 5, x + nx, y + ny, z + 5], color, { nx: dx / d, ny: dy / d, nz: 0, twoSided: true, raw: true });
  }

  /* ------------------------------------------------------------------ */
  /* الرسم النهائي                                                       */
  /* ------------------------------------------------------------------ */
  _drawFaces(ctx) {
    const faces = this.faces;
    faces.sort((a, b) => b.depth - a.depth);
    let drawn = 0;
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      if (f.alpha < 1) ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(f.sx[0], f.sy[0]);
      for (let k = 1; k < f.n; k++) ctx.lineTo(f.sx[k], f.sy[k]);
      ctx.closePath();
      ctx.fill();
      if (f.alpha < 1) ctx.globalAlpha = 1;
      drawn++;
    }
    ctx.globalAlpha = 1;
    this.stats.faces = faces.length;
    this.stats.drawn = drawn;
  }
  _drawTracers(ctx, view) {
    ctx.lineCap = 'round';
    for (const b of view.bullets) {
      const z = 1.1 * M;
      const len = (b.w === 'awm' || b.w === 'kar98' || b.w === 'm249') ? 90 : 55;
      const a = this.worldToScreen(b.x, b.y, z);
      const bx = b.x - Math.cos(b.a || 0) * len, by = b.y - Math.sin(b.a || 0) * len;
      const c = this.worldToScreen(bx, by, z);
      if (!a.vis && !c.vis) continue;
      ctx.strokeStyle = b.silent ? 'rgba(255,255,200,.5)' : 'rgba(255,243,176,.95)';
      ctx.lineWidth = Math.max(1, Math.min(4, 300 / (a.depth || 200)));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  _drawParticles(ctx) {
    for (const p of this.parts) {
      const s = this.worldToScreen(p.x, p.y, p.z);
      if (!s.vis) continue;
      const k = Math.max(0, p.life / p.max);
      const r = Math.max(0.6, p.r * this.focal / s.depth * 0.02);
      ctx.globalAlpha = p.kind === 'smoke' ? k * 0.4 : k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  _drawZoneRing(ctx, view) {
    const z = view.zone;
    if (!z) return;
    const pts = [];
    const N = 64;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.2832;
      pts.push(z.tx + Math.cos(a) * z.tr, z.ty + Math.sin(a) * z.tr, 8);
    }
    this._strokePath(ctx, pts, 'rgba(255,255,255,.5)', 2, true);
  }
  _drawTags(ctx, view) {
    ctx.textAlign = 'center';
    for (const p of view.players) {
      if (!p.al || p.id === view.myId) continue;
      if (p.id === view.myId && this.mode === 'fps') continue;
      const d = Math.hypot(p.x - this.cam.x, p.y - this.cam.y);
      if (d > 2600) continue;
      const s = this.worldToScreen(p.x, p.y, (p.z || 0) + (p.pr ? 0.5 : 2.0) * M);
      if (!s.vis) continue;
      if (s.x < -60 || s.x > this.w + 60 || s.y < -40 || s.y > this.h + 40) continue;
      const sameTeam = view.teams && p.t === view.myTeam;
      const col = sameTeam ? '#6ee7a0' : (p.bot ? '#ff9a9a' : '#9fd0ff');
      const scale = clamp(1400 / (d + 300), 0.55, 1.5);
      const fs = Math.round(13 * scale);
      ctx.font = `700 ${fs}px Cairo, sans-serif`;
      const label = p.n || '';
      const tw = ctx.measureText(label).width + 12 * scale;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      const bx = s.x - tw / 2, by = s.y - fs - 6;
      ctx.moveTo(bx + 4, by); ctx.lineTo(bx + tw - 4, by); ctx.lineTo(bx + tw, by + fs + 4);
      ctx.lineTo(bx, by + fs + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillText(label, s.x, s.y - 6);
      const bw = 46 * scale;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(s.x - bw / 2, s.y + 1, bw, 4);
      ctx.fillStyle = p.hp > 50 ? '#41e06a' : p.hp > 20 ? '#ffd23d' : '#ff4757';
      ctx.fillRect(s.x - bw / 2, s.y + 1, bw * clamp(p.hp / 100, 0, 1), 4);
      if (p.kn) { ctx.fillStyle = '#ff8080'; ctx.font = `700 ${fs - 1}px Cairo`; ctx.fillText('مصاب!', s.x, s.y - fs - 10); }
    }
    ctx.textAlign = 'left';
  }
  _drawScreenFx(ctx, view) {
    const w = this.w, h = this.h;
    const me = view.players.find(p => p.id === view.myId);
    // داخل العاصفة
    if (me && view.zone && Math.hypot(me.x - view.zone.x, me.y - view.zone.y) > view.zone.r) {
      ctx.fillStyle = 'rgba(90,130,255,.16)'; ctx.fillRect(0, 0, w, h);
    }
    // وميض الضرر
    const dmg = view.damageFlash || 0;
    if (dmg > 0) { ctx.fillStyle = `rgba(255,20,40,${0.34 * dmg})`; ctx.fillRect(0, 0, w, h); }
    if (this.hitFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.16 * this.hitFlash})`; ctx.fillRect(0, 0, w, h); }
    // صحة منخفضة
    if (me && me.al && me.hp <= 30) {
      const p = 0.32 + Math.sin(this.time * 4) * 0.12;
      const rg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.26, w / 2, h / 2, Math.max(w, h) * 0.62);
      rg.addColorStop(0, 'rgba(255,0,30,0)'); rg.addColorStop(1, `rgba(255,0,30,${p})`);
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
    // اتجاهات الطلقات
    if (view.shotDirs && view.shotDirs.length && me) {
      for (const s of view.shotDirs) {
        let a = Math.atan2(s.y - me.y, s.x - me.x) - this.cam.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > 1.2) continue;
        const sx = this.cx0 + Math.tan(a) * this.focal;
        ctx.fillStyle = `rgba(255,90,60,${0.5 * s.k})`;
        ctx.beginPath();
        ctx.moveTo(sx, h * 0.2); ctx.lineTo(sx + 16, h * 0.2 + 26); ctx.lineTo(sx - 16, h * 0.2 + 26);
        ctx.closePath(); ctx.fill();
      }
    }
    // منظار القنص
    if (this.cam.ads > 0.5 && view.scope > 2) this._drawScope(ctx, view);
  }
  _drawScope(ctx, view) {
    const w = this.w, h = this.h;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.92)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, r, 0, 6.2832, true);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,20,20,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx - 12, cy); ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy - 12); ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,20,20,.6)';
    for (let i = 1; i <= 4; i++) {
      const y = cy + i * r * 0.16;
      ctx.beginPath(); ctx.moveTo(cx - 8, y); ctx.lineTo(cx + 8, y); ctx.stroke();
    }
    ctx.restore();
  }
  /** واجهة الهبوط (الطائرة) */
  _drawDropOverlay(ctx, view) {
    const w = this.w, h = this.h;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(0, 0, w, 60);
    ctx.fillRect(0, h - 60, w, 60);
  }

  /* ---------- نموذج السلاح (منظور الشخص الأول) ---------- */
  _drawViewModel(ctx, view) {
    const me = view.players.find(p => p.id === view.myId);
    if (!me) return;
    const w = this.w, h = this.h;
    const wdef = me.w ? WEAPONS[me.w] : null;
    const skin = SKIN_MAP[me.s] || SKIN_MAP.out_basic;
    const sleeve = skin.body || '#4a5b6e';
    const glove = tint(sleeve, -0.35);
    const ads = this.cam.ads;
    const kick = this.recoil;
    const bobX = Math.sin(this.cam.bobPhase) * 10 * this.cam.bob;
    const bobY = Math.abs(Math.cos(this.cam.bobPhase)) * 8 * this.cam.bob;
    const reload = me.rl ? 1 : 0;
    const scale = (Math.min(w, h) / 560) * (1 + ads * 0.3);
    // الموضع: وسط الشاشة عند التصويب، يمين أسفل عند الورك
    const hx = w * 0.70, hy = h * 1.0;
    const ax = w * 0.5, ay = h * 0.86;
    const x = hx + (ax - hx) * ads + bobX;
    const y = hy + (ay - hy) * ads + bobY + kick * 40 + reload * 90;
    const rot = (-0.16 + ads * 0.16) + kick * 0.16 + reload * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale * (1 + ads * 0.25), scale * (1 + ads * 0.25));
    if (!wdef) this._vmFists(ctx, sleeve, glove);
    else if (wdef.type === 'melee') this._vmMelee(ctx, wdef, sleeve, glove);
    else this._vmGun(ctx, wdef, sleeve, glove, ads, me.fireFx > 0);
    ctx.restore();
    // وميض الفوهة في منظور الشخص الأول
    if (me.fireFx > 0 && wdef && wdef.type !== 'melee') {
      const fx = x + (ads ? 0 : -30 * scale), fy = y - (ads ? 330 : 250) * scale;
      const r = (40 + Math.random() * 26) * scale * me.fireFx;
      const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, r);
      g.addColorStop(0, 'rgba(255,250,210,.95)');
      g.addColorStop(0.4, 'rgba(255,180,60,.6)');
      g.addColorStop(1, 'rgba(255,120,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, 6.2832); ctx.fill();
    }
  }
  _vmGun(ctx, def, sleeve, glove, ads, firing) {
    const long = def.type === 'sniper' || def.type === 'lmg' || def.type === 'dmr';
    const small = def.type === 'pistol' || def.type === 'smg';
    const bodyLen = small ? 150 : long ? 300 : 230;
    const bodyH = small ? 34 : 44;
    const metal = '#24282e', metal2 = '#3a4149', dark = '#15181c';
    // الساعد/اليد اليمنى
    ctx.fillStyle = sleeve;
    this._rr(ctx, 20, 40, 120, 90, 26); ctx.fill();
    ctx.fillStyle = glove;
    this._rr(ctx, -20, 20, 90, 60, 20); ctx.fill();
    // جسم السلاح
    ctx.save();
    ctx.translate(-bodyLen * 0.45, -bodyH);
    ctx.fillStyle = metal;
    this._rr(ctx, 0, 0, bodyLen, bodyH, 8); ctx.fill();
    ctx.fillStyle = metal2;
    this._rr(ctx, bodyLen * 0.12, 4, bodyLen * 0.5, bodyH * 0.3, 4); ctx.fill();
    // السبطانة
    ctx.fillStyle = dark;
    this._rr(ctx, bodyLen, bodyH * 0.28, small ? 40 : long ? 130 : 90, bodyH * 0.34, 5); ctx.fill();
    // كاتم/موازن
    if ((def.scope || 1) > 1.2 || long) {
      ctx.fillStyle = '#0f1114';
      this._rr(ctx, bodyLen + (small ? 30 : long ? 110 : 70), bodyH * 0.2, 46, bodyH * 0.5, 6); ctx.fill();
    }
    // المخزن
    ctx.fillStyle = '#1b1f24';
    this._rr(ctx, bodyLen * 0.34, bodyH, 34, small ? 44 : 74, 6); ctx.fill();
    // المقبض
    ctx.fillStyle = '#2b2118';
    this._rr(ctx, bodyLen * 0.1, bodyH, 30, 62, 8); ctx.fill();
    // المخزن/المنظار
    if (long || (def.scope || 1) > 1.5) {
      ctx.fillStyle = '#101317';
      this._rr(ctx, bodyLen * 0.3, -22, 78, 22, 6); ctx.fill();
      ctx.fillStyle = '#4b6f8a';
      ctx.beginPath(); ctx.arc(bodyLen * 0.3 + 12, -11, 8, 0, 6.2832); ctx.fill();
    }
    // اليد اليسرى على المقدمة
    ctx.fillStyle = sleeve;
    this._rr(ctx, bodyLen * 0.62, bodyH * 0.5, 76, 46, 18); ctx.fill();
    ctx.fillStyle = glove;
    this._rr(ctx, bodyLen * 0.7, bodyH * 0.35, 48, 40, 14); ctx.fill();
    ctx.restore();
  }
  _vmMelee(ctx, def, sleeve, glove) {
    ctx.fillStyle = sleeve;
    this._rr(ctx, 10, 40, 120, 90, 26); ctx.fill();
    ctx.fillStyle = glove;
    this._rr(ctx, -30, 10, 90, 60, 20); ctx.fill();
    if (def.id === 'pan') {
      ctx.fillStyle = '#2b2f36';
      ctx.beginPath(); ctx.ellipse(-60, -70, 70, 52, -0.3, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#3d434c';
      ctx.beginPath(); ctx.ellipse(-60, -74, 58, 42, -0.3, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = '#c8ced8';
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-150, -150); ctx.lineTo(-120, -160); ctx.lineTo(20, -20);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7d5a2e';
      this._rr(ctx, -20, -10, 70, 26, 8); ctx.fill();
    }
  }
  _vmFists(ctx, sleeve, glove) {
    ctx.fillStyle = sleeve;
    this._rr(ctx, 30, 60, 120, 90, 26); ctx.fill();
    ctx.fillStyle = glove;
    this._rr(ctx, -10, 20, 86, 70, 24); ctx.fill();
  }
  _rr(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ */
  /* الجسيمات                                                            */
  /* ------------------------------------------------------------------ */
  spawnParticle(x, y, z, vx, vy, vz, color, life, r, kind, grav) {
    if (this.parts.length > this.cfg.parts) this.parts.shift();
    this.parts.push({
      x, y, z, vx, vy, vz,
      life, max: life, r, color, kind: kind || 'spark',
      grav: grav !== undefined ? grav : (kind === 'smoke' ? -18 : 240),
    });
  }
  updateParticles(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vz -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 2) { p.z = 2; p.vz *= -0.25; p.vx *= 0.6; p.vy *= 0.6; }
      if (p.kind === 'smoke') p.r += dt * 26;
    }
  }
  burst(x, y, z, n, opts) {
    const o = opts || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832;
      const el = Math.random() * Math.PI - Math.PI / 2;
      const sp = (o.speed || 160) * (0.35 + Math.random() * 0.9);
      this.spawnParticle(
        x, y, z,
        Math.cos(a) * Math.cos(el) * sp, Math.sin(a) * Math.cos(el) * sp, Math.abs(Math.sin(el)) * sp * 0.8 + 40,
        o.color || '#ffb14a', o.life || 0.55, (o.size || 4) * (0.6 + Math.random()), o.kind || 'spark', o.grav
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* أحداث اللعبة → مؤثرات ثلاثية الأبعاد                                */
  /* ------------------------------------------------------------------ */
  handleEvent(e, view) {
    const z = 1.1 * M;
    switch (e.type) {
      case 'hit': {
        const col = this.bloodFx === false ? (e.head ? '#dfe7f1' : '#aab4c2') : (e.head ? '#ff3355' : '#c42030');
        this.burst(e.x, e.y, e.head ? 1.6 * M : z, e.head ? 12 : 7, { color: col, speed: 180, life: 0.45, size: 3.2, kind: 'blood' });
        if (e.by === view.myId) this.hitFlash = 0.3;
        break;
      }
      case 'kill': {
        const v = (view.players || []).find(x => x.id === e.id);
        if (v) {
          this.corpses.push({ x: v.x, y: v.y, a: v.a, c: v.c, s: v.s, t: v.t, n: v.n, dead: 1, walking: false, al: 1, hp: 0 });
          if (this.corpses.length > 20) this.corpses.shift();
        }
        this.burst(e.x, e.y, z, 16, { color: this.bloodFx === false ? '#8b93a1' : '#a01828', speed: 150, life: 0.7, size: 4, kind: 'blood' });
        break;
      }
      case 'explosion': {
        this.burst(e.x, e.y, 1 * M, 44, { color: '#ffb14a', speed: 420, life: 0.75, size: 7 });
        this.burst(e.x, e.y, 1 * M, 24, { color: '#ff5a20', speed: 280, life: 1.0, size: 12 });
        this.burst(e.x, e.y, 1.4 * M, 16, { color: 'rgba(130,130,130,.75)', speed: 110, life: 1.6, size: 22, kind: 'smoke', grav: -22 });
        this.shake(16);
        this.hitFlash = 0.5;
        break;
      }
      case 'vehicleBoom': this.burst(e.x, e.y, 1 * M, 38, { color: '#ffb14a', speed: 400, life: 0.8, size: 8 }); this.shake(18); break;
      case 'pickup': this.burst(e.x, e.y, 0.6 * M, 6, { color: '#ffd166', speed: 80, life: 0.4, size: 3 }); break;
      case 'airdropLand': this.burst(e.x, e.y, 0.4 * M, 22, { color: '#d8c9a8', speed: 160, life: 0.9, size: 10, kind: 'smoke', grav: -10 }); break;
      case 'crateBreak': this.burst(e.x, e.y, 0.8 * M, 14, { color: '#b98b4a', speed: 190, life: 0.6, size: 5 }); break;
      case 'smoke': this.smokes.push({ x: e.x, y: e.y, r: 170, t: e.dur || 14 }); break;
      default: break;
    }
  }
}
const EMPTY = {};
function shortAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

export default Renderer3D;
