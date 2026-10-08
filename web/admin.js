// SPDX-License-Identifier: GPL-3.0-or-later
const byId = (id) => document.getElementById(id);
const contentForm = byId('content-form');
let session;

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  let payload = {};
  try { payload = await response.json(); } catch { /* show a generic response below */ }
  if (!response.ok) {
    if (response.status === 401) location.assign('/login');
    throw new Error(payload.error ?? `HTTP_${response.status}`);
  }
  return payload.data;
}

function fields(form) { return Object.fromEntries(new FormData(form)); }
function message(target, text, error = false) {
  target.textContent = text;
  target.classList.toggle('error', error);
}
function idempotencyKey() { return crypto.randomUUID(); }
function postHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': session.csrfToken,
    'Idempotency-Key': idempotencyKey(),
  };
}

function setContentForm(item) {
  contentForm.reset();
  contentForm.elements.id.value = item?.id ?? '';
  contentForm.elements.version.value = item?.version ?? '';
  contentForm.elements.type.value = item?.type ?? 'page';
  contentForm.elements.title.value = item?.content?.title ?? '';
  contentForm.elements.slug.value = item?.content?.slug ?? '';
  contentForm.elements.summary.value = item?.content?.summary ?? '';
  contentForm.elements.seoTitle.value = item?.content?.seoTitle ?? '';
  contentForm.elements.seoDescription.value = item?.content?.seoDescription ?? '';
  contentForm.elements.body.value = item?.content?.blocks?.map((block) => block.text ?? block.items?.join('\n') ?? '').join('\n\n') ?? '';
  byId('content-form-title').textContent = item ? `Content bewerken · #${item.id}` : 'Concept maken';
}

function contentPayload(data) {
  const title = data.title.trim();
  const summary = data.summary.trim();
  return {
    type: data.type,
    title,
    slug: data.slug.trim(),
    summary,
    blocks: data.body.split(/\n\s*\n/u).map((text) => text.trim()).filter(Boolean).map((text) => ({ type: 'paragraph', text })),
    seoTitle: data.seoTitle.trim() || title,
    seoDescription: data.seoDescription.trim() || summary,
  };
}

function contentRow(item) {
  const row = document.createElement('article');
  row.className = 'record-card';
  const details = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = item.content.title;
  const meta = document.createElement('p');
  meta.textContent = `${item.type} · /${item.slug} · ${item.status} · v${item.version}`;
  details.append(title, meta);
  const actions = document.createElement('div');
  actions.className = 'record-actions';
  if (['admin', 'editor'].includes(session.actor.role)) {
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'button-secondary'; edit.textContent = 'Bewerken';
    edit.addEventListener('click', () => { setContentForm(item); contentForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    actions.append(edit);
  }
  if (['admin', 'publisher'].includes(session.actor.role) && item.status !== 'archived') {
    const publish = document.createElement('button');
    publish.type = 'button'; publish.textContent = 'Publiceren';
    publish.addEventListener('click', () => contentAction('publish', item));
    actions.append(publish);
    const archive = document.createElement('button');
    archive.type = 'button'; archive.className = 'button-danger'; archive.textContent = 'Archiveren';
    archive.addEventListener('click', () => contentAction('archive', item));
    actions.append(archive);
  }
  row.append(details, actions);
  return row;
}

async function loadContent() {
  const list = byId('content-list');
  list.replaceChildren(document.createTextNode('Laden…'));
  const items = await request('/api/content/items?limit=100&offset=0');
  list.replaceChildren();
  if (!items.length) { list.textContent = 'Nog geen content. Maak hierboven een concept.'; return; }
  for (const item of items) list.append(contentRow(item));
}

async function contentAction(action, item) {
  const target = byId('content-message');
  try {
    await request(`/api/content/commands/${action}`, {
      method: 'POST', headers: postHeaders(),
      body: JSON.stringify({ id: item.id, version: item.version }),
    });
    message(target, action === 'publish' ? 'Content gepubliceerd.' : 'Content gearchiveerd.');
    await loadContent();
  } catch (error) { message(target, `Actie niet uitgevoerd: ${error.message}`, true); }
}

contentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const target = byId('content-message');
  try {
    const data = fields(contentForm);
    const content = contentPayload(data);
    if (!content.blocks.length) throw new Error('Voeg minimaal één alinea toe.');
    const editing = Boolean(data.id);
    await request(`/api/content/commands/${editing ? 'update' : 'create'}`, {
      method: 'POST', headers: postHeaders(),
      body: JSON.stringify(editing ? { id: Number(data.id), version: Number(data.version), content } : { content }),
    });
    setContentForm();
    message(target, 'Concept opgeslagen.');
    await loadContent();
  } catch (error) { message(target, `Niet opgeslagen: ${error.message}`, true); }
});

byId('new-content').addEventListener('click', () => setContentForm());
byId('refresh-content').addEventListener('click', () => loadContent().catch((error) => message(byId('content-message'), error.message, true)));

async function postCommand(command, payload) {
  return request(`/api/operations/commands/${command}`, {
    method: 'POST', headers: postHeaders(), body: JSON.stringify(payload),
  });
}

function moneyToCents(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(normalized)) throw new Error('Gebruik een bedrag zoals 12,50.');
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 100000000n) throw new Error('Prijs is te hoog.');
  return Number(cents);
}
function percentToBasisPoints(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^(0|[1-9]\d?)(?:\.\d{1,2})?$/u.test(normalized)) throw new Error('Gebruik een btw-percentage tussen 0 en 100.');
  const [whole, fraction = ''] = normalized.split('.');
  return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
}
function decimalToMilli(value) {
  const normalized = String(value).trim().replace(',', '.');
  if (!/^(0|[1-9]\d*)(?:\.\d{1,3})?$/u.test(normalized)) throw new Error('Gebruik een aantal zoals 1 of 1,250.');
  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (amount < 1n || amount > 1000000n) throw new Error('Aantal valt buiten het toegestane bereik.');
  return Number(amount);
}

async function bindCreateForm(form, build) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('.message');
    try {
      await build(fields(form));
      form.reset();
      message(status, 'Opgeslagen.');
      await loadEntity();
    } catch (error) { message(status, `Niet opgeslagen: ${error.message}`, true); }
  });
}

bindCreateForm(byId('customer-form'), async (data) => {
  const payload = { name: data.name.trim(), type: data.type };
  if (data.email.trim()) payload.email = data.email.trim();
  await postCommand('create-customer', payload);
});
bindCreateForm(byId('product-form'), async (data) => {
  await postCommand('create-product', {
    name: data.name.trim(), sku: data.sku.trim(), unitCents: moneyToCents(data.price),
    vatBasisPoints: percentToBasisPoints(data.vat), stock: Number(data.stock),
  });
});
bindCreateForm(byId('quote-form'), async (data) => {
  await postCommand('create-quote', {
    customerId: Number(data.customerId),
    lines: [{ description: data.description.trim(), unitCents: moneyToCents(data.price), quantityMilli: decimalToMilli(data.quantity), vatBasisPoints: percentToBasisPoints(data.vat) }],
  });
});

const labels = { customers: 'Klanten', products: 'Producten', quotes: 'Offertes', workorders: 'Werkorders', invoices: 'Facturen', hours: 'Uren', movements: 'Voorraadmutaties' };
async function loadEntity() {
  const entity = byId('entity-select').value;
  byId('entity-heading').textContent = labels[entity];
  const list = byId('entity-list');
  list.replaceChildren(document.createTextNode('Laden…'));
  const rows = await request(`/api/operations/${entity}?limit=100&offset=0`);
  list.replaceChildren();
  if (!rows.length) { list.textContent = 'Nog geen gegevens.'; return; }
  for (const value of rows) {
    const item = document.createElement('details'); item.className = 'record-card data-row';
    const summary = document.createElement('summary');
    summary.textContent = `${labels[entity]} #${value.id} · ${value.name ?? value.number ?? value.status ?? value.sku ?? value.operation ?? 'record'}`;
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(value, null, 2);
    item.append(summary, pre);
    const actions = document.createElement('div'); actions.className = 'record-actions';
    if (entity === 'quotes' && ['admin', 'planner'].includes(session.actor.role)) {
      if (value.status === 'draft') addAction(actions, 'Verstuur offerte', () => runEntityCommand('quote-status', { id: value.id, status: 'sent', version: value.version }));
      if (value.status === 'sent') {
        addAction(actions, 'Accepteer', () => runEntityCommand('quote-status', { id: value.id, status: 'accepted', version: value.version }));
        addAction(actions, 'Wijs af', () => runEntityCommand('quote-status', { id: value.id, status: 'rejected', version: value.version }), 'button-danger');
      }
      if (value.status === 'accepted') addAction(actions, 'Werkorder maken', () => runEntityCommand('workorder-from-quote', { quoteId: value.id, schedule: {} }));
    }
    if (entity === 'workorders' && ['admin', 'planner', 'technician'].includes(session.actor.role)) {
      const next = value.status === 'planned' ? ['active', 'cancelled'] : value.status === 'active' ? ['done', 'cancelled'] : [];
      for (const status of next) addAction(actions, status === 'active' ? 'Start' : status === 'done' ? 'Afronden' : 'Annuleren', () => runEntityCommand('workorder-status', { id: value.id, status, version: value.version }), status === 'cancelled' ? 'button-danger' : '');
    }
    if (actions.childElementCount) item.append(actions);
    list.append(item);
  }
}

function addAction(container, label, action, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', action); container.append(button);
}
async function runEntityCommand(command, payload) {
  const target = byId('entity-list');
  try {
    await postCommand(command, payload);
    await loadEntity();
  } catch (error) { target.prepend(document.createTextNode(`Actie niet uitgevoerd: ${error.message} `)); }
}
byId('entity-select').addEventListener('change', () => loadEntity().catch((error) => { byId('entity-list').textContent = error.message; }));
byId('refresh-entity').addEventListener('click', () => loadEntity().catch((error) => { byId('entity-list').textContent = error.message; }));

async function start() {
  try {
    session = await request('/api/auth/session');
    byId('welcome').textContent = `Ingelogd als ${session.actor.email} · rol ${session.actor.role}`;
    if (!['admin', 'editor', 'publisher'].includes(session.actor.role)) byId('content').hidden = true;
    if (!['admin', 'editor'].includes(session.actor.role)) {
      contentForm.hidden = true;
      byId('new-content').hidden = true;
    }
    if (!['admin', 'planner'].includes(session.actor.role)) {
      for (const form of ['customer-form', 'product-form', 'quote-form']) byId(form).hidden = true;
    }
    if (!['admin', 'planner', 'technician', 'finance', 'reader'].includes(session.actor.role)) byId('operations').hidden = true;
    await Promise.all([byId('content').hidden ? Promise.resolve() : loadContent(), byId('operations').hidden ? Promise.resolve() : loadEntity()]);
    if (session.actor.role === 'admin') createUserPanel();
  } catch (error) {
    if (error.message !== 'AUTH_REQUIRED') byId('welcome').textContent = `Laden mislukt: ${error.message}`;
  }
}

function createUserPanel() {
  const section = document.createElement('section');
  section.id = 'users'; section.className = 'panel';
  const heading = document.createElement('div'); heading.className = 'section-heading';
  const title = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'Toegang';
  const h2 = document.createElement('h2'); h2.textContent = 'Gebruikers';
  title.append(eyebrow, h2); heading.append(title);
  const note = document.createElement('p'); note.className = 'muted';
  note.textContent = 'Alleen admins kunnen accounts toevoegen. Gebruik voor elk account een uniek wachtwoord van minimaal 14 tekens.';
  const grid = document.createElement('div'); grid.className = 'content-grid';
  const form = document.createElement('form'); form.id = 'user-form'; form.className = 'form-grid';
  const formTitle = document.createElement('h3'); formTitle.textContent = 'Gebruiker toevoegen'; form.append(formTitle);
  const addField = (labelText, name, type, options) => {
    const label = document.createElement('label'); label.append(document.createTextNode(labelText));
    const control = document.createElement(options ? 'select' : 'input');
    control.name = name; control.required = true;
    if (options) for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; control.append(option); }
    else { control.type = type; control.maxLength = name === 'password' ? 1024 : 254; if (name === 'password') { control.minLength = 14; control.autocomplete = 'new-password'; } }
    label.append(control); form.append(label);
  };
  addField('E-mailadres', 'email', 'email');
  addField('Rol', 'role', null, [['editor','CMS-editor'],['publisher','CMS-uitgever'],['planner','ERP-planner'],['technician','ERP-monteur'],['finance','ERP-financiën'],['reader','Alleen lezen'],['admin','Admin']]);
  addField('Tijdelijk wachtwoord', 'password', 'password');
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Account aanmaken'; form.append(submit);
  const feedback = document.createElement('p'); feedback.id = 'user-message'; feedback.className = 'message'; feedback.setAttribute('role', 'status'); form.append(feedback);
  const listColumn = document.createElement('div');
  const toolbar = document.createElement('div'); toolbar.className = 'list-toolbar';
  const listTitle = document.createElement('h3'); listTitle.textContent = 'Accounts';
  const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'button-secondary'; refresh.textContent = 'Verversen';
  const list = document.createElement('div'); list.id = 'user-list'; list.className = 'record-list'; list.setAttribute('aria-live', 'polite');
  toolbar.append(listTitle, refresh); listColumn.append(toolbar, list); grid.append(form, listColumn); section.append(heading, note, grid);
  byId('operations').after(section);
  const navLink = document.createElement('a'); navLink.href = '#users'; navLink.textContent = 'Gebruikers'; document.querySelector('.topbar nav').append(navLink);
  async function loadUsers() {
    list.replaceChildren(document.createTextNode('Laden…'));
    const users = await request('/api/users');
    list.replaceChildren();
    for (const user of users) {
      const row = document.createElement('article'); row.className = 'record-card';
      const text = document.createElement('div');
      const email = document.createElement('strong'); email.textContent = user.email;
      const role = document.createElement('p'); role.textContent = `${user.role} · ${user.active ? 'actief' : 'uitgeschakeld'}`;
      text.append(email, role); row.append(text); list.append(row);
    }
    if (!users.length) list.textContent = 'Geen accounts gevonden.';
  }
  refresh.addEventListener('click', () => loadUsers().catch((error) => message(feedback, error.message, true)));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = fields(form);
      await request('/api/users', { method: 'POST', headers: postHeaders(), body: JSON.stringify(values) });
      form.reset(); message(feedback, 'Account aangemaakt.'); await loadUsers();
    } catch (error) { message(feedback, `Niet aangemaakt: ${error.message}`, true); }
  });
  loadUsers().catch((error) => { list.textContent = `Laden mislukt: ${error.message}`; });
}

byId('logout-button').addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': session.csrfToken } });
  } finally { location.assign('/login'); }
});
start();
