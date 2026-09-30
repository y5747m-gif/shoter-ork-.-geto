import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';

function draw(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const S = size / 512;
  // خلفية متدرجة داكنة
  const bg = ctx.createRadialGradient(size*0.3, size*0.2, size*0.05, size*0.5, size*0.5, size*0.75);
  bg.addColorStop(0, '#1b2c46'); bg.addColorStop(0.55, '#0d1219'); bg.addColorStop(1, '#05070a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  // إطار ذهبي
  ctx.strokeStyle = '#ffc63d'; ctx.lineWidth = 14*S;
  ctx.beginPath(); ctx.roundRect(10*S, 10*S, size-20*S, size-20*S, 48*S); ctx.stroke();
  // تاج الملك أورك (شكل مبسط)
  ctx.fillStyle = '#ffc63d';
  ctx.beginPath();
  ctx.moveTo(size*0.26, size*0.36);
  ctx.lineTo(size*0.34, size*0.26);
  ctx.lineTo(size*0.44, size*0.34);
  ctx.lineTo(size*0.5,  size*0.22);
  ctx.lineTo(size*0.56, size*0.34);
  ctx.lineTo(size*0.66, size*0.26);
  ctx.lineTo(size*0.74, size*0.36);
  ctx.lineTo(size*0.71, size*0.5);
  ctx.lineTo(size*0.29, size*0.5);
  ctx.closePath(); ctx.fill();
  // برق
  const g = ctx.createLinearGradient(0, size*0.5, 0, size*0.82);
  g.addColorStop(0, '#ffe187'); g.addColorStop(1, '#ff8a1f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(size*0.545, size*0.52);
  ctx.lineTo(size*0.44,  size*0.68);
  ctx.lineTo(size*0.505, size*0.68);
  ctx.lineTo(size*0.455, size*0.84);
  ctx.lineTo(size*0.60,  size*0.63);
  ctx.lineTo(size*0.53,  size*0.63);
  ctx.lineTo(size*0.585, size*0.52);
  ctx.closePath(); ctx.fill();
  // نص ORK ZONE
  ctx.fillStyle = '#e8eef7';
  ctx.font = `900 ${Math.round(54*S)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ORK ZONE', size*0.5, size*0.90);
  return c;
}
(async () => {
for (const s of [192, 512]) {
  const png = await draw(s).encode("png");
  fs.writeFileSync(`public/icons/icon-${s}.png`, png);
  console.log('icon-' + s + '.png', png.length, 'bytes');
}
})();
