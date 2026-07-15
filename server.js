/* =====================================================================
   تطبيق تبادل مستلزمات المساجد — مديرية أوقاف دمشق
   سيرفر خلفي كامل مع إرسال OTP بالبريد عبر Google Apps Script أو Gmail SMTP
   التشغيل:  npm install && npm start   ثم افتح http://localhost:3000
   ===================================================================== */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;           // يمكن توجيهه لقرص دائم عند الاستضافة
const DB_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const PROD = process.env.NODE_ENV === 'production';
const CONFIGURED_SECRET = String(process.env.SECRET || '').trim();
const SECRET = CONFIGURED_SECRET || crypto.randomBytes(32).toString('hex');
if (PROD && !CONFIGURED_SECRET)
  console.warn('[تحذير] SECRET غير مضبوط؛ استُخدم سر مؤقت آمن وستنتهي الجلسات عند إعادة التشغيل.');

const GMAIL_USER = String(process.env.GMAIL_USER || '').trim().toLowerCase();
const GMAIL_APP_PASSWORD = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const GMAIL_APPS_SCRIPT_URL = String(process.env.GMAIL_APPS_SCRIPT_URL || '').trim();
const GMAIL_WEBHOOK_SECRET = String(process.env.GMAIL_WEBHOOK_SECRET || '').trim();
const MAIL_FROM_NAME = String(process.env.MAIL_FROM_NAME || 'مديرية أوقاف دمشق').trim();
const TEST_MAIL_TRANSPORT = !PROD && process.env.MAIL_TRANSPORT === 'json';
const APPS_SCRIPT_CONFIGURED = Boolean(GMAIL_APPS_SCRIPT_URL && GMAIL_WEBHOOK_SECRET.length >= 32);
const SMTP_CONFIGURED = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
const MAIL_CONFIGURED = TEST_MAIL_TRANSPORT || APPS_SCRIPT_CONFIGURED || SMTP_CONFIGURED;
const ENABLE_DEMO_LOGIN = /^(1|true|yes)$/i.test(String(process.env.ENABLE_DEMO_LOGIN || 'true'));
const BOOTSTRAP_MANAGER_EMAIL = String(process.env.BOOTSTRAP_MANAGER_EMAIL || '').trim().toLowerCase();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const AUTH_TOKEN_VERSION = 2;

if (!MAIL_CONFIGURED) {
  console.warn('[البريد] خدمة الإرسال غير مضبوطة؛ الحسابات غير التجريبية لن تستقبل رمز الدخول.');
} else if (APPS_SCRIPT_CONFIGURED) {
  console.log('[البريد] طريقة الإرسال: Google Apps Script عبر HTTPS.');
} else if (SMTP_CONFIGURED) {
  console.log('[البريد] طريقة الإرسال: Gmail SMTP.');
}
if (Boolean(GMAIL_APPS_SCRIPT_URL) !== Boolean(GMAIL_WEBHOOK_SECRET))
  console.warn('[البريد] إعداد Apps Script غير مكتمل؛ يلزم الرابط والمفتاح السري معاً.');
else if (GMAIL_WEBHOOK_SECRET && GMAIL_WEBHOOK_SECRET.length < 32)
  console.warn('[البريد] GMAIL_WEBHOOK_SECRET قصير؛ استخدم 32 محرفاً على الأقل.');

// ================================================================
// جلسات تجريبية منفصلة عن الحسابات الحقيقية ولا تحتاج إلى OTP.
// عطّلها في أي استخدام حقيقي بوضع ENABLE_DEMO_LOGIN=false في Render.
// ================================================================
const DEMO_USERS = Object.freeze({
  imam: Object.freeze({
    id: 'demo-imam',
    fullName: 'قيّم مسجد — حساب تجريبي',
    phone: '0000000001',
    email: 'demo-imam@awqaf-damas.example',
    role: 'imam',
    mosqueId: 2,
    isDemo: true,
  }),
  ministry: Object.freeze({
    id: 'demo-ministry',
    fullName: 'موظف الوزارة — حساب تجريبي',
    phone: '0000000002',
    email: 'demo-ministry@awqaf-damas.example',
    role: 'ministry',
    mosqueId: null,
    isDemo: true,
  }),
  manager: Object.freeze({
    id: 'demo-manager',
    fullName: 'المدير العام — حساب تجريبي',
    phone: '0000000003',
    email: 'demo-manager@awqaf-damas.example',
    role: 'manager',
    mosqueId: null,
    isDemo: true,
  }),
});
const demoCreatedUsers = [];
let demoCreatedUserSeq = 1;

if (PROD && ENABLE_DEMO_LOGIN)
  console.warn('[تجريبي] الدخول المباشر للأدوار الثلاثة مفعّل. عطّله قبل استخدام النظام ببيانات حقيقية.');

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
    { id: 20, fullName: 'المدير العام', phone: '0933000000', email: BOOTSTRAP_MANAGER_EMAIL || 'manager@awqaf-damas.gov.sy', role: 'manager', mosqueId: null },
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

// يتيح ضبط بريد المدير التجريبي من Render دون نشره داخل GitHub.
// يُطبّق أيضاً إن كان ملف البيانات قد أُنشئ قبل إضافة المتغير.
if (BOOTSTRAP_MANAGER_EMAIL) {
  const manager = db.users.find(u => u.role === 'manager');
  const emailOwner = db.users.find(u => (u.email || '').toLowerCase() === BOOTSTRAP_MANAGER_EMAIL);
  if (manager && (!emailOwner || emailOwner.id === manager.id) && manager.email !== BOOTSTRAP_MANAGER_EMAIL) {
    manager.email = BOOTSTRAP_MANAGER_EMAIL;
    saveDB();
  }
}

/* ---------- مساعدات ---------- */
const mosqueName = id => (db.mosques.find(m => m.id === id) || {}).name || '';
// البحث عن المستخدم بالبريد الإلكتروني أو رقم الجوال
function findUser(idf) {
  idf = String(idf || '').trim().toLowerCase();
  if (!idf) return null;
  return db.users.find(u => u.phone === idf || (u.email || '').toLowerCase() === idf) || null;
}
function demoUser(role) {
  const profile = DEMO_USERS[String(role || '').trim().toLowerCase()];
  return profile ? { ...profile } : null;
}
function sessionUser(user, isDemo = false) {
  return {
    ...user,
    mosque: user.mosqueId ? mosqueName(user.mosqueId) : null,
    demo: Boolean(isDemo),
  };
}
function publicItem(it) {
  return { ...it,
    sourceMosque: { id: it.sourceMosqueId, name: mosqueName(it.sourceMosqueId) },
    requesterMosque: it.requesterMosqueId ? { id: it.requesterMosqueId, name: mosqueName(it.requesterMosqueId) } : null };
}

/* ---------- مصادقة بسيطة (OTP بالبريد + رمز جلسة موقّع HMAC) ---------- */
const otpStore = new Map(); // user id -> { digest, expiresAt, attempts, sentAt }
let testMailTransport = null;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'بريدك الإلكتروني المسجّل';
  const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}
async function resolveGmailIpv4() {
  let addresses = [];
  try {
    addresses = await dns.promises.resolve4('smtp.gmail.com');
  } catch (_err) {
    const fallback = await dns.promises.lookup('smtp.gmail.com', { family: 4, all: true });
    addresses = fallback.map(entry => entry.address);
  }
  addresses = addresses.filter(address => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address));
  if (!addresses.length) throw new Error('GMAIL_IPV4_NOT_FOUND');
  return addresses[crypto.randomInt(0, addresses.length)];
}
async function getMailTransport() {
  if (TEST_MAIL_TRANSPORT) {
    if (!testMailTransport) testMailTransport = nodemailer.createTransport({ jsonTransport: true });
    return testMailTransport;
  }
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    const gmailIpv4 = await resolveGmailIpv4();
    return nodemailer.createTransport({
      host: gmailIpv4,
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      tls: { servername: 'smtp.gmail.com', minVersion: 'TLSv1.2' },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return null;
}
function appsScriptSignature(timestamp, nonce, recipient, code) {
  const message = [timestamp, nonce, recipient, code].join('\n');
  return crypto.createHmac('sha256', GMAIL_WEBHOOK_SECRET).update(message).digest('hex');
}
async function sendViaAppsScript(user, code) {
  let endpoint;
  try {
    endpoint = new URL(GMAIL_APPS_SCRIPT_URL);
  } catch (_err) {
    throw new Error('INVALID_APPS_SCRIPT_URL');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || (PROD && endpoint.protocol !== 'https:'))
    throw new Error('INVALID_APPS_SCRIPT_URL');

  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    to: user.email,
    fullName: user.fullName || '',
    code,
    timestamp,
    nonce,
    signature: appsScriptSignature(timestamp, nonce, user.email, code),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('APPS_SCRIPT_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let result = null;
  try { result = JSON.parse(raw); } catch (_err) { /* handled below */ }
  if (!response.ok) throw new Error(`APPS_SCRIPT_HTTP_${response.status}`);
  if (!result || result.ok !== true) {
    const codeName = String((result && result.error) || 'INVALID_RESPONSE')
      .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    throw new Error(`APPS_SCRIPT_${codeName || 'ERROR'}`);
  }
}
async function sendOtpEmail(user, code) {
  if (!isValidEmail(user.email)) throw new Error('INVALID_RECIPIENT_EMAIL');

  // عند ضبط Apps Script نستخدم HTTPS حصراً لتجنب حظر منافذ SMTP في الاستضافة.
  if (APPS_SCRIPT_CONFIGURED) return sendViaAppsScript(user, code);

  const transport = await getMailTransport();
  if (!transport) throw new Error('MAIL_NOT_CONFIGURED');

  await transport.sendMail({
    from: { name: MAIL_FROM_NAME, address: GMAIL_USER || 'test@awqaf.invalid' },
    to: user.email,
    subject: 'رمز التحقق — أوقاف دمشق',
    text: `مرحباً ${user.fullName || ''}\n\nرمز التحقق الخاص بك هو: ${code}\n\nينتهي الرمز خلال 10 دقائق ولا يجوز مشاركته مع أي شخص.`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#112a20">
      <h2 style="color:#0b6e4f">مديرية أوقاف دمشق</h2>
      <p>مرحباً ${escapeHtml(user.fullName)},</p>
      <p>رمز التحقق الخاص بك هو:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0b6e4f;margin:18px 0">${code}</div>
      <p>ينتهي الرمز خلال 10 دقائق ولا يجوز مشاركته مع أي شخص.</p>
      <p style="color:#6b7c75;font-size:13px">إذا لم تطلب هذا الرمز، فتجاهل الرسالة.</p>
    </div>`,
  });
}
function otpDigest(userId, code) {
  return crypto.createHmac('sha256', SECRET).update(`${userId}:${code}`).digest();
}
function otpMatches(userId, code, digest) {
  const candidate = otpDigest(userId, code);
  return Buffer.isBuffer(digest) && digest.length === candidate.length && crypto.timingSafeEqual(digest, candidate);
}
function clearExpiredOtps() {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (entry.expiresAt <= now) otpStore.delete(key);
  }
}

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
function authSession(req) {
  const h = req.headers['authorization'] || '';
  const p = verify(h.replace(/^Bearer\s+/i, ''));
  if (!p || p.v !== AUTH_TOKEN_VERSION) return null;
  if (p.demo === true) {
    if (!ENABLE_DEMO_LOGIN) return null;
    const user = demoUser(p.role);
    return user ? { user, isDemo: true } : null;
  }
  const user = db.users.find(u => u.id === p.uid) || null;
  return user ? { user, isDemo: false } : null;
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
  if (p[0] === 'auth' && p[1] === 'demo-login' && method === 'POST') {
    if (!ENABLE_DEMO_LOGIN)
      return send(res, 403, { error: 'الدخول التجريبي غير مفعّل' });

    const body = await readBody(req);
    const role = String(body.role || '').trim().toLowerCase();
    const user = demoUser(role);
    if (!user)
      return send(res, 400, { error: 'الدور التجريبي غير صالح' });

    const token = sign({ uid: user.id, role: user.role, demo: true, v: AUTH_TOKEN_VERSION, exp: Date.now() + 8 * 60 * 60 * 1000 });
    console.log(`[تجريبي] دخول مباشر بدور ${role}`);
    return send(res, 200, { token, user: sessionUser(user, true), demo: true });
  }

  if (p[0] === 'auth' && p[1] === 'request-otp' && method === 'POST') {
    const body = await readBody(req);
    const idf = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
    const user = findUser(idf);
    if (!user) return send(res, 404, { error: 'البريد أو رقم الجوال غير مسجّل لدى المديرية' });

    clearExpiredOtps();
    const key = String(user.id);
    const previous = otpStore.get(key);
    if (previous && Date.now() - previous.sentAt < OTP_RESEND_MS) {
      const retryAfter = Math.ceil((OTP_RESEND_MS - (Date.now() - previous.sentAt)) / 1000);
      return send(res, 429, { error: `انتظر ${retryAfter} ثانية قبل طلب رمز جديد`, retry_after: retryAfter });
    }

    const code = String(crypto.randomInt(100000, 1000000));

    if (!MAIL_CONFIGURED)
      return send(res, 503, { error: 'خدمة البريد غير مضبوطة بعد. راجع إدارة النظام.' });
    if (!isValidEmail(user.email))
      return send(res, 400, { error: 'لا يوجد بريد إلكتروني صالح مرتبط بهذا الحساب' });
    try {
      await sendOtpEmail(user, code);
      console.log(`[البريد] أُرسل رمز تحقق للمستخدم رقم ${user.id} إلى ${maskEmail(user.email)}`);
    } catch (e) {
      console.error(`[البريد] تعذر إرسال OTP للمستخدم رقم ${user.id}:`, e.message);
      return send(res, 503, { error: 'تعذر إرسال رمز التحقق عبر البريد. حاول لاحقاً.' });
    }

    otpStore.set(key, {
      digest: otpDigest(user.id, code),
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      sentAt: Date.now(),
    });

    const out = {
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      delivery_hint: maskEmail(user.email),
      expires_in: Math.floor(OTP_TTL_MS / 1000),
    };
    // يفيد الاختبارات المحلية فقط؛ Render مضبوط على NODE_ENV=production.
    if (!PROD) out.dev_code = code;
    return send(res, 200, out);
  }
  if (p[0] === 'auth' && p[1] === 'verify-otp' && method === 'POST') {
    const body = await readBody(req);
    const idf = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
    const user = findUser(idf);
    const code = String(body.code || '').trim();
    if (!user || !/^\d{6}$/.test(code))
      return send(res, 401, { error: 'رمز التحقق غير صحيح أو منتهي الصلاحية' });

    const key = String(user.id);
    const entry = otpStore.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      otpStore.delete(key);
      return send(res, 401, { error: 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.' });
    }
    if (!otpMatches(user.id, code, entry.digest)) {
      entry.attempts += 1;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        otpStore.delete(key);
        return send(res, 429, { error: 'تجاوزت عدد المحاولات. اطلب رمزاً جديداً.' });
      }
      return send(res, 401, { error: 'رمز التحقق غير صحيح' });
    }

    otpStore.delete(key);
    const token = sign({ uid: user.id, role: user.role, v: AUTH_TOKEN_VERSION, exp: Date.now() + 30 * 86400000 });
    return send(res, 200, { token, user: sessionUser(user, false) });
  }

  /* كل ما يلي يتطلب تسجيل دخول (إلا بعض الاستثناءات العامة للضيوف) */
  const auth = authSession(req);
  const me = auth && auth.user;
  const isDemoSession = Boolean(auth && auth.isDemo);

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
    return send(res, 200, sessionUser(me, isDemoSession));

  /* --- إدارة الحسابات (إضافة وعرض) --- */
  if (p[0] === 'users' && method === 'GET') {
    if (me.role !== 'ministry' && me.role !== 'manager')
      return send(res, 403, { error: 'صلاحية غير كافية' });

    let visibleUsers;
    if (isDemoSession) {
      const builtInDemoUsers = Object.values(DEMO_USERS).map(u => ({ ...u }));
      visibleUsers = [...builtInDemoUsers, ...demoCreatedUsers];
    } else {
      visibleUsers = db.users.filter(u => u.isDemo !== true);
    }
    if (me.role === 'ministry')
      visibleUsers = visibleUsers.filter(u => u.role === 'imam');

    const mapped = visibleUsers.map(u => ({
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

    const allowedRoles = me.role === 'manager' ? new Set(['imam', 'ministry']) : new Set(['imam']);
    if (!allowedRoles.has(role))
      return send(res, 403, {
        error: me.role === 'manager'
          ? 'يمكن للمدير إنشاء حساب قيم مسجد أو موظف وزارة فقط'
          : 'موظف الوزارة يمكنه إنشاء حسابات قيمي المساجد فقط',
      });

    const comparableUsers = isDemoSession
      ? [...Object.values(DEMO_USERS), ...demoCreatedUsers]
      : db.users.filter(u => u.isDemo !== true);
    const exists = comparableUsers.some(u => u.phone === phone || (u.email || '').toLowerCase() === email);
    if (exists)
      return send(res, 400, { error: 'رقم الجوال أو البريد الإلكتروني مسجّل بالفعل لكائن آخر' });

    let finalMosqueId = null;
    if (role === 'imam') {
      if (newMosque && newMosque.name && newMosque.area) {
        if (isDemoSession)
          return send(res, 403, { error: 'الحساب التجريبي يربط المستخدم بمسجد موجود ولا ينشئ مساجد جديدة' });
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

    const uId = isDemoSession
      ? `demo-created-${demoCreatedUserSeq++}`
      : Math.max(0, ...db.users.map(u => Number.isFinite(Number(u.id)) ? Number(u.id) : 0)) + 1;
    const newUser = { id: uId, fullName, phone, email, role, mosqueId: finalMosqueId, isDemo: isDemoSession };
    if (isDemoSession) {
      demoCreatedUsers.push(newUser);
    } else {
      db.users.push(newUser);
      saveDB();
    }
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
