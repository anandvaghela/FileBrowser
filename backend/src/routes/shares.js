'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Share, User } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { s3, BUCKET_NAME, resolvePath, buildFileInfo, statSafe, walkDir } = require('../services/fileSystem');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const archiver = require('archiver');
const path = require('path');

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

function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// GET /api/shares — list all (admin) or own (user)
router.get('/shares', requireAuth, async (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  try {
    let rows;
    if (req.user.perm.admin) {
      rows = await Share.find().sort({ user_id: 1, expire: 1 });
    } else {
      rows = await Share.find({ user_id: req.user.id }).sort({ expire: 1 });
    }
    return res.json(rows.map(shareToJson));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/share/* — get shares for a specific path
router.get('/share/*', requireAuth, async (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const urlPath = '/' + (req.params[0] || '');
  try {
    let rows;
    const pathPattern = new RegExp('^' + escapeRegex(urlPath));
    if (req.user.perm.admin) {
      rows = await Share.find({ path: pathPattern });
    } else {
      rows = await Share.find({ path: pathPattern, user_id: req.user.id });
    }
    return res.json(rows.map(shareToJson));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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

  try {
    const newShare = await Share.create({
      hash,
      path: urlPath,
      user_id: req.user.id,
      expire,
      password_hash: passwordHash,
      token
    });

    return res.json(shareToJson(newShare));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/share/:hash — delete a share
router.delete('/share/:hash', requireAuth, async (req, res) => {
  if (!canShare(req.user)) return res.status(403).json({ error: 'Share permission denied' });

  const { hash } = req.params;
  try {
    const row = await Share.findOne({ hash });
    if (!row) return res.status(404).json({ error: 'Share not found' });

    if (row.user_id !== req.user.id && !req.user.perm.admin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Share.deleteOne({ hash });
    return res.status(200).json({ message: 'Share deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/public/share/:hash — get share info (public)
router.get('/public/share/:hash', async (req, res) => {
  const { hash } = req.params;
  const password = req.query.password || req.headers['x-share-password'];

  try {
    const share = await Share.findOne({ hash });
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
    const owner = await User.findOne({ id: share.user_id });
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const absPath = await resolvePath(owner.scope, share.path);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'File not found' });

    const info = await buildFileInfo(absPath, share.path, { expand: stat.isDirectory() });
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

  try {
    const share = await Share.findOne({ hash });
    if (!share) return res.status(404).json({ error: 'Share not found' });

    if (share.expire > 0 && Math.floor(Date.now() / 1000) > share.expire) {
      return res.status(410).json({ error: 'Share link expired' });
    }

    if (share.password_hash) {
      if (!password) return res.status(401).json({ error: 'Password required', passwordRequired: true });
      const valid = await bcrypt.compare(password, share.password_hash);
      if (!valid) return res.status(403).json({ error: 'Wrong password' });
    }

    const owner = await User.findOne({ id: share.user_id });
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const absPath = await resolvePath(owner.scope, share.path);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'File not found' });

    if (stat.isDirectory()) {
      const name = path.basename(share.path) || 'files';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(res);

      const files = await walkDir(absPath, share.path);
      for (const file of files) {
        if (file.isDir) continue;
        const relativePath = file.path.slice(share.path.length).replace(/^\//, '');
        const fileKey = await resolvePath(owner.scope, file.path);
        try {
          const fileObj = await s3.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey
          }));
          archive.append(fileObj.Body, { name: relativePath });
        } catch (err) {
          console.error('Failed to append file to zip from S3:', fileKey, err);
        }
      }
      await archive.finalize();
    } else {
      const name = path.basename(absPath);
      const mime = require('mime-types');
      res.setHeader('Content-Type', mime.lookup(absPath) || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.setHeader('Content-Length', stat.size);

      const fileObj = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath
      }));
      fileObj.Body.pipe(res);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
