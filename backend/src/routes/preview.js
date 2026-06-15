'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const { requireAuth } = require('../middleware/auth');
const { s3, BUCKET_NAME, resolvePath, statSafe } = require('../services/fileSystem');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const router = express.Router();

// Require auth for all preview router paths to populate req.user
router.use(requireAuth);

// Block users whose scope is outside userHomeBase from accessing userHomeBase directly
router.use(async (req, res, next) => {
  let resourcePath = '/' + req.path.replace(/^\//, '');
  const parts = resourcePath.split('/').filter(Boolean);
  if (parts.length > 1) {
    resourcePath = '/' + parts.slice(1).join('/');
  }

  const { Settings } = require('../db');
  try {
    const settings = await Settings.findOne({ id: 1 });
    const userHomeBase = (settings ? settings.user_home_base : '/users').replace(/\/$/, '');
    const userScope = req.user.scope.replace(/\/$/, '');
    const isScopeUnderBase = userScope === userHomeBase || userScope.startsWith(userHomeBase + '/');
    const cleanUrlPath = resourcePath.replace(/\/$/, '');
    if (!isScopeUnderBase && (cleanUrlPath === userHomeBase || cleanUrlPath.startsWith(userHomeBase + '/'))) {
      return res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    console.error('Error in user home base restriction middleware:', err);
  }
  next();
});

const CACHE_DIR = path.join(os.tmpdir(), 'thumbcache');
fse.ensureDirSync(CACHE_DIR);

const SIZES = { small: 128, medium: 480, big: 1080 };

function cacheKey(userId, scope, urlPath, size) {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(`${userId}:${scope}:${urlPath}:${size}`).digest('hex');
}

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

// GET /api/preview/:size/:path  — generate or return cached thumbnail
router.get('/:size/*', requireAuth, async (req, res) => {
  const sizeLabel = req.params.size;
  const pixelSize = SIZES[sizeLabel];
  if (!pixelSize) return res.status(400).json({ error: 'Invalid size. Use: small, medium, big' });

  const urlPath = '/' + (req.params[0] || '');

  try {
    let scopeToUse = req.user.scope;
    const access = await getShareAccess(req.user.id, urlPath);
    if (access) {
      scopeToUse = access.scope;
    }
    const absPath = await resolvePath(scopeToUse, urlPath);
    const stat = await statSafe(absPath);
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
        const fileObj = await s3.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: absPath
        }));

        const sharp = require('sharp');
        const transformer = sharp()
          .resize(pixelSize, pixelSize, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 });

        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(cachePath);
          fileObj.Body.pipe(transformer).pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
          transformer.on('error', reject);
          fileObj.Body.on('error', reject);
        });

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return fs.createReadStream(cachePath).pipe(res);
      } catch (e) {
        // Fall back to original
        console.error('Thumbnail generation error:', e);
      }
    }

    // Fallback: return original
    res.setHeader('Content-Type', mimeType);
    const fileObj = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: absPath
    }));
    return fileObj.Body.pipe(res);
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
