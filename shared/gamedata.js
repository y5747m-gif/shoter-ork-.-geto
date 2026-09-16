/**
 * ORK ZONE — shared/gamedata.js
 * ملف البيانات المشترك بين السيرفر والعميل (أسلحة، خرائط، شخصيات، اسكنات، متجر، باس، مهام)
 * ESM: يستطيع استيراده كل من Node.js والمتصفح.
 */

export const GAME = {
  title: 'أورك زون',
  titleEn: 'ORK ZONE',
  version: '1.0.0',
  maxPlayers: 50,
  tickRate: 30,
  snapshotRate: 20,
  matchTimeLimit: 22 * 60, // ثانية
};

/* ============================= الأسطورية / الندرة ============================= */
export const RARITY = {
  common:    { key: 'common',    ar: 'عادي',    color: '#9aa4b2', glow: 'rgba(154,164,178,.55)', mult: 1.0,  order: 0 },
  rare:      { key: 'rare',      ar: 'نادر',    color: '#3ea6ff', glow: 'rgba(62,166,255,.6)',  mult: 1.15, order: 1 },
  epic:      { key: 'epic',      ar: 'ملحمي',   color: '#b45bff', glow: 'rgba(180,91,255,.65)', mult: 1.3,  order: 2 },
  legendary: { key: 'legendary', ar: 'أسطوري',  color: '#ffb02e', glow: 'rgba(255,176,46,.7)',  mult: 1.5,  order: 3 },
  mythic:    { key: 'mythic',    ar: 'خرافي',   color: '#ff3d6e', glow: 'rgba(255,61,110,.75)', mult: 1.75, order: 4 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/* ============================= الأسلحة ============================= */
// ammo types: 9mm | 556 | 762 | 12g | 45 | sniper | melee
export const AMMO = {
  '9mm':    { ar: '٩ ملم',  color: '#d9d2c3', size: 3, stack: 180 },
  '556':    { ar: '٥.٥٦',   color: '#9ad36b', size: 3, stack: 180 },
  '762':    { ar: '٧.٦٢',   color: '#e0a35c', size: 4, stack: 180 },
  '12g':    { ar: 'خرطوش',  color: '#e06a5c', size: 3, stack: 60  },
  '45':     { ar: '٤٥ ACP', color: '#c9a86a', size: 3, stack: 120 },
  'sniper': { ar: 'قنص',    color: '#7ec8e3', size: 5, stack: 60  },
  'melee':  { ar: 'قريب',   color: '#b0b0b0', size: 0, stack: 1   },
};

export const WEAPONS = {
  // مسدسات
  p92:       { id:'p92',       ar:'بي ٩٢',        en:'P92',        type:'pistol', rarity:'common',    dmg:22, rpm:380, mag:15, reload:1.6, spread:2.6, range:520,  speed:1500, ammo:'9mm',    move:1.00, slots:2, auto:false, scope:1.1, price:0,    desc:'مسدس بداية سريع وخفيف.' },
  deagle:    { id:'deagle',    ar:'صحراء الصقر',  en:'Desert Viper',type:'pistol',rarity:'rare',     dmg:58, rpm:150, mag:7,  reload:2.2, spread:2.2, range:900,  speed:2000, ammo:'45',     move:1.00, slots:3, auto:false, scope:1.2, price:1200, desc:'ضربة واحدة تكسر الدروع.' },
  // رشاشات صغيرة
  mp40:      { id:'mp40',      ar:'إم بي ٤٠',     en:'MP40',       type:'smg',    rarity:'common',    dmg:17, rpm:640, mag:30, reload:2.0, spread:3.4, range:700,  speed:1400, ammo:'9mm',    move:0.98, slots:3, auto:true,  scope:1.2, price:0,    desc:'رشاش بداية ممتاز للمعارك القريبة.' },
  ump:       { id:'ump',       ar:'يو إم بي',     en:'UMP45',      type:'smg',    rarity:'rare',      dmg:26, rpm:520, mag:25, reload:2.3, spread:2.6, range:820,  speed:1500, ammo:'45',     move:0.96, slots:4, auto:true,  scope:1.3, price:2400, desc:'توازن رهيب بين الضرر والدقة.' },
  vector:    { id:'vector',    ar:'الناقل',       en:'Vector',     type:'smg',    rarity:'epic',      dmg:20, rpm:1100,mag:19, reload:2.1, spread:2.2, range:640,  speed:1600, ammo:'9mm',    move:0.96, slots:4, auto:true,  scope:1.3, price:0,    desc:'سرعة تصويب مجنونة بمدى قصير.' },
  // بنادق هجومية
  akm:       { id:'akm',       ar:'أكي إم الجبل', en:'AKM',        type:'ar',     rarity:'rare',      dmg:47, rpm:600, mag:30, reload:2.5, spread:2.8, range:1250, speed:1900, ammo:'762',    move:0.90, slots:5, auto:true,  scope:1.4, price:3200, desc:'ضرر قاتل وارتداد يحب السيطرة.' },
  m416:      { id:'m416',      ar:'إم ٤١٦',       en:'M416',       type:'ar',     rarity:'epic',      dmg:41, rpm:660, mag:30, reload:2.2, spread:1.9, range:1350, speed:1900, ammo:'556',    move:0.91, slots:5, auto:true,  scope:1.5, price:4200, desc:'الأسطورة: مستقرة في كل المسافات.' },
  scar:      { id:'scar',      ar:'سكـار',        en:'SCAR-L',     type:'ar',     rarity:'rare',      dmg:43, rpm:620, mag:30, reload:2.4, spread:2.2, range:1280, speed:1850, ammo:'556',    move:0.91, slots:5, auto:true,  scope:1.45,price:3800, desc:'دقيق جداً من الرشقة الأولى.' },
  groza:     { id:'groza',     ar:'جروزا التنين', en:'GROZA',      type:'ar',     rarity:'legendary', dmg:52, rpm:700, mag:30, reload:2.6, spread:2.4, range:1300, speed:1950, ammo:'762',    move:0.89, slots:5, auto:true,  scope:1.5, price:0,    desc:'سلاح الإنزال الجوي — كابوس القريب.' },
  // قناصة
  sks:       { id:'sks',       ar:'إس كي إس',      en:'SKS',        type:'dmr',    rarity:'rare',      dmg:53, rpm:240, mag:10, reload:2.6, spread:1.4, range:1900, speed:2400, ammo:'762',    move:0.90, slots:5, auto:false, scope:2.0, price:3600, desc:'نصف أوتوماتيكي بعيد المدى.' },
  kar98:     { id:'kar98',     ar:'كار ٩٨',       en:'Kar98k',     type:'sniper', rarity:'epic',      dmg:98, rpm:60,  mag:5,  reload:3.0, spread:0.6, range:2600, speed:3200, ammo:'sniper', move:0.86, slots:4, auto:false, scope:4.0, price:5000, desc:'رأس واحد… نهاية اللعبة للعدو.' },
  awm:       { id:'awm',       ar:'القاضية AWM',  en:'AWM',        type:'sniper', rarity:'legendary', dmg:135,rpm:45,  mag:5,  reload:3.6, spread:0.4, range:3200, speed:3800, ammo:'sniper', move:0.84, slots:4, auto:false, scope:8.0, price:0,    desc:'أقوى بندقية قنص — إنزال جوي فقط.' },
  // بندقية خرطوش
  m1014:     { id:'m1014',     ar:'إم ١٠١٤',      en:'M1014',      type:'shotgun',rarity:'rare',      dmg:22, rpm:200, mag:7,  reload:3.0, spread:5.5, range:320,  speed:1300, ammo:'12g',    move:0.92, slots:3, auto:false, scope:1.1, pellets:7, price:3000, desc:'٧ خرطوشات بضربة واحدة.' },
  spas:      { id:'spas',      ar:'سباس ١٢',      en:'SPAS-12',    type:'shotgun',rarity:'epic',      dmg:26, rpm:150, mag:5,  reload:3.4, spread:5.0, range:380,  speed:1300, ammo:'12g',    move:0.90, slots:4, auto:false, scope:1.15,pellets:8, price:0,   desc:'تفتّت أمامك في ثانية.' },
  // رشاش ثقيل
  m249:      { id:'m249',      ar:'إم ٢٤٩',       en:'M249',       type:'lmg',    rarity:'legendary', dmg:45, rpm:750, mag:100,reload:5.5, spread:3.6, range:1500, speed:1900, ammo:'556',    move:0.80, slots:5, auto:true,  scope:1.4, price:0,    desc:'١٠٠ طلقة… لا تتوقف!' },
  minigun:   { id:'minigun',   ar:'المنجل الدوار', en:'Minigun',   type:'lmg',    rarity:'mythic',    dmg:34, rpm:1400,mag:150,reload:6.0, spread:4.2, range:1400, speed:2000, ammo:'556',    move:0.74, slots:5, auto:true,  scope:1.35,price:0,    desc:'سلاح خرافي من الإنزال الذهبي.' },
  // قتال قريب
  machete:   { id:'machete',   ar:'المنجل',       en:'Machete',    type:'melee',  rarity:'common',    dmg:45, rpm:110, mag:0,  reload:0,   spread:0,   range:70,   speed:0,    ammo:'melee',  move:1.02, slots:1, auto:false, scope:1.0, price:0,    desc:'أقرب صديق عند الهبوط.' },
  pan:       { id:'pan',       ar:'المقلاة',      en:'Pan',        type:'melee',  rarity:'rare',      dmg:60, rpm:90,  mag:0,  reload:0,   spread:0,   range:72,   speed:0,    ammo:'melee',  move:1.02, slots:1, auto:false, scope:1.0, price:900,  desc:'تصد الطلقات من الخلف!' },
};

export const GUN_IDS = Object.keys(WEAPONS);
export const AIRDROP_WEAPONS = ['awm', 'groza', 'm249', 'minigun', 'spas'];

/* ============================= الملحقات ============================= */
export const ATTACHMENTS = {
  scope2:    { id:'scope2',    ar:'منظار ٢×',    slot:'scope',  rarity:'rare',      zoom:1.35, spreadMul:0.92, price:800 },
  scope4:    { id:'scope4',    ar:'منظار ٤×',    slot:'scope',  rarity:'epic',      zoom:1.7,  spreadMul:0.86, price:1800 },
  scope8:    { id:'scope8',    ar:'منظار ٨×',    slot:'scope',  rarity:'legendary', zoom:2.3,  spreadMul:0.80, price:0 },
  grip:      { id:'grip',      ar:'قبضة رأسية',  slot:'grip',   rarity:'rare',      zoom:1,    spreadMul:0.86, price:1000 },
  extmag:    { id:'extmag',    ar:'مخزن موسع',   slot:'mag',    rarity:'epic',      zoom:1,    magMul:1.5, price:1500 },
  suppressor:{ id:'suppressor',ar:'كاتم صوت',    slot:'muzzle', rarity:'epic',      zoom:1,    spreadMul:0.94, silent:true, price:1600 },
  compensator:{id:'compensator',ar:'موازن ارتداد',slot:'muzzle',rarity:'rare',      zoom:1,    spreadMul:0.88, price:1200 },
};

/* ============================= الدروع ============================= */
export const ARMORS = {
  vest1: { id:'vest1', ar:'درع مستوى ١', lvl:1, dr:0.20, dur:150, price:400 },
  vest2: { id:'vest2', ar:'درع مستوى ٢', lvl:2, dr:0.32, dur:240, price:900 },
  vest3: { id:'vest3', ar:'درع مستوى ٣', lvl:3, dr:0.45, dur:350, price:0   },
  helm1: { id:'helm1', ar:'خوذة مستوى ١', lvl:1, dr:0.18, dur:120, price:350 },
  helm2: { id:'helm2', ar:'خوذة مستوى ٢', lvl:2, dr:0.28, dur:200, price:850 },
  helm3: { id:'helm3', ar:'خوذة مستوى ٣', lvl:3, dr:0.40, dur:300, price:0   },
  bag1:  { id:'bag1', ar:'حقيبة مستوى ١', lvl:1, cap:1.4, price:300 },
  bag2:  { id:'bag2', ar:'حقيبة مستوى ٢', lvl:2, cap:1.8, price:700 },
  bag3:  { id:'bag3', ar:'حقيبة مستوى ٣', lvl:3, cap:2.3, price:0 },
};

export const HEALS = {
  bandage: { id:'bandage', ar:'ضمادة',   heal:20, time:3.0, price:0, stack:10, color:'#e8e2d4' },
  medkit:  { id:'medkit',  ar:'حقيبة طبية', heal:100, time:6.0, price:0, stack:3, color:'#ff5d5d' },
  energy:  { id:'energy',  ar:'شراب الطاقة', heal:0, boost:45, time:3.0, price:0, stack:8, color:'#4be07a' },
  grenade: { id:'grenade', ar:'قنبلة يدوية', dmg:110, radius:120, time:0, price:0, stack:6, color:'#4d6b3a' },
  smoke:   { id:'smoke',   ar:'قنبلة دخان',  radius:180, dur:14, time:0, price:0, stack:4, color:'#c9c9c9' },
  coin:    { id:'coin',    ar:'عملة ذهبية',  value:1, price:0, stack:9999, color:'#ffcc45' },
};

/* ============================= الشخصيات (رجال فقط) ============================= */
export const CHARACTERS = [
  { id:'fahd',   ar:'فهد الصحراء',   en:'Fahd',      rarity:'common',    price:0,    skill:{ ar:'رياح السريع',  desc:'+٨٪ سرعة جري دائم.',        kind:'speed',   value:0.08 } },
  { id:'amer',   ar:'الرقيب عامر',   en:'Amer',      rarity:'common',    price:0,    skill:{ ar:'يد سريعة',     desc:'-٢٠٪ زمن إعادة التعبئة.',   kind:'reload',  value:0.20 } },
  { id:'hakim',  ar:'الدكتور حكيم',  en:'Hakim',     rarity:'rare',      price:3000, skill:{ ar:'شفاء ميداني',  desc:'-٣٠٪ زمن العلاج + تجدد HP.', kind:'heal',    value:0.30 }, skinPrice:800,  gems:0 },
  { id:'khaled', ar:'الظل خالد',     en:'Khaled',    rarity:'rare',      price:3500, skill:{ ar:'تلاشي',        desc:'اختفاء عن الرادار ٨ ثوان.', kind:'stealth', value:8 },    skinPrice:900,  gems:0 },
  { id:'shadi',  ar:'القناص شادي',   en:'Shadi',     rarity:'epic',      price:6500, skill:{ ar:'عين الصقر',    desc:'-٣٥٪ تشتت عند التصويب.',   kind:'accuracy',value:0.35 }, skinPrice:1600, gems:0 },
  { id:'rami',   ar:'المهندس رامي',  en:'Rami',      rarity:'epic',      price:7000, skill:{ ar:'حصن سريع',     desc:'يبني حاجزاً واقياً فوراً.', kind:'shield',  value:250 },  skinPrice:1600, gems:0 },
  { id:'zaid',   ar:'الصخرة زيد',    en:'Zaid',      rarity:'epic',      price:7500, skill:{ ar:'جسم فولاذي',   desc:'-٢٥٪ ضرر وارد.',           kind:'tank',    value:0.25 }, skinPrice:1800, gems:0 },
  { id:'yaser',  ar:'النينجا ياسر',  en:'Yaser',     rarity:'legendary', price:0,    gems:600,  skill:{ ar:'خطوة البرق',   desc:'انطلاقة سريعة + قفز الحواجز.',kind:'dash',   value:420 },  skinPrice:2600 },
  { id:'majhool',ar:'الجندي المجهول',en:'Unknown',   rarity:'legendary', price:0,    gems:700,  skill:{ ar:'ترس إضافي',    desc:'+٥٠ درع إضافي عند الهبوط.', kind:'bonus',   value:50 },   skinPrice:2800 },
  { id:'tannin', ar:'تنين الرمال',   en:'Sand Dragon',rarity:'legendary',price:0,   gems:950,  skill:{ ar:'زفير النار',    desc:'تضاعف الضرر ٦ ثوان بعد كل قتل.', kind:'rage', value:6 }, skinPrice:3400 },
  { id:'asad',   ar:'أسد الجليد',    en:'Ice Lion',  rarity:'legendary', price:0,    gems:950,  skill:{ ar:'تجميد',        desc:'يبطئ الأعداء القريبين ٤٠٪.', kind:'slow',   value:0.4 },  skinPrice:3400 },
  { id:'orkking',ar:'ملك أورك',      en:'ORK KING',  rarity:'mythic',    price:0,    gems:1800, skill:{ ar:'تاج الملوك',    desc:'كل المهارات بمستوى أعلى + هالة ذهبية.', kind:'all', value:0.12 }, skinPrice:5200 },
];

/* ============================= الاسكنات (الأزياء) ============================= */
// كل سكن = لوحة ألوان + تفاصيل + تأثير بصري. الاسم عربي والإطار يحدد الندرة.
export const SKINS = [
  // ملابس أساسية
  { id:'out_basic',   ar:'زي المبتدئ',        rarity:'common',    price:0,    char:'*',  body:'#4a5b6e', pants:'#2f3a46', accent:'#8fa3b8', effect:'none' },
  { id:'out_desert',  ar:'بدلة الصحراء',      rarity:'common',    price:600,  char:'*',  body:'#c2a271', pants:'#7d6a49', accent:'#e8d3a8', effect:'none' },
  { id:'out_forest',  ar:'تخفي الغابة',       rarity:'common',    price:600,  char:'*',  body:'#4d6b3a', pants:'#33472a', accent:'#93b06a', effect:'none' },
  { id:'out_snow',    ar:'بياض الجليد',       rarity:'rare',      price:1500, char:'*',  body:'#dfe8f2', pants:'#9fb1c4', accent:'#6fa8dc', effect:'none' },
  { id:'out_urban',   ar:'مقاتل المدن',       rarity:'rare',      price:1500, char:'*',  body:'#3b3f46', pants:'#22252a', accent:'#e04b4b', effect:'none' },
  { id:'out_shadow',  ar:'ظلال الليل',        rarity:'epic',      price:3800, char:'*',  body:'#20232e', pants:'#14161d', accent:'#7b4bd8', effect:'trail' },
  { id:'out_blood',   ar:'حمرة المعركة',      rarity:'epic',      price:3800, char:'*',  body:'#5c1f22', pants:'#2e1113', accent:'#ff5a5a', effect:'trail' },
  { id:'out_neon',    ar:'نيون المستقبل',     rarity:'epic',      price:4200, char:'*',  body:'#101820', pants:'#0a0f14', accent:'#22e0d0', effect:'glow' },
  { id:'out_gold',    ar:'طلي بالذهب',        rarity:'legendary', price:9000, char:'*',  body:'#c9a227', pants:'#7a5f13', accent:'#ffe07a', effect:'glow' },
  { id:'out_flame',   ar:'لهب التنين',        rarity:'legendary', price:11000,char:'*',  body:'#7a2b12', pants:'#3d1508', accent:'#ff8b2e', effect:'fire' },
  { id:'out_storm',   ar:'صاعقة العاصفة',     rarity:'legendary', price:12000,char:'*',  body:'#232b52', pants:'#12172e', accent:'#69a8ff', effect:'lightning' },
  { id:'out_void',    ar:'فراغ الكون',        rarity:'mythic',    gems:900,   char:'*',  body:'#160d24', pants:'#0b0614', accent:'#c74bff', effect:'void' },
  { id:'out_orkking', ar:'ثوب ملك أورك',      rarity:'mythic',    gems:1400,  char:'orkking', body:'#3a2408', pants:'#1d1204', accent:'#ffc63d', effect:'crown' },
  // أزياء خاصة لكل شخصية
  { id:'out_fahd',    ar:'عباءة الصحراء',     rarity:'rare',      price:2200, char:'fahd',  body:'#d9b072', pants:'#8a6b3c', accent:'#fff0c4', effect:'sand' },
  { id:'out_khaled',  ar:'رداء الظل',         rarity:'epic',      price:4600, char:'khaled',body:'#1b1f2a', pants:'#0f1219', accent:'#6f7cff', effect:'smoke' },
  { id:'out_shadi',   ar:'بزة القناص',        rarity:'epic',      price:4600, char:'shadi', body:'#3c4a33', pants:'#232c1e', accent:'#b7d67a', effect:'laser' },
  { id:'out_tannin',  ar:'درع التنين',        rarity:'legendary', price:13000,char:'tannin',body:'#8c2f0d', pants:'#3f1505', accent:'#ffb03a', effect:'fire' },
  { id:'out_asad',    ar:'فرو الأسد',         rarity:'legendary', price:13000,char:'asad',  body:'#cfe3f5', pants:'#7fa3c4', accent:'#8fe8ff', effect:'ice' },
  { id:'out_majhool', ar:'زي المجهول',        rarity:'legendary', price:12500,char:'majhool',body:'#2c3038',pants:'#191c21',accent:'#00e0a0', effect:'glitch' },
  { id:'out_yaser',   ar:'ثوب النينجا',       rarity:'legendary', price:12500,char:'yaser',body:'#20242c', pants:'#101317', accent:'#ff2f6d', effect:'dash' },
];

/* ============================= المركبات ============================= */
export const VEHICLES = {
  jeep:  { id:'jeep',  ar:'جيب مصفح', en:'Armored Jeep', seats:4, hp:900, speed:520, accel:220, water:false, turret:false, price:0,    color:'#5a6b3a' },
  bike:  { id:'bike',  ar:'دراجة سريعة',en:'Rapid Bike',  seats:2, hp:420, speed:660, accel:380, water:false, turret:false, price:2200, color:'#b03a2e' },
  boat:  { id:'boat',  ar:'قارب سريع', en:'Speed Boat',   seats:4, hp:600, speed:560, accel:240, water:true,  turret:false, price:2600, color:'#2f6f92' },
  tank:  { id:'tank',  ar:'مدرعة الإنزال',en:'Airdrop APC',seats:4, hp:1600,speed:420, accel:160, water:false, turret:true,  price:0,    color:'#4a4a4a' },
};

/* ============================= الخرائط (أشكال مختلفة) ============================= */
/**
 * shape:
 *  circle   {r}
 *  roundrect{w,h,r}
 *  blob     {r,lobes,amp}   (شكل عشوائي ناعم كالجزيرة)
 *  cross    {len,armW,r}    (مدينة صليبية)
 *  ring     {r,hole}        (جزيرة حلقة بها بحيرة بركان)
 */
export const MAPS = [
  {
    id:'ork_island', ar:'جزيرة أورك', en:'ORK ISLAND', size:3600,
    shape:{ type:'circle', r:1700 },
    biome:'grass', sky:'#0f2a20',
    desc:'الجزيرة الأصلية: غابات كثيفة وبلدات قديمة ونهر يقسم الخريطة.',
    terrain:{ water:[{x:-200,y:200,w:1700,h:240,r:110}], roads:[[-1650,0,1650,0], [0,-1650,0,1650]] },
    buildDensity:1.0, trees:230, rocks:70, lootSpots:60, vehicleSpots:22, playerScale:1,
  },
  {
    id:'sand_storm', ar:'صحراء العواصف', en:'SAND STORM', size:3800,
    shape:{ type:'roundrect', w:2700, h:2500, r:260 },
    biome:'desert', sky:'#3a2a12',
    desc:'مدن ملحية وكثبان رملية، مدى رؤية بعيد جداً — سلاح القناص هنا ملك.',
    terrain:{ water:[[-1250,900,700,420,80]], roads:[[-1700,-400,1700,-400],[300,-1600,300,1600]] },
    buildDensity:0.8, trees:40, rocks:150, lootSpots:55, vehicleSpots:28, playerScale:1.05,
  },
  {
    id:'snow_peak', ar:'قمة الجليد', en:'SNOW PEAK', size:3600,
    shape:{ type:'blob', r:1650, lobes:7, amp:0.24 },
    biome:'snow', sky:'#12233a',
    desc:'شكل نجمي غير منتظم، بحيرات متجمدة وأكواخ جبلية. الجري هنا بطيء.',
    terrain:{ water:[[200,-700,900,600,150],[-900,800,700,500,120]], roads:[[-1500,300,1500,300]] },
    buildDensity:1.1, trees:150, rocks:90, lootSpots:58, vehicleSpots:24, playerScale:0.98, slippery:0.9,
  },
  {
    id:'neo_city', ar:'مدينة النيون', en:'NEO CITY', size:3400,
    shape:{ type:'cross', len:1600, armW:900, r:120 },
    biome:'urban', sky:'#1a0f2e',
    desc:'خريطة صليبية الشكل مبنية من ناطحات سحاب وشوارع مضيئة — قتال شوارع!',
    terrain:{ water:[], roads:[[-1700,0,1700,0],[0,-1700,0,1700]] },
    buildDensity:2.0, trees:20, rocks:30, lootSpots:70, vehicleSpots:20, playerScale:0.95,
  },
  {
    id:'volcano', ar:'قلب البركان', en:'VOLCANO HEART', size:3600,
    shape:{ type:'ring', r:1750, hole:520 },
    biome:'volcano', sky:'#2a0f0a',
    desc:'جزيرة حلقة بها بحيرة حمم قاتلة في المنتصف — تحرك بحذر، الحمم تحرق!',
    terrain:{ water:[[-700,1100,600,420,90]], roads:[] },
    buildDensity:0.9, trees:60, rocks:200, lootSpots:66, vehicleSpots:26, playerScale:1, lava:true,
  },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));
export const BIOMES = {
  grass:   { ground:'#2f5d3a', ground2:'#2a5233', accent:'#4a7c4e', detail:'#8fbf6a', water:'#1c4a63', road:'#6b6350', build:'#7d6a52', roof:'#8f4b3c', tree:'#4d9a53', treeDark:'#1e4426', floor:'#6d5c46', rug:'#8a4a3a' },
  desert:  { ground:'#b99a63', ground2:'#ab8b57', accent:'#cbb684', detail:'#e0cb95', water:'#2c6b7a', road:'#8d7a55', build:'#c9b189', roof:'#a05f42', tree:'#8b9a55', treeDark:'#4f5a2c', floor:'#a08a63', rug:'#8d5f42' },
  snow:    { ground:'#dfe9f2', ground2:'#cfdcea', accent:'#b9cede', detail:'#ffffff', water:'#4d7fa8', road:'#9fb0c0', build:'#8b7a6a', roof:'#5d5148', tree:'#5d8a68', treeDark:'#2c4a38', floor:'#7d6f61', rug:'#6c5a58' },
  urban:   { ground:'#2a2a35', ground2:'#232330', accent:'#3a3a4a', detail:'#22e0d0', water:'#123a52', road:'#1b1b24', build:'#3f4250', roof:'#584bd8', tree:'#3d5a44', treeDark:'#1b2a20', floor:'#31323d', rug:'#4b3a6a' },
  volcano: { ground:'#3a2a24', ground2:'#33241f', accent:'#4d372c', detail:'#ff7a2e', water:'#ff5a10', road:'#5a4038', build:'#4a3a33', roof:'#8a3218', tree:'#3a2a20', treeDark:'#1a1008', floor:'#3f3129', rug:'#5a2a18' },
};

/* ============================= دوائر العاصفة ============================= */
export const ZONE_PHASES = [
  { hold:75, shrink:48, factor:0.74, dps:1.0  },
  { hold:60, shrink:45, factor:0.70, dps:1.5  },
  { hold:52, shrink:40, factor:0.68, dps:2.5  },
  { hold:44, shrink:34, factor:0.64, dps:4.0  },
  { hold:38, shrink:30, factor:0.60, dps:6.5  },
  { hold:32, shrink:26, factor:0.56, dps:10.0 },
  { hold:26, shrink:20, factor:0.50, dps:14.0 },
  { hold:20, shrink:16, factor:0.44, dps:20.0 },
];

/* ============================= جدول الغنائم ============================= */
export const LOOT_TABLE = {
  floor: { // أرضي/داخل البيوت
    weapon:  { weight: 30, pool: ['p92','mp40','ump','akm','scar','sks','m1014','machete','deagle','m416','kar98'] },
    ammo:    { weight: 26, counts: { '9mm': [30,60], '556': [30,60], '762': [30,60], '12g': [8,16], '45': [20,40], 'sniper': [5,10] } },
    armor:   { weight: 14, pool: ['vest1','vest2','helm1','helm2','bag1','bag2'] },
    heal:    { weight: 22, pool: ['bandage','energy','medkit','grenade','smoke'] },
    attach:  { weight: 8,  pool: ['scope2','grip','compensator','extmag','suppressor','scope4'] },
  },
  crate: { // صناديق عسكرية
    weapon:  { weight: 30, pool: ['ump','akm','m416','scar','sks','spas','kar98','m249'] },
    ammo:    { weight: 20, counts: { '556': [60,120], '762': [60,120], '45': [40,80], 'sniper': [10,20], '12g': [12,24], '9mm': [60,120] } },
    armor:   { weight: 22, pool: ['vest2','vest3','helm2','helm3','bag2','bag3'] },
    heal:    { weight: 20, pool: ['bandage','medkit','medkit','energy','grenade','smoke'] },
    attach:  { weight: 8,  pool: ['scope4','scope8','extmag','suppressor','grip'] },
  },
  airdrop: {
    weapon:  { weight: 45, pool: ['awm','groza','m249','minigun','spas'] },
    ammo:    { weight: 15, counts: { '556': [120,200], '762': [120,200], 'sniper': [20,30], '12g': [24,40] } },
    armor:   { weight: 25, pool: ['vest3','helm3','bag3'] },
    heal:    { weight: 15, pool: ['medkit','medkit','grenade','smoke'] },
  },
};

/* ============================= المتجر ============================= */
export const SHOP_SECTIONS = [
  { id:'featured', ar:'العروض',      icon:'🔥' },
  { id:'chars',    ar:'الشخصيات',    icon:'🧍' },
  { id:'skins',    ar:'الاسكنات',    icon:'✨' },
  { id:'weapons',  ar:'الأسلحة',     icon:'🔫' },
  { id:'vehicles', ar:'المركبات',    icon:'🚙' },
  { id:'bundles',  ar:'الحزم',       icon:'🎁' },
  { id:'crates',   ar:'الصناديق',    icon:'📦' },
  { id:'wheel',    ar:'عجلة الحظ',    icon:'🎡' },
];

export const WEAPON_SKINS = [
  { id:'ws_black',  ar:'الأحمر الدموي', w:'akm',  rarity:'rare',      price:1200, tint:'#8e2b2b', accent:'#ff5a5a' },
  { id:'ws_gold',   ar:'الذهبي الملكي', w:'m416', rarity:'legendary', price:6000, tint:'#c9a227', accent:'#ffe07a' },
  { id:'ws_neon',   ar:'النيون',        w:'ump',  rarity:'epic',      price:2600, tint:'#12202a', accent:'#22e0d0' },
  { id:'ws_dragon', ar:'زفير التنين',   w:'akm',  rarity:'legendary', price:6500, tint:'#7a2b12', accent:'#ff9a3d' },
  { id:'ws_ice',    ar:'الصقيع',        w:'kar98',rarity:'epic',      price:3000, tint:'#9fd3f0', accent:'#e8f7ff' },
  { id:'ws_void',   ar:'الفراغ',        w:'groza',rarity:'mythic',    gems:700,   tint:'#160d24', accent:'#c74bff' },
  { id:'ws_ork',    ar:'ختم الملك',     w:'awm',  rarity:'mythic',    gems:900,   tint:'#3a2408', accent:'#ffc63d' },
];

export const VEHICLE_SKINS = [
  { id:'vs_camo',  ar:'تمويه عسكري', v:'jeep', rarity:'rare',      price:1400, tint:'#4d5a33', accent:'#7d8a5a' },
  { id:'vs_flame', ar:'شعلة',        v:'bike', rarity:'epic',      price:2600, tint:'#8e2b12', accent:'#ff9a3d' },
  { id:'vs_gold',  ar:'ذهبي',        v:'jeep', rarity:'legendary', price:5200, tint:'#c9a227', accent:'#ffe07a' },
  { id:'vs_ghost', ar:'الشبح',       v:'boat', rarity:'legendary', price:5400, tint:'#dfe8f2', accent:'#8fe8ff' },
];

export const PARACHUTES = [
  { id:'pc_basic', ar:'مظلة الأساس',  rarity:'common',    price:0,    colors:['#e0e0e0','#8fa3b8'] },
  { id:'pc_red',   ar:'مظلة الحمراء', rarity:'rare',      price:900,  colors:['#e04b4b','#7a1f1f'] },
  { id:'pc_gold',  ar:'مظلة الذهبية', rarity:'legendary', price:4200, colors:['#ffd75a','#a8791a'] },
  { id:'pc_dragon',ar:'أجنحة التنين', rarity:'mythic',    gems:600,   colors:['#ff7a2e','#3a1204'] },
];

export const EMOTES = [
  { id:'em_wave',   ar:'تحية',        rarity:'common',    price:300,  icon:'👋' },
  { id:'em_dance',  ar:'رقصة النصر',  rarity:'rare',      price:1200, icon:'🕺' },
  { id:'em_laugh',  ar:'ضحكة',        rarity:'rare',      price:1000, icon:'😂' },
  { id:'em_taunt',  ar:'استفزاز',     rarity:'epic',      price:2200, icon:'😈' },
  { id:'em_crown',  ar:'تاج الملك',   rarity:'mythic',    gems:800,   icon:'👑' },
];

export const BUNDLES = [
  { id:'bnd_starter', ar:'حزمة المبتدئ',   rarity:'rare',      price:4000, gems:0,   items:['out_forest','out_desert','em_wave'],      bonusGold:1000, desc:'زيان + رقصة + ١٠٠٠ ذهب' },
  { id:'bnd_warrior', ar:'حزمة المحارب',   rarity:'epic',      price:9000, gems:0,   items:['out_urban','ws_black','em_dance'],        bonusGold:1500, desc:'زي مقاتل مدن + سكن AKM الأحمر + رقصة' },
  { id:'bnd_elite',   ar:'حزمة النخبة',    rarity:'legendary', price:0,    gems:260, items:['out_neon','ws_neon','pc_red','em_laugh'], bonusGold:3000, desc:'نيون + سكن سلاح + مظلة حمراء + ٣٠٠٠ ذهب' },
  { id:'bnd_king',    ar:'حزمة الملك',     rarity:'mythic',    price:0,    gems:680, items:['out_gold','ws_gold','em_crown','pc_gold'],bonusGold:6000, desc:'الزي الذهبي + سكن ذهبي + تاج الملك + مظلة ذهبية' },
];

export const CRATES = [
  { id:'crate_bronze', ar:'صندوق برونزي', rarity:'rare',      price:1500, gems:0,  pool:['out_forest','out_desert','out_snow','em_dance','ws_black','pc_red'], odds:{rare:60,epic:30,legendary:9,mythic:1} },
  { id:'crate_gold',   ar:'صندوق ذهبي',   rarity:'epic',      price:0, gems:120,  pool:['out_gold','out_flame','ws_gold','pc_gold','em_taunt','out_shadow'], odds:{rare:35,epic:45,legendary:17,mythic:3} },
  { id:'crate_myth',   ar:'صندوق أورك',   rarity:'mythic',    price:0, gems:420,  pool:['out_void','out_orkking','ws_void','ws_ork','pc_dragon','em_crown'], odds:{epic:45,legendary:42,mythic:13} },
];

export const WHEEL = {
  price: 120, currency: 'gems',
  slots: [
    { id:'w_gold500',  ar:'٥٠٠ ذهب',      weight:22, kind:'gold',   value:500 },
    { id:'w_xp300',    ar:'٣٠٠ خبرة',      weight:20, kind:'xp',     value:300 },
    { id:'w_gold1500', ar:'١٥٠٠ ذهب',     weight:14, kind:'gold',   value:1500 },
    { id:'w_skin',     ar:'سكن نادر',      weight:16, kind:'skin',   value:'out_urban' },
    { id:'w_gems60',   ar:'٦٠ جوهرة',      weight:12, kind:'gems',   value:60 },
    { id:'w_char',     ar:'شخصية ملحمية',  weight:8,  kind:'char',   value:'shadi' },
    { id:'w_ws',       ar:'سكن سلاح أسطوري',weight:5, kind:'wskin',  value:'ws_gold' },
    { id:'w_char_l',   ar:'شخصية أسطورية', weight:2,  kind:'char',   value:'tannin' },
    { id:'w_jackpot',  ar:'الجاكبوت! ١٠٠ جوهرة + اسكن خرافي', weight:1, kind:'jackpot', value:0 },
  ],
};

/* ============================= باس المعركة ============================= */
export const BATTLEPASS = {
  seasonAr: 'الموسم الأول: صعود الملوك',
  seasonEn: 'Season 1: Rise of Kings',
  tiers: 50,
  xpPerTier: 800,
  premiumPrice: 320, // جواهر
  free:    { 1:{kind:'gold',value:300}, 3:{kind:'bandage'}, 5:{kind:'gold',value:600}, 8:{kind:'emote',value:'em_laugh'}, 12:{kind:'gold',value:900}, 16:{kind:'skin',value:'out_urban'}, 20:{kind:'gold',value:1500}, 25:{kind:'skin',value:'out_snow'}, 30:{kind:'gold',value:2000}, 35:{kind:'wskin',value:'ws_black'}, 40:{kind:'gold',value:2500}, 45:{kind:'skin',value:'out_shadow'}, 50:{kind:'char',value:'yaser'} },
  premium: { 1:{kind:'skin',value:'out_desert'}, 2:{kind:'wskin',value:'ws_neon'}, 4:{kind:'gold',value:800}, 6:{kind:'emote',value:'em_dance'}, 10:{kind:'skin',value:'out_neon'}, 14:{kind:'gold',value:1500}, 18:{kind:'wskin',value:'ws_ice'}, 22:{kind:'skin',value:'out_blood'}, 26:{kind:'gold',value:2000}, 30:{kind:'skin',value:'out_flame'}, 34:{kind:'wskin',value:'ws_dragon'}, 38:{kind:'skin',value:'out_storm'}, 42:{kind:'gold',value:3000}, 46:{kind:'skin',value:'out_gold'}, 50:{kind:'char',value:'orkking'} },
};

/* ============================= المهام ============================= */
export const MISSIONS = [
  { id:'daily_play1',  type:'daily',  ar:'العب مباراة واحدة',        goal:1,   reward:{gold:200, xp:100, bp:60} },
  { id:'daily_kill3',  type:'daily',  ar:'احصل على ٣ إقصاءات',        goal:3,   reward:{gold:350, xp:180, bp:90} },
  { id:'daily_dmg500', type:'daily',  ar:'سبب ٥٠٠ ضرر',              goal:500, reward:{gold:300, xp:160, bp:80} },
  { id:'daily_top10',  type:'daily',  ar:'أكمل ضمن أفضل ١٠',         goal:1,   reward:{gold:400, xp:200, bp:100} },
  { id:'daily_win',    type:'daily',  ar:'فز بمباراة (بويـه!)',       goal:1,   reward:{gold:800, xp:420, bp:200, gems:15} },
  { id:'weekly_kill25',type:'weekly', ar:'٢٥ إقصاء هذا الأسبوع',      goal:25,  reward:{gold:2200, xp:1200, bp:500, gems:40} },
  { id:'weekly_win5',  type:'weekly', ar:'٥ انتصارات هذا الأسبوع',    goal:5,   reward:{gold:4000, xp:2000, bp:800, gems:80} },
  { id:'weekly_dmg8k', type:'weekly', ar:'٨٠٠٠ ضرر هذا الأسبوع',      goal:8000,reward:{gold:3000, xp:1600, bp:650, gems:60} },
  { id:'weekly_revive',type:'weekly', ar:'أنعش ٣ من زملائك',          goal:3,   reward:{gold:1800, xp:900, bp:400} },
  { id:'ach_headshot', type:'achv',   ar:'إنجاز: ١٠٠ إصابة رأس',      goal:100, reward:{gold:5000, gems:120, bp:900} },
  { id:'ach_chicken',  type:'achv',   ar:'إنجاز: ١٠ انتصارات',        goal:10,  reward:{gold:6000, gems:150, bp:1000} },
  { id:'ach_100games', type:'achv',   ar:'إنجاز: ١٠٠ مباراة',         goal:100, reward:{gold:8000, gems:200, bp:1200} },
];

/* ============================= أنماط اللعب ============================= */
export const MODES = [
  { id:'solo',  ar:'فردي',    players:1, icon:'👤', teams:true,  desc:'أنت وحدك ضد ٤٩ لاعباً.' },
  { id:'duo',   ar:'ثنائي',   players:2, icon:'👥', teams:true,  desc:'زميل واحد معك، التعاون هو المفتاح.' },
  { id:'squad', ar:'رباعي',   players:4, icon:'👨‍👨‍👦', teams:true,  desc:'فريق من ٤ مقاتلين.' },
  { id:'tdm',   ar:'معركة الفريق', players:0, icon:'⚔️', teams:true, desc:'٤ ضد ٤ — أول فريق يحقق ٣٠ إقصاء.' },
];

export const LEVEL_XP = (lvl) => 500 + lvl * 250;
export const REWARD = {
  perKill: 35, perAssist: 12, perDamage100: 8, place1: 900, top3: 420, top10: 220,
  base: 120, xpKill: 55, xpDamage100: 12, xpBase: 90, gemsWin: 25, gemsTop3: 8,
  perHeadshot: 15,
};

export default { GAME, RARITY, RARITY_ORDER, BUNDLES, AMMO, WEAPONS, GUN_IDS, AIRDROP_WEAPONS, ATTACHMENTS, ARMORS, HEALS, CHARACTERS, SKINS, VEHICLES, MAPS, MAP_BY_ID, BIOMES, ZONE_PHASES, LOOT_TABLE, SHOP_SECTIONS, WEAPON_SKINS, VEHICLE_SKINS, PARACHUTES, EMOTES, CRATES, WHEEL, BATTLEPASS, MISSIONS, MODES, LEVEL_XP, REWARD };
