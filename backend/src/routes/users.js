'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Settings, dbUserToJson } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — admin: list all, authenticated users: list usernames only (for sharing)
router.get('/', requireAuth, async (req, res) => {
  try {
    if (req.user.perm.admin) {
      const rows = await User.find().sort({ id: 1 });
      return res.json(rows.map(r => { const u = dbUserToJson(r); delete u._raw; return u; }));
    }
    // Non-admins get only id + username (for sharing UI), excluding themselves
    const rows = await User.find({ id: { $ne: req.user.id } }, 'id username').sort({ username: 1 });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — self or admin
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (req.user.id !== id && !req.user.perm.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const row = await User.findOne({ id });
    if (!row) return res.status(404).json({ error: 'User not found' });

    const u = dbUserToJson(row);
    if (!req.user.perm.admin) {
      delete u.scope; // non-admins can't see scope
    }
    return res.json(u);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users — admin: create user
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, scope, perm, locale, viewMode, commands } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const settings = await Settings.findOne({ id: 1 });
    const minLen = settings?.min_pwd_length || 8;
    const userHomeBase = settings?.user_home_base || '/users';
    const createUserDir = !!settings?.create_user_dir;

    if (password.length < minLen) {
      return res.status(400).json({ error: `Password must be at least ${minLen} characters` });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, 10);

    // Resolve scope: replace {username} placeholder, or default to userHomeBase + username if empty/invalid
    let finalScope = scope;
    if (!finalScope || finalScope === '.' || finalScope === '/') {
      finalScope = `${userHomeBase}/${username}`.replace(/\/+/g, '/');
    } else {
      finalScope = finalScope.replace('{username}', username);
    }
    if (!finalScope.startsWith('/')) {
      finalScope = '/' + finalScope;
    }

    // Create directory prefix in S3 if setting is enabled
    if (createUserDir) {
      const { s3, BUCKET_NAME } = require('../services/fileSystem');
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const s3Prefix = finalScope.replace(/^\//, '') + '/';
      try {
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Prefix,
          Body: ''
        }));
      } catch (e) {
        console.error('Failed to create user directory in S3:', e);
      }
    }

    const p = perm || {};
    const newUser = await User.create({
      username,
      password: hash,
      scope: finalScope,
      locale: locale || 'en',
      view_mode: viewMode || 'mosaic',
      perm_admin: p.admin ? 1 : 0,
      perm_execute: p.execute ? 1 : 0,
      perm_create: p.create !== false ? 1 : 0,
      perm_rename: p.rename !== false ? 1 : 0,
      perm_modify: p.modify !== false ? 1 : 0,
      perm_delete: p.delete !== false ? 1 : 0,
      perm_share: p.share !== false ? 1 : 0,
      perm_download: p.download !== false ? 1 : 0,
      commands: JSON.stringify(commands || []),
    });

    const u = dbUserToJson(newUser);

    res.setHeader('Location', `/api/users/${u.id}`);
    return res.status(201).json(u);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — self (limited fields) or admin (all fields)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (req.user.id !== id && !req.user.perm.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const row = await User.findOne({ id });
    if (!row) return res.status(404).json({ error: 'User not found' });

    const body = req.body;
    const isAdmin = req.user.perm.admin;

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
      const settings = await Settings.findOne({ id: 1 });
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

    await User.updateOne({ id }, { $set: updates });

    const updated = await User.findOne({ id });
    return res.json(dbUserToJson(updated));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — self or admin
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (req.user.id !== id && !req.user.perm.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Require current password for self-deletion
    const { currentPassword } = req.body || {};
    if (req.user.id === id && currentPassword) {
      const row = await User.findOne({ id });
      const valid = await bcrypt.compare(currentPassword, row.password);
      if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    }

    await User.deleteOne({ id });
    return res.status(200).json({ message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
