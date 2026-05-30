'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { resolvePath, buildFileInfo, statSafe } = require('../services/fileSystem');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

const router = express.Router();

function canShare(user) {
  return user.perm.share && user.perm.download;
}

function shareToJson(s) {
  return {
    id: s.id,
    hash: s.hash,
    path: s.path,
    userId: s.user_id,
    expire: s.expire,
    hasPassword: !!s.password_hash,
    token: s.token || undefined,
    createdAt: s.created_at,
  };
}

// GET /api/shares — list all (admin) or own (user)
router.get('/shares', requireAuth, (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const db = getDb();
  let rows;
  if (req.user.perm.admin) {
    rows = db.prepare('SELECT * FROM shares ORDER BY user_id, expire').all();
  } else {
    rows = db.prepare('SELECT * FROM shares WHERE user_id = ? ORDER BY expire').all(req.user.id);
  }
  return res.json(rows.map(shareToJson));
});

// GET /api/share/* — get shares for a specific path
router.get('/share/*', requireAuth, (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const urlPath = '/' + (req.params[0] || '');
  const db = getDb();
  let rows;
  if (req.user.perm.admin) {
    rows = db.prepare('SELECT * FROM shares WHERE path LIKE ?').all(urlPath + '%');
  } else {
    rows = db.prepare('SELECT * FROM shares WHERE path LIKE ? AND user_id = ?').all(urlPath + '%', req.user.id);
  }
  return res.json(rows.map(shareToJson));
});

// POST /api/share/* — create a share link
router.post('/share/*', requireAuth, async (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const urlPath = '/' + (req.params[0] || '');
  const { expires, unit, password } = req.body || {};

  const hashBytes = crypto.randomBytes(6);
  const hash = hashBytes.toString('base64url');

  let expire = 0;
  if (expires) {
    const num = parseInt(expires);
    const durations = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
    const mult = durations[unit] || 3600;
    expire = Math.floor(Date.now() / 1000) + num * mult;
  }

  let passwordHash = '';
  let token = '';
  if (password) {
    passwordHash = await bcrypt.hash(password, 10);
    const tokenBuf = crypto.randomBytes(96);
    token = tokenBuf.toString('base64url');
  }

  const db = getDb();
  db.prepare(`
    INSERT INTO shares (hash, path, user_id, expire, password_hash, token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(hash, urlPath, req.user.id, expire, passwordHash, token);

  const row = db.prepare('SELECT * FROM shares WHERE hash = ?').get(hash);
  return res.json(shareToJson(row));
});

// DELETE /api/share/:hash — delete a share
router.delete('/share/:hash', requireAuth, async (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const { hash } = req.params;
  const db = getDb();
  const row = db.prepare('SELECT * FROM shares WHERE hash = ?').get(hash);
  if (!row) return res.status(404).json({ error: 'Share not found' });

  if (row.user_id !== req.user.id && !req.user.perm.admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.prepare('DELETE FROM shares WHERE hash = ?').run(hash);
  return res.status(200).json({ message: 'Share deleted' });
});

// GET /api/public/share/:hash — get share info (public)
router.get('/public/share/:hash', async (req, res) => {
  const { hash } = req.params;
  const password = req.query.password || req.headers['x-share-password'];

  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE hash = ?').get(hash);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  // Check expiry
  if (share.expire > 0 && Math.floor(Date.now() / 1000) > share.expire) {
    return res.status(410).json({ error: 'Share link expired' });
  }

  // Check password
  if (share.password_hash) {
    if (!password) return res.status(401).json({ error: 'Password required', passwordRequired: true });
    const valid = await bcrypt.compare(password, share.password_hash);
    if (!valid) return res.status(403).json({ error: 'Wrong password' });
  }

  // Load file/dir info
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(share.user_id);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });

  try {
    const absPath = resolvePath(owner.scope, share.path);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'File not found' });

    const info = buildFileInfo(absPath, share.path, { expand: stat.isDirectory() });
    info.share = shareToJson(share);
    return res.json(info);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/public/dl/:hash — download shared file/dir
router.get('/public/dl/:hash', async (req, res) => {
  const { hash } = req.params;
  const password = req.query.password || req.headers['x-share-password'];

  const db = getDb();
  const share = db.prepare('SELECT * FROM shares WHERE hash = ?').get(hash);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  if (share.expire > 0 && Math.floor(Date.now() / 1000) > share.expire) {
    return res.status(410).json({ error: 'Share link expired' });
  }

  if (share.password_hash) {
    if (!password) return res.status(401).json({ error: 'Password required', passwordRequired: true });
    const valid = await bcrypt.compare(password, share.password_hash);
    if (!valid) return res.status(403).json({ error: 'Wrong password' });
  }

  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(share.user_id);
  if (!owner) return res.status(404).json({ error: 'Owner not found' });

  try {
    const absPath = resolvePath(owner.scope, share.path);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'File not found' });

    if (stat.isDirectory()) {
      // Zip and stream
      const name = path.basename(share.path) || 'files';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(res);
      archive.directory(absPath, name);
      await archive.finalize();
    } else {
      const name = path.basename(absPath);
      const mime = require('mime-types');
      res.setHeader('Content-Type', mime.lookup(absPath) || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(absPath).pipe(res);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
