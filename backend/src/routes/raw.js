'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const mime = require('mime-types');
const { requireAuth } = require('../middleware/auth');
const { resolvePath, statSafe } = require('../services/fileSystem');

const router = express.Router();

// GET /api/raw/* — download a raw file or a zipped directory
router.get('/*', requireAuth, async (req, res) => {
  if (!req.user.perm.download) {
    return res.status(403).json({ error: 'Download permission denied' });
  }

  const urlPath = '/' + (req.params[0] || '');
  const inline = req.query.inline === 'true';
  const algo = req.query.algo; // for checksum (unused here — see resources route)

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
    if (!stat) return res.status(404).json({ error: 'Not found' });

    if (stat.isDirectory()) {
      const name = path.basename(absPath) || 'files';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', err => {
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      archive.pipe(res);
      archive.directory(absPath, name);
      await archive.finalize();
    } else {
      const mimeType = mime.lookup(absPath) || 'application/octet-stream';
      const name = path.basename(absPath);
      const disposition = inline ? 'inline' : `attachment; filename="${name}"`;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', disposition);
      res.setHeader('Content-Length', stat.size);

      // Support range requests for video/audio
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);

        fs.createReadStream(absPath, { start, end }).pipe(res);
      } else {
        res.setHeader('Accept-Ranges', 'bytes');
        fs.createReadStream(absPath).pipe(res);
      }
    }
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
