'use strict';

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const mime = require('mime-types');
require('dotenv').config();

const FILES_ROOT = path.resolve(process.env.FILES_ROOT || './uploads');

// Ensure root exists
fse.ensureDirSync(FILES_ROOT);

/**
 * Resolve a user-supplied path to an absolute filesystem path,
 * confined to the user's scope directory.
 *
 * @param {string} userScope  - e.g. '/' or '/alice'
 * @param {string} urlPath    - path from the URL
 * @returns {string} absolute resolved path
 */
function resolvePath(userScope, urlPath) {
  // Normalise scope: strip leading slash, join with FILES_ROOT
  const scopeAbs = path.resolve(FILES_ROOT, userScope.replace(/^\//, ''));

  // Normalise urlPath
  const clean = path.normalize('/' + (urlPath || '')).replace(/\\/g, '/');
  const target = path.resolve(scopeAbs, '.' + clean);

  // Security: ensure target is inside the scope
  if (!target.startsWith(scopeAbs + path.sep) && target !== scopeAbs) {
    throw Object.assign(new Error('Path traversal not allowed'), { code: 'FORBIDDEN' });
  }

  return target;
}

/**
 * Get stat for a path (null if not found).
 */
function statSafe(absPath) {
  try {
    return fs.statSync(absPath);
  } catch {
    return null;
  }
}

/**
 * Build a file info object compatible with the original API.
 */
function buildFileInfo(absPath, urlPath, options = {}) {
  const stat = fs.statSync(absPath);
  const name = path.basename(absPath) || '/';
  const mimeType = stat.isDirectory() ? '' : (mime.lookup(absPath) || 'application/octet-stream');

  const info = {
    path: urlPath || '/',
    name,
    size: stat.size,
    extension: path.extname(name).toLowerCase(),
    modified: stat.mtime.toISOString(),
    mode: stat.mode,
    isDir: stat.isDirectory(),
    isSymlink: stat.isSymbolicLink(),
    type: getFileType(mimeType, stat.isDirectory()),
    mimeType,
  };

  if (stat.isDirectory() && options.expand) {
    info.items = listDir(absPath, urlPath);
    info.numDirs = info.items.filter(i => i.isDir).length;
    info.numFiles = info.items.filter(i => !i.isDir).length;
    info.sorting = options.sorting || { by: 'name', asc: true };
  }

  if (!stat.isDirectory() && options.content) {
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      info.content = content;
    } catch {
      info.content = '';
    }
  }

  return info;
}

function listDir(absPath, urlPathPrefix) {
  let entries;
  try {
    entries = fs.readdirSync(absPath);
  } catch {
    return [];
  }

  return entries.map(name => {
    const childAbs = path.join(absPath, name);
    const childUrl = (urlPathPrefix === '/' ? '' : urlPathPrefix) + '/' + name;
    try {
      const stat = fs.statSync(childAbs);
      const mimeType = stat.isDirectory() ? '' : (mime.lookup(childAbs) || 'application/octet-stream');
      return {
        path: childUrl,
        name,
        size: stat.size,
        extension: path.extname(name).toLowerCase(),
        modified: stat.mtime.toISOString(),
        mode: stat.mode,
        isDir: stat.isDirectory(),
        isSymlink: false,
        type: getFileType(mimeType, stat.isDirectory()),
        mimeType,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function getFileType(mimeType, isDir) {
  if (isDir) return 'directory';
  if (!mimeType) return 'blob';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/javascript') return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'blob';
}

/**
 * Recursively walk a directory and return flat entries.
 */
function walkDir(absPath, urlPathPrefix) {
  const results = [];
  function walk(abs, urlP) {
    let entries;
    try { entries = fs.readdirSync(abs); } catch { return; }
    for (const name of entries) {
      const childAbs = path.join(abs, name);
      const childUrl = urlP === '/' ? '/' + name : urlP + '/' + name;
      try {
        const stat = fs.statSync(childAbs);
        results.push({
          path: childUrl,
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          isDir: stat.isDirectory(),
        });
        if (stat.isDirectory()) walk(childAbs, childUrl);
      } catch { /* skip */ }
    }
  }
  walk(absPath, urlPathPrefix);
  return results;
}

/**
 * Copy a file or directory recursively.
 */
async function copyPath(src, dst) {
  await fse.copy(src, dst, { overwrite: true });
}

/**
 * Move/rename a file or directory.
 */
async function movePath(src, dst) {
  await fse.move(src, dst, { overwrite: true });
}

/**
 * Generate a non-conflicting name if dst exists.
 * e.g. file(1).txt, file(2).txt
 */
function addVersionSuffix(dstAbs) {
  if (!fs.existsSync(dstAbs)) return dstAbs;
  const dir = path.dirname(dstAbs);
  const ext = path.extname(dstAbs);
  const base = path.basename(dstAbs, ext);
  let counter = 1;
  let candidate;
  do {
    candidate = path.join(dir, `${base}(${counter})${ext}`);
    counter++;
  } while (fs.existsSync(candidate));
  return candidate;
}

module.exports = {
  FILES_ROOT,
  resolvePath,
  statSafe,
  buildFileInfo,
  listDir,
  walkDir,
  copyPath,
  movePath,
  addVersionSuffix,
  getFileType,
};
