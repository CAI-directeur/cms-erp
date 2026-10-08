// SPDX-License-Identifier: GPL-3.0-or-later
import { DatabaseSync } from 'node:sqlite';
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const cookieName = 'cms_erp_session';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const roles = new Set(['admin', 'editor', 'publisher', 'planner', 'technician', 'finance', 'reader']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

function cookieValue(req) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  }
  return null;
}

function tokenDigest(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function sessionCookie(token, { secure = false, clear = false } = {}) {
  const attributes = [
    `${cookieName}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
    `Max-Age=${clear ? 0 : Math.floor(sessionLifetimeMs / 1000)}`,
  ];
  return attributes.join('; ');
}

export class AuthStore {
  #db;
  #csrfSecret = randomBytes(32);
  #dummySalt = randomBytes(16);
  #dummyHash = scryptSync('invalid-password', this.#dummySalt, 64);

  constructor(databasePath) {
    this.#db = new DatabaseSync(databasePath);
    this.#db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS app_users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','editor','publisher','planner','technician','finance','reader')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        auth0_issuer TEXT,
        auth0_subject TEXT
      );
      CREATE TABLE IF NOT EXISTS app_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS app_user_idempotency (
        actor_id INTEGER NOT NULL REFERENCES app_users(id),
        idem_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES app_users(id),
        PRIMARY KEY(actor_id,idem_key)
      );
    `);
    const userColumns = new Set(this.#db.prepare('PRAGMA table_info(app_users)').all().map((column) => column.name));
    if (!userColumns.has('auth0_issuer')) this.#db.exec('ALTER TABLE app_users ADD COLUMN auth0_issuer TEXT');
    if (!userColumns.has('auth0_subject')) this.#db.exec('ALTER TABLE app_users ADD COLUMN auth0_subject TEXT');
    this.#db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth0_identity
        ON app_users(auth0_issuer,auth0_subject)
        WHERE auth0_issuer IS NOT NULL AND auth0_subject IS NOT NULL;
      CREATE TABLE IF NOT EXISTS app_identity_link_idempotency (
        actor_id INTEGER NOT NULL REFERENCES app_users(id),
        idem_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES app_users(id),
        PRIMARY KEY(actor_id,idem_key)
      );
      CREATE TABLE IF NOT EXISTS app_identity_link_challenges (
        code_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES app_users(id),
        created_by INTEGER NOT NULL REFERENCES app_users(id),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS app_identity_link_audit (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES app_users(id),
        actor_id INTEGER NOT NULL REFERENCES app_users(id),
        auth0_issuer TEXT NOT NULL,
        auth0_subject TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  hasUsers() {
    return this.#db.prepare('SELECT 1 AS present FROM app_users LIMIT 1').get() !== undefined;
  }

  bootstrapAdmin(emailValue, password) {
    if (this.hasUsers()) return false;
    const email = normalizedEmail(emailValue);
    if (!email || typeof password !== 'string' || password.length < 14 || password.length > 1024) {
      throw new Error('First-run setup requires a valid CMS_ERP_BOOTSTRAP_EMAIL and a password of at least 14 characters.');
    }
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    this.#db.prepare(
      'INSERT INTO app_users(email,password_hash,password_salt,role,created_at) VALUES(?,?,?,\'admin\',?)',
    ).run(email, hash.toString('hex'), salt.toString('hex'), new Date().toISOString());
    return true;
  }

  authenticate(emailValue, password) {
    const email = normalizedEmail(emailValue);
    if (typeof password !== 'string' || password.length > 1024) return null;
    const user = email
      ? this.#db.prepare('SELECT id,email,password_hash,password_salt,role,active FROM app_users WHERE email=?').get(email)
      : undefined;
    const salt = user ? Buffer.from(user.password_salt, 'hex') : this.#dummySalt;
    const expected = user ? Buffer.from(user.password_hash, 'hex') : this.#dummyHash;
    const actual = scryptSync(password, salt, 64);
    const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!user || !user.active || !matches) return null;

    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.#db.prepare('DELETE FROM app_sessions WHERE expires_at<=?').run(now);
    this.#db.prepare('INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(tokenDigest(token), user.id, now + sessionLifetimeMs, now);
    return { token, actor: { id: user.id, email: user.email, role: user.role } };
  }

  changePassword(req, actor, currentPassword, newPassword) {
    const session = this.#session(req);
    if (!session || session.actor.id !== actor?.id) return { error: 'AUTH_REQUIRED' };
    if (typeof currentPassword !== 'string' || currentPassword.length > 1024) {
      return { error: 'INVALID_CURRENT_PASSWORD' };
    }
    if (typeof newPassword !== 'string' || newPassword.length < 14 || newPassword.length > 1024) {
      return { error: 'INVALID_NEW_PASSWORD' };
    }
    if (currentPassword === newPassword) return { error: 'PASSWORD_UNCHANGED' };

    const user = this.#db.prepare(
      'SELECT id,email,role,password_hash,password_salt,active FROM app_users WHERE id=?',
    ).get(actor.id);
    if (!user || !user.active) return { error: 'AUTH_REQUIRED' };
    const oldSalt = Buffer.from(user.password_salt, 'hex');
    const oldHash = Buffer.from(user.password_hash, 'hex');
    const suppliedHash = scryptSync(currentPassword, oldSalt, 64);
    if (suppliedHash.length !== oldHash.length || !timingSafeEqual(suppliedHash, oldHash)) {
      return { error: 'CURRENT_PASSWORD_INVALID' };
    }

    const nextSalt = randomBytes(16);
    const nextHash = scryptSync(newPassword, nextSalt, 64);
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const update = this.#db.prepare(`
        UPDATE app_users SET password_hash=?,password_salt=?
        WHERE id=? AND password_hash=? AND password_salt=? AND active=1
      `).run(nextHash.toString('hex'), nextSalt.toString('hex'), actor.id, user.password_hash, user.password_salt);
      if (Number(update.changes) !== 1) {
        this.#db.exec('ROLLBACK');
        return { error: 'PASSWORD_CHANGED_CONCURRENTLY' };
      }
      this.#db.prepare('DELETE FROM app_sessions WHERE user_id=?').run(actor.id);
      this.#db.prepare('INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
        .run(tokenDigest(token), actor.id, now + sessionLifetimeMs, now);
      this.#db.exec('COMMIT');
      return {
        token,
        actor: { id: user.id, email: user.email, role: user.role },
        csrfToken: createHmac('sha256', this.#csrfSecret).update(token, 'utf8').digest('base64url'),
      };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* the transaction may already be closed */ }
      throw error;
    }
  }

  listUsers() {
    return this.#db.prepare('SELECT id,email,role,active,created_at AS createdAt,(auth0_subject IS NOT NULL) AS auth0Linked FROM app_users ORDER BY id').all();
  }

  actorForExternalIdentity(issuer, subject) {
    if (typeof issuer !== 'string' || typeof subject !== 'string' || !issuer || !subject ||
        issuer.length > 512 || subject.length > 255 || /[\u0000-\u001f\u007f]/u.test(issuer + subject)) return null;
    const user = this.#db.prepare(`
      SELECT id,email,role FROM app_users
      WHERE auth0_issuer=? AND auth0_subject=? AND active=1
    `).get(issuer, subject);
    return user ? { id: user.id, email: user.email, role: user.role } : null;
  }

  createAuth0LinkChallenge(actor, key, userId, code) {
    if (actor?.role !== 'admin' || !Number.isSafeInteger(actor.id) || actor.id < 1) return { error: 'FORBIDDEN' };
    if (!Number.isSafeInteger(userId) || userId < 1 || typeof code !== 'string' || !/^[A-Za-z0-9._~-]{32,100}$/u.test(code)) return { error: 'INVALID_LINK_REQUEST' };
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/u.test(key)) return { error: 'IDEMPOTENCY_KEY_REQUIRED' };
    const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
    const fingerprint = createHash('sha256').update(JSON.stringify({ userId, codeHash }), 'utf8').digest('hex');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.#db.prepare('SELECT fingerprint,user_id FROM app_identity_link_idempotency WHERE actor_id=? AND idem_key=?').get(actor.id, key);
      if (prior) {
        const challenge = prior.fingerprint === fingerprint
          ? this.#db.prepare('SELECT expires_at,consumed_at FROM app_identity_link_challenges WHERE code_hash=?').get(codeHash)
          : null;
        this.#db.exec('COMMIT');
        if (prior.fingerprint !== fingerprint) return { error: 'IDEMPOTENCY_CONFLICT' };
        if (!challenge || challenge.consumed_at !== null || challenge.expires_at <= Date.now()) return { error: 'LINK_CHALLENGE_EXPIRED' };
        return { data: { userId: prior.user_id, challengeCreated: true, expiresAt: challenge.expires_at } };
      }
      const user = this.#db.prepare('SELECT id,active,auth0_issuer,auth0_subject FROM app_users WHERE id=?').get(userId);
      if (!user) { this.#db.exec('ROLLBACK'); return { error: 'USER_NOT_FOUND' }; }
      if (!user.active) { this.#db.exec('ROLLBACK'); return { error: 'USER_INACTIVE' }; }
      if (user.auth0_issuer || user.auth0_subject) {
        this.#db.exec('ROLLBACK');
        return { error: 'IDENTITY_ALREADY_LINKED' };
      }
      const now = Date.now();
      this.#db.prepare('UPDATE app_identity_link_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL').run(now, userId);
      this.#db.prepare('INSERT INTO app_identity_link_challenges(code_hash,user_id,created_by,created_at,expires_at) VALUES(?,?,?,?,?)').run(codeHash, userId, actor.id, now, now + 10 * 60 * 1000);
      this.#db.prepare('INSERT INTO app_identity_link_idempotency(actor_id,idem_key,fingerprint,user_id) VALUES(?,?,?,?)').run(actor.id, key, fingerprint, userId);
      this.#db.exec('COMMIT');
      return { data: { userId, challengeCreated: true, expiresAt: now + 10 * 60 * 1000 } };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* preserve the original error */ }
      throw error;
    }
  }

  completeAuth0IdentityLink(issuer, subject, code) {
    if (typeof issuer !== 'string' || !/^https:\/\/[^/]+\/$/u.test(issuer) || issuer.length > 512 ||
        typeof subject !== 'string' || !/^[^\u0000-\u0020\u007f]{1,255}$/u.test(subject) ||
        typeof code !== 'string' || !/^[A-Za-z0-9._~-]{32,100}$/u.test(code)) return { error: 'INVALID_LINK_REQUEST' };
    const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
    const now = Date.now();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const challenge = this.#db.prepare('SELECT user_id,created_by,expires_at,consumed_at FROM app_identity_link_challenges WHERE code_hash=?').get(codeHash);
      if (!challenge || challenge.consumed_at !== null || challenge.expires_at <= now) {
        this.#db.exec('ROLLBACK');
        return { error: 'LINK_CHALLENGE_INVALID' };
      }
      const user = this.#db.prepare('SELECT id,role,active,auth0_issuer,auth0_subject FROM app_users WHERE id=?').get(challenge.user_id);
      if (!user || !user.active || user.auth0_issuer || user.auth0_subject) {
        this.#db.exec('ROLLBACK');
        return { error: 'IDENTITY_ALREADY_LINKED' };
      }
      this.#db.prepare('UPDATE app_users SET auth0_issuer=?,auth0_subject=? WHERE id=? AND auth0_issuer IS NULL AND auth0_subject IS NULL').run(issuer, subject, user.id);
      this.#db.prepare('UPDATE app_identity_link_challenges SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL').run(now, codeHash);
      this.#db.prepare('INSERT INTO app_identity_link_audit(user_id,actor_id,auth0_issuer,auth0_subject,created_at) VALUES(?,?,?,?,?)').run(user.id, challenge.created_by, issuer, subject, new Date(now).toISOString());
      this.#db.exec('COMMIT');
      return { data: { userId: user.id, linked: true, role: user.role } };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* preserve the original error */ }
      if (/UNIQUE constraint failed: app_users\.auth0_issuer, app_users\.auth0_subject/u.test(error?.message ?? '')) return { error: 'IDENTITY_IN_USE' };
      throw error;
    }
  }

  listActiveTechnicians() {
    return this.#db.prepare(
      "SELECT id,email FROM app_users WHERE role='technician' AND active=1 ORDER BY id",
    ).all();
  }

  isActiveTechnician(id) {
    if (!Number.isSafeInteger(id) || id < 1) return false;
    return Boolean(this.#db.prepare(
      "SELECT 1 FROM app_users WHERE id=? AND role='technician' AND active=1",
    ).get(id));
  }

  createUser(actor, key, { email: emailValue, password, role } = {}) {
    const email = normalizedEmail(emailValue);
    if (!email || typeof password !== 'string' || password.length < 14 || password.length > 1024 || !roles.has(role)) {
      return { error: 'INVALID_USER' };
    }
    if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/u.test(key)) return { error: 'IDEMPOTENCY_KEY_REQUIRED' };
    const fingerprint = createHmac('sha256', this.#csrfSecret)
      .update(JSON.stringify({ email, role, password }), 'utf8').digest('hex');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.#db.prepare('SELECT fingerprint,user_id FROM app_user_idempotency WHERE actor_id=? AND idem_key=?').get(actor.id, key);
      if (prior) {
        this.#db.exec('COMMIT');
        return prior.fingerprint === fingerprint
          ? { data: this.#db.prepare('SELECT id,email,role,active,created_at AS createdAt FROM app_users WHERE id=?').get(prior.user_id) }
          : { error: 'IDEMPOTENCY_CONFLICT' };
      }
      if (this.#db.prepare('SELECT 1 FROM app_users WHERE email=?').get(email)) {
        this.#db.exec('ROLLBACK');
        return { error: 'EMAIL_IN_USE' };
      }
      const salt = randomBytes(16);
      const passwordHash = scryptSync(password, salt, 64);
      const createdAt = new Date().toISOString();
      const insert = this.#db.prepare(
        'INSERT INTO app_users(email,password_hash,password_salt,role,created_at) VALUES(?,?,?,?,?)',
      ).run(email, passwordHash.toString('hex'), salt.toString('hex'), role, createdAt);
      const id = Number(insert.lastInsertRowid);
      this.#db.prepare('INSERT INTO app_user_idempotency(actor_id,idem_key,fingerprint,user_id) VALUES(?,?,?,?)')
        .run(actor.id, key, fingerprint, id);
      const data = this.#db.prepare('SELECT id,email,role,active,created_at AS createdAt FROM app_users WHERE id=?').get(id);
      this.#db.exec('COMMIT');
      return { data };
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch { /* the transaction may already be closed */ }
      throw error;
    }
  }

  #session(req) {
    const token = cookieValue(req);
    if (!token) return null;
    const row = this.#db.prepare(`
      SELECT u.id,u.email,u.role,s.token_hash,s.expires_at
      FROM app_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.active=1
    `).get(tokenDigest(token), Date.now());
    return row ? { token, tokenHash: row.token_hash, actor: { id: row.id, email: row.email, role: row.role } } : null;
  }

  actor(req) {
    return this.#session(req)?.actor ?? null;
  }

  csrfToken(req) {
    const session = this.#session(req);
    return session ? createHmac('sha256', this.#csrfSecret).update(session.token, 'utf8').digest('base64url') : null;
  }

  verifyCsrf(req, actor) {
    const session = this.#session(req);
    const supplied = req.headers['x-csrf-token'];
    if (!session || session.actor.id !== actor?.id || typeof supplied !== 'string') return false;
    const expected = createHmac('sha256', this.#csrfSecret).update(session.token, 'utf8').digest();
    let actual;
    try { actual = Buffer.from(supplied, 'base64url'); } catch { return false; }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  revoke(req) {
    const session = this.#session(req);
    if (session) this.#db.prepare('DELETE FROM app_sessions WHERE token_hash=?').run(session.tokenHash);
  }

  close() {
    this.#db.close();
  }
}
