'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/filebrowser.db';
const db = new Database(path.resolve(DB_PATH));

console.log('[Migration] Starting database migration...');

try {
  // Check if old schema exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const hasGlobalFolders = tables.some(t => t.name === 'global_folders');
  const hasUserItems = tables.some(t => t.name === 'user_items');

  if (hasGlobalFolders) {
    console.log('[Migration] Checking global_folders table...');
    const columns = db.prepare("PRAGMA table_info(global_folders)").all();
    const hasOldColumns = columns.some(c => c.name === 'path' || c.name === 'name');
    
    if (hasOldColumns) {
      console.log('[Migration] Migrating global_folders table...');
      db.exec(`
        DROP TABLE IF EXISTS global_folders_old;
        ALTER TABLE global_folders RENAME TO global_folders_old;
        
        CREATE TABLE global_folders (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_path TEXT    NOT NULL UNIQUE,
          created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        
        INSERT INTO global_folders (id, folder_path, created_by, created_at)
        SELECT id, path, created_by, created_at FROM global_folders_old;
        
        DROP TABLE global_folders_old;
      `);
      console.log('[Migration] global_folders table migrated successfully');
    } else {
      console.log('[Migration] global_folders table already has correct schema');
    }
  } else {
    console.log('[Migration] Creating global_folders table...');
    db.exec(`
      CREATE TABLE global_folders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT    NOT NULL UNIQUE,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  }

  if (hasUserItems) {
    console.log('[Migration] Checking user_items table...');
    const columns = db.prepare("PRAGMA table_info(user_items)").all();
    const hasOldColumn = columns.some(c => c.name === 'path');
    
    if (hasOldColumn) {
      console.log('[Migration] Migrating user_items table...');
      db.exec(`
        DROP TABLE IF EXISTS user_items_old;
        ALTER TABLE user_items RENAME TO user_items_old;
        
        CREATE TABLE user_items (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_path   TEXT    NOT NULL,
          show_to_admin INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
          UNIQUE(user_id, item_path)
        );
        
        INSERT INTO user_items (id, user_id, item_path, show_to_admin, created_at)
        SELECT id, user_id, path, show_to_admin, created_at FROM user_items_old;
        
        DROP TABLE user_items_old;
      `);
      console.log('[Migration] user_items table migrated successfully');
    } else {
      console.log('[Migration] user_items table already has correct schema');
    }
  } else {
    console.log('[Migration] Creating user_items table...');
    db.exec(`
      CREATE TABLE user_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_path   TEXT    NOT NULL,
        show_to_admin INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(user_id, item_path)
      );
    `);
  }

  console.log('[Migration] Migration completed successfully!');
} catch (err) {
  console.error('[Migration] Error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
