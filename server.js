/* =====================================================================
   تطبيق تبادل مستلزمات المساجد — مديرية أوقاف دمشق
   سيرفر خلفي كامل بلا أي مكتبات خارجية (Node.js المدمج فقط)
   التشغيل:  node server.js   ثم افتح http://localhost:3000
   ===================================================================== */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;           // يمكن توجيهه لقرص دائم عند الاستضافة
const DB_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const PROD = true;
const SECRET = process.env.SECRET || 'awqaf-dimashq-demo-secret-change-in-production';
if (PROD && SECRET.includes('demo-secret'))
  console.warn('[تحذير] عيّن متغير البيئة SECRET بقيمة سرية قوية في الإنتاج.');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- قاعدة البيانات (ملف JSON) ---------- */
function seed() {
  const mosques = [
    { id: 1, name: 'الجامع الأموي', area: 'دمشق القديمة' },
    { id: 2, name: 'جامع الإيمان', area: 'الميدان' },
    { id: 3, name: 'جامع بدر', area: 'المزة' },
    { id: 4, name: 'جامع التوحيد', area: 'كفرسوسة' },
    { id: 5, name: 'جامع الرحمن', area: 'ركن الدين' },
    { id: 6, name: 'جامع النور', area: 'القصاع' },
  ];
  const users = [
    { id: 1, fullName: 'الشيخ أحمد', phone: '0911000001', email: 'ahmad@awqaf-damas.gov.sy', role: 'imam', mosqueId: 2 },
    { id: 2, fullName: 'الشيخ محمود', phone: '0911000002', email: 'mahmoud@awqaf-damas.gov.sy', role: 'imam', mosqueId: 1 },
    { id: 3, fullName: 'الشيخ خالد', phone: '0911000003', email: 'khaled@awqaf-damas.gov.sy', role: 'imam', mosqueId: 3 },
    { id: 4, fullName: 'الشيخ عمر', phone: '0911000004', email: 'omar@awqaf-damas.gov.sy', role: 'imam', mosqueId: 4 },
    { id: 10, fullName: 'أ. سامر — دائرة شؤون المساجد', phone: '0922000000', email: 'ministry@awqaf-damas.gov.sy', role: 'ministry', mosqueId: null },
    { id: 20, fullName: 'المدير العام', phone: '0933000000', email: 'manager@awqaf-damas.gov.sy', role: 'manager', mosqueId: null },
  ];
  const now = Date.now();
  const D = 86400000;
  const items = [
    { id: 1, name: 'مكيّف سبليت 2 طن', category: 'تكييف وتدفئة', quantity: '2', description: 'مكيّف بحالة جيدة، فائض عن حاجة المسجد بعد التوسعة.', photo: '', sourceMosqueId: 1, status: 'available', requesterMosqueId: null, decisionNote: '', createdAt: now - 3 * D, decidedAt: null },
    { id: 2, name: 'سجاد مصلّى (40م)', category: 'فرش وسجاد', quantity: '40م²', description: 'سجاد أخضر نظيف، تم استبداله بسجاد جديد.', photo: '', sourceMosqueId: 3, status: 'available', requesterMosqueId: null, decisionNote: '', createdAt: now - D, decidedAt: null },
    { id: 3, name: 'كراسي بلاستيك لكبار السن', category: 'أثاث', quantity: '25', description: 'عدد 25 كرسي، فائضة.', photo: '', sourceMosqueId: 4, status: 'available', requesterMosqueId: null, decisionNote: '', createdAt: now - 5 * D, decidedAt: null },
    { id: 4, name: 'خزانة مصاحف خشبية', category: 'أثاث', quantity: '1', description: 'خزانة كبيرة لحفظ المصاحف، تحتاج تنظيفاً بسيطاً.', photo: '', sourceMosqueId: 5, status: 'available', requesterMosqueId: null, decisionNote: '', createdAt: now - 7 * D, decidedAt: null },
    { id: 5, name: 'مدفأة مازوت كبيرة', category: 'تكييف وتدفئة', quantity: '3', description: 'مدافئ فائضة عن الحاجة.', photo: '', sourceMosqueId: 1, status: 'delivered', requesterMosqueId: 4, decisionNote: 'تم التسليم بنجاح.', createdAt: now - 12 * D, decidedAt: now - 9 * D },
  ];
  return { mosques, users, items, seq: { item: 100 } };
}

let db;
function loadDB() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { db = seed(); saveDB(); }
}
let saveTimer = null;
function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)), 50);
}
loadDB();

/* ---------- مساعدات ---------- */
const mosqueName = id => (db.mosques.find(m => m.id === id) || {}).name || '';
// البحث عن المستخدم بالبريد الإلكتروني أو رقم الجوال
function findUser(idf) {
  idf = String(idf || '').trim().toLowerCase();
  if (!idf) return null;
  return db.users.find(u => u.phone === idf || (u.email || '').toLowerCase() === idf) || null;
}
function publicItem(it) {
  return { ...it,
    sourceMosque: { id: it.sourceMosqueId, name: mosqueName(it.sourceMosqueId) },
    requesterMosque: it.requesterMosqueId ? { id: it.requesterMosqueId, name: mosqueName(it.requesterMosqueId) } : null };
}

/* ---------- مصادقة بسيطة (رمز موقّع HMAC) ---------- */
const otpStore = {}; // phone -> code
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token) {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac !== expected) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const p = verify(h.replace(/^Bearer\s+/i, ''));
  if (!p) return null;
  return db.users.find(u => u.id === p.uid) || null;
}

/* ---------- أدوات الاستجابة ---------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 9e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

/* ---------- حفظ الصورة من dataURL ---------- */
function savePhoto(dataUrl, id) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return '';
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return '';
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `item_${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64'));
  return '/uploads/' + file;
}

/* ===================== المسارات (API) ===================== */
async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const p = seg.slice(1); // drop 'api'
  const method = req.method;

  /* --- المصادقة --- */
  if (p[0] === 'auth' && p[1] === 'request-otp' && method === 'POST') {
    const body = await readBody(req);
    const idf = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
    const user = findUser(idf);
    if (!user) return send(res, 404, { error: 'البريد أو رقم الجوال غير مسجّل لدى المديرية' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore[idf] = code;
    // console.log(`OTP لـ ${idf}: ${code}`); // تم إيقاف طباعة الرمز للأمان في وضع الإنتاج
    console.log(`[أمن] تم توليد رمز تحقق للحساب: ${idf}`);
    const out = { message: 'تم إرسال رمز التحقق' };
    if (!PROD) out.dev_code = code;
    return send(res, 200, out);
  }
  if (p[0] === 'auth' && p[1] === 'verify-otp' && method === 'POST') {
    const body = await readBody(req);
    const idf = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
    const code = body.code;
    if (!otpStore[idf] || otpStore[idf] !== String(code))
      return send(res, 401, { error: 'رمز التحقق غير صحيح' });
    delete otpStore[idf];
    const user = findUser(idf);
    const token = sign({ uid: user.id, role: user.role, exp: Date.now() + 30 * 86400000 });
    return send(res, 200, { token, user: { ...user, mosque: user.mosqueId ? mosqueName(user.mosqueId) : null } });
  }

  /* كل ما يلي يتطلب تسجيل دخول (إلا بعض الاستثناءات العامة للضيوف) */
  const me = authUser(req);

  // السماح للضيوف بتصفح المساجد المتاحة
  if (p[0] === 'mosques' && method === 'GET')
    return send(res, 200, { data: db.mosques });

  // السماح للضيوف بتصفح الأغراض المتاحة
  if (p[0] === 'items' && p.length === 1 && method === 'GET' && url.searchParams.get('scope') === 'browse') {
    let list = db.items.slice().sort((a, b) => b.createdAt - a.createdAt);
    list = list.filter(i => i.status === 'available');
    if (me && me.mosqueId) {
      list = list.filter(i => i.sourceMosqueId !== me.mosqueId);
    }
    return send(res, 200, { data: list.map(publicItem) });
  }

  // بقية العمليات تتطلب تسجيل دخول حتماً
  if (!me) return send(res, 401, { error: 'يجب تسجيل الدخول' });

  if (p[0] === 'me' && method === 'GET')
    return send(res, 200, { ...me, mosque: me.mosqueId ? mosqueName(me.mosqueId) : null });

  /* --- إدارة الحسابات (إضافة وعرض) --- */
  if (p[0] === 'users' && method === 'GET') {
    if (me.role !== 'ministry' && me.role !== 'manager')
      return send(res, 403, { error: 'صلاحية غير كافية' });
    const mapped = db.users.map(u => ({
      ...u,
      mosqueName: u.mosqueId ? mosqueName(u.mosqueId) : null
    }));
    return send(res, 200, { data: mapped });
  }

  if (p[0] === 'users' && method === 'POST') {
    if (me.role !== 'ministry' && me.role !== 'manager')
      return send(res, 403, { error: 'صلاحية غير كافية' });
    const b = await readBody(req);
    const fullName = String(b.fullName || '').trim();
    const phone = String(b.phone || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const role = String(b.role || '').trim();
    const mosqueId = b.mosqueId;
    const newMosque = b.newMosque;

    if (!fullName || !phone || !email || !role)
      return send(res, 400, { error: 'بيانات الحساب ناقصة' });

    if (role === 'ministry' && me.role !== 'manager')
      return send(res, 403, { error: 'المدير العام فقط يمكنه إضافة موظفي الوزارة' });

    if (role !== 'imam' && role !== 'ministry')
      return send(res, 400, { error: 'دور غير صالح' });

    const exists = db.users.some(u => u.phone === phone || u.email.toLowerCase() === email);
    if (exists)
      return send(res, 400, { error: 'رقم الجوال أو البريد الإلكتروني مسجّل بالفعل لكائن آخر' });

    let finalMosqueId = null;
    if (role === 'imam') {
      if (newMosque && newMosque.name && newMosque.area) {
        const mId = Math.max(0, ...db.mosques.map(m => m.id)) + 1;
        db.mosques.push({ id: mId, name: newMosque.name, area: newMosque.area });
        finalMosqueId = mId;
      } else if (mosqueId) {
        finalMosqueId = Number(mosqueId);
        if (!db.mosques.some(m => m.id === finalMosqueId))
          return send(res, 400, { error: 'المسجد المحدد غير موجود' });
      } else {
        return send(res, 400, { error: 'يجب ربط الحساب بمسجد قائم أو إضافة مسجد جديد' });
      }
    }

    const uId = Math.max(0, ...db.users.map(u => u.id)) + 1;
    const newUser = { id: uId, fullName, phone, email, role, mosqueId: finalMosqueId };
    db.users.push(newUser);
    saveDB();
    return send(res, 201, newUser);
  }

  /* --- الأغراض --- */
  if (p[0] === 'items' && p.length === 1 && method === 'GET') {
    const scope = url.searchParams.get('scope');
    let list = db.items.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (scope === 'browse')
      list = list.filter(i => i.status === 'available' && i.sourceMosqueId !== me.mosqueId);
    else if (scope === 'mine')
      list = list.filter(i => i.sourceMosqueId === me.mosqueId);
    else if (scope === 'myrequests')
      list = list.filter(i => i.requesterMosqueId === me.mosqueId);
    return send(res, 200, { data: list.map(publicItem) });
  }

  if (p[0] === 'items' && p.length === 1 && method === 'POST') {
    if (me.role !== 'imam') return send(res, 403, { error: 'مخصّص لقيّم المسجد' });
    const b = await readBody(req);
    if (!b.name || !b.category) return send(res, 400, { error: 'بيانات ناقصة' });
    const id = ++db.seq.item;
    const photo = savePhoto(b.photo, id);
    const it = { id, name: b.name, category: b.category, quantity: b.quantity || '1',
      description: b.description || 'غرض فائض عن حاجة المسجد.', photo,
      sourceMosqueId: me.mosqueId, status: 'available', requesterMosqueId: null,
      decisionNote: '', createdAt: Date.now(), decidedAt: null };
    db.items.unshift(it); saveDB();
    return send(res, 201, publicItem(it));
  }

  // مسارات على غرض محدد: items/:id(/action)
  if (p[0] === 'items' && p[1]) {
    const it = db.items.find(i => i.id === Number(p[1]));
    if (!it) return send(res, 404, { error: 'الغرض غير موجود' });

    if (p.length === 2 && method === 'DELETE') {
      if (me.role !== 'imam' || it.sourceMosqueId !== me.mosqueId)
        return send(res, 403, { error: 'يحق للمالك فقط' });
      db.items = db.items.filter(i => i.id !== it.id); saveDB();
      return send(res, 200, { ok: true });
    }
    if (p[2] === 'request' && method === 'POST') {
      if (me.role !== 'imam') return send(res, 403, { error: 'مخصّص لقيّم المسجد' });
      if (it.sourceMosqueId === me.mosqueId) return send(res, 409, { error: 'لا يمكن طلب غرض مسجدك' });
      if (it.status !== 'available') return send(res, 409, { error: 'الغرض غير متاح' });
      it.status = 'pending'; it.requesterMosqueId = me.mosqueId; it.createdAt = Date.now(); saveDB();
      return send(res, 201, publicItem(it));
    }
    if (p[2] === 'deliver' && method === 'POST') {
      if (me.role !== 'imam' || it.sourceMosqueId !== me.mosqueId)
        return send(res, 403, { error: 'يؤكّدها المسجد المصدر فقط' });
      if (it.status !== 'approved') return send(res, 409, { error: 'لا يمكن التسليم قبل موافقة الوزارة' });
      it.status = 'delivered'; it.decisionNote = 'تم التسليم والاستلام بنجاح.'; it.decidedAt = Date.now(); saveDB();
      return send(res, 200, publicItem(it));
    }
  }

  /* --- الطلبات والموافقات (الوزارة) --- */
  if (p[0] === 'requests' && p.length === 1 && method === 'GET') {
    if (me.role !== 'ministry' && me.role !== 'manager')
      return send(res, 403, { error: 'مخصّص للوزارة' });
    const status = url.searchParams.get('status');
    let list = db.items.filter(i => i.requesterMosqueId); // عمليات لها طالب
    if (status) list = list.filter(i => i.status === status);
    list.sort((a, b) => (b.decidedAt || b.createdAt) - (a.decidedAt || a.createdAt));
    return send(res, 200, { data: list.map(publicItem) });
  }
  if (p[0] === 'requests' && p[1] && (p[2] === 'approve' || p[2] === 'reject') && method === 'POST') {
    if (me.role !== 'ministry') return send(res, 403, { error: 'الاعتماد من صلاحية موظف الوزارة فقط' });
    const it = db.items.find(i => i.id === Number(p[1]));
    if (!it) return send(res, 404, { error: 'العملية غير موجودة' });
    if (it.status !== 'pending') return send(res, 409, { error: 'العملية ليست بانتظار الموافقة' });
    const { note } = await readBody(req);
    if (p[2] === 'approve') {
      it.status = 'approved';
      it.decisionNote = note || 'تمت الموافقة من الوزارة. يُرجى التنسيق بين المسجدين للتسليم خلال أسبوع.';
    } else {
      it.status = 'available';
      it.requesterMosqueId = null;
      it.decisionNote = '';
    }
    it.decidedAt = Date.now(); saveDB();
    return send(res, 200, publicItem(it));
  }

  /* --- إحصاءات المدير --- */
  if (p[0] === 'stats' && p[1] === 'overview' && method === 'GET') {
    if (me.role !== 'manager') return send(res, 403, { error: 'مخصّص للمدير العام' });
    const c = s => db.items.filter(i => i.status === s).length;
    const cats = {};
    db.items.forEach(i => cats[i.category] = (cats[i.category] || 0) + 1);
    return send(res, 200, {
      total: db.items.length, available: c('available'), pending: c('pending'),
      approved: c('approved'), delivered: c('delivered'), mosques: db.mosques.length,
      categories: cats,
      perMosque: db.mosques.map(m => ({
        name: m.name,
        given: db.items.filter(i => i.sourceMosqueId === m.id).length,
        received: db.items.filter(i => i.requesterMosqueId === m.id).length,
      })),
    });
  }

  return send(res, 404, { error: 'مسار غير معروف' });
}

/* ===================== ملفات ثابتة ===================== */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serveStatic(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ===================== الخادم ===================== */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/'))
      return serveStatic(res, path.join(UPLOAD_DIR, path.basename(decodeURIComponent(url.pathname))));
    if (url.pathname === '/' || url.pathname === '/index.html')
      return serveStatic(res, path.join(ROOT, 'public', 'index.html'));
    return serveStatic(res, path.join(ROOT, 'public', path.basename(decodeURIComponent(url.pathname))));
  } catch (e) {
    console.error(e); send(res, 500, { error: 'خطأ في الخادم' });
  }
}).listen(PORT, () => {
  console.log('=================================================');
  console.log('  تطبيق أوقاف دمشق — السيرفر يعمل');
  console.log('  افتح المتصفح على:  http://localhost:' + PORT);
  console.log('=================================================');
});
