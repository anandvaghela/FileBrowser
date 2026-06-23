'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ActivityLog, UserShare, User } = require('../db');

const router = express.Router();

async function getShareAccess(userId, itemPath) {
  try {
    const normalised = itemPath.replace(/\/$/, '');
    const shares = await UserShare.find({ shared_with: userId });

    let matchedShare = null;
    for (const s of shares) {
      const sPath = s.item_path.replace(/\/$/, '');
      if (normalised === sPath || normalised.startsWith(sPath + '/')) {
        if (!matchedShare || s.item_path.length > matchedShare.item_path.length) {
          matchedShare = s;
        }
      }
    }

    if (!matchedShare) return null;

    const owner = await User.findOne({ id: matchedShare.owner_id });
    if (!owner) return null;

    return {
      can_write: matchedShare.can_write,
      owner_id: matchedShare.owner_id,
      scope: owner.scope
    };
  } catch (e) {
    console.error('Error in getShareAccess:', e);
    return null;
  }
}

async function resolveActivityPath(user, itemPath) {
  if (!user) return itemPath.replace(/^\//, '');
  const { resolvePath } = require('../services/fileSystem');
  
  // Check if this path is shared with this user
  const access = await getShareAccess(user.id, itemPath);
  const scopeToUse = access ? access.scope : user.scope;
  return await resolvePath(scopeToUse, itemPath);
}

// Record an activity entry. Safe to call fire-and-forget (never throws to caller).
async function logActivity(itemPath, user, action, details = '') {
  try {
    const absPath = await resolveActivityPath(user, itemPath);
    await ActivityLog.create({
      item_path: absPath,
      user_id: user?.id || 0,
      username: user?.username || 'Unknown',
      action,
      details,
    });
  } catch (err) {
    console.error('Failed to record activity:', err.message);
  }
}

// GET /api/activity/* — activity log for a specific file/folder, newest first
router.get('/*', requireAuth, async (req, res) => {
  const itemPath = '/' + (req.params[0] || '');
  try {
    const absPath = await resolveActivityPath(req.user, itemPath);
    const rows = await ActivityLog.find({ item_path: absPath }).sort({ created_at: -1 }).limit(100);
    return res.json({
      items: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        username: r.username,
        action: r.action,
        details: r.details,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.logActivity = logActivity;
