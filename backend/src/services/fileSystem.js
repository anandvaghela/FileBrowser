'use strict';

const path = require('path');
const mime = require('mime-types');
const {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} = require('@aws-sdk/client-s3');
require('dotenv').config();

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'dummy-bucket';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy'
  }
});

/**
 * Resolve a user-supplied path to an absolute filesystem path,
 * confined to the user's scope directory.
 * Under S3, this resolves to an S3 object key.
 */
function getCleanUrlPath(urlPath) {
  let p = (urlPath || '').replace(/\\/g, '/');
  p = p.replace(/\/+/g, '/');
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p;
}

async function checkIsGlobal(urlPath) {
  try {
    const { GlobalFolder } = require('../db');
    const clean = getCleanUrlPath(urlPath);
    const globalFolders = await GlobalFolder.find();
    return globalFolders.some(f => {
      const gPath = getCleanUrlPath(f.folder_path);
      return clean === gPath || clean.startsWith(gPath + '/');
    });
  } catch (e) {
    return false;
  }
}

async function resolvePath(userScope, urlPath) {
  let scopeToUse = userScope;
  if (await checkIsGlobal(urlPath)) {
    scopeToUse = '/';
  }
  const clean = getCleanUrlPath(urlPath);

  // Combine scope and urlPath
  let joined = (scopeToUse + '/' + clean).replace(/\/+/g, '/');
  // S3 keys do not start with a leading slash
  joined = joined.replace(/^\//, '');
  return joined;
}

/**
 * Get stat for an S3 key (null if not found).
 */
async function statSafe(key) {
  if (!key) {
    // Root folder is always a directory
    return {
      isDirectory: () => true,
      size: 0,
      mtime: new Date(),
    };
  }

  try {
    const data = await s3.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    }));

    const isDir = key.endsWith('/') || data.ContentType === 'application/x-directory';
    return {
      isDirectory: () => isDir,
      size: data.ContentLength || 0,
      mtime: data.LastModified || new Date(),
    };
  } catch (err) {
    // Check if objects exist under this prefix (acting as a directory)
    const prefix = key.endsWith('/') ? key : key + '/';
    try {
      const list = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1
      }));
      if (list.Contents && list.Contents.length > 0) {
        return {
          isDirectory: () => true,
          size: 0,
          mtime: new Date(),
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }
}

/**
 * Build a file info object compatible with the original API.
 */
async function buildFileInfo(key, urlPath, options = {}) {
  const stat = await statSafe(key);
  if (!stat) throw new Error('Not found');

  const name = key ? (key.endsWith('/') ? key.slice(0, -1).split('/').pop() : key.split('/').pop()) : '/';
  const isDir = stat.isDirectory();
  const mimeType = isDir ? '' : (mime.lookup(name) || 'application/octet-stream');

  const info = {
    path: urlPath || '/',
    name,
    size: stat.size,
    extension: isDir ? '' : path.extname(name).toLowerCase(),
    modified: stat.mtime.toISOString(),
    mode: isDir ? 16877 : 33188,
    isDir: isDir,
    isSymlink: false,
    type: getFileType(mimeType, isDir),
    mimeType,
    isGlobal: await checkIsGlobal(urlPath),
  };

  if (isDir && options.expand) {
    info.items = await listDir(key, urlPath);
    info.numDirs = info.items.filter(i => i.isDir).length;
    info.numFiles = info.items.filter(i => !i.isDir).length;
    info.sorting = options.sorting || { by: 'name', asc: true };
  }

  if (!isDir && options.content) {
    try {
      const getObj = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      }));
      const content = await getObj.Body.transformToString('utf8');
      info.content = content;
    } catch {
      info.content = '';
    }
  }

  return info;
}

async function listDir(key, urlPathPrefix) {
  const prefix = key ? (key.endsWith('/') ? key : key + '/') : '';
  try {
    const data = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: '/'
    }));

    const folders = (data.CommonPrefixes || []).map(p => {
      const name = p.Prefix.slice(prefix.length).replace(/\/$/, '');
      const childUrl = (urlPathPrefix === '/' ? '' : urlPathPrefix) + '/' + name;
      return {
        path: childUrl,
        name,
        size: 0,
        extension: '',
        modified: new Date().toISOString(),
        mode: 16877,
        isDir: true,
        isSymlink: false,
        type: 'directory',
        mimeType: '',
        isGlobal: false,
      };
    });

    const files = (data.Contents || [])
      .filter(item => item.Key !== prefix)
      .map(item => {
        const name = item.Key.slice(prefix.length);
        if (!name) return null;
        const childUrl = (urlPathPrefix === '/' ? '' : urlPathPrefix) + '/' + name;
        const mimeType = mime.lookup(name) || 'application/octet-stream';
        return {
          path: childUrl,
          name,
          size: item.Size,
          extension: path.extname(name).toLowerCase(),
          modified: item.LastModified.toISOString(),
          mode: 33188,
          isDir: false,
          isSymlink: false,
          type: getFileType(mimeType, false),
          mimeType,
          isGlobal: false,
        };
      })
      .filter(Boolean);

    const items = [...folders, ...files];
    for (const item of items) {
      item.isGlobal = await checkIsGlobal(item.path);
    }
    return items;
  } catch (err) {
    console.error('Error listing S3 directory:', err);
    return [];
  }
}

function getFileType(mimeType, isDir) {
  if (isDir) return 'directory';
  if (!mimeType) return 'blob';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType === 'application/json' || mimeType === 'application/javascript') return 'text';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'blob';
}

/**
 * Recursively walk an S3 prefix path and return flat entries.
 */
async function walkDir(key, urlPathPrefix) {
  const prefix = key ? (key.endsWith('/') ? key : key + '/') : '';
  const results = [];
  try {
    const data = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    }));
    for (const item of (data.Contents || [])) {
      if (item.Key === prefix) continue;
      const relative = item.Key.slice(prefix.length);
      const isDir = item.Key.endsWith('/');
      const childUrl = urlPathPrefix === '/' ? '/' + relative : urlPathPrefix + '/' + relative;
      results.push({
        path: childUrl,
        name: relative.split('/').filter(Boolean).pop(),
        size: item.Size,
        modified: item.LastModified.toISOString(),
        isDir: isDir,
      });
    }
  } catch (e) {
    console.error('Error walking S3 prefix:', e);
  }
  return results;
}

/**
 * Copy a file or directory recursively in S3.
 */
async function copyPath(src, dst) {
  const srcStat = await statSafe(src);
  if (!srcStat) return;

  if (srcStat.isDirectory()) {
    const prefix = src ? (src.endsWith('/') ? src : src + '/') : '';
    const dstPrefix = dst ? (dst.endsWith('/') ? dst : dst + '/') : '';

    const data = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    }));

    for (const item of (data.Contents || [])) {
      const relativeKey = item.Key.slice(prefix.length);
      const newKey = dstPrefix + relativeKey;
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `/${BUCKET_NAME}/${item.Key}`,
        Key: newKey
      }));
    }
  } else {
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `/${BUCKET_NAME}/${src}`,
      Key: dst
    }));
  }
}

/**
 * Move/rename a file or directory in S3.
 */
async function movePath(src, dst) {
  const srcStat = await statSafe(src);
  if (!srcStat) return;

  if (srcStat.isDirectory()) {
    const prefix = src ? (src.endsWith('/') ? src : src + '/') : '';
    const dstPrefix = dst ? (dst.endsWith('/') ? dst : dst + '/') : '';

    const data = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix
    }));

    for (const item of (data.Contents || [])) {
      const relativeKey = item.Key.slice(prefix.length);
      const newKey = dstPrefix + relativeKey;

      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `/${BUCKET_NAME}/${item.Key}`,
        Key: newKey
      }));

      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.Key
      }));
    }
  } else {
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `/${BUCKET_NAME}/${src}`,
      Key: dst
    }));
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: src
    }));
  }
}

/**
 * Generate a non-conflicting name if dst exists.
 */
async function addVersionSuffix(dstAbs) {
  let stat = await statSafe(dstAbs);
  if (!stat) return dstAbs;

  const ext = path.extname(dstAbs);
  const dir = path.dirname(dstAbs);
  const base = path.basename(dstAbs, ext);

  let counter = 1;
  let candidate;
  do {
    let dirPath = dir === '.' ? '' : dir;
    candidate = (dirPath ? dirPath + '/' : '') + `${base}(${counter})${ext}`;
    counter++;
    stat = await statSafe(candidate);
  } while (stat);
  return candidate;
}

module.exports = {
  s3,
  BUCKET_NAME,
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
