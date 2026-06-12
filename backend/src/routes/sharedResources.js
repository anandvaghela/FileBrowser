'use strict';

const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { UserShare, User } = require('../db');
const { s3, BUCKET_NAME, resolvePath, statSafe, buildFileInfo, movePath } = require('../services/fileSystem');
const { PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10737418240') },
});

// Helper: check if current user has access to item_path, returns { owner, can_write } or null
async function getShareAccess(userId, itemPath) {
  try {
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

// GET /api/shared-resources/* — browse shared files
router.get('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const access = await getShareAccess(req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access to this shared item' });

  try {
    const absPath = await resolvePath(access.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    const info = await buildFileInfo(absPath, urlPath, {
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
  const access = await getShareAccess(req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const absPath = await resolvePath(access.scope, urlPath);

    if (urlPath.endsWith('/')) {
      // Create empty folder placeholder in S3
      const s3Prefix = absPath.endsWith('/') ? absPath : absPath + '/';
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Prefix,
        Body: ''
      }));
      return res.status(200).json({ message: 'Directory created' });
    }

    if (req.file) {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: absPath,
        Body: req.file.buffer
      }));
    } else {
      // Stream raw body
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
    return res.status(200).json({ message: 'File uploaded' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shared-resources/* — delete inside shared folder (needs can_write)
router.delete('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const access = await getShareAccess(req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const absPath = await resolvePath(access.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    if (stat.isDirectory()) {
      // List and delete recursively
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

// PATCH /api/shared-resources/* — rename inside shared folder (needs can_write)
router.patch('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const destination = req.query.destination;
  if (!destination) return res.status(400).json({ error: 'destination required' });

  const dstUrlPath = '/' + decodeURIComponent(destination).replace(/^\//, '');
  const access = await getShareAccess(req.user.id, urlPath);
  if (!access) return res.status(403).json({ error: 'No access' });
  if (!access.can_write) return res.status(403).json({ error: 'Read-only access' });

  try {
    const srcAbs = await resolvePath(access.scope, urlPath);
    const dstAbs = await resolvePath(access.scope, dstUrlPath);
    const stat = await statSafe(srcAbs);
    if (!stat) return res.status(404).json({ error: 'Source not found' });

    await movePath(srcAbs, dstAbs);
    return res.status(200).json({ message: 'Done' });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
