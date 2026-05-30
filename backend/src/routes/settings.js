'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function rowToSettings(row) {
  if (!row) return null;
  return {
    signup: !!row.signup,
    createUserDir: !!row.create_user_dir,
    userHomeBasePath: row.user_home_base || '/users',
    authMethod: row.auth_method || 'json',
    branding: JSON.parse(row.branding || '{}'),
    commands: JSON.parse(row.commands || '{}'),
    shell: JSON.parse(row.shell || '[]'),
    rules: JSON.parse(row.rules || '[]'),
    minimumPasswordLength: row.min_pwd_length || 8,
    hideDotfiles: !!row.hide_dotfiles,
  };
}

// GET /api/settings — admin only
router.get('/', requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return res.json(rowToSettings(row));
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, (req, res) => {
  const body = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE settings SET
      signup          = ?,
      create_user_dir = ?,
      user_home_base  = ?,
      auth_method     = ?,
      branding        = ?,
      commands        = ?,
      shell           = ?,
      rules           = ?,
      min_pwd_length  = ?,
      hide_dotfiles   = ?
    WHERE id = 1
  `).run(
    body.signup ? 1 : 0,
    body.createUserDir ? 1 : 0,
    body.userHomeBasePath || '/users',
    body.authMethod || 'json',
    JSON.stringify(body.branding || {}),
    JSON.stringify(body.commands || {}),
    JSON.stringify(body.shell || []),
    JSON.stringify(body.rules || []),
    body.minimumPasswordLength || 8,
    body.hideDotfiles ? 1 : 0,
  );

  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  return res.json(rowToSettings(row));
});

module.exports = router;
