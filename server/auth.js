// server/auth.js — Autenticación JWT + roles
const crypto = require('crypto');
const db = require('./db');
const fs = require('fs');
const path = require('path');

const AUTH_AGENT_DESCRIPTOR = {
  id: 'auth',
  nombre: 'Agente de Identidad y Acceso',
  categoria: 'soporte',
};

// JWT Secret: use env, or generate once and persist to file so it survives restarts
function getOrCreateSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(process.env.DATA_DIR || './data', '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  } catch (error) { /* secret file unavailable */ }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, secret);
    console.warn('[AUTH] ⚠ JWT_SECRET not set in .env — generated and saved to', secretFile);
  } catch (error) { console.warn('[AUTH] ⚠ JWT_SECRET not set and could not save. Tokens will invalidate on restart!'); }
  return secret;
}
const SECRET = getOrCreateSecret();
const TOKEN_TTL = 86400000 * 7; // 7 days

// Simple JWT (no dependency needed)
function base64url(str) { return Buffer.from(str).toString('base64url'); }
function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + TOKEN_TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verify(token) {
  try {
    const [h, b, s] = token.split('.');
    const check = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
    if (check !== s) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (error) { return null; }
}
function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function normalizeCommunityCode(value) {
  return String(value || '').trim().toUpperCase();
}

function validateCommunityAccessCode(code) {
  const configuredCode = normalizeCommunityCode(process.env.COMMUNITY_ACCESS_CODE);
  const incomingCode = normalizeCommunityCode(code);

  if (!configuredCode) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        error: 'Registro cerrado temporalmente. Configura COMMUNITY_ACCESS_CODE para habilitar el alta privada.'
      };
    }

    return { ok: true, enforced: false };
  }

  if (!incomingCode) {
    return { ok: false, error: 'Codigo de comunidad requerido' };
  }

  if (incomingCode !== configuredCode) {
    return { ok: false, error: 'Codigo de comunidad invalido' };
  }

  return { ok: true, enforced: true };
}

// DB init for users table (ya se crea en db.js)
function initUsersTable() {
  // Las tablas ya se crean en db.js automáticamente
  console.log('[AUTH] ✅ Tabla de users ya existe');
}

module.exports = {
  AUTH_AGENT_DESCRIPTOR,
  initUsersTable,
  validateCommunityAccessCode,

  // Middleware: require auth
  requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
    const user = verify(header.slice(7));
    if (!user) return res.status(401).json({ error: 'Token inválido o expirado' });
    req.user = user;
    next();
  },

  // Middleware: require admin
  requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    next();
  },

  // Optional auth (doesn't block, just attaches user if present)
  optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) req.user = verify(header.slice(7));
    next();
  },

  register(email, password, name, company, ruc) {
    if (!email || !password) throw new Error('Email y contraseña requeridos');
    if (password.length < 6) throw new Error('Contraseña mínimo 6 caracteres');
    const existing = db.get('SELECT id FROM users WHERE email=?', [email]);
    if (existing) throw new Error('Email ya registrado');
    const id = 'u_' + Date.now();
    const { hash, salt } = hashPw(password);
    db.run('INSERT INTO users(id,email,name,password_hash,password_salt,company,ruc) VALUES(?,?,?,?,?,?,?)',
      [id, email.toLowerCase(), name || '', hash, salt, company || '', ruc || '']);
    return { id, email, name, role: 'user', token: sign({ id, email, role: 'user', name }) };
  },

  login(email, password) {
    const user = db.get('SELECT * FROM users WHERE email=?', [email?.toLowerCase()]);
    if (!user) throw new Error('Email no encontrado');
    const { hash } = hashPw(password, user.password_salt);
    if (hash !== user.password_hash) throw new Error('Contraseña incorrecta');
    db.run('UPDATE users SET last_login=datetime(\'now\') WHERE id=?', [user.id]);
    return {
      id: user.id, email: user.email, name: user.name, role: user.role, company: user.company,
      token: sign({ id: user.id, email: user.email, role: user.role, name: user.name })
    };
  },
};
