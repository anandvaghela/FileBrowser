'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/global-folders — list all global folders (all authenticated users)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM global_folders ORDER BY created_at DESC').all();
  res.json({ folders: rows });
});

// POST /api/global-folders — admin makes a folder global
router.post('/', requireAdmin, (req, res) => {
  const { folder_path } = req.body;
  if (!folder_path) return res.status(400).json({ error: 'folder_path required' });
  const db = getDb();
  try {
    db.prepare('INSERT OR REPLACE INTO global_folders (folder_path, created_by) VALUES (?, ?)')
      .run(folder_path, req.user.id);
    res.json({ message: 'Folder made global' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/global-folders — admin removes global status
router.delete('/', requireAdmin, (req, res) => {
  const { folder_path } = req.body;
  if (!folder_path) return res.status(400).json({ error: 'folder_path required' });
  const db = getDb();
  db.prepare('DELETE FROM global_folders WHERE folder_path = ?').run(folder_path);
  res.json({ message: 'Folder removed from global' });
});

module.exports = router;
