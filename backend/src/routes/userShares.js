'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb, dbUserToJson } = require('../db');

const router = express.Router();

// GET /api/user-shares?item_path= — get users this item is shared with
router.get('/', requireAuth, (req, res) => {
  const { item_path } = req.query;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT us.id, us.shared_with, us.can_write, u.username
    FROM user_shares us
    JOIN users u ON u.id = us.shared_with
    WHERE us.item_path = ? AND us.owner_id = ?
  `).all(item_path, req.user.id);
  res.json({ shares: rows });
});

// POST /api/user-shares — share item with users
router.post('/', requireAuth, (req, res) => {
  const { item_path, user_ids, can_write } = req.body;
  if (!item_path || !Array.isArray(user_ids)) return res.status(400).json({ error: 'item_path and user_ids required' });
  const db = getDb();
  try {
    const insert = db.prepare(`
      INSERT INTO user_shares (item_path, owner_id, shared_with, can_write)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(item_path, owner_id, shared_with) DO UPDATE SET can_write = excluded.can_write
    `);
    for (const uid of user_ids) {
      insert.run(item_path, req.user.id, uid, can_write ? 1 : 0);
    }
    res.json({ message: 'Shared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/user-shares — remove share for a specific user
router.delete('/', requireAuth, (req, res) => {
  const { item_path, shared_with } = req.body;
  if (!item_path || !shared_with) return res.status(400).json({ error: 'item_path and shared_with required' });
  const db = getDb();
  db.prepare('DELETE FROM user_shares WHERE item_path = ? AND owner_id = ? AND shared_with = ?')
    .run(item_path, req.user.id, shared_with);
  res.json({ message: 'Removed' });
});

// GET /api/user-shares/my-shares — items I have shared with others (grouped by item)
router.get('/my-shares', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT us.id, us.item_path, us.can_write, us.shared_with, u.username as shared_with_name
    FROM user_shares us
    JOIN users u ON u.id = us.shared_with
    WHERE us.owner_id = ?
    ORDER BY us.item_path, u.username
  `).all(req.user.id);

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
});

// PATCH /api/user-shares — update permission for an existing share
router.patch('/', requireAuth, (req, res) => {
  const { item_path, shared_with, can_write } = req.body;
  if (!item_path || !shared_with) return res.status(400).json({ error: 'item_path and shared_with required' });
  const db = getDb();
  db.prepare('UPDATE user_shares SET can_write = ? WHERE item_path = ? AND owner_id = ? AND shared_with = ?')
    .run(can_write ? 1 : 0, item_path, req.user.id, shared_with);
  res.json({ message: 'Updated' });
});

// GET /api/user-shares/shared-with-me — items shared with the current user
router.get('/shared-with-me', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT us.item_path, us.can_write, us.owner_id, u.username as owner_name, u.scope as owner_scope
    FROM user_shares us
    JOIN users u ON u.id = us.owner_id
    WHERE us.shared_with = ?
  `).all(req.user.id);

  const path = require('path');
  const mime = require('mime-types');
  const { resolvePath, statSafe, getFileType } = require('../services/fileSystem');

  const items = rows.map(row => {
    try {
      const absPath = resolvePath(row.owner_scope, row.item_path);
      const stat = statSafe(absPath);
      if (!stat) return null;
      const name = path.basename(absPath);
      const mimeType = stat.isDirectory() ? '' : (mime.lookup(absPath) || 'application/octet-stream');
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
  }).filter(Boolean);

  res.json({ items });
});

module.exports = router;
