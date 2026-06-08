'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/user-items?item_path=xxx — get visibility setting for a path
router.get('/', requireAuth, (req, res) => {
  const { item_path } = req.query;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });
  const db = getDb();
  const row = db.prepare('SELECT show_to_admin FROM user_items WHERE user_id = ? AND item_path = ?')
    .get(req.user.id, item_path);
  res.json({ showToAdmin: row ? !!row.show_to_admin : true });
});

// POST /api/user-items — set visibility for a path
router.post('/', requireAuth, (req, res) => {
  const { item_path, show_to_admin } = req.body;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO user_items (user_id, item_path, show_to_admin)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, item_path) DO UPDATE SET show_to_admin = excluded.show_to_admin
    `).run(req.user.id, item_path, show_to_admin ? 1 : 0);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user-items/visible — admin gets all items shared with them
router.get('/visible', requireAuth, (req, res) => {
  if (!req.user.perm.admin) return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT ui.item_path, ui.user_id, u.username, ui.show_to_admin
    FROM user_items ui
    JOIN users u ON u.id = ui.user_id
    WHERE ui.show_to_admin = 1
  `).all();
  res.json({ items: rows });
});

module.exports = router;
