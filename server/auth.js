// server/auth.js - Autenticacion JWT + roles
const crypto = require('crypto');
const db = require('./db');
const fs = require('fs');
const path = require('path');

const AUTH_AGENT_DESCRIPTOR = {
  id: 'auth',
  nombre: 'Agente de Identidad y Acceso',
  categoria: 'soporte',
};

const ALLOWED_ROLES = new Set(['user', 'admin']);
const TOKEN_TTL = 86400000 * (parseInt(process.env.JWT_TTL_DAYS, 10) || 7);
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');

function resolveDataDir() {
  if (!process.env.DATA_DIR) {
    return DEFAULT_DATA_DIR;
  }

  return path.isAbsolute(process.env.DATA_DIR)
    ? process.env.DATA_DIR
    : path.resolve(__dirname, '..', process.env.DATA_DIR);
}

function getOrCreateSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(resolveDataDir(), '.jwt_secret');

  try {
    if (fs.existsSync(secretFile)) {
      const persistedSecret = fs.readFileSync(secretFile, 'utf8').trim();
      if (persistedSecret) return persistedSecret;
    }
  } catch (error) {
    // Secret file unavailable; continue with generated secret.
  }

  const secret = crypto.randomBytes(32).toString('hex');

  try {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, secret);
    console.warn('[AUTH] JWT_SECRET no configurado. Se genero uno persistente en', secretFile);
  } catch (error) {
    console.warn('[AUTH] JWT_SECRET no configurado y no pude persistirlo. Los tokens caducaran al reiniciar.');
  }

  return secret;
}

const SECRET = getOrCreateSecret();

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + TOKEN_TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const expectedBuf = Buffer.from(expected);
    const sigBuf = Buffer.from(signature);
    if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function hashPw(password, salt) {
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, effectiveSalt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt: effectiveSalt };
}

function normalizeCommunityCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

const TRUTHY_VALUES = ['true', '1', 'si', 'sí', 'yes', 'y', 'on'];
const FALSY_VALUES = ['false', '0', 'no', 'n', 'off'];

function parseStringToBool(str) {
  const normalized = str.trim().toLowerCase();
  if (TRUTHY_VALUES.includes(normalized)) return true;
  if (FALSY_VALUES.includes(normalized)) return false;
  return undefined;
}

function asBool(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const result = parseStringToBool(value);
    if (result !== undefined) return result;
  }
  return fallback;
}

function parseBooleanInput(value, fieldName, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const result = parseStringToBool(value);
    if (result !== undefined) return result;
  }
  throw createError(`${fieldName} debe ser booleano`);
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    role: user.role || 'user',
    company: user.company || '',
    ruc: user.ruc || '',
    active: asBool(user.active, true),
    approved: asBool(user.approved, true),
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
    last_login: user.last_login || null,
  };
}

function getUserById(id) {
  if (!id) return null;
  return db.get('SELECT * FROM users WHERE id=?', [id]);
}

function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return db.get('SELECT * FROM users WHERE email=?', [normalizedEmail]);
}

function assertAllowedRole(role) {
  const normalizedRole = normalizeRole(role);
  if (!ALLOWED_ROLES.has(normalizedRole)) {
    throw createError('Rol fuera de catalogo');
  }

  return normalizedRole;
}

function assertPasswordStrength(password) {
  if (!password) throw createError('Contrasena requerida');
  if (String(password).length < 6) throw createError('Contrasena minimo 6 caracteres');
}

function assertUserHasAccess(user) {
  if (!user) throw createError('Cuenta no encontrada', 401);
  if (!asBool(user.approved, true)) {
    throw createError('Tu acceso aun no fue aprobado. Contacta al administrador.', 403);
  }
  if (!asBool(user.active, true)) {
    throw createError('Tu acceso fue suspendido. Contacta al administrador.', 403);
  }
}

function insertUserRecord({ email, password, name, company, ruc, role = 'user', active = true, approved = true }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw createError('Email requerido');
  assertPasswordStrength(password);
  const normalizedRole = assertAllowedRole(role);

  if (getUserByEmail(normalizedEmail)) {
    throw createError('Email ya registrado');
  }

  const id = `u_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const { hash, salt } = hashPw(password);

  db.run(
    'INSERT INTO users(id,email,name,password_hash,password_salt,role,company,ruc,active,approved,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,datetime(\'now\'))',
    [
      id,
      normalizedEmail,
      name || '',
      hash,
      salt,
      normalizedRole,
      company || '',
      ruc || '',
      active ? 1 : 0,
      approved ? 1 : 0,
    ]
  );

  return getUserById(id);
}

function resolveAuthenticatedUser(token) {
  const payload = verify(token);
  if (!payload) return null;

  try {
    const user = getUserById(payload.id);
    assertUserHasAccess(user);
    return sanitizeUser(user);
  } catch (error) {
    return null;
  }
}

function initUsersTable() {
  console.log('[AUTH] Tabla de users ya existe');
}

module.exports = {
  AUTH_AGENT_DESCRIPTOR,
  initUsersTable,

  checkCommunityAccessCode(code) {
    const configuredCode = normalizeCommunityCode(process.env.COMMUNITY_ACCESS_CODE);
    const incomingCode = normalizeCommunityCode(code);

    if (!configuredCode) {
      if (process.env.NODE_ENV === 'production') {
        return {
          ok: false,
          error: 'El alta privada no esta disponible. Configura COMMUNITY_ACCESS_CODE para permitirla.',
        };
      }

      return { ok: true, enforced: false };
    }

    if (!incomingCode) {
      return { ok: false, error: 'Codigo de comunidad requerido' };
    }

    if (incomingCode !== configuredCode) {
      return { ok: false, error: 'Codigo de comunidad incorrecto' };
    }

    return { ok: true, enforced: true };
  },

  requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });

    const payload = verify(header.slice(7));
    if (!payload) return res.status(401).json({ error: 'Token no interpretable o expirado' });

    try {
      const user = getUserById(payload.id);
      assertUserHasAccess(user);
      req.user = sanitizeUser(user);
      next();
    } catch (error) {
      res.status(error.statusCode || 401).json({ error: error.message });
    }
  },

  requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
  },

  optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const user = resolveAuthenticatedUser(header.slice(7));
      if (user) req.user = user;
    }
    next();
  },

  register(email, password, name, company, ruc) {
    const user = insertUserRecord({ email, password, name, company, ruc, role: 'user' });
    return {
      ...sanitizeUser(user),
      token: sign({ id: user.id, email: user.email, role: user.role, name: user.name }),
    };
  },

  login(email, password) {
    const user = getUserByEmail(email);
    if (!user) throw createError('Email no encontrado', 401);

    const { hash } = hashPw(password, user.password_salt);
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(user.password_hash, 'hex');
    if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
      throw createError('Contrasena incorrecta', 401);
    }

    assertUserHasAccess(user);
    db.run('UPDATE users SET last_login=datetime(\'now\'), updated_at=datetime(\'now\') WHERE id=?', [user.id]);
    const freshUser = getUserById(user.id);

    return {
      ...sanitizeUser(freshUser),
      token: sign({ id: freshUser.id, email: freshUser.email, role: freshUser.role, name: freshUser.name }),
    };
  },

  listUsers() {
    return db
      .all('SELECT * FROM users ORDER BY CASE WHEN role = ? THEN 0 ELSE 1 END, created_at DESC', ['admin'])
      .map(sanitizeUser);
  },

  createUserByAdmin(payload = {}) {
    const user = insertUserRecord({
      email: payload.email,
      password: payload.password,
      name: payload.name,
      company: payload.company,
      ruc: payload.ruc,
      role: payload.role || 'user',
      active: parseBooleanInput(payload.active, 'active', true),
      approved: parseBooleanInput(payload.approved, 'approved', true),
    });

    return sanitizeUser(user);
  },

  updateUserAccess(id, updates = {}, actorId) {
    const user = getUserById(id);
    if (!user) throw createError('Usuario no encontrado', 404);

    const nextRole = assertAllowedRole(updates.role ?? user.role ?? 'user');
    const nextActive = updates.active !== undefined
      ? parseBooleanInput(updates.active, 'active', true)
      : asBool(user.active, true);
    const nextApproved = updates.approved !== undefined
      ? parseBooleanInput(updates.approved, 'approved', true)
      : asBool(user.approved, true);

    if (actorId && actorId === user.id) {
      if (nextRole !== 'admin') throw createError('No puedes quitarte el rol admin a ti mismo.', 400);
      if (!nextActive) throw createError('No puedes suspender tu propia cuenta.', 400);
      if (!nextApproved) throw createError('No puedes revocar tu propia aprobacion.', 400);
    }

    db.run(
      'UPDATE users SET name=?, role=?, company=?, ruc=?, active=?, approved=?, updated_at=datetime(\'now\') WHERE id=?',
      [
        updates.name ?? user.name ?? '',
        nextRole,
        updates.company ?? user.company ?? '',
        updates.ruc ?? user.ruc ?? '',
        nextActive ? 1 : 0,
        nextApproved ? 1 : 0,
        user.id,
      ]
    );

    return sanitizeUser(getUserById(user.id));
  },

  resetUserPassword(id, password) {
    assertPasswordStrength(password);
    const user = getUserById(id);
    if (!user) throw createError('Usuario no encontrado', 404);

    const { hash, salt } = hashPw(password);
    db.run(
      'UPDATE users SET password_hash=?, password_salt=?, updated_at=datetime(\'now\') WHERE id=?',
      [hash, salt, user.id]
    );

    return sanitizeUser(getUserById(user.id));
  },

  sanitizeUser,
  resolveAuthenticatedUser,
  _private: {
    asBool,
    parseBooleanInput,
  },
};
