'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, dbUserToJson } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, row.password);
  if (!valid) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  const user = dbUserToJson(row);
  const token = signToken(user);

  return res.json({ token, user });
});

// POST /api/signup
router.post('/signup', async (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

  if (!settings || !settings.signup) {
    return res.status(405).json({ error: 'Signup is disabled' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const minLen = settings.min_pwd_length || 8;
  if (password.length < minLen) {
    return res.status(400).json({ error: `Password must be at least ${minLen} characters` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const branding = JSON.parse(settings.branding || '{}');
  const defaultPerm = branding.defaultPerm || {
    admin: false, execute: false, create: true,
    rename: true, modify: true, delete: true, share: true, download: true,
  };
  const userHomeBase = settings.user_home_base || '/users';
  const createUserDir = !!settings.create_user_dir;

  // Resolve scope: replace {username} placeholder, or default to userHomeBase + username if empty/invalid
  let finalScope = branding.defaultScope;
  if (!finalScope || finalScope === '.' || finalScope === '/') {
    finalScope = `${userHomeBase}/${username}`.replace(/\/+/g, '/');
  } else {
    finalScope = finalScope.replace('{username}', username);
  }
  if (!finalScope.startsWith('/')) {
    finalScope = '/' + finalScope;
  }

  // Create directory if setting is enabled
  if (createUserDir) {
    const fs = require('fs');
    const path = require('path');
    const { FILES_ROOT } = require('../services/fileSystem');
    const dirAbs = path.resolve(FILES_ROOT, finalScope.replace(/^\//, ''));
    if (!fs.existsSync(dirAbs)) {
      fs.mkdirSync(dirAbs, { recursive: true });
    }
  }

  db.prepare(`
    INSERT INTO users
      (username, password, scope, locale, view_mode,
       perm_admin, perm_execute, perm_create, perm_rename,
       perm_modify, perm_delete, perm_share, perm_download, commands)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username, hash,
    finalScope,
    branding.defaultLanguage || 'en',
    'mosaic',
    defaultPerm.admin ? 1 : 0,
    defaultPerm.execute ? 1 : 0,
    defaultPerm.create !== false ? 1 : 0,
    defaultPerm.rename !== false ? 1 : 0,
    defaultPerm.modify !== false ? 1 : 0,
    defaultPerm.delete !== false ? 1 : 0,
    defaultPerm.share !== false ? 1 : 0,
    defaultPerm.download !== false ? 1 : 0,
    JSON.stringify(branding.defaultCommands || []),
  );

  return res.status(200).json({ message: 'User created' });
});

// POST /api/renew  — exchange current token for a fresh one
router.post('/renew', requireAuth, (req, res) => {
  res.setHeader('X-Renew-Token', 'false');
  const token = signToken(req.user);
  return res.json({ token, user: req.user });
});

module.exports = router;
