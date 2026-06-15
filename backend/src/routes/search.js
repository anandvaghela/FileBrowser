'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { User, GlobalFolder } = require('../db');
const { s3, BUCKET_NAME, resolvePath } = require('../services/fileSystem');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const path = require('path');

const router = express.Router();

// Require auth for all search router paths to populate req.user
router.use(requireAuth);

// Block users whose scope is outside userHomeBase from accessing userHomeBase directly
router.use(async (req, res, next) => {
  const resourcePath = '/' + req.path.replace(/^\//, '');

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

  let otherScopes = [];
  let globalFolders = [];
  try {
    const otherUsers = await User.find({ id: { $ne: req.user.id } }, 'scope');
    otherScopes = otherUsers.map(u => {
      let p = (u.scope || '').replace(/\\/g, '/').replace(/\/+/g, '/');
      if (!p.startsWith('/')) p = '/' + p;
      if (p.endsWith('/') && p !== '/') p = p.slice(0, -1);
      return p;
    }).filter(p => p !== '/' && p !== '');

    const globals = await GlobalFolder.find({}, 'folder_path');
    globalFolders = globals.map(f => {
      let p = (f.folder_path || '').replace(/\\/g, '/').replace(/\/+/g, '/');
      if (!p.startsWith('/')) p = '/' + p;
      if (p.endsWith('/') && p !== '/') p = p.slice(0, -1);
      return p;
    });
  } catch (err) {
    console.error('Failed to fetch scopes/global-folders:', err);
  }

  function isOtherUserScope(urlPath) {
    const cleanUrl = urlPath.replace(/\\/g, '/').replace(/\/+/g, '/');
    
    const isGlobal = globalFolders.some(g => cleanUrl === g || cleanUrl.startsWith(g + '/'));
    if (isGlobal) return false;

    return otherScopes.some(scope => {
      return cleanUrl === scope || cleanUrl.startsWith(scope + '/');
    });
  }

  let absRoot;
  let userHomeBase = '/users';
  let isScopeUnderBase = false;
  try {
    absRoot = await resolvePath(req.user.scope, urlPath);
    const { Settings } = require('../db');
    const settings = await Settings.findOne({ id: 1 });
    userHomeBase = (settings ? settings.user_home_base : '/users').replace(/\/$/, '');
    const userScope = req.user.scope.replace(/\/$/, '');
    isScopeUnderBase = userScope === userHomeBase || userScope.startsWith(userHomeBase + '/');
  } catch (err) {
    return res.status(403).json({ error: err.message });
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

  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) {
      res.write('\n');
    }
  }, 5000);

  const mime = require('mime-types');

  function getType(key, isDir) {
    if (isDir) return 'directory';
    const m = mime.lookup(key) || '';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    if (m.startsWith('text/')) return 'text';
    return 'blob';
  }

  function matchesQuery(name, key, isDir) {
    const lname = name.toLowerCase();

    if (typeFilter) {
      const fileType = getType(key, isDir);
      if (typeFilter === 'dir' && !isDir) return false;
      if (typeFilter !== 'dir' && fileType !== typeFilter) return false;
    }

    if (!nameQuery) return true;

    if (nameQuery.includes('*')) {
      const pattern = nameQuery.replace(/\*/g, '.*');
      return new RegExp(pattern).test(lname);
    }

    return lname.includes(nameQuery);
  }

  try {
    let continuationToken = null;
    const prefix = absRoot ? (absRoot.endsWith('/') ? absRoot : absRoot + '/') : '';
    
    do {
      if (closed || res.writableEnded) break;

      const data = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }));

      for (const item of (data.Contents || [])) {
        if (closed || res.writableEnded) break;
        if (item.Key === prefix) continue;

        const relativeKey = item.Key.slice(prefix.length);
        const childUrl = (urlPath === '/' ? '' : urlPath) + '/' + relativeKey;

        if (!isScopeUnderBase && (childUrl.replace(/\/$/, '') === userHomeBase || childUrl.replace(/\/$/, '').startsWith(userHomeBase + '/'))) {
          continue;
        }

        if (isOtherUserScope(childUrl)) {
          continue;
        }

        const name = relativeKey.split('/').filter(Boolean).pop();
        if (!name) continue;
        if (name.startsWith('.') && req.user.hideDotfiles) continue;

        const isDir = item.Key.endsWith('/');

        if (matchesQuery(name, item.Key, isDir)) {
          const result = { path: childUrl.replace(/\/+/g, '/'), dir: isDir };
          try {
            res.write(JSON.stringify(result) + '\n');
          } catch {
            closed = true;
            break;
          }
        }
      }

      continuationToken = data.NextContinuationToken;
    } while (continuationToken);

  } catch (err) {
    if (!res.writableEnded) {
      res.write(JSON.stringify({ error: err.message }) + '\n');
    }
  }

  clearInterval(heartbeat);
  if (!res.writableEnded) res.end();
});

module.exports = router;
