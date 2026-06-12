'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Settings, dbUserToJson } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const row = await User.findOne({ username });
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
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/signup
router.post('/signup', async (req, res) => {
  try {
    const settings = await Settings.findOne({ id: 1 });

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

    const existing = await User.findOne({ username });
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

    await User.create({
      username,
      password: hash,
      scope: finalScope,
      locale: branding.defaultLanguage || 'en',
      view_mode: 'mosaic',
      perm_admin: defaultPerm.admin ? 1 : 0,
      perm_execute: defaultPerm.execute ? 1 : 0,
      perm_create: defaultPerm.create !== false ? 1 : 0,
      perm_rename: defaultPerm.rename !== false ? 1 : 0,
      perm_modify: defaultPerm.modify !== false ? 1 : 0,
      perm_delete: defaultPerm.delete !== false ? 1 : 0,
      perm_share: defaultPerm.share !== false ? 1 : 0,
      perm_download: defaultPerm.download !== false ? 1 : 0,
      commands: JSON.stringify(branding.defaultCommands || []),
    });

    return res.status(200).json({ message: 'User created' });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/renew  — exchange current token for a fresh one
router.post('/renew', requireAuth, (req, res) => {
  res.setHeader('X-Renew-Token', 'false');
  const token = signToken(req.user);
  return res.json({ token, user: req.user });
});

module.exports = router;
