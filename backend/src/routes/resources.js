'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { User, UserItem, Share, GlobalFolder } = require('../db');
const {
  s3,
  BUCKET_NAME,
  resolvePath,
  statSafe,
  buildFileInfo,
  walkDir,
  copyPath,
  movePath,
  addVersionSuffix,
} = require('../services/fileSystem');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10737418240') },
});

// GET /api/resources/*  — list directory or get file info
router.get('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  try {
    const absPath = await resolvePath(req.user.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    const wantsEncoding = req.headers['x-encoding'] === 'true';
    const checksum = req.query.checksum;

    const info = await buildFileInfo(absPath, urlPath, {
      expand: stat.isDirectory(),
      content: !stat.isDirectory() && req.user.perm.download,
      sorting: req.user.sorting,
    });

    // Filter items hidden from admin by users
    if (stat.isDirectory() && info.items && req.user.perm.admin) {
      try {
        const hiddenRows = await UserItem.find({ show_to_admin: 0 });
        const userIds = hiddenRows.map(r => r.user_id);
        const users = await User.find({ id: { $in: userIds } });
        const userMap = new Map(users.map(u => [u.id, u.scope]));

        const hiddenPaths = new Set();
        for (const row of hiddenRows) {
          const scope = (userMap.get(row.user_id) || '').replace(/\/$/, '');
          const ipath = row.item_path.replace(/\/$/, '');
          hiddenPaths.add((scope + ipath).replace(/\/$/, '') || '/');
          hiddenPaths.add(ipath);
        }

        info.items = info.items.filter(item => {
          const normalised = item.path.replace(/\/$/, '');
          return !hiddenPaths.has(normalised);
        });
      } catch (err) {
        console.error('Failed to filter hidden items for admin:', err);
      }
    }

    // If asking for text content as raw bytes
    if (wantsEncoding && !stat.isDirectory()) {
      if (!req.user.perm.download) return res.status(202).end();
      if (info.type !== 'text') return res.json(info);

      const fileObj = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath
      }));
      const data = await fileObj.Body.transformToByteArray();
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(Buffer.from(data));
    }

    if (checksum) {
      const algos = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };
      const algo = algos[checksum.toLowerCase()];
      if (!algo) return res.status(400).json({ error: 'Invalid checksum algorithm' });

      const fileObj = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath
      }));
      const data = await fileObj.Body.transformToByteArray();
      const crypto = require('crypto');
      const hash = crypto.createHash(algo);
      hash.update(Buffer.from(data));
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
    const absPath = await resolvePath(req.user.scope, urlPath);

    // Directory creation
    if (urlPath.endsWith('/')) {
      const s3Prefix = absPath.endsWith('/') ? absPath : absPath + '/';
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Prefix,
        Body: ''
      }));
      return res.status(200).json({ message: 'Directory created' });
    }

    // File upload
    const override = req.query.override === 'true';
    const exists = await statSafe(absPath);
    if (exists && !override) {
      return res.status(409).json({ error: 'File already exists. Use ?override=true to overwrite.' });
    }

    if (exists && !req.user.perm.modify) {
      return res.status(403).json({ error: 'Modify permission denied' });
    }

    if (req.file) {
      // Uploaded via multipart
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath,
        Body: req.file.buffer
      }));
    } else {
      // Raw body stream upload using @aws-sdk/lib-storage Upload wrapper
      const { Upload } = require('@aws-sdk/lib-storage');
      const uploadStream = new Upload({
        client: s3,
        params: {
          Bucket: BUCKET_NAME,
          Key: absPath,
          Body: req
        }
      });
      await uploadStream.done();
    }

    const stat = await statSafe(absPath);
    const etag = `"${stat.mtime.getTime().toString(16)}${stat.size.toString(16)}"`;
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
    const absPath = await resolvePath(req.user.scope, urlPath);
    const exists = await statSafe(absPath);
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (req.file) {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath,
        Body: req.file.buffer
      }));
    } else {
      const { Upload } = require('@aws-sdk/lib-storage');
      const uploadStream = new Upload({
        client: s3,
        params: {
          Bucket: BUCKET_NAME,
          Key: absPath,
          Body: req
        }
      });
      await uploadStream.done();
    }

    const stat = await statSafe(absPath);
    const etag = `"${stat.mtime.getTime().toString(16)}${stat.size.toString(16)}"`;
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
    const absPath = await resolvePath(req.user.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Remove associated shares
    const pathEscaped = urlPath.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    await Share.deleteMany({ path: new RegExp('^' + pathEscaped) });

    // Remove associated global folders
    await GlobalFolder.deleteMany({
      $or: [
        { folder_path: urlPath },
        { folder_path: new RegExp('^' + (urlPath + '/').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')) }
      ]
    });

    if (stat.isDirectory()) {
      // List and delete S3 prefix keys recursively
      const prefix = absPath.endsWith('/') ? absPath : absPath + '/';
      const data = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix
      }));
      for (const item of (data.Contents || [])) {
        await s3.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: item.Key
        }));
      }
    } else {
      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath
      }));
    }

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
    const srcAbs = await resolvePath(req.user.scope, urlPath);
    let dstAbs = await resolvePath(req.user.scope, dstUrlPath);

    const stat = await statSafe(srcAbs);
    if (!stat) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (action === 'copy') {
      if (!req.user.perm.create) return res.status(403).json({ error: 'Create permission denied' });
      const destExists = await statSafe(dstAbs);
      if (!override && !rename && destExists) {
        return res.status(409).json({ error: 'Destination already exists' });
      }
      if (rename) dstAbs = await addVersionSuffix(dstAbs);
      await copyPath(srcAbs, dstAbs);
    } else if (action === 'rename') {
      if (!req.user.perm.rename) return res.status(403).json({ error: 'Rename permission denied' });
      const destExists = await statSafe(dstAbs);
      if (!override && !rename && destExists) {
        return res.status(409).json({ error: 'Destination already exists' });
      }
      if (rename) dstAbs = await addVersionSuffix(dstAbs);
      await movePath(srcAbs, dstAbs);

      // Update global folders paths in DB
      const rows = await GlobalFolder.find({});
      for (const row of rows) {
        if (row.folder_path === urlPath) {
          await GlobalFolder.updateOne({ id: row.id }, { $set: { folder_path: dstUrlPath } });
        } else if (row.folder_path.startsWith(urlPath + '/')) {
          const remaining = row.folder_path.slice(urlPath.length);
          const newPath = dstUrlPath + remaining;
          await GlobalFolder.updateOne({ id: row.id }, { $set: { folder_path: newPath } });
        }
      }
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
router.get('/recursive/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  try {
    const absPath = await resolvePath(req.user.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a directory' });

    const entries = await walkDir(absPath, urlPath);
    return res.json(entries);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
