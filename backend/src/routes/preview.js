'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { requireAuth } = require('../middleware/auth');
const { resolvePath, statSafe } = require('../services/fileSystem');

const router = express.Router();

const CACHE_DIR = path.resolve('./data/thumbcache');
fse.ensureDirSync(CACHE_DIR);

const SIZES = { small: 128, medium: 480, big: 1080 };

function cacheKey(userId, scope, urlPath, size) {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(`${userId}:${scope}:${urlPath}:${size}`).digest('hex');
}

// GET /api/preview/:size/:path  — generate or return cached thumbnail
router.get('/:size/*', requireAuth, async (req, res) => {
  const sizeLabel = req.params.size; // small | medium | big
  const pixelSize = SIZES[sizeLabel];
  if (!pixelSize) return res.status(400).json({ error: 'Invalid size. Use: small, medium, big' });

  const urlPath = '/' + (req.params[0] || '');

  const { getDb } = require('../db');

  function getShareAccess(db, userId, itemPath) {
    const normalised = itemPath.replace(/\/$/, '');
    const row = db.prepare(`
      SELECT us.can_write, us.owner_id, u.scope
      FROM user_shares us
      JOIN users u ON u.id = us.owner_id
      WHERE us.shared_with = ?
        AND (us.item_path = ? OR us.item_path = ? OR ? LIKE (us.item_path || '%'))
      ORDER BY LENGTH(us.item_path) DESC
      LIMIT 1
    `).get(userId, normalised, normalised + '/', normalised);
    return row || null;
  }

  try {
    const db = getDb();
    let scopeToUse = req.user.scope;
    const access = getShareAccess(db, req.user.id, urlPath);
    if (access) {
      scopeToUse = access.scope;
    }
    const absPath = resolvePath(scopeToUse, urlPath);
    const stat = statSafe(absPath);
    if (!stat || stat.isDirectory()) return res.status(404).json({ error: 'File not found' });

    const mime = require('mime-types');
    const mimeType = mime.lookup(absPath) || '';

    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      return res.status(415).json({ error: 'Not a previewable file' });
    }

    const key = cacheKey(req.user.id, scopeToUse, urlPath, sizeLabel);
    const cachePath = path.join(CACHE_DIR, key + '.jpg');

    if (fs.existsSync(cachePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(cachePath).pipe(res);
    }

    // Generate thumbnail
    if (!process.env.ENABLE_THUMBNAILS || process.env.ENABLE_THUMBNAILS === 'true') {
      try {
        const sharp = require('sharp');
        await sharp(absPath)
          .resize(pixelSize, pixelSize, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(cachePath);

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(cachePath).pipe(res);
      } catch {
        // Sharp failed (e.g. video) — fall back to raw
      }
    }

    // Fallback: return original
    res.setHeader('Content-Type', mimeType);
    return fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
