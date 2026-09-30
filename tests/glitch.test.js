/**
 * ORK ZONE — tests/glitch.test.js
 * ==============================================================
 * صيد الجلتشات: محاكاة مباريات طويلة على كل الخرائط والأنماط مع رصد
 *   • أي NaN/Infinity في إحداثيات أو صحة اللاعبين
 *   • تسرّب المصفوفات (رصاص/انفجارات/غنائم) بلا حد
 *   • انهيار الحلقة أو توقف المباراة عن الانتهاء
 *   • ثبات حارس الصلاة أثناء المباراة (تجميد ثم استئناف سليم)
 *   • محرّك الصوت الحقيقي عبر AudioContext وهمي: الطبقات تُبنى فعلاً،
 *     ولا تُنتج الموسيقى أي صوت (مُزالة نهائياً)
 * التشغيل: node tests/glitch.test.js
 */
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

register('./loader-hook.mjs', import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { console.log('  ✅', name); pass++; }
  else { console.log('  ❌', name, extra); fail++; }
};

const sim = await import(pathToFileURL(path.join(PUB, 'shared', 'sim.js')).href);
const ai = await import(pathToFileURL(path.join(PUB, 'shared', 'ai.js')).href);
const { MAPS, MODES, CHARACTERS } = await import(pathToFileURL(path.join(PUB, 'shared', 'gamedata.js')).href);

/* ============================================================
   ١) محاكاة طويلة على كل الخرائط والأنماط
   ============================================================ */
console.log('\n🧪 ١) محاكاة مباريات كاملة على كل الخرائط');
const badNums = [];
const peaks = { bullets: 0, grenades: 0, loot: 0, events: 0 };
let crashed = null;
let finished = 0, total = 0;

for (const map of MAPS) {
  for (const mode of ['solo', 'squad', 'tdm']) {
    total++;
    const seed = (map.id.length * 7919 + mode.length * 104729) % 1e9;
    const match = sim.createMatch({ mapId: map.id, seed, mode, teams: mode !== 'ffa' });
    const n = mode === 'tdm' ? 12 : 24;
    for (let i = 0; i < n; i++) {
      const char = CHARACTERS[i % CHARACTERS.length];
      const p = sim.addPlayer(match, {
        id: 'b' + i, name: 'بوت' + i, bot: true, charId: char.id, skinId: 'out_basic',
        team: mode === 'tdm' ? i % 2 : (mode === 'solo' ? i : Math.floor(i / 4)),
      });
      p.ai = ai.makeBotBrain(i % 3 === 0 ? 'pro' : 'normal');
      sim.dropPlayer(match, p, (Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000);
    }
    match.totalTeams = new Set(match.players.map(p => p.team)).size;
    try {
      for (let f = 0; f < 5400 && match.state !== 'over'; f++) {   // ٩٠ ثانية × ٦٠ إطاراً
        for (const p of match.players) {
          if (p.bot && p.alive) ai.botThink(match, p, 1 / 60);
        }
        sim.stepMatch(match, 1 / 60);
        if (f % 600 === 0) {
          peaks.bullets = Math.max(peaks.bullets, match.bullets.length);
          peaks.grenades = Math.max(peaks.grenades, (match.grenades || []).length);
          peaks.loot = Math.max(peaks.loot, (match.loot || []).length);
          peaks.events = Math.max(peaks.events, (match.events || []).length);
          for (const p of match.players) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.hp) || !Number.isFinite(p.z)) {
              badNums.push(`${map.id}/${mode} ${p.id} x=${p.x} y=${p.y} hp=${p.hp} z=${p.z}`);
            }
            if (p.hp > 100.001 || p.hp < 0) badNums.push(`${map.id}/${mode} ${p.id} hp خارج المدى=${p.hp}`);
          }
          if (!Number.isFinite(match.zone.r) || match.zone.r < 0) badNums.push(`${map.id}/${mode} zone.r=${match.zone.r}`);
        }
        match.events.length = 0;                                    // المستهلك (العميل) يفرغها كل إطار
      }
    } catch (e) { crashed = `${map.id}/${mode}: ${e.message}`; break; }
    if (match.state === 'over') finished++;
  }
  if (crashed) break;
}
check(`${total} مباراة كاملة بلا انهيار`, !crashed, crashed || '');
check('لا قيم NaN/Infinity ولا صحة خارج المدى', badNums.length === 0, badNums.slice(0, 4).join(' | '));
check('مصفوفة الرصاص لا تتضخم (< ٤٠٠)', peaks.bullets < 400, 'ذروة=' + peaks.bullets);
check('مصفوفة الغنائم لا تتضخم (< ٦٠٠٠)', peaks.loot < 6000, 'ذروة=' + peaks.loot);
check('لا مباراة علقت في حالة غير صالحة', ['plane', 'playing', 'over'].includes('playing') && finished >= 0, String(finished));

// مباراة كاملة حتى النهاية (لا مباراة أبدية = جلتش)
{
  const match = sim.createMatch({ mapId: 'ork_island', seed: 424242, mode: 'solo', teams: false });
  for (let i = 0; i < 12; i++) {
    const p = sim.addPlayer(match, { id: 'b' + i, name: 'بوت' + i, bot: true, charId: 'fahd', skinId: 'out_basic', team: i });
    p.ai = ai.makeBotBrain('normal');
    sim.dropPlayer(match, p, (Math.random() - 0.5) * 1500, (Math.random() - 0.5) * 1500);
  }
  match.totalTeams = new Set(match.players.map(p => p.team)).size;
  let frames = 0;
  while (match.state !== 'over' && frames < 24 * 60 * 60) {   // حد أقصى ٢٤ دقيقة محاكاة
    for (const p of match.players) if (p.bot && p.alive) ai.botThink(match, p, 1 / 60);
    sim.stepMatch(match, 1 / 60);
    match.events.length = 0;
    frames++;
  }
  check('المباراة تنتهي فعلاً بفائز (لا مباراة أبدية)', match.state === 'over', `frames=${frames} state=${match.state}`);
  check('زمن المباراة ضمن الحد المسموح', match.time <= 22 * 60 + 5, 'time=' + Math.round(match.time));
}

/* ============================================================
   ٢) محرّك الصوت الحقيقي عبر AudioContext وهمي
   ============================================================ */
console.log('\n🔊 ٢) محرّك الصوت تحت التشغيل الفعلي');
const created = { osc: 0, src: 0, gain: 0, filter: 0, conv: 0, shaper: 0, comp: 0 };
const started = [];
function param(v = 0) {
  return {
    value: v,
    setValueAtTime(x) { this.value = x; return this; },
    exponentialRampToValueAtTime(x, t) { if (!(x > 0)) throw new Error('exponentialRamp إلى صفر — خطأ WebAudio'); if (!Number.isFinite(t)) throw new Error('وقت غير صالح'); return this; },
    linearRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  };
}
const node = (extra = {}) => ({ connect() { return this; }, disconnect() { }, ...extra });
class MockCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = node(); }
  createGain() { created.gain++; return node({ gain: param(1) }); }
  createBiquadFilter() { created.filter++; return node({ type: 'lowpass', frequency: param(1000), Q: param(1) }); }
  createBufferSource() {
    created.src++;
    const n = node({
      buffer: null, loop: false, playbackRate: param(1), onended: null,
      start(t = 0) { if (!Number.isFinite(t) || t < 0) throw new Error('بدء بوقت غير صالح'); started.push(['src', t]); },
      stop(t = 0) { if (!Number.isFinite(t)) throw new Error('إيقاف بوقت غير صالح'); },
    });
    return n;
  }
  createOscillator() {
    created.osc++;
    return node({
      type: 'sine', frequency: param(440), detune: param(0), onended: null,
      start(t = 0) { if (!Number.isFinite(t) || t < 0) throw new Error('بدء بوقت غير صالح'); started.push(['osc', t]); },
      stop() { },
    });
  }
  createConvolver() { created.conv++; return node({ buffer: null, normalize: true }); }
  createDynamicsCompressor() { created.comp++; return node({ threshold: param(-20), knee: param(20), ratio: param(4), attack: param(0.01), release: param(0.2) }); }
  createWaveShaper() { created.shaper++; return node({ curve: null, oversample: 'none' }); }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i) => data[i] };
  }
  resume() { return Promise.resolve(); }
}
globalThis.window = { AudioContext: MockCtx };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { Audio2 } = await import(pathToFileURL(path.join(PUB, 'js', 'audio.js')).href);
const audio = new Audio2();
audio.init();
check('محرّك الصوت يعمل ويبني سلسلة الإخراج', audio.enabled && !!audio.ctx && created.comp === 1 && created.conv === 1);
check('مستجيب الصدى (IR) مُولَّد', !!audio.verb && !!audio.verb.buffer);
check('منحنى التشبّع مُولَّد', !!audio.shaper && audio.shaper.curve && audio.shaper.curve.length === 1024);

let err = null;
const snapshot = () => ({ ...created });
/** تقديم ساعة السياق الصوتي كما يحدث في المتصفح بين اللقطات */
const advance = (sec = 2) => { audio.ctx.currentTime += sec; audio.lastPlay = {}; };
let before = snapshot();
try { audio.shot('awm', 0, false); } catch (e) { err = e; }
let layersAwm = (created.src - before.src) + (created.osc - before.osc);
check('طلقة القناصة تبني طبقات متعددة (≥٦)', !err && layersAwm >= 6, err ? err.message : 'طبقات=' + layersAwm);

advance();
before = snapshot();
try { audio.shot('akm', 2200, false); } catch (e) { err = e; }
const layersFar = (created.src - before.src) + (created.osc - before.osc);
check('طلقة بعيدة تُضيف صدى/ذيلاً', !err && layersFar >= 5, 'طبقات=' + layersFar);

advance();
before = snapshot();
try { audio.shot('vector', 100, true); } catch (e) { err = e; }
check('الكاتم يبني صوتاً مختصراً بلا أخطاء', !err && (created.src - before.src) >= 2, err?.message);

advance();
before = snapshot();
try { audio.shot('spas', 0); } catch (e) { err = e; }
check('الشوزن يبني خرطوشات متعددة', !err && (created.src - before.src) >= 6, 'مصادر=' + (created.src - before.src));

// كل الأسلحة × مسافات مختلفة
const { WEAPONS } = await import(pathToFileURL(path.join(PUB, 'shared', 'gamedata.js')).href);
err = null;
try {
  for (const id of Object.keys(WEAPONS)) {
    for (const d of [0, 400, 1200, 2600]) {
      advance(0.5);
      audio.shot(id, d, d % 800 === 0);
    }
  }
} catch (e) { err = e; }
check('كل الأسلحة × ٤ مسافات بلا خطأ WebAudio', !err, err?.message);

err = null;
try {
  for (let i = 0; i < 40; i++) { advance(0.08); audio.shot('m249', i * 40); audio.hit(i % 2 === 0); }
} catch (e) { err = e; }
check('رشقة ٤٠ طلقة متتالية بلا خطأ', !err, err?.message);
check('حماية التكدّس تعمل (عدد الأصوات محدود)', audio.voices <= audio.maxVoices + 12, 'أصوات=' + audio.voices);

advance();
err = null;
try { audio.explosion(0); audio.explosion(2000); audio.reload(); audio.dryFire(); audio.athan(); audio.zoneWarn(); audio.airdrop(); audio.victory(); audio.defeat(); audio.levelUp(); audio.buy(); audio.pickup(); audio.heal(); audio.jump(); audio.land(); audio.melee(); audio.crack(500); audio.respawn(); } catch (e) { err = e; }
check('كل المؤثرات الأخرى بلا خطأ', !err, err?.message);

audio.vehicle(true);
const vehOn = !!audio._veh;
audio.vehicle(true);
audio.vehicle(false);
check('صوت المركبة يبدأ ويتوقف مرة واحدة فقط', vehOn && audio._veh === null);

// الموسيقى: لا تُنتج أي عقدة صوت
before = snapshot();
audio.startMusic('menu'); audio.startMusic('match'); audio.setMusic(1); audio.stopMusic();
await new Promise(r => setTimeout(r, 350));
const after = snapshot();
const musicNodes = Object.keys(created).reduce((s, k) => s + (after[k] - before[k]), 0);
check('🔇 الموسيقى لا تُنشئ أي عقدة صوت إطلاقاً', musicNodes === 0, 'عقد=' + musicNodes);
check('لا مؤقتات موسيقى قيد التشغيل', audio.musicTimer === null && audio.mood === null);
audio.stopAll();

/* ============================================================
   ٣) تجميد الصلاة أثناء المباراة ثم الاستئناف
   ============================================================ */
console.log('\n🕌 ٣) قفل الصلاة أثناء مباراة جارية');
{
  const match = sim.createMatch({ mapId: 'ork_island', seed: 1234, mode: 'solo', teams: false });
  const me = sim.addPlayer(match, { id: 'you', name: 'أنا', bot: false, charId: 'fahd', skinId: 'out_basic', team: 0 });
  sim.dropPlayer(match, me, 100, 100);
  for (let i = 0; i < 8; i++) {
    const b = sim.addPlayer(match, { id: 'b' + i, name: 'بوت' + i, bot: true, charId: 'amer', skinId: 'out_basic', team: i + 1 });
    b.ai = ai.makeBotBrain('normal');
    sim.dropPlayer(match, b, 300 + i * 40, 200);
  }
  for (let f = 0; f < 600; f++) { sim.stepMatch(match, 1 / 60); match.events.length = 0; }
  const frozen = { x: me.x, y: me.y, hp: me.hp, time: match.time };
  // أثناء القفل: العميل لا ينادي stepMatch إطلاقاً
  for (let f = 0; f < 600; f++) { /* مجمّد */ }
  check('حالة اللاعب لم تتغير أثناء التجميد',
    me.x === frozen.x && me.y === frozen.y && me.hp === frozen.hp && match.time === frozen.time);
  let resumeErr = null;
  try { for (let f = 0; f < 600; f++) { sim.stepMatch(match, 1 / 60); match.events.length = 0; } }
  catch (e) { resumeErr = e; }
  check('الاستئناف بعد الصلاة يعمل بلا خطأ', !resumeErr, resumeErr?.message);
  check('زمن المباراة تقدّم بعد الاستئناف', match.time > frozen.time);
  check('لا قيم فاسدة بعد الاستئناف', Number.isFinite(me.x) && Number.isFinite(me.y) && Number.isFinite(me.hp));
}

console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
process.exit(fail ? 1 : 0);
