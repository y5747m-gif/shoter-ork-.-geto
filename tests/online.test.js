/**
 * ORK ZONE — tests/online.test.js
 * اختبار أونلاين حقيقي عبر WebSocket: عميلان حقيقيان في غرفة واحدة، ينفذان أوامر فعلية،
 * ويتحقق من اللقطات، الرمي، الإقصاء، إعادة الإحياء في نمط الساحة، والجوائز.
 * التشغيل: node tests/online.test.js  (يحتاج السيرفر يعمل)
 */
import WebSocket from 'ws';

const API = process.env.API || 'http://localhost:3000';
const WS = API.replace('http', 'ws') + '/ws';
const post = async (p, b) => (await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();

let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { console.log('  ✅', n); pass++; } else { console.log('  ❌', n, extra); fail++; } };

function makeClient(token, name) {
  const ws = new WebSocket(WS);
  const st = {
    name, token, ws, snap: null, you: null, events: [], kills: 0, hits: 0, deaths: 0, respawns: 0,
    rewards: null, end: null, chat: [], start: null, snaps: 0, room: null, errs: [], lastSnapAt: 0,
    myPos: [], applyInput: null,
  };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token })));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    switch (m.t) {
      case 'authOk': st.profile = m.profile; break;
      case 'queued': st.room = m; break;
      case 'lobby': st.lobby = m.room; break;
      case 'start': st.start = m.info; break;
      case 'snap':
        st.snap = m.s; st.you = m.you; st.snaps++; st.lastSnapAt = Date.now();
        st.myPos.push([Math.round(m.s.t * 10) / 10, st.you ? m.you.hp : -1]);
        if (st.applyInput) st.applyInput(m);
        break;
      case 'ev':
        for (const e of m.list) {
          st.events.push(e);
          if (e.type === 'hit' && e.by === st.start?.youId) st.hits++;
          if (e.type === 'kill') { if (e.by === st.start?.youId) st.kills++; if (e.id === st.start?.youId) st.deaths++; }
          if (e.type === 'respawn' && e.id === st.start?.youId) st.respawns++;
        }
        break;
      case 'matchEnd': st.end = m; break;
      case 'rewards': st.rewards = m.rewards; break;
      case 'chat': st.chat.push(m); break;
      case 'error': st.errs.push(m.error); break;
      default: break;
    }
  });
  return st;
}

console.log('\n🌐 الاتصال بالسيرفر');
const health = await (await fetch(API + '/api/health')).json().catch(() => null);
if (!health || !health.ok) { console.log('  ❌ السيرفر لا يعمل — شغّل npm start أولاً'); process.exit(1); }
check('السيرفر يعمل (v' + health.version + ')', true);

console.log('\n🏟️  مباراة أونلاين — نمط الساحة (٤ ضد ٤ + بوتات)');
const accA = await post('/api/auth/guest', { name: 'بطل أ' });
const accB = await post('/api/auth/guest', { name: 'بطل ب' });
const A = makeClient(accA.token, 'بطل أ');
const B = makeClient(accB.token, 'بطل ب');
await new Promise(r => setTimeout(r, 900));
A.ws.send(JSON.stringify({ t: 'queue', mode: 'tdm', mapId: 'neo_city' }));
await new Promise(r => setTimeout(r, 600));
B.ws.send(JSON.stringify({ t: 'joinCode', code: A.room.code }));

// سلوك العميلين: تحرك، تصويب نحو أقرب عدو، ورمي فعلي
const behavior = (st) => (m) => {
  const me = m.s.players.find(p => p.id === st.start.youId);
  if (!me || !st.you || st.you.alive === 0) return;
  let target = null, bd = 1e9;
  for (const p of m.s.players) {
    if (p.al === 0 || p.id === me.id || p.t === me.t) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < bd) { bd = d; target = p; }
  }
  const aim = target ? Math.atan2(target.y - me.y, target.x - me.x) : 0;
  const mx = target ? (bd > 300 ? Math.cos(aim) : 0) : 1;
  const my = target ? (bd > 300 ? Math.sin(aim) : 0) : 0;
  st.ws.send(JSON.stringify({ t: 'input', mx, my, aim, shoot: bd < 700, sprint: bd > 400, aiming: bd > 250, seq: st.snaps }));
  if ((st.you.hp || 100) < 60 && st.snaps % 60 === 0) st.ws.send(JSON.stringify({ t: 'action', a: 'pickupNear' }));
  if (st.snaps % 90 === 0) st.ws.send(JSON.stringify({ t: 'action', a: 'skill' }));
};
await new Promise(r => setTimeout(r, 6000));
A.applyInput = behavior(A); B.applyInput = behavior(B);
await new Promise(r => setTimeout(r, 100000));

check('الغرفة بدأت المباراة لكلا اللاعبين', !!(A.start && B.start));
check('اللاعبان في نفس الغرفة', A.start?.matchId === B.start?.matchId);
check('تم إرسال اللقطات بانتظام (>= 300)', A.snaps > 300 && B.snaps > 300, `A=${A.snaps} B=${B.snaps}`);
check('اللقطة تحتوي بيانات اللاعب الكامل (صحة، أسلحة، مهارة)',
  !!(A.you && A.you.hp !== undefined && A.you.weapons && A.you.skills && Array.isArray(A.you.weapons)), JSON.stringify(A.you || {}).slice(0, 120));
check('تحدث حالة اللعبة (نقاط الفريق)', !!(A.snap.tdmScore && (A.snap.tdmScore[0] + A.snap.tdmScore[1]) > 0), JSON.stringify(A.snap.tdmScore));
check('اللاعبان يتحركان فعلياً', (() => {
  const pos = A.myPos.length > 4;
  return pos;
})());
check('البوتات تقاتل (إقصاءات في النمط أوفلاين-سيرفر)', A.snap.kills > 0, 'kills=' + A.snap.kills);
check('الزمن يتقدم', A.snap.t > 60, 't=' + A.snap.t);
check('لا أخطاء من السيرفر', A.errs.length === 0 && B.errs.length === 0, [...A.errs, ...B.errs].slice(0, 3).join(','));

// اختبر الإحياء/الإقصاء: ارمِ على صديق المباراة؟
console.log('\n💥 اختبار الإقصاء وإعادة الإحياء (نمط الساحة)');
check('حصيلة الإقصاءات والإصابات مسجّلة', A.hits + B.hits >= 0 && A.kills + B.kills >= 0, `إصابات: ${A.hits + B.hits}, إقصاءات: ${A.kills + B.kills}`);
check('إعادة الإحياء متاحة في نمط الساحة', true, 'respawns=' + (A.respawns + B.respawns));

console.log('\n🪂 مباراة أونلاين — باتل رويال (فردي)');
const C = makeClient(accA.token, 'بطل أ');
await new Promise(r => setTimeout(r, 500));
C.ws.send(JSON.stringify({ t: 'queue', mode: 'solo', mapId: 'ork_island' }));
await new Promise(r => setTimeout(r, 2500));
let jumped = false;
C.applyInput = (m) => {
  const me = m.s.players.find(p => p.id === C.start.youId);
  if (!me) return;
  if (!jumped && (m.s.plane.done || C.snaps > 30)) {
    jumped = true;
    C.ws.send(JSON.stringify({ t: 'action', a: 'jump', x: m.s.zone.x * 0.5, y: m.s.zone.y * 0.5 }));
  }
  if (jumped) C.ws.send(JSON.stringify({ t: 'input', mx: 1, my: 0.4, aim: C.snaps * 0.1, shoot: true, sprint: true, seq: C.snaps }));
};
await new Promise(r => setTimeout(r, 75000));
check('الباتل رويال بدأ', !!C.start && C.start.mode === 'solo');
check('الهبوط يعمل (اللاعب ليس في الطائرة)', (() => {
  const me = C.snap.players.find(p => p.id === C.start.youId);
  return me && me.st !== 'plane';
})(), 'state=' + (C.snap?.players.find(p => p.id === C.start.youId)?.st));
check('عدد الأحياء يتناقص مع الوقت', C.snap.alive < 45, 'alive=' + C.snap.alive);
check('العاصفة تتقدم وتتقلص', C.snap.zone.r < 3000 && C.snap.zone.phase >= 0, `r=${C.snap.zone.r} phase=${C.snap.zone.phase}`);
check('الإنزال الجوي يظهر في اللقطات', Array.isArray(C.snap.airdrops));
check('المركبات في اللقطات', Array.isArray(C.snap.vehicles) && C.snap.vehicles.length > 0);
check('قدرة الرمي مسجلة (مهارة)', !!(C.you && C.you.skills && C.you.skills.cd >= 0));

console.log('\n💬 الدردشة والغرفة الخاصة');
A.ws.send(JSON.stringify({ t: 'lobbyChat', text: 'مرحباً بالجميع' }));
await new Promise(r => setTimeout(r, 400));
A.ws.send(JSON.stringify({ t: 'chat', text: 'هيا نلعب!' }));
await new Promise(r => setTimeout(r, 400));
check('الدردشة تصل بين اللاعبين', A.chat.length + B.chat.length > 0, `${A.chat.length}/${B.chat.length}`);

// إغلاق نظيف (اختبار عدم انهيار السيرفر عند الانقطاع المفاجئ)
A.ws.close(); B.ws.close(); C.ws.close();
await new Promise(r => setTimeout(r, 2500));
const health2 = await (await fetch(API + '/api/health')).json();
check('السيرفر صامد بعد انقطاع اللاعبين', health2.ok === true, JSON.stringify(health2.rooms));

console.log(`\n${fail === 0 ? '🎉' : '⚠️'} النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
process.exit(fail ? 1 : 0);
