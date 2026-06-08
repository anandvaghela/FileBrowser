'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/filebrowser.db';

// Ensure data directory exists
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      scope       TEXT    NOT NULL DEFAULT '/',
      locale      TEXT    NOT NULL DEFAULT 'en',
      view_mode   TEXT    NOT NULL DEFAULT 'mosaic',
      single_click INTEGER NOT NULL DEFAULT 0,
      perm_admin   INTEGER NOT NULL DEFAULT 0,
      perm_execute INTEGER NOT NULL DEFAULT 0,
      perm_create  INTEGER NOT NULL DEFAULT 1,
      perm_rename  INTEGER NOT NULL DEFAULT 1,
      perm_modify  INTEGER NOT NULL DEFAULT 1,
      perm_delete  INTEGER NOT NULL DEFAULT 1,
      perm_share   INTEGER NOT NULL DEFAULT 1,
      perm_download INTEGER NOT NULL DEFAULT 1,
      lock_password INTEGER NOT NULL DEFAULT 0,
      hide_dotfiles INTEGER NOT NULL DEFAULT 0,
      date_format   INTEGER NOT NULL DEFAULT 0,
      commands      TEXT    NOT NULL DEFAULT '[]',
      rules         TEXT    NOT NULL DEFAULT '[]',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS shares (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      hash          TEXT    NOT NULL UNIQUE,
      path          TEXT    NOT NULL,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expire        INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT    NOT NULL DEFAULT '',
      token         TEXT    NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      signup          INTEGER NOT NULL DEFAULT 0,
      create_user_dir INTEGER NOT NULL DEFAULT 0,
      user_home_base  TEXT    NOT NULL DEFAULT '/users',
      auth_method     TEXT    NOT NULL DEFAULT 'json',
      branding        TEXT    NOT NULL DEFAULT '{}',
      commands        TEXT    NOT NULL DEFAULT '{}',
      shell           TEXT    NOT NULL DEFAULT '[]',
      rules           TEXT    NOT NULL DEFAULT '[]',
      min_pwd_length  INTEGER NOT NULL DEFAULT 8,
      hide_dotfiles   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS global_folders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_path TEXT    NOT NULL UNIQUE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_path   TEXT    NOT NULL,
      show_to_admin INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(user_id, item_path)
    );

    CREATE TABLE IF NOT EXISTS user_shares (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      item_path   TEXT    NOT NULL,
      owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_with INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      can_write   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(item_path, owner_id, shared_with)
    );

    CREATE TABLE IF NOT EXISTS tus_uploads (
      upload_id   TEXT    PRIMARY KEY,
      file_path   TEXT    NOT NULL,
      size        INTEGER NOT NULL DEFAULT 0,
      offset      INTEGER NOT NULL DEFAULT 0,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      user_id     INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Seed settings if empty
  const s = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!s) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }

  // Seed default admin if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    db.prepare(`
      INSERT INTO users (username, password, scope, perm_admin)
      VALUES ('admin', ?, '/', 1)
    `).run(hash);
    console.log('[DB] Default admin user created: admin / admin');
    console.log('[DB] IMPORTANT: Change the default password immediately!');
  }
}

// ─── User helpers ──────────────────────────────────────────────────────────────

function dbUserToJson(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    scope: u.scope,
    locale: u.locale,
    viewMode: u.view_mode,
    singleClick: !!u.single_click,
    lockPassword: !!u.lock_password,
    hideDotfiles: !!u.hide_dotfiles,
    dateFormat: !!u.date_format,
    commands: JSON.parse(u.commands || '[]'),
    rules: JSON.parse(u.rules || '[]'),
    perm: {
      admin: !!u.perm_admin,
      execute: !!u.perm_execute,
      create: !!u.perm_create,
      rename: !!u.perm_rename,
      modify: !!u.perm_modify,
      delete: !!u.perm_delete,
      share: !!u.perm_share,
      download: !!u.perm_download,
    },
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

module.exports = { getDb, dbUserToJson };
