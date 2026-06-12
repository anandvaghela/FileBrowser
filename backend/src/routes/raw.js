'use strict';

const express = require('express');
const path = require('path');
const archiver = require('archiver');
const mime = require('mime-types');
const { requireAuth } = require('../middleware/auth');
const { s3, BUCKET_NAME, resolvePath, statSafe, walkDir } = require('../services/fileSystem');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const router = express.Router();

async function getShareAccess(userId, itemPath) {
  try {
    const { UserShare, User } = require('../db');
    const normalised = itemPath.replace(/\/$/, '');
    const shares = await UserShare.find({ shared_with: userId });

    let matchedShare = null;
    for (const s of shares) {
      const sPath = s.item_path.replace(/\/$/, '');
      if (normalised === sPath || normalised.startsWith(sPath + '/')) {
        if (!matchedShare || s.item_path.length > matchedShare.item_path.length) {
          matchedShare = s;
        }
      }
    }

    if (!matchedShare) return null;

    const owner = await User.findOne({ id: matchedShare.owner_id });
    if (!owner) return null;

    return {
      can_write: matchedShare.can_write,
      owner_id: matchedShare.owner_id,
      scope: owner.scope
    };
  } catch (e) {
    return null;
  }
}

// GET /api/raw/* — download a raw file or a zipped directory
router.get('/*', requireAuth, async (req, res) => {
  if (!req.user.perm.download) {
    return res.status(403).json({ error: 'Download permission denied' });
  }

  const urlPath = '/' + (req.params[0] || '');

  try {
    let scopeToUse = req.user.scope;
    const access = await getShareAccess(req.user.id, urlPath);
    if (access) {
      scopeToUse = access.scope;
    }
    const absPath = await resolvePath(scopeToUse, urlPath);
    const stat = await statSafe(absPath);
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

      const files = await walkDir(absPath, urlPath);
      for (const file of files) {
        if (file.isDir) continue;
        const relativePath = file.path.slice(urlPath.length).replace(/^\//, '');
        const fileKey = await resolvePath(scopeToUse, file.path);
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
      const mimeType = mime.lookup(absPath) || 'application/octet-stream';
      const name = absPath.split('/').pop() || 'file';

      const inlineTypes = ['application/pdf', 'image/', 'video/', 'audio/', 'text/'];
      const browserCanDisplay = inlineTypes.some(t => mimeType.startsWith(t));
      const forceDownload = req.query.inline === 'false';
      const disposition = (!forceDownload && browserCanDisplay) ? 'inline' : `attachment; filename="${name}"`;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', disposition);

      const range = req.headers.range;
      let fileObj;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);

        fileObj = await s3.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: absPath,
          Range: `bytes=${start}-${end}`
        }));
      } else {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', stat.size);

        fileObj = await s3.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: absPath
        }));
      }
      fileObj.Body.pipe(res);
    }
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
