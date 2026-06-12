'use strict';

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { GlobalFolder } = require('../db');

const router = express.Router();

// GET /api/global-folders — list all global folders (all authenticated users)
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await GlobalFolder.find().sort({ created_at: -1 });
    res.json({ folders: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/global-folders — admin makes a folder global
router.post('/', requireAdmin, async (req, res) => {
  const { folder_path } = req.body;
  if (!folder_path) return res.status(400).json({ error: 'folder_path required' });

  try {
    let doc = await GlobalFolder.findOne({ folder_path });
    if (!doc) {
      doc = new GlobalFolder({ folder_path, created_by: req.user.id });
    } else {
      doc.created_by = req.user.id;
    }
    await doc.save();
    res.json({ message: 'Folder made global' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/global-folders — admin removes global status
router.delete('/', requireAdmin, async (req, res) => {
  const { folder_path } = req.body;
  if (!folder_path) return res.status(400).json({ error: 'folder_path required' });

  try {
    await GlobalFolder.deleteOne({ folder_path });
    res.json({ message: 'Folder removed from global' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
