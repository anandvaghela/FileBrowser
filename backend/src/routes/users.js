'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, dbUserToJson } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — admin: list all
router.get('/', requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  const users = rows.map(r => {
    const u = dbUserToJson(r);
    delete u._raw;
    return u;
  });
  return res.json(users);
});

// GET /api/users/:id — self or admin
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (req.user.id !== id && !req.user.perm.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'User not found' });

  const u = dbUserToJson(row);
  if (!req.user.perm.admin) {
    delete u.scope; // non-admins can't see scope
  }
  return res.json(u);
});

// POST /api/users — admin: create user
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, scope, perm, locale, viewMode, commands } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = getDb();
  const settings = db.prepare('SELECT min_pwd_length FROM settings WHERE id = 1').get();
  const minLen = settings?.min_pwd_length || 8;

  if (password.length < minLen) {
    return res.status(400).json({ error: `Password must be at least ${minLen} characters` });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);

  const p = perm || {};
  db.prepare(`
    INSERT INTO users
      (username, password, scope, locale, view_mode,
       perm_admin, perm_execute, perm_create, perm_rename,
       perm_modify, perm_delete, perm_share, perm_download, commands)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    username, hash,
    scope || `/${username}`,
    locale || 'en',
    viewMode || 'mosaic',
    p.admin ? 1 : 0,
    p.execute ? 1 : 0,
    p.create !== false ? 1 : 0,
    p.rename !== false ? 1 : 0,
    p.modify !== false ? 1 : 0,
    p.delete !== false ? 1 : 0,
    p.share !== false ? 1 : 0,
    p.download !== false ? 1 : 0,
    JSON.stringify(commands || []),
  );

  const created = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const u = dbUserToJson(created);

  res.setHeader('Location', `/api/users/${u.id}`);
  return res.status(201).json(u);
});

// PUT /api/users/:id — self (limited fields) or admin (all fields)
router.put('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (req.user.id !== id && !req.user.perm.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'User not found' });

  const body = req.body;
  const isAdmin = req.user.perm.admin;

  // Fields non-admins can update
  const updates = {};

  if (body.locale !== undefined) updates.locale = body.locale;
  if (body.viewMode !== undefined) updates.view_mode = body.viewMode;
  if (body.singleClick !== undefined) updates.single_click = body.singleClick ? 1 : 0;
  if (body.hideDotfiles !== undefined) updates.hide_dotfiles = body.hideDotfiles ? 1 : 0;
  if (body.dateFormat !== undefined) updates.date_format = body.dateFormat ? 1 : 0;

  // Password change (self or admin)
  if (body.password) {
    if (!isAdmin && row.lock_password) {
      return res.status(403).json({ error: 'Password is locked' });
    }
    // Require current password for self
    if (!isAdmin && body.currentPassword) {
      const valid = await bcrypt.compare(body.currentPassword, row.password);
      if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    }
    const db2 = getDb();
    const settings = db2.prepare('SELECT min_pwd_length FROM settings WHERE id = 1').get();
    const minLen = settings?.min_pwd_length || 8;
    if (body.password.length < minLen) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters` });
    }
    updates.password = await bcrypt.hash(body.password, 10);
  }

  // Admin-only fields
  if (isAdmin) {
    if (body.username !== undefined) updates.username = body.username;
    if (body.scope !== undefined) updates.scope = body.scope;
    if (body.lockPassword !== undefined) updates.lock_password = body.lockPassword ? 1 : 0;
    if (body.commands !== undefined) updates.commands = JSON.stringify(body.commands);
    if (body.rules !== undefined) updates.rules = JSON.stringify(body.rules);
    if (body.perm) {
      const p = body.perm;
      if (p.admin !== undefined) updates.perm_admin = p.admin ? 1 : 0;
      if (p.execute !== undefined) updates.perm_execute = p.execute ? 1 : 0;
      if (p.create !== undefined) updates.perm_create = p.create ? 1 : 0;
      if (p.rename !== undefined) updates.perm_rename = p.rename ? 1 : 0;
      if (p.modify !== undefined) updates.perm_modify = p.modify ? 1 : 0;
      if (p.delete !== undefined) updates.perm_delete = p.delete ? 1 : 0;
      if (p.share !== undefined) updates.perm_share = p.share ? 1 : 0;
      if (p.download !== undefined) updates.perm_download = p.download ? 1 : 0;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.updated_at = Math.floor(Date.now() / 1000);

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return res.json(dbUserToJson(updated));
});

// DELETE /api/users/:id — self or admin
router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (req.user.id !== id && !req.user.perm.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Require current password for self-deletion
  const { currentPassword } = req.body || {};
  if (req.user.id === id && currentPassword) {
    const db = getDb();
    const row = db.prepare('SELECT password FROM users WHERE id = ?').get(id);
    const valid = await bcrypt.compare(currentPassword, row.password);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
  }

  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return res.status(200).json({ message: 'User deleted' });
});

module.exports = router;
