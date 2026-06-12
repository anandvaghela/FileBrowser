'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { UserShare, User } = require('../db');

const router = express.Router();

// GET /api/user-shares?item_path= — get users this item is shared with
router.get('/', requireAuth, async (req, res) => {
  const { item_path } = req.query;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });

  try {
    const shares = await UserShare.find({ item_path, owner_id: req.user.id });
    const uids = shares.map(s => s.shared_with);
    const users = await User.find({ id: { $in: uids } });
    const userMap = new Map(users.map(u => [u.id, u.username]));

    const rows = shares.map(s => ({
      id: s.id,
      shared_with: s.shared_with,
      can_write: s.can_write,
      username: userMap.get(s.shared_with) || ''
    }));

    res.json({ shares: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user-shares — share item with users
router.post('/', requireAuth, async (req, res) => {
  const { item_path, user_ids, can_write } = req.body;
  if (!item_path || !Array.isArray(user_ids)) return res.status(400).json({ error: 'item_path and user_ids required' });

  try {
    for (const uid of user_ids) {
      let doc = await UserShare.findOne({ item_path, owner_id: req.user.id, shared_with: uid });
      if (!doc) {
        doc = new UserShare({ item_path, owner_id: req.user.id, shared_with: uid, can_write: can_write ? 1 : 0 });
      } else {
        doc.can_write = can_write ? 1 : 0;
      }
      await doc.save();
    }
    res.json({ message: 'Shared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/user-shares — remove share for a specific user
router.delete('/', requireAuth, async (req, res) => {
  const { item_path, shared_with } = req.body;
  if (!item_path || !shared_with) return res.status(400).json({ error: 'item_path and shared_with required' });

  try {
    await UserShare.deleteOne({ item_path, owner_id: req.user.id, shared_with });
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user-shares/my-shares — items I have shared with others (grouped by item)
router.get('/my-shares', requireAuth, async (req, res) => {
  try {
    const shares = await UserShare.find({ owner_id: req.user.id }).sort({ item_path: 1 });
    const uids = shares.map(s => s.shared_with);
    const users = await User.find({ id: { $in: uids } });
    const userMap = new Map(users.map(u => [u.id, u.username]));

    const rows = shares.map(s => ({
      id: s.id,
      item_path: s.item_path,
      can_write: s.can_write,
      shared_with: s.shared_with,
      shared_with_name: userMap.get(s.shared_with) || ''
    }));

    // Group by item_path
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.item_path)) {
        map.set(row.item_path, { item_path: row.item_path, users: [] });
      }
      map.get(row.item_path).users.push({
        id: row.id,
        shared_with: row.shared_with,
        username: row.shared_with_name,
        can_write: !!row.can_write
      });
    }

    res.json({ shares: Array.from(map.values()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/user-shares — update permission for an existing share
router.patch('/', requireAuth, async (req, res) => {
  const { item_path, shared_with, can_write } = req.body;
  if (!item_path || !shared_with) return res.status(400).json({ error: 'item_path and shared_with required' });

  try {
    await UserShare.updateOne(
      { item_path, owner_id: req.user.id, shared_with },
      { $set: { can_write: can_write ? 1 : 0 } }
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user-shares/shared-with-me — items shared with the current user
router.get('/shared-with-me', requireAuth, async (req, res) => {
  try {
    const shares = await UserShare.find({ shared_with: req.user.id });
    const ownerIds = shares.map(s => s.owner_id);
    const owners = await User.find({ id: { $in: ownerIds } });
    const ownerMap = new Map(owners.map(o => [o.id, { username: o.username, scope: o.scope }]));

    const rows = shares.map(s => {
      const owner = ownerMap.get(s.owner_id) || {};
      return {
        item_path: s.item_path,
        can_write: s.can_write,
        owner_id: s.owner_id,
        owner_name: owner.username || '',
        owner_scope: owner.scope || '/'
      };
    });

    const mime = require('mime-types');
    const { resolvePath, statSafe, getFileType } = require('../services/fileSystem');

    const items = (await Promise.all(rows.map(async row => {
      try {
        const absPath = await resolvePath(row.owner_scope, row.item_path);
        const stat = await statSafe(absPath);
        if (!stat) return null;
        const name = absPath ? (absPath.endsWith('/') ? absPath.slice(0, -1).split('/').pop() : absPath.split('/').pop()) : row.item_path;
        const mimeType = stat.isDirectory() ? '' : (mime.lookup(name) || 'application/octet-stream');
        return {
          path: row.item_path,
          name: name || row.item_path,
          isDir: stat.isDirectory(),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          type: getFileType(mimeType, stat.isDirectory()),
          sharedBy: row.owner_name,
          canWrite: !!row.can_write
        };
      } catch (err) {
        return null;
      }
    }))).filter(Boolean);

    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
