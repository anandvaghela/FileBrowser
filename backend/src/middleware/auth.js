'use strict';

const jwt = require('jsonwebtoken');
const { getDb, dbUserToJson } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

/**
 * Extracts the JWT from Authorization header (Bearer) or X-Auth header or auth cookie.
 */
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  if (req.headers['x-auth']) {
    return req.headers['x-auth'];
  }
  if (req.cookies && req.cookies.auth) {
    return req.cookies.auth;
  }
  return null;
}

/**
 * requireAuth – attaches req.user or returns 401.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // Check if token is close to expiry (renew hint)
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!row) {
    return res.status(401).json({ error: 'User not found' });
  }

  const user = dbUserToJson(row);
  user._raw = row; // keep raw for password checks

  // Hint frontend to renew token if it expires within 1 hour
  const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
  if (expiresIn < 3600) {
    res.setHeader('X-Renew-Token', 'true');
  }

  req.user = user;
  next();
}

/**
 * requireAdmin – 403 if user is not admin.
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.perm.admin) {
      return res.status(403).json({ error: 'Admin permission required' });
    }
    next();
  });
}

/**
 * Sign a new JWT for a user row.
 */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      perm: user.perm,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '2h', issuer: 'FileBrowser' }
  );
}

module.exports = { requireAuth, requireAdmin, signToken, extractToken };
