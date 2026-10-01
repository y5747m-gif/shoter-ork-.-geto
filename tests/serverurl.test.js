/**
 * ORK ZONE — tests/serverurl.test.js
 * يختبر طبقة «عنوان سيرفر الأونلاين» التي تجعل الأونلاين يعمل على الهواتف الحقيقية
 * حتى عندما تُفتح اللعبة من استضافة ثابتة (Vercel) لا سيرفر خلفها:
 *   • تطبيع العناوين (host فقط / http / https / ws / wss / مسار فرعي)
 *   • اشتقاق عنوان WebSocket الصحيح
 *   • كشف المحتوى المختلط (صفحة https + سيرفر http) — أكبر سبب لتعطل الأونلاين على الهاتف
 *   • الحفظ والاسترجاع من localStorage والقراءة من ?server= و window.ORK_SERVER
 *   • فحص حقيقي لسيرفر يعمل (/api/health) إن كان مشغّلاً
 * التشغيل: node tests/serverurl.test.js
 */
import { register } from 'node:module';
register('./loader-hook.mjs', import.meta.url);

let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { console.log('  ✅', n); pass++; } else { console.log('  ❌', n, extra); fail++; } };

/* بيئة متصفح وهمية: صفحة https على استضافة ثابتة بلا سيرفر */
function fakeBrowser({ href = 'https://ork-zone.vercel.app/', orkServer = '', saved = null } = {}) {
  const url = new URL(href);
  const storage = new Map();
  if (saved) storage.set('orkz_server', saved);
  globalThis.location = { href, origin: url.origin, protocol: url.protocol, host: url.host, pathname: url.pathname, search: url.search };
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  globalThis.window = globalThis.window || {};
  globalThis.window.ORK_SERVER = orkServer;
  globalThis.window.localStorage = globalThis.localStorage;
  return storage;
}

console.log('\n🔗 تطبيع عناوين السيرفر');
fakeBrowser();
const net = await import('../public/js/net.js?case=base');
const { normalizeServer, Server } = net;
check('host فقط ← https (الصفحة https)', normalizeServer('my-server.com') === 'https://my-server.com');
check('عنوان http يبقى http', normalizeServer('http://1.2.3.4:3000') === 'http://1.2.3.4:3000');
check('wss ← https', normalizeServer('wss://srv.io') === 'https://srv.io');
check('ws ← http', normalizeServer('ws://srv.io:8080') === 'http://srv.io:8080');
check('الشرطة الأخيرة تُزال', normalizeServer('https://srv.io/') === 'https://srv.io');
check('المسار الفرعي يبقى', normalizeServer('https://srv.io/game/') === 'https://srv.io/game');
check('/ws تُكتب كما هي بلا كسر', normalizeServer('https://srv.io/ws').endsWith('/ws'));
check('الفراغ = نفس أصل الصفحة', normalizeServer('   ') === '');
check('نص غير صالح لا يرمي خطأ', normalizeServer('::::') !== undefined);

console.log('\n📡 اشتقاق عنوان WebSocket');
Server.base = 'https://srv.io';
check('https ← wss', Server.wsURL() === 'wss://srv.io/ws');
Server.base = 'http://192.168.1.9:3000';
check('http ← ws', Server.wsURL() === 'ws://192.168.1.9:3000/ws');
Server.base = '';
check('بلا عنوان ← نفس أصل الصفحة', Server.wsURL() === 'wss://ork-zone.vercel.app/ws');
Server.base = 'https://srv.io/game';
check('المسار الفرعي يُحترم', Server.wsURL() === 'wss://srv.io/game/ws');
check('عنوان REST كامل', Server.url('/api/health') === 'https://srv.io/game/api/health');
Server.base = '';
check('REST بلا عنوان = مسار نسبي', Server.url('/api/health') === '/api/health');

console.log('\n⛔ كشف المحتوى المختلط (سبب تعطل الأونلاين على الهاتف)');
Server.base = 'http://1.2.3.4:3000';
check('صفحة https + سيرفر http = محظور', Server.isMixed() === true);
Server.base = 'https://1.2.3.4';
check('صفحة https + سيرفر https = مسموح', Server.isMixed() === false);

console.log('\n💾 الحفظ والاسترجاع');
Server.save('srv.example.com');
check('العنوان يُحفظ في localStorage', localStorage.getItem('orkz_server') === 'https://srv.example.com');
Server.save('');
check('المسح يعيد نفس أصل الصفحة', Server.base === '' && localStorage.getItem('orkz_server') === null);

console.log('\n🧭 مصادر العنوان (رابط الدعوة / الحفظ / إعداد النشر)');
fakeBrowser({ href: 'https://ork-zone.vercel.app/?server=https%3A%2F%2Finvite.srv.io' });
let m = await import('../public/js/net.js?case=url');
check('?server= يُقرأ من رابط الدعوة', m.Server.base === 'https://invite.srv.io' && m.Server.source === 'url');
check('رابط الدعوة يُحفظ للمرات القادمة', globalThis.localStorage.getItem('orkz_server') === 'https://invite.srv.io');

fakeBrowser({ href: 'https://ork-zone.vercel.app/', saved: 'https://saved.srv.io' });
m = await import('../public/js/net.js?case=saved');
check('العنوان المحفوظ يُستخدم', m.Server.base === 'https://saved.srv.io' && m.Server.source === 'saved');

fakeBrowser({ href: 'https://ork-zone.vercel.app/', orkServer: 'https://cfg.srv.io' });
m = await import('../public/js/net.js?case=cfg');
check('window.ORK_SERVER من config.js يُستخدم', m.Server.base === 'https://cfg.srv.io' && m.Server.source === 'config');

fakeBrowser({ href: 'http://localhost:3000/' });
m = await import('../public/js/net.js?case=origin');
check('بلا أي إعداد = نفس أصل الصفحة', m.Server.base === '' && m.Server.source === 'origin');

console.log('\n🌐 فحص سيرفر حقيقي');
const live = process.env.API || 'http://localhost:3000';
const reachable = await fetch(live + '/api/health').then(r => r.json()).catch(() => null);
if (reachable && reachable.ok) {
  m.Server.base = live;
  const ok = await m.Server.probe(6000);
  check('probe ينجح مع سيرفر يعمل', ok && m.Server.status === 'ok', m.Server.message);
  m.Server.base = 'http://127.0.0.1:59999';
  const bad = await m.Server.probe(2500);
  check('probe يفشل بلطف مع عنوان خاطئ', bad === false && m.Server.status === 'down');
  // طلب REST عبر عنوان سيرفر خارجي (كما يفعل الهاتف من استضافة ثابتة)
  m.Server.base = live;
  m.API.offline = false;
  const guest = await m.API.post('/api/auth/guest', { name: 'هاتف' });
  check('REST عبر عنوان سيرفر خارجي يعمل (CORS)', !!(guest && guest.token), JSON.stringify(guest).slice(0, 80));
} else {
  console.log('  ⏭️  السيرفر غير مشغّل — تم تخطي الفحص الحيّ (شغّل npm start لاختباره)');
}

console.log(`\n🎉 النتيجة: ${pass} ناجح، ${fail} فاشل\n`);
process.exit(fail ? 1 : 0);
