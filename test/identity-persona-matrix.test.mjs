// SPDX-License-Identifier: GPL-3.0-or-later
// Synthetic local contract for Sprint 1; partner/customer are not implemented roles.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = 'synthetic-test-password-24-characters';
const people = [
  { persona: 'owner', email: 'owner-matrix@example.test', role: 'admin' },
  { persona: 'backoffice', email: 'backoffice-matrix@example.test', role: 'planner' },
  { persona: 'worker', email: 'worker-matrix@example.test', role: 'technician' },
  // These are read-only internal accounts, never product partner/customer accounts.
  { persona: 'partner-simulator', email: 'partner-simulator@example.test', role: 'reader' },
  { persona: 'customer-simulator', email: 'customer-simulator@example.test', role: 'reader' },
];
let directory;
let child;
let origin;
let serverOutput = '';
const sessions = new Map();

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function request(pathname, { session, method = 'GET', body, csrf, key, requestOrigin } = {}) {
  const headers = { Origin: requestOrigin ?? origin };
  if (session) headers.Cookie = session.cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(new URL(pathname, origin), {
    method, headers, redirect: 'manual',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let payload = raw;
  try { payload = raw ? JSON.parse(raw) : null; } catch { /* HTML and redirects are not JSON. */ }
  return { status: response.status, payload, headers: response.headers };
}

async function login(email) {
  const response = await fetch(new URL('/login', origin), {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });
  assert.equal(response.status, 303, serverOutput);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.match(cookie ?? '', /^cms_erp_session=[A-Za-z0-9_-]{43}$/u);
  const current = await request('/api/auth/session', { session: { cookie } });
  assert.equal(current.status, 200);
  return { cookie, actor: current.payload.data.actor, csrf: current.payload.data.csrfToken };
}

async function createUser(owner, person, key) {
  return request('/api/users', {
    session: owner, csrf: owner.csrf, method: 'POST', key,
    body: { email: person.email, password, role: person.role },
  });
}

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cms-erp-persona-matrix-'));
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
      NODE_ENV: 'test', PORT: String(port), CMS_ERP_HOST: '127.0.0.1',
      CMS_ERP_ORIGIN: origin, CMS_ERP_DATABASE: path.join(directory, 'matrix.sqlite'),
      CMS_ERP_BOOTSTRAP_EMAIL: people[0].email,
      CMS_ERP_BOOTSTRAP_PASSWORD: password,
    },
  });
  child.stdout.setEncoding('utf8').on('data', (part) => { serverOutput += part; });
  child.stderr.setEncoding('utf8').on('data', (part) => { serverOutput += part; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${serverOutput}`);
    try { if ((await fetch(new URL('/health', origin))).ok) return; } catch { /* Startup. */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not start: ${serverOutput}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('five synthetic identities have distinct sessions and only supported local roles', async () => {
  const owner = await login(people[0].email);
  sessions.set('owner', owner);
  assert.equal(owner.actor.role, 'admin');
  for (const [index, person] of people.entries()) {
    if (index === 0) continue;
    const created = await createUser(owner, person, `matrix-user-${index}`);
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    const session = await login(person.email);
    assert.equal(session.actor.role, person.role);
    assert.equal(session.actor.id, created.payload.data.id);
    sessions.set(person.persona, session);
  }
  assert.equal(new Set([...sessions.values()].map((session) => session.actor.id)).size, 5);
  assert.equal(new Set([...sessions.values()].map((session) => session.cookie)).size, 5);
});

test('role matrix gates user administration, technician directory, finance and CMS drafts', async () => {
  const expected = [
    ['owner', 200, 200, 200, 200],
    ['backoffice', 403, 200, 403, 401],
    ['worker', 403, 403, 403, 401],
    ['partner-simulator', 403, 403, 403, 403],
    ['customer-simulator', 403, 403, 403, 403],
  ];
  for (const [persona, users, technicians, invoices, managedContent] of expected) {
    const session = sessions.get(persona);
    assert.equal((await request('/api/users', { session })).status, users, `${persona} users`);
    assert.equal((await request('/api/technicians', { session })).status, technicians, `${persona} technicians`);
    assert.equal((await request('/api/operations/invoices', { session })).status, invoices, `${persona} invoices`);
    assert.equal((await request('/api/content/items', { session })).status, managedContent, `${persona} CMS`);
  }
});

test('partner and customer product roles cannot be provisioned by the local app', async () => {
  const owner = sessions.get('owner');
  for (const role of ['partner', 'customer']) {
    const result = await createUser(owner, {
      email: `${role}-real-role@example.test`, role,
    }, `matrix-unsupported-${role}`);
    assert.equal(result.status, 400);
    assert.equal(result.payload.error, 'INVALID_USER');
  }
  const listed = await request('/api/users', { session: owner });
  assert.equal(listed.payload.data.length, 5);
});

test('reader simulators expose an existing internal-data gap; no partner/customer isolation claim', async () => {
  const owner = sessions.get('owner');
  const created = await request('/api/operations/commands/create-customer', {
    session: owner, csrf: owner.csrf, method: 'POST', key: 'matrix-customer-create-001',
    body: { name: 'Synthetic Only', type: 'b2b' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  for (const persona of ['partner-simulator', 'customer-simulator']) {
    const list = await request('/api/operations/customers', { session: sessions.get(persona) });
    assert.equal(list.status, 200);
    assert.ok(list.payload.data.some((item) => item.id === created.payload.data.id));
  }
});

test('CSRF, origin and idempotency prevent unauthorized or changed customer writes', async () => {
  const owner = sessions.get('owner');
  const body = { name: 'Synthetic Repeat', type: 'b2c' };
  const key = 'matrix-customer-repeat-001';
  const noCsrf = await request('/api/operations/commands/create-customer', {
    session: owner, method: 'POST', key, body,
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.payload.error, 'CSRF_REJECTED');
  const wrongOrigin = await request('/api/operations/commands/create-customer', {
    session: owner, csrf: owner.csrf, method: 'POST', key, body,
    requestOrigin: 'https://outside.example.test',
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.payload.error, 'ORIGIN_REJECTED');
  const first = await request('/api/operations/commands/create-customer', {
    session: owner, csrf: owner.csrf, method: 'POST', key, body,
  });
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  const repeat = await request('/api/operations/commands/create-customer', {
    session: owner, csrf: owner.csrf, method: 'POST', key, body,
  });
  assert.deepEqual(repeat.payload, first.payload);
  const changed = await request('/api/operations/commands/create-customer', {
    session: owner, csrf: owner.csrf, method: 'POST', key,
    body: { name: 'Changed Repeat', type: 'b2c' },
  });
  assert.equal(changed.status, 409);
  assert.equal(changed.payload.error, 'CONFLICT');
});

test('wrong CMS object is hidden from a different editor', async () => {
  const owner = sessions.get('owner');
  const editors = [];
  for (const suffix of ['a', 'b']) {
    const person = { email: `editor-${suffix}-matrix@example.test`, role: 'editor' };
    const created = await createUser(owner, person, `matrix-editor-${suffix}`);
    assert.equal(created.status, 201);
    editors.push(await login(person.email));
  }
  const content = {
    type: 'page', title: 'Matrix synthetic draft', slug: 'matrix-synthetic-draft',
    summary: 'Synthetic only', blocks: [{ type: 'paragraph', text: 'Synthetic only' }],
    seoTitle: 'Matrix draft', seoDescription: 'Synthetic draft',
  };
  const created = await request('/api/content/commands/create', {
    session: editors[0], csrf: editors[0].csrf, method: 'POST',
    key: 'matrix-editor-create-001', body: { content },
  });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const id = created.payload.data.id;
  const wrongRead = await request(`/api/content/items/${id}`, { session: editors[1] });
  assert.equal(wrongRead.status, 404);
  const wrongWrite = await request('/api/content/commands/update', {
    session: editors[1], csrf: editors[1].csrf, method: 'POST',
    key: 'matrix-editor-update-001',
    body: { id, version: 1, content: { ...content, title: 'Unauthorized change' } },
  });
  assert.equal(wrongWrite.status, 404);
  const ownerRead = await request(`/api/content/items/${id}`, { session: owner });
  assert.equal(ownerRead.status, 200);
  assert.equal(ownerRead.payload.data.content.title, content.title);
});

test('role downgrade revokes the old session and reduces the new session permissions', async () => {
  const owner = sessions.get('owner');
  const old = sessions.get('backoffice');
  const result = await request(`/api/users/${old.actor.id}`, {
    session: owner, csrf: owner.csrf, method: 'PATCH',
    key: 'matrix-downgrade-planner-001', body: { role: 'reader' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.data.role, 'reader');
  assert.equal((await request('/api/auth/session', { session: old })).status, 401);
  const current = await login(people[1].email);
  assert.equal(current.actor.role, 'reader');
  assert.equal((await request('/api/technicians', { session: current })).status, 403);
});

test('logout revokes the worker session and blocks subsequent protected reads', async () => {
  const worker = sessions.get('worker');
  const loggedOut = await request('/logout', {
    session: worker, csrf: worker.csrf, method: 'POST',
  });
  assert.equal(loggedOut.status, 303);
  assert.equal((await request('/api/auth/session', { session: worker })).status, 401);
  assert.equal((await request('/api/operations/workorders', { session: worker })).status, 401);
});
