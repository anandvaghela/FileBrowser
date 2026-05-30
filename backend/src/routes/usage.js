'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { resolvePath, statSafe, FILES_ROOT } = require('../services/fileSystem');

const router = express.Router();

/**
 * Recursively calculate folder size.
 */
function dirSize(absPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(absPath);
    for (const e of entries) {
      const child = path.join(absPath, e);
      try {
        const s = fs.statSync(child);
        if (s.isDirectory()) total += dirSize(child);
        else total += s.size;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
}

/**
 * Get total disk usage for the underlying filesystem.
 * Falls back to a manual calculation if os-level stats fail.
 */
function getDiskStats(absPath) {
  try {
    // Use statvfs via a child process on Linux/macOS
    const { execSync } = require('child_process');
    const out = execSync(`df -Pk "${absPath}" 2>/dev/null | tail -1`, { timeout: 3000 }).toString();
    const parts = out.trim().split(/\s+/);
    if (parts.length >= 4) {
      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      return { total, used };
    }
  } catch { /* fall back */ }

  // Fallback: report used bytes inside FILES_ROOT
  const used = dirSize(FILES_ROOT);
  return { total: 0, used };
}

// GET /api/usage/*
router.get('/*', requireAuth, (req, res) => {
  const urlPath = '/' + (req.params[0] || '');

  try {
    const absPath = resolvePath(req.user.scope, urlPath);
    const stat = statSafe(absPath);
    if (!stat) return res.status(404).json({ error: 'Not found' });

    if (!stat.isDirectory()) {
      return res.json({ total: 0, used: 0 });
    }

    const { total, used } = getDiskStats(absPath);
    return res.json({ total, used });
  } catch (err) {
    if (err.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
