'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const {
  resolvePath,
  statSafe,
  buildFileInfo,
  walkDir,
  copyPath,
  movePath,
  addVersionSuffix,
} = require('../services/fileSystem');

const router = express.Router();

// multer: store to a temp path then move ourselves so we control the dest
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10737418240') },
});

// ── Helper: normalise the URL path ────────────────────────────────────────────
function getUrlPath(req, prefix) {
  let p = req.path || '/';
  // remove prefix the router mounted at
  if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length);
  return p || '/';
}

// GET /api/resources/*  — list directory or get file info
router.get('/*', requireAuth, (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  try {
    const absPath = resolvePath(req.user.scope, urlPath);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    const wantsEncoding = req.headers['x-encoding'] === 'true';
    const checksum = req.query.checksum;

    const info = buildFileInfo(absPath, urlPath, {
      expand: stat.isDirectory(),
      content: !stat.isDirectory() && req.user.perm.download,
      sorting: req.user.sorting,
    });

    // If asking for text content as raw bytes
    if (wantsEncoding && !stat.isDirectory()) {
      if (!req.user.perm.download) return res.status(202).end();
      if (info.type !== 'text') return res.json(info);

      const data = fs.readFileSync(absPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(data);
    }

    if (checksum) {
      const algos = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
      const algo = algos[checksum.toLowerCase()];
      if (!algo) return res.status(400).json({ error: 'Invalid checksum algorithm' });

      const crypto = require('crypto');
      const hash = crypto.createHash(algo);
      hash.update(fs.readFileSync(absPath));
      info.checksums = { [checksum]: hash.digest('hex') };
      delete info.content; // save bandwidth
    }

    return res.json(info);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/resources/* — create directory (path ends with /) or upload file
router.post('/*', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.user.perm.create) {
    return res.status(403).json({ error: 'Create permission denied' });
  }

  const urlPath = '/' + (req.params[0] || '');

  try {
    const absPath = resolvePath(req.user.scope, urlPath);

    // Directory creation
    if (urlPath.endsWith('/')) {
      await fse.ensureDir(absPath);
      return res.status(200).json({ message: 'Directory created' });
    }

    // File upload
    const override = req.query.override === 'true';
    if (fs.existsSync(absPath) && !override) {
      return res.status(409).json({ error: 'File already exists. Use ?override=true to overwrite.' });
    }

    if (fs.existsSync(absPath) && !req.user.perm.modify) {
      return res.status(403).json({ error: 'Modify permission denied' });
    }

    await fse.ensureDir(path.dirname(absPath));

    if (req.file) {
      // Uploaded via multipart
      await fse.writeFile(absPath, req.file.buffer);
    } else {
      // Raw body stream
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(absPath);
        req.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        req.on('error', reject);
      });
    }

    const stat = fs.statSync(absPath);
    const etag = `"${stat.mtimeMs.toString(16)}${stat.size.toString(16)}"`;
    res.setHeader('ETag', etag);
    return res.status(200).json({ message: 'File uploaded' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/resources/* — update (overwrite) an existing file
router.put('/*', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.user.perm.modify) {
    return res.status(403).json({ error: 'Modify permission denied' });
  }

  const urlPath = '/' + (req.params[0] || '');
  if (urlPath.endsWith('/')) {
    return res.status(405).json({ error: 'Cannot PUT a directory' });
  }

  try {
    const absPath = resolvePath(req.user.scope, urlPath);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

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

    const stat = fs.statSync(absPath);
    const etag = `"${stat.mtimeMs.toString(16)}${stat.size.toString(16)}"`;
    res.setHeader('ETag', etag);
    return res.status(200).json({ message: 'File updated' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/resources/* — delete file or directory
router.delete('/*', requireAuth, async (req, res) => {
  if (!req.user.perm.delete) {
    return res.status(403).json({ error: 'Delete permission denied' });
  }

  const urlPath = '/' + (req.params[0] || '');
  if (urlPath === '/') {
    return res.status(403).json({ error: 'Cannot delete root' });
  }

  try {
    const absPath = resolvePath(req.user.scope, urlPath);
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Remove associated shares
    const db = require('../db').getDb();
    db.prepare('DELETE FROM shares WHERE path LIKE ?').run(urlPath + '%');

    await fse.remove(absPath);
    return res.status(204).end();
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/resources/* — copy or rename/move
router.patch('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const destination = req.query.destination;
  const action = req.query.action || 'rename'; // 'copy' | 'rename'
  const override = req.query.override === 'true';
  const rename = req.query.rename === 'true'; // auto-rename on conflict

  if (!destination) {
    return res.status(400).json({ error: 'destination query param required' });
  }

  const dstUrlPath = '/' + decodeURIComponent(destination).replace(/^\//, '');

  if (urlPath === '/' || dstUrlPath === '/') {
    return res.status(403).json({ error: 'Cannot operate on root' });
  }

  try {
    const srcAbs = resolvePath(req.user.scope, urlPath);
    let dstAbs = resolvePath(req.user.scope, dstUrlPath);

    if (!fs.existsSync(srcAbs)) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (action === 'copy') {
      if (!req.user.perm.create) return res.status(403).json({ error: 'Create permission denied' });
      if (!override && !rename && fs.existsSync(dstAbs)) {
        return res.status(409).json({ error: 'Destination already exists' });
      }
      if (rename) dstAbs = addVersionSuffix(dstAbs);
      await copyPath(srcAbs, dstAbs);
    } else if (action === 'rename') {
      if (!req.user.perm.rename) return res.status(403).json({ error: 'Rename permission denied' });
      if (!override && !rename && fs.existsSync(dstAbs)) {
        return res.status(409).json({ error: 'Destination already exists' });
      }
      if (rename) dstAbs = addVersionSuffix(dstAbs);
      await movePath(srcAbs, dstAbs);
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(200).json({ message: 'Done' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/resources/recursive/* — flat recursive listing
router.get('/recursive/*', requireAuth, (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  try {
    const absPath = resolvePath(req.user.scope, urlPath);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    const entries = walkDir(absPath, urlPath);
    return res.json(entries);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
