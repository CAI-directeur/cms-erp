// SPDX-License-Identifier: GPL-3.0-or-later
import { createServer } from 'node:http';
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AuthStore, sessionCookie } from './auth.mjs';
import { ContentService, renderPublicContent } from '../modules/content-management/engine.mjs';
import { createContentHandler } from '../modules/content-management/http.mjs';
import { OperationsService } from '../modules/service-operations/engine.mjs';
import { createOperationsHandler } from '../modules/service-operations/http.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(projectRoot, 'web');
const production = process.env.NODE_ENV === 'production';
const allowedOrigin = process.env.CMS_ERP_ORIGIN ?? (production ? '' : 'http://127.0.0.1:3000');
const originUrl = new URL(allowedOrigin || 'http://invalid');
const secureCookies = originUrl.protocol === 'https:';
if (!allowedOrigin || originUrl.origin !== allowedOrigin || originUrl.username || originUrl.password ||
    (originUrl.protocol !== 'https:' && !(originUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(originUrl.hostname)))) {
  throw new Error('Set CMS_ERP_ORIGIN to an exact HTTPS origin (HTTP is allowed only for localhost development).');
}

const dbPath = resolve(process.env.CMS_ERP_DATABASE ?? resolve(projectRoot, 'var', 'cms-erp.sqlite'));
const relativeToWeb = relative(webRoot, dbPath);
if (relativeToWeb === '' || (!relativeToWeb.startsWith(`..${sep}`) && relativeToWeb !== '..' && !isAbsolute(relativeToWeb))) {
  throw new Error('The database must be outside the served web directory.');
}
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });

const auth = new AuthStore(dbPath);
auth.bootstrapAdmin(process.env.CMS_ERP_BOOTSTRAP_EMAIL, process.env.CMS_ERP_BOOTSTRAP_PASSWORD);
const content = new ContentService(dbPath);
const operations = new OperationsService(dbPath, { businessTimezone: process.env.CMS_ERP_TIMEZONE ?? 'Europe/Amsterdam' });
try { chmodSync(dbPath, 0o600); } catch { /* Windows ACLs control access on Windows. */ }

const contentRoles = new Set(['admin', 'editor', 'publisher', 'reader']);
const operationsRoles = new Set(['admin', 'planner', 'technician', 'finance', 'reader']);
const handleContent = createContentHandler({
  service: content,
  resolveActor: (req) => { const actor = auth.actor(req); return actor && contentRoles.has(actor.role) ? { id: actor.id, role: actor.role } : null; },
  verifyCsrf: (req, actor) => auth.verifyCsrf(req, actor),
  allowedOrigin,
  onError: ({ requestId }) => console.error(JSON.stringify({ event: 'content_request_error', requestId })),
});
const handleOperations = createOperationsHandler({
  service: operations,
  resolveActor: (req) => { const actor = auth.actor(req); return actor && operationsRoles.has(actor.role) ? { id: actor.id, role: actor.role } : null; },
  verifyCsrf: (req, actor) => auth.verifyCsrf(req, actor),
  allowedOrigin,
  onError: ({ requestId }) => console.error(JSON.stringify({ event: 'operations_request_error', requestId })),
});

const loginHtml = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inloggen · CMS/ERP</title><link rel="stylesheet" href="/assets/app.css"></head><body class="login-page"><main class="login-card"><p class="eyebrow">CMS · ERP</p><h1>Inloggen</h1><p>Gebruik het account dat voor deze installatie is ingesteld.</p><form method="post" action="/login"><label>E-mailadres<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" maxlength="1024" required></label><button type="submit">Inloggen</button><p class="form-error" role="alert">{{ERROR}}</p></form></main></body></html>`;
const adminHtml = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beheer · CMS/ERP</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/admin.js"></script></head><body><header class="topbar"><a class="brand" href="/admin">CMS <span>ERP</span></a><nav><a href="#content">Content</a><a href="#operations">ERP</a><a href="/">Website bekijken</a></nav><button id="logout-button" class="button-quiet" type="button">Uitloggen</button></header><main class="layout"><section class="hero"><p class="eyebrow">Beheeromgeving</p><h1>CMS &amp; ERP</h1><p id="welcome">Gegevens laden…</p></section><section id="content" class="panel"><div class="section-heading"><div><p class="eyebrow">Contentbeheer</p><h2>Pagina’s en artikelen</h2></div><button id="new-content" type="button" class="button-secondary">Nieuwe content</button></div><div class="content-grid"><form id="content-form" class="form-grid"><h3 id="content-form-title">Concept maken</h3><input type="hidden" name="id"><input type="hidden" name="version"><label>Type<select name="type"><option value="page">Pagina</option><option value="article">Artikel</option><option value="service">Dienst</option><option value="project">Project</option><option value="faq">FAQ</option></select></label><label>Titel<input name="title" maxlength="200" required></label><label>Slug<input name="slug" maxlength="160" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required></label><label>Samenvatting<textarea name="summary" maxlength="500" rows="2"></textarea></label><label>Tekst (lege regel scheidt alinea’s)<textarea name="body" rows="8" required></textarea></label><label>SEO-titel<input name="seoTitle" maxlength="200"></label><label>SEO-beschrijving<input name="seoDescription" maxlength="320"></label><button type="submit">Concept opslaan</button><p id="content-message" class="message" role="status"></p></form><div><div class="list-toolbar"><h3>Inhoud</h3><button id="refresh-content" type="button" class="button-secondary">Verversen</button></div><div id="content-list" class="record-list" aria-live="polite"></div></div></div></section><section id="operations" class="panel"><div class="section-heading"><div><p class="eyebrow">Bedrijfsvoering</p><h2>ERP-overzicht</h2></div><label class="compact-label">Gegevens<select id="entity-select"><option value="customers">Klanten</option><option value="products">Producten</option><option value="quotes">Offertes</option><option value="workorders">Werkorders</option><option value="invoices">Facturen</option><option value="hours">Uren</option><option value="movements">Voorraadmutaties</option></select></label></div><p class="muted">Nieuwe klant, product en offerte invoeren is beschikbaar voor de rollen admin en planner.</p><div class="erp-create-grid"><form id="customer-form" class="form-grid"><h3>Klant toevoegen</h3><label>Naam<input name="name" maxlength="200" required></label><label>Type<select name="type"><option value="b2b">Zakelijk</option><option value="b2c">Particulier</option></select></label><label>E-mail<input name="email" type="email" maxlength="254"></label><button type="submit">Klant opslaan</button><p class="message" role="status"></p></form><form id="product-form" class="form-grid"><h3>Product toevoegen</h3><label>Naam<input name="name" maxlength="200" required></label><label>SKU<input name="sku" maxlength="80" required></label><label>Prijs per eenheid (EUR)<input name="price" inputmode="decimal" placeholder="0,00" required></label><label>Btw (%)<input name="vat" inputmode="decimal" value="21" required></label><label>Voorraad (stuks)<input name="stock" type="number" min="0" step="1" value="0" required></label><button type="submit">Product opslaan</button><p class="message" role="status"></p></form><form id="quote-form" class="form-grid"><h3>Offerte aanmaken</h3><label>Klant-ID<input name="customerId" type="number" min="1" step="1" required></label><label>Omschrijving<input name="description" maxlength="500" required></label><label>Prijs per eenheid (EUR)<input name="price" inputmode="decimal" placeholder="0,00" required></label><label>Aantal<input name="quantity" inputmode="decimal" value="1" required></label><label>Btw (%)<input name="vat" inputmode="decimal" value="21" required></label><button type="submit">Offerte als concept</button><p class="message" role="status"></p></form></div><div class="list-toolbar"><h3 id="entity-heading">Klanten</h3><button id="refresh-entity" type="button" class="button-secondary">Verversen</button></div><div id="entity-list" class="record-list" aria-live="polite"></div></section></main></body></html>`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function send(res, status, body, contentType = 'text/html; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
    ...extraHeaders,
  });
  res.end(body);
}

function json(res, status, value, extraHeaders = {}) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', extraHeaders);
}

function redirect(res, path, extraHeaders = {}) {
  res.writeHead(303, { Location: path, 'Cache-Control': 'no-store', ...extraHeaders });
  res.end();
}

async function readForm(req) {
  const contentType = req.headers['content-type'] ?? '';
  if (!/^application\/x-www-form-urlencoded(?:\s*;.*)?$/iu.test(contentType)) return null;
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > 8192)) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) return null;
    chunks.push(chunk);
  }
  try { return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { return null; }
}

async function readJson(req, maxBytes = 8192) {
  if (!/^application\/json(?:\s*;.*)?$/iu.test(req.headers['content-type'] ?? '')) return null;
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) return null;
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) return null;
      chunks.push(chunk);
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function asset(res, name, type) {
  try {
    const body = readFileSync(resolve(webRoot, name));
    send(res, 200, body, type, { 'Cache-Control': 'public, max-age=300' });
  } catch {
    send(res, 404, 'Not found');
  }
}

function publicShell(title, description, body) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="stylesheet" href="/assets/app.css"></head><body><header class="topbar"><a class="brand" href="/">CMS <span>ERP</span></a><nav><a href="/">Website</a><a href="/login">Beheer</a></nav></header><main class="public-layout">${body}</main></body></html>`;
}

const loginAttempts = new Map();
function loginLimited(req) {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  for (const [address, entry] of loginAttempts) if (now >= entry.expiresAt) loginAttempts.delete(address);
  if (!loginAttempts.has(key) && loginAttempts.size >= 10000) return true;
  const entry = loginAttempts.get(key);
  return Boolean(entry && entry.count >= 5 && now < entry.expiresAt);
}
function failedLogin(req) {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now >= entry.expiresAt) loginAttempts.set(key, { count: 1, expiresAt: now + 15 * 60 * 1000 });
  else entry.count += 1;
}

async function route(req, res) {
  const requestId = randomUUID();
  const host = req.headers.host;
  if (host && host.toLowerCase() !== originUrl.host.toLowerCase()) return send(res, 400, 'Invalid host');
  let url;
  try { url = new URL(req.url, allowedOrigin); } catch { return send(res, 400, 'Bad request'); }
  if (url.origin !== allowedOrigin) return send(res, 400, 'Invalid origin');

  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/assets/app.css') return asset(res, 'app.css', 'text/css; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/assets/admin.js') return asset(res, 'admin.js', 'text/javascript; charset=utf-8');

  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    const actor = auth.actor(req);
    const csrfToken = auth.csrfToken(req);
    if (!actor || !csrfToken) return json(res, 401, { error: 'AUTH_REQUIRED', requestId });
    return json(res, 200, { data: { actor, csrfToken } });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/password') {
    const actor = auth.actor(req);
    if (!actor) return json(res, 401, { error: 'AUTH_REQUIRED', requestId });
    if (req.headers.origin !== allowedOrigin || !auth.verifyCsrf(req, actor)) {
      return json(res, 403, { error: 'CSRF_REJECTED', requestId });
    }
    const input = await readJson(req);
    if (!input || Object.keys(input).some((key) => !['currentPassword', 'newPassword'].includes(key))) {
      return json(res, 400, { error: 'INVALID_PASSWORD_REQUEST', requestId });
    }
    const result = auth.changePassword(req, actor, input.currentPassword, input.newPassword);
    if (result.error) {
      const status = result.error === 'AUTH_REQUIRED' ? 401
        : result.error === 'PASSWORD_CHANGED_CONCURRENTLY' ? 409
          : 400;
      return json(res, status, { error: result.error, requestId });
    }
    return json(res, 200, { data: { actor: result.actor, csrfToken: result.csrfToken } }, {
      'Set-Cookie': sessionCookie(result.token, { secure: secureCookies }),
    });
  }
  if (url.pathname === '/api/users' && req.method === 'GET') {
    if (auth.actor(req)?.role !== 'admin') return json(res, 403, { error: 'FORBIDDEN', requestId });
    return json(res, 200, { data: auth.listUsers() });
  }
  if (url.pathname === '/api/users' && req.method === 'POST') {
    const actor = auth.actor(req);
    if (actor?.role !== 'admin') return json(res, 403, { error: 'FORBIDDEN', requestId });
    if (req.headers.origin !== allowedOrigin || !auth.verifyCsrf(req, actor)) return json(res, 403, { error: 'CSRF_REJECTED', requestId });
    const input = await readJson(req);
    if (!input || Object.keys(input).some((key) => !['email', 'password', 'role'].includes(key))) return json(res, 400, { error: 'INVALID_USER', requestId });
    const result = auth.createUser(actor, req.headers['idempotency-key'], input);
    if (result.error) {
      const status = result.error === 'EMAIL_IN_USE' || result.error === 'IDEMPOTENCY_CONFLICT' ? 409 : 400;
      return json(res, status, { error: result.error, requestId });
    }
    return json(res, 201, { data: result.data });
  }

  if (req.method === 'GET' && url.pathname === '/login') {
    if (auth.actor(req)) return redirect(res, '/admin');
    return send(res, 200, loginHtml.replace('{{ERROR}}', ''));
  }
  if (req.method === 'POST' && url.pathname === '/login') {
    if (req.headers.origin !== allowedOrigin) return send(res, 403, loginHtml.replace('{{ERROR}}', 'Ongeldige aanmeldpoging.'));
    if (loginLimited(req)) return send(res, 429, loginHtml.replace('{{ERROR}}', 'Te veel pogingen. Probeer het later opnieuw.'));
    const form = await readForm(req);
    const session = form && auth.authenticate(form.get('email'), form.get('password'));
    if (!session) {
      failedLogin(req);
      return send(res, 401, loginHtml.replace('{{ERROR}}', 'E-mailadres of wachtwoord is onjuist.'));
    }
    loginAttempts.delete(req.socket.remoteAddress ?? 'unknown');
    return redirect(res, '/admin', { 'Set-Cookie': sessionCookie(session.token, { secure: secureCookies }) });
  }
  if (req.method === 'GET' && url.pathname === '/admin') {
    if (!auth.actor(req)) return redirect(res, '/login');
    return send(res, 200, adminHtml);
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    const actor = auth.actor(req);
    if (!actor || req.headers.origin !== allowedOrigin || !auth.verifyCsrf(req, actor)) return send(res, 403, 'Ongeldige aanvraag.');
    auth.revoke(req);
    return redirect(res, '/login', { 'Set-Cookie': sessionCookie('', { secure: secureCookies, clear: true }) });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    const items = content.listPublished({ limit: 100, offset: 0 });
    const links = items.map((item) => `<li><a href="/p/${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a><span>${escapeHtml(item.summary ?? '')}</span></li>`).join('');
    return send(res, 200, publicShell('Welkom', 'Gepubliceerde pagina’s en artikelen.', `<section class="public-hero"><p class="eyebrow">CMS · ERP</p><h1>Welkom</h1><p>Gepubliceerde pagina’s en artikelen.</p></section><ul class="public-list">${links || '<li>Nog geen gepubliceerde content.</li>'}</ul>`));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
    let slug;
    try { slug = decodeURIComponent(url.pathname.slice(3)); } catch { return send(res, 404, 'Niet gevonden.'); }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) return send(res, 404, 'Niet gevonden.');
    const item = content.getPublished(slug);
    if (!item) return send(res, 404, 'Niet gevonden.');
    return send(res, 200, publicShell(item.seoTitle, item.seoDescription, renderPublicContent(item)));
  }

  if (await handleContent(req, res)) return;
  if (await handleOperations(req, res)) return;
  send(res, 404, 'Niet gevonden.');
}

const server = createServer((req, res) => {
  route(req, res).catch(() => {
    const requestId = randomUUID();
    console.error(JSON.stringify({ event: 'host_request_error', requestId }));
    if (!res.headersSent) send(res, 500, 'Er ging iets mis. Probeer het later opnieuw.');
    else res.destroy();
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 100;

const portValue = Number(process.env.PORT ?? (originUrl.port || 3000));
if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) throw new Error('PORT must be an integer from 1 through 65535.');
const listenHost = process.env.CMS_ERP_HOST ?? (production ? '0.0.0.0' : '127.0.0.1');
server.listen(portValue, listenHost, () => {
  console.log(JSON.stringify({ event: 'server_started', origin: allowedOrigin, host: listenHost, port: portValue }));
});

function close() {
  server.close(() => {
    content.close();
    operations.close();
    auth.close();
  });
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
