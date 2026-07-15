const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
let serverProcess;
let baseUrl;
let dataDir;
let serverOutput = '';

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function request(endpoint, options = {}) {
  const response = await fetch(baseUrl + endpoint, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function demoLogin(role) {
  return request('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

function withToken(token) {
  return { Authorization: `Bearer ${token}` };
}

test.before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awqaf-test-'));
  serverProcess = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: 'test',
      SECRET: 'test-secret-that-is-long-enough-for-signed-sessions',
      ENABLE_DEMO_LOGIN: 'true',
      MAIL_TRANSPORT: 'json',
      BOOTSTRAP_MANAGER_EMAIL: 'private.owner@gmail.com',
      GMAIL_APPS_SCRIPT_URL: '',
      GMAIL_WEBHOOK_SECRET: '',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', chunk => { serverOutput += chunk; });
  serverProcess.stderr.on('data', chunk => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/');
      if (response.ok) return;
    } catch (_error) {
      // The process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`تعذر تشغيل خادم الاختبار:\n${serverOutput}`);
});

test.after(() => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test('الدخول التجريبي المباشر يعمل للأدوار الثلاثة دون OTP', async () => {
  for (const role of ['imam', 'ministry', 'manager']) {
    const result = await demoLogin(role);
    assert.equal(result.status, 200);
    assert.equal(result.body.user.role, role);
    assert.equal(result.body.user.demo, true);
    assert.equal(result.body.demo, true);
    assert.ok(result.body.token);
  }
});

test('يرفض الخادم أي دور تجريبي غير معروف', async () => {
  const result = await demoLogin('unknown-role');
  assert.equal(result.status, 400);
});

test('لوحة المدير تعيد الإحصاءات بنجاح', async () => {
  const login = await demoLogin('manager');
  const result = await request('/api/stats/overview', {
    headers: withToken(login.body.token),
  });
  assert.equal(result.status, 200);
  assert.equal(typeof result.body.total, 'number');
  assert.ok(Array.isArray(result.body.perMosque));
});

test('موظف الوزارة لا يستطيع إنشاء موظف آخر', async () => {
  const login = await demoLogin('ministry');
  const result = await request('/api/users', {
    method: 'POST',
    headers: withToken(login.body.token),
    body: JSON.stringify({
      fullName: 'موظف غير مسموح',
      phone: '0999999100',
      email: 'forbidden-ministry@example.test',
      role: 'ministry',
    }),
  });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /قيمي المساجد فقط/);
});

test('موظف الوزارة يستطيع إنشاء حساب قيم مسجد فقط', async () => {
  const login = await demoLogin('ministry');
  const result = await request('/api/users', {
    method: 'POST',
    headers: withToken(login.body.token),
    body: JSON.stringify({
      fullName: 'قيم تجريبي جديد',
      phone: '0999999101',
      email: 'new-imam@example.test',
      role: 'imam',
      mosqueId: 1,
    }),
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.role, 'imam');
  assert.equal(result.body.isDemo, true);
});

test('المدير يستطيع إنشاء موظف دون كشف الحسابات الحقيقية للجلسة التجريبية', async () => {
  const login = await demoLogin('manager');
  const createResult = await request('/api/users', {
    method: 'POST',
    headers: withToken(login.body.token),
    body: JSON.stringify({
      fullName: 'موظف تجريبي جديد',
      phone: '0999999102',
      email: 'new-ministry@example.test',
      role: 'ministry',
    }),
  });
  assert.equal(createResult.status, 201);
  assert.equal(createResult.body.role, 'ministry');

  const listResult = await request('/api/users', {
    headers: withToken(login.body.token),
  });
  assert.equal(listResult.status, 200);
  assert.ok(listResult.body.data.every(user => user.isDemo === true));
  assert.ok(!listResult.body.data.some(user => user.email === 'private.owner@gmail.com'));
});

test('الحسابات التي تنشئها جلسة العرض لا تختلط بالحسابات الحقيقية', async () => {
  const otpRequest = await request('/api/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier: '0933000000' }),
  });
  assert.equal(otpRequest.status, 200);
  assert.match(otpRequest.body.dev_code, /^\d{6}$/);

  const otpVerify = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier: '0933000000', code: otpRequest.body.dev_code }),
  });
  assert.equal(otpVerify.status, 200);

  const listResult = await request('/api/users', {
    headers: withToken(otpVerify.body.token),
  });
  assert.equal(listResult.status, 200);
  assert.ok(listResult.body.data.every(user => user.isDemo !== true));
  assert.ok(!listResult.body.data.some(user => user.email === 'new-ministry@example.test'));
});

test('واجهة الويب تربط تبويب لوحة المدير وتعرض أزرار الدخول المباشر', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  assert.match(html, /tab === 'dash'\) await manager\(\)/);
  assert.match(html, /\/api\/auth\/demo-login/);
  assert.equal((html.match(/data-demo-role=/g) || []).length, 3);
  assert.doesNotMatch(html, /onclick="fillPhone\(/);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});

test('تعريف PWA وأيقونات Android صالحان للتغليف', async () => {
  const manifestResponse = await fetch(baseUrl + '/manifest.json');
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.orientation, 'portrait-primary');

  for (const size of [192, 512]) {
    const iconResponse = await fetch(`${baseUrl}/icon-${size}.png`);
    assert.equal(iconResponse.status, 200);
    assert.match(iconResponse.headers.get('content-type') || '', /^image\/png/);
    const bytes = Buffer.from(await iconResponse.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});
