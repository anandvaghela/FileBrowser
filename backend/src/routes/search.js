'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { resolvePath } = require('../services/fileSystem');

const router = express.Router();

/**
 * GET /api/search/*?query=<q>
 *
 * Streams NDJSON results (one JSON object per line) as the walk progresses.
 * Supports simple glob-style patterns: *ext, name*, *partial*, type:image, etc.
 */
router.get('/*', requireAuth, async (req, res) => {
  const urlPath = '/' + (req.params[0] || '');
  const query = (req.query.query || '').toLowerCase().trim();

  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  let absRoot;
  try {
    absRoot = resolvePath(req.user.scope, urlPath);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }

  if (!fs.existsSync(absRoot)) {
    return res.status(404).json({ error: 'Path not found' });
  }

  // Parse type: filter
  let typeFilter = null;
  let nameQuery = query;
  const typeMatch = query.match(/^type:(\w+)\s*(.*)?$/);
  if (typeMatch) {
    typeFilter = typeMatch[1];
    nameQuery = (typeMatch[2] || '').trim();
  }

  // Set headers for streaming
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => { closed = true; });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write('\n');
    }
  }, 5000);

  const mime = require('mime-types');

  function getType(absPath, stat) {
    if (stat.isDirectory()) return 'directory';
    const m = mime.lookup(absPath) || '';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('text/')) return 'text';
    return 'blob';
  }

  function matchesQuery(name, absPath, stat) {
    const lname = name.toLowerCase();

    if (typeFilter) {
      const fileType = getType(absPath, stat);
      if (typeFilter === 'dir' && !stat.isDirectory()) return false;
      if (typeFilter !== 'dir' && fileType !== typeFilter) return false;
    }

    if (!nameQuery) return true;

    // glob-style: starts with *, ends with *, or contains *
    if (nameQuery.includes('*')) {
      const pattern = nameQuery.replace(/\*/g, '.*');
      return new RegExp(pattern).test(lname);
    }

    return lname.includes(nameQuery);
  }

  async function walk(absDir, urlDir) {
    if (closed || res.writableEnded) return;

    let entries;
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (closed || res.writableEnded) return;
      if (name.startsWith('.') && req.user.hideDotfiles) continue;

      const childAbs = path.join(absDir, name);
      const childUrl = (urlDir === '/' ? '' : urlDir) + '/' + name;

      let stat;
      try {
        stat = fs.statSync(childAbs);
      } catch {
        continue;
      }

      if (matchesQuery(name, childAbs, stat)) {
        const result = { path: childUrl, dir: stat.isDirectory() };
        try {
          res.write(JSON.stringify(result) + '\n');
        } catch {
          closed = true;
          return;
        }
      }

      if (stat.isDirectory()) {
        await walk(childAbs, childUrl);
      }
    }
  }

  try {
    await walk(absRoot, urlPath);
  } catch (err) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ error: err.message }) + '\n');
    }
  }

  clearInterval(heartbeat);
  if (!res.writableEnded) res.end();
});

module.exports = router;
