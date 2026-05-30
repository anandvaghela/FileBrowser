'use strict';

/**
 * TUS 1.0.0 resumable upload implementation.
 * Supports: Creation, Head (offset check), Patch (append), Delete.
 * Stores upload state in SQLite; chunks go to a temp file that
 * is moved to the final path on completion.
 */

const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');
const { resolvePath } = require('../services/fileSystem');

const router = express.Router();
const TUS_VERSION = '1.0.0';
const TMP_DIR = path.resolve('./data/tus_tmp');
fse.ensureDirSync(TMP_DIR);

function tusHeaders(res) {
  res.setHeader('Tus-Resumable', TUS_VERSION);
  res.setHeader('Tus-Version', TUS_VERSION);
  res.setHeader('Tus-Extension', 'creation,termination');
  res.setHeader('Tus-Max-Size', process.env.MAX_UPLOAD_SIZE || '10737418240');
}

// OPTIONS — capability discovery
router.options('/', requireAuth, (req, res) => {
  tusHeaders(res);
  res.setHeader('Allow', 'OPTIONS,HEAD,POST,PATCH,DELETE');
  return res.status(204).end();
});

// POST /api/tus — create upload
router.post('/', requireAuth, (req, res) => {
  if (!req.user.perm.create) return res.status(403).json({ error: 'Create permission denied' });

  tusHeaders(res);

  const uploadLength = parseInt(req.headers['upload-length'] || '0');
  const metaRaw = req.headers['upload-metadata'] || '';

  // Parse TUS metadata (base64 key-value pairs)
  const metadata = {};
  for (const pair of metaRaw.split(',')) {
    const [k, v] = pair.trim().split(' ');
    if (k && v) {
      try { metadata[k] = Buffer.from(v, 'base64').toString('utf8'); }
      catch { metadata[k] = v; }
    }
  }

  const uploadId = uuidv4().replace(/-/g, '');
  const tmpPath = path.join(TMP_DIR, uploadId);

  // Determine final file path from metadata
  const filePath = metadata.filePath || metadata.filename || `/${uploadId}`;
  const urlPath = filePath.startsWith('/') ? filePath : '/' + filePath;

  const db = getDb();
  db.prepare(`
    INSERT INTO tus_uploads (upload_id, file_path, size, offset, metadata, user_id)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(uploadId, urlPath, uploadLength, JSON.stringify(metadata), req.user.id);

  // Touch temp file
  fs.writeFileSync(tmpPath, '');

  res.setHeader('Location', `/api/tus/${uploadId}`);
  return res.status(201).end();
});

// HEAD /api/tus/:id — get current offset
router.head('/:id', requireAuth, (req, res) => {
  tusHeaders(res);

  const db = getDb();
  const upload = db.prepare('SELECT * FROM tus_uploads WHERE upload_id = ?').get(req.params.id);
  if (!upload) return res.status(404).end();
  if (upload.user_id !== req.user.id && !req.user.perm.admin) return res.status(403).end();

  res.setHeader('Upload-Offset', upload.offset);
  res.setHeader('Upload-Length', upload.size);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).end();
});

// PATCH /api/tus/:id — append chunk
router.patch('/:id', requireAuth, async (req, res) => {
  tusHeaders(res);

  if (req.headers['content-type'] !== 'application/offset+octet-stream') {
    return res.status(415).end();
  }

  const db = getDb();
  const upload = db.prepare('SELECT * FROM tus_uploads WHERE upload_id = ?').get(req.params.id);
  if (!upload) return res.status(404).end();
  if (upload.user_id !== req.user.id && !req.user.perm.admin) return res.status(403).end();

  const offset = parseInt(req.headers['upload-offset'] || '0');
  if (offset !== upload.offset) return res.status(409).end();

  const tmpPath = path.join(TMP_DIR, req.params.id);

  // Append data to temp file
  const written = await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath, { flags: 'a' });
    let bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; });
    req.pipe(out);
    out.on('finish', () => resolve(bytes));
    out.on('error', reject);
    req.on('error', reject);
  });

  const newOffset = offset + written;
  db.prepare('UPDATE tus_uploads SET offset = ?, updated_at = unixepoch() WHERE upload_id = ?')
    .run(newOffset, req.params.id);

  // If upload complete, move to final location
  if (newOffset >= upload.size) {
    try {
      const absPath = resolvePath(req.user.scope, upload.file_path);
      await fse.ensureDir(path.dirname(absPath));
      await fse.move(tmpPath, absPath, { overwrite: true });
      db.prepare('DELETE FROM tus_uploads WHERE upload_id = ?').run(req.params.id);
    } catch (err) {
      console.error('[TUS] Failed to finalize upload:', err.message);
    }
  }

  res.setHeader('Upload-Offset', newOffset);
  return res.status(204).end();
});

// DELETE /api/tus/:id — cancel upload
router.delete('/:id', requireAuth, async (req, res) => {
  tusHeaders(res);

  const db = getDb();
  const upload = db.prepare('SELECT * FROM tus_uploads WHERE upload_id = ?').get(req.params.id);
  if (!upload) return res.status(404).end();
  if (upload.user_id !== req.user.id && !req.user.perm.admin) return res.status(403).end();

  const tmpPath = path.join(TMP_DIR, req.params.id);
  try { await fse.remove(tmpPath); } catch { /* ignore */ }
  db.prepare('DELETE FROM tus_uploads WHERE upload_id = ?').run(req.params.id);

  return res.status(204).end();
});

module.exports = router;
