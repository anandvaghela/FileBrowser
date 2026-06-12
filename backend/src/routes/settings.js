'use strict';

const express = require('express');
const { Settings } = require('../db');
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
router.get('/', requireAdmin, async (req, res) => {
  try {
    const row = await Settings.findOne({ id: 1 });
    return res.json(rowToSettings(row));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — admin only
router.put('/', requireAdmin, async (req, res) => {
  const body = req.body;
  try {
    await Settings.updateOne({ id: 1 }, {
      $set: {
        signup: body.signup ? 1 : 0,
        create_user_dir: body.createUserDir ? 1 : 0,
        user_home_base: body.userHomeBasePath || '/users',
        auth_method: body.authMethod || 'json',
        branding: JSON.stringify(body.branding || {}),
        commands: JSON.stringify(body.commands || {}),
        shell: JSON.stringify(body.shell || []),
        rules: JSON.stringify(body.rules || []),
        min_pwd_length: body.minimumPasswordLength || 8,
        hide_dotfiles: body.hideDotfiles ? 1 : 0,
      }
    }, { upsert: true });

    const row = await Settings.findOne({ id: 1 });
    return res.json(rowToSettings(row));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
