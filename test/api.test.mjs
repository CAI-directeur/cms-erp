// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminEmail = 'cms-api-test@example.test';
const adminPassword = 'test-only-password-with-24-chars';
const technicianEmail = 'technician-api-test@example.test';
const technicianPassword = 'technician-test-password-24c';
let tempRoot;
let processHandle;
let origin;
let output = '';

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(pathname, { cookie, csrf, method = 'GET', body, idempotencyKey, sendOrigin = true } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (sendOrigin) headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(new URL(pathname, origin), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload };
}

async function login(email, password) {
  const response = await fetch(new URL('/login', origin), {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303, `login failed; server output: ${output}`);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie?.startsWith('cms_erp_session='), 'session cookie missing');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/iu);
  const session = await request('/api/auth/session', { cookie });
  assert.equal(session.response.status, 200);
  return { cookie, actor: session.payload.data.actor, csrf: session.payload.data.csrfToken };
}

async function command(session, commandName, payload, key) {
  return request(`/api/operations/commands/${commandName}`, {
    cookie: session.cookie,
    csrf: session.csrf,
    method: 'POST',
    body: payload,
    idempotencyKey: key,
  });
}

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'cms-erp-api-'));
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['src/server.mjs'], {
    cwd: projectRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'test',
      PORT: String(port),
      CMS_ERP_HOST: '127.0.0.1',
      CMS_ERP_ORIGIN: origin,
      CMS_ERP_DATABASE: path.join(tempRoot, 'cms-test.sqlite'),
      CMS_ERP_BOOTSTRAP_EMAIL: adminEmail,
      CMS_ERP_BOOTSTRAP_PASSWORD: adminPassword,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processHandle.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  processHandle.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`API test server exited early:\n${output}`);
    try {
      const response = await fetch(new URL('/health', origin));
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API test server did not start:\n${output}`);
});

after(async () => {
  if (processHandle && processHandle.exitCode === null) {
    const exited = new Promise((resolve) => processHandle.once('exit', resolve));
    processHandle.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (processHandle.exitCode === null) processHandle.kill('SIGKILL');
  }
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

test('authenticated REST APIs complete a CMS and service ERP workflow', async () => {
  const health = await request('/health');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.payload, { status: 'ok' });

  const publicContent = await request('/api/content/public');
  assert.equal(publicContent.response.status, 200);
  assert.deepEqual(publicContent.payload.data, []);
  const unauthorized = await request('/api/operations/customers');
  assert.equal(unauthorized.response.status, 401);

  const admin = await login(adminEmail, adminPassword);
  assert.equal(admin.actor.email, adminEmail);
  assert.equal(admin.actor.role, 'admin');
  assert.equal(Object.hasOwn(admin.actor, 'password_hash'), false);
  const adminPage = await request('/admin', { cookie: admin.cookie });
  assert.equal(adminPage.response.status, 200);
  assert.match(adminPage.response.headers.get('content-security-policy'), /default-src 'self'/u);
  assert.match(adminPage.payload, /ERP-werkstromen/u);
  assert.match(adminPage.payload, /id="inventory-form"/u);
  assert.match(adminPage.payload, /id="credit-form"/u);

  const content = {
    type: 'page',
    title: 'REST-testpagina',
    slug: 'rest-testpagina',
    summary: 'Synthetische acceptatietest',
    blocks: [{ type: 'paragraph', text: '<script>synthetic()</script> veilige tekst' }],
    seoTitle: 'REST-testpagina',
    seoDescription: 'Synthetische testinhoud',
  };
  const missingCsrf = await request('/api/content/commands/create', {
    cookie: admin.cookie,
    method: 'POST',
    body: { content },
    idempotencyKey: 'cms-api-no-csrf-001',
  });
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.payload.error, 'CSRF_REJECTED');

  const createdContent = await request('/api/content/commands/create', {
    cookie: admin.cookie,
    csrf: admin.csrf,
    method: 'POST',
    body: { content },
    idempotencyKey: 'cms-api-content-001',
  });
  assert.equal(createdContent.response.status, 200, JSON.stringify(createdContent.payload));
  assert.equal(createdContent.payload.data.status, 'draft');
  const published = await request('/api/content/commands/publish', {
    cookie: admin.cookie,
    csrf: admin.csrf,
    method: 'POST',
    body: { id: createdContent.payload.data.id, version: createdContent.payload.data.version },
    idempotencyKey: 'cms-api-publish-001',
  });
  assert.equal(published.response.status, 200);
  const publicPage = await fetch(new URL('/p/rest-testpagina', origin));
  assert.equal(publicPage.status, 200);
  const publicHtml = await publicPage.text();
  assert.match(publicHtml, /&lt;script&gt;synthetic\(\)&lt;\/script&gt;/u);
  assert.doesNotMatch(publicHtml, /<script>synthetic\(\)<\/script>/u);

  const technicianCreated = await request('/api/users', {
    cookie: admin.cookie,
    csrf: admin.csrf,
    method: 'POST',
    body: { email: technicianEmail, password: technicianPassword, role: 'technician' },
    idempotencyKey: 'cms-api-user-tech-01',
  });
  assert.equal(technicianCreated.response.status, 201);
  const technicianId = technicianCreated.payload.data.id;
  assert.equal(Object.hasOwn(technicianCreated.payload.data, 'password_hash'), false);
  const technicians = await request('/api/technicians', { cookie: admin.cookie });
  assert.equal(technicians.response.status, 200);
  assert.deepEqual(technicians.payload.data, [{ id: technicianId, email: technicianEmail }]);
  const technicianSession = await login(technicianEmail, technicianPassword);
  const hiddenTechnicianDirectory = await request('/api/technicians', { cookie: technicianSession.cookie });
  assert.equal(hiddenTechnicianDirectory.response.status, 403);
  const unknownTechnician = await command(admin, 'create-resource', {
    name: 'Onbekende monteur', technicianId: technicianId + 1000,
  }, 'cms-api-resource-denied');
  assert.equal(unknownTechnician.response.status, 403);
  assert.equal(unknownTechnician.payload.error, 'COMMAND_NOT_AUTHORIZED');

  const customer = await command(admin, 'create-customer', { name: 'Synthetische testklant', type: 'b2b' }, 'cms-api-customer-01');
  assert.equal(customer.response.status, 200);
  const repeatedCustomer = await command(admin, 'create-customer', { name: 'Synthetische testklant', type: 'b2b' }, 'cms-api-customer-01');
  assert.equal(repeatedCustomer.payload.data.id, customer.payload.data.id);
  const conflictingReuse = await command(admin, 'create-customer', { name: 'Andere klant', type: 'b2b' }, 'cms-api-customer-01');
  assert.equal(conflictingReuse.response.status, 409);

  const product = await command(admin, 'create-product', {
    name: 'Testkabel', sku: 'TEST-CABLE-1', unitCents: 10000, vatBasisPoints: 2100, stock: 3,
  }, 'cms-api-product-001');
  assert.equal(product.response.status, 200);
  const resource = await command(admin, 'create-resource', { name: 'Testmonteur', technicianId }, 'cms-api-resource-01');
  assert.equal(resource.response.status, 200);
  const quote = await command(admin, 'create-quote', {
    customerId: customer.payload.data.id,
    lines: [{ description: 'Testwerk', unitCents: 10000, quantityMilli: 1000, vatBasisPoints: 2100, productId: product.payload.data.id }],
  }, 'cms-api-quote-0001');
  assert.equal(quote.response.status, 200);
  const sentQuote = await command(admin, 'quote-status', { id: quote.payload.data.id, status: 'sent', version: quote.payload.data.version }, 'cms-api-quote-sent1');
  assert.equal(sentQuote.payload.data.status, 'sent');
  const acceptedQuote = await command(admin, 'quote-status', { id: quote.payload.data.id, status: 'accepted', version: sentQuote.payload.data.version }, 'cms-api-quote-acc01');
  assert.equal(acceptedQuote.payload.data.status, 'accepted');

  const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString();
  const workorder = await command(admin, 'workorder-from-quote', {
    quoteId: quote.payload.data.id,
    schedule: { resourceId: resource.payload.data.id, startAt, endAt },
  }, 'cms-api-workorder1');
  assert.equal(workorder.response.status, 200);
  assert.equal(workorder.payload.data.status, 'planned');

  const technician = await login(technicianEmail, technicianPassword);
  const hiddenFinance = await request('/api/operations/invoices', { cookie: technician.cookie });
  assert.equal(hiddenFinance.response.status, 403);
  const assignedWorkorders = await request('/api/operations/workorders', { cookie: technician.cookie });
  assert.equal(assignedWorkorders.response.status, 200);
  assert.equal(assignedWorkorders.payload.data.length, 1);
  const activeWorkorder = await command(admin, 'workorder-status', {
    id: workorder.payload.data.id, status: 'active', version: workorder.payload.data.version,
  }, 'cms-api-workactive1');
  assert.equal(activeWorkorder.payload.data.status, 'active');

  const businessDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const hours = await command(technician, 'record-hours', {
    workorderId: workorder.payload.data.id, minutes: 60, date: businessDay, note: 'Synthetische REST-test',
  }, 'cms-api-hours-0001');
  assert.equal(hours.response.status, 200);
  assert.equal(String(hours.payload.data.technicianId), String(technicianId));

  const reserved = await command(admin, 'reserve-inventory', {
    workorderId: workorder.payload.data.id, productId: product.payload.data.id, quantity: 1,
  }, 'cms-api-stock-res-01');
  assert.equal(reserved.response.status, 200);
  const consumed = await command(technician, 'consume-inventory', {
    workorderId: workorder.payload.data.id, productId: product.payload.data.id, quantity: 1,
  }, 'cms-api-stock-use-01');
  assert.equal(consumed.response.status, 200);

  const doneWorkorder = await command(admin, 'workorder-status', {
    id: workorder.payload.data.id, status: 'done', version: activeWorkorder.payload.data.version,
  }, 'cms-api-workdone01');
  assert.equal(doneWorkorder.payload.data.status, 'done');
  const invoice = await command(admin, 'issue-invoice', {
    quoteId: quote.payload.data.id, workorderId: workorder.payload.data.id, dueDate: businessDay,
  }, 'cms-api-invoice-01');
  assert.equal(invoice.response.status, 200);
  assert.equal(invoice.payload.data.totalCents, 12100);
  const payment = await command(admin, 'record-payment', {
    invoiceId: invoice.payload.data.id, amountCents: 5000, reference: 'SYNTHETIC-REST-1',
  }, 'cms-api-payment-01');
  assert.equal(payment.response.status, 200);
  const financeExport = await request('/api/operations/bookkeeping', { cookie: admin.cookie });
  assert.equal(financeExport.response.status, 200);
  assert.equal(financeExport.payload.data.entries.length, 2);

  const secondAdminSession = await login(adminEmail, adminPassword);
  const passwordPayload = { currentPassword: adminPassword, newPassword: 'new-test-password-with-30-chars' };
  const passwordCsrfRejected = await request('/api/auth/password', {
    cookie: admin.cookie, method: 'POST', body: passwordPayload,
  });
  assert.equal(passwordCsrfRejected.response.status, 403);
  const passwordWrongCurrent = await request('/api/auth/password', {
    cookie: admin.cookie, csrf: admin.csrf, method: 'POST',
    body: { ...passwordPayload, currentPassword: 'incorrect-current-password' },
  });
  assert.equal(passwordWrongCurrent.response.status, 400);
  assert.equal(passwordWrongCurrent.payload.error, 'CURRENT_PASSWORD_INVALID');
  const passwordMissingCurrent = await request('/api/auth/password', {
    cookie: admin.cookie, csrf: admin.csrf, method: 'POST',
    body: { newPassword: passwordPayload.newPassword },
  });
  assert.equal(passwordMissingCurrent.response.status, 400);
  assert.equal(passwordMissingCurrent.payload.error, 'INVALID_CURRENT_PASSWORD');
  const passwordTooShort = await request('/api/auth/password', {
    cookie: admin.cookie, csrf: admin.csrf, method: 'POST',
    body: { currentPassword: adminPassword, newPassword: 'too-short' },
  });
  assert.equal(passwordTooShort.response.status, 400);
  const passwordUnchanged = await request('/api/auth/password', {
    cookie: admin.cookie, csrf: admin.csrf, method: 'POST',
    body: { currentPassword: adminPassword, newPassword: adminPassword },
  });
  assert.equal(passwordUnchanged.response.status, 400);
  assert.equal(passwordUnchanged.payload.error, 'PASSWORD_UNCHANGED');
  const passwordChanged = await request('/api/auth/password', {
    cookie: admin.cookie, csrf: admin.csrf, method: 'POST', body: passwordPayload,
  });
  assert.equal(passwordChanged.response.status, 200);
  assert.equal(passwordChanged.payload.data.actor.email, adminEmail);
  assert.ok(passwordChanged.payload.data.csrfToken);
  const rotatedCookie = passwordChanged.response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(rotatedCookie ?? '', /^cms_erp_session=[A-Za-z0-9_-]{43}$/u);
  const rotatedSession = await request('/api/auth/session', { cookie: rotatedCookie });
  assert.equal(rotatedSession.response.status, 200);
  assert.equal(rotatedSession.payload.data.csrfToken, passwordChanged.payload.data.csrfToken);
  assert.equal((await request('/api/auth/session', { cookie: admin.cookie })).response.status, 401);
  assert.equal((await request('/api/auth/session', { cookie: secondAdminSession.cookie })).response.status, 401);
  const oldPasswordLogin = await fetch(new URL('/login', origin), {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: adminEmail, password: adminPassword }), redirect: 'manual',
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordSession = await login(adminEmail, passwordPayload.newPassword);
  assert.equal(newPasswordSession.actor.role, 'admin');
});
