'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { UserItem, User } = require('../db');

const router = express.Router();

// GET /api/user-items?item_path=xxx — get visibility setting for a path
router.get('/', requireAuth, async (req, res) => {
  const { item_path } = req.query;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });

  try {
    const row = await UserItem.findOne({ user_id: req.user.id, item_path });
    res.json({ showToAdmin: row ? !!row.show_to_admin : true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user-items — set visibility for a path
router.post('/', requireAuth, async (req, res) => {
  const { item_path, show_to_admin } = req.body;
  if (!item_path) return res.status(400).json({ error: 'item_path required' });

  try {
    await UserItem.updateOne(
      { user_id: req.user.id, item_path },
      { $set: { show_to_admin: show_to_admin ? 1 : 0 } },
      { upsert: true }
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user-items/visible — admin gets all items shared with them
router.get('/visible', requireAuth, async (req, res) => {
  if (!req.user.perm.admin) return res.status(403).json({ error: 'Admin only' });

  try {
    const rows = await UserItem.find({ show_to_admin: 1 });
    const uids = rows.map(r => r.user_id);
    const users = await User.find({ id: { $in: uids } });
    const userMap = new Map(users.map(u => [u.id, u.username]));

    const items = rows.map(r => ({
      item_path: r.item_path,
      user_id: r.user_id,
      show_to_admin: r.show_to_admin,
      username: userMap.get(r.user_id) || ''
    }));

    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
