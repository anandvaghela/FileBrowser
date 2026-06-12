'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { s3, BUCKET_NAME, resolvePath, statSafe } = require('../services/fileSystem');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');

const router = express.Router();

async function getS3Usage(prefix) {
  let totalSize = 0;
  try {
    let continuationToken = null;
    const cleanPrefix = prefix ? (prefix.endsWith('/') ? prefix : prefix + '/') : '';
    do {
      const data = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: cleanPrefix,
        ContinuationToken: continuationToken
      }));
      for (const item of (data.Contents || [])) {
        totalSize += item.Size || 0;
      }
      continuationToken = data.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    console.error('Failed to get usage from S3:', err);
  }
  return totalSize;
}

// GET /api/usage/*
router.get('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');

  try {
    const absPath = await resolvePath(req.user.scope, urlPath);
    const stat = await statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    if (!stat.isDirectory()) {
      return res.json({ total: 0, used: 0 });
    }

    const used = await getS3Usage(absPath);
    // Report total = 0 (or limit, if applicable), and actual used bytes
    return res.json({ total: 0, used });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
