'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');
const { resolvePath, statSafe, buildFileInfo, walkDir } = require('../services/fileSystem');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10737418240') },
});

// Helper: check if current user has access to item_path, returns { owner, can_write } or null
function getShareAccess(db, userId, itemPath) {
  // Strip trailing slash for matching
  const normalised = itemPath.replace(/\/$/, '');
  // Check direct share or parent folder share
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

// GET /api/shared-resources/* — browse shared files
router.get('/*', requireAuth, (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const db = getDb();
  const access = getShareAccess(db, req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access to this shared item' });

  try {
    const absPath = resolvePath(access.scope, urlPath);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    const info = buildFileInfo(absPath, urlPath, {
      expand: stat.isDirectory(),
      content: !stat.isDirectory(),
      sorting: {},
    });
    info.canWrite = !!access.can_write;
    return res.json(info);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/shared-resources/* — upload/create inside shared folder (needs can_write)
router.post('/*', requireAuth, upload.single('file'), async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const db = getDb();
  const access = getShareAccess(db, req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const absPath = resolvePath(access.scope, urlPath);

    if (urlPath.endsWith('/')) {
      await fse.ensureDir(absPath);
      return res.status(200).json({ message: 'Directory created' });
    }

    await fse.ensureDir(path.dirname(absPath));
    if (req.file) {
      await fse.writeFile(absPath, req.file.buffer);
    } else {
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(absPath);
        req.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        req.on('error', reject);
      });
    }
    return res.status(200).json({ message: 'File uploaded' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shared-resources/* — delete inside shared folder (needs can_write)
router.delete('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const db = getDb();
  const access = getShareAccess(db, req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const absPath = resolvePath(access.scope, urlPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Not found' });
    await fse.remove(absPath);
    return res.status(204).end();
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shared-resources/* — rename inside shared folder (needs can_write)
router.patch('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const destination = req.query.destination;
  if (!destination) return res.status(400).json({ error: 'destination required' });

  const dstUrlPath = '/' + decodeURIComponent(destination).replace(/^\//, '');
  const db = getDb();
  const access = getShareAccess(db, req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const srcAbs = resolvePath(access.scope, urlPath);
    const dstAbs = resolvePath(access.scope, dstUrlPath);
    if (!fs.existsSync(srcAbs)) return res.status(404).json({ error: 'Source not found' });
    await fse.move(srcAbs, dstAbs, { overwrite: true });
    return res.status(200).json({ message: 'Done' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
