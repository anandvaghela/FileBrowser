'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/filebrowser';

// ─── Models & Schemas ─────────────────────────────────────────────────────────

// Counter Schema for Auto-Incrementing IDs
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextSequenceValue(sequenceName) {
  const sequenceDocument = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return sequenceDocument.seq;
}

// User Schema
const userSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  scope: { type: String, default: '/' },
  locale: { type: String, default: 'en' },
  view_mode: { type: String, default: 'mosaic' },
  single_click: { type: Number, default: 0 },
  perm_admin: { type: Number, default: 0 },
  perm_execute: { type: Number, default: 0 },
  perm_create: { type: Number, default: 1 },
  perm_rename: { type: Number, default: 1 },
  perm_modify: { type: Number, default: 1 },
  perm_delete: { type: Number, default: 1 },
  perm_share: { type: Number, default: 1 },
  perm_download: { type: Number, default: 1 },
  lock_password: { type: Number, default: 0 },
  hide_dotfiles: { type: Number, default: 0 },
  date_format: { type: Number, default: 0 },
  commands: { type: String, default: '[]' },
  rules: { type: String, default: '[]' }
}, { timestamps: { createdAt: 'created_at_time', updatedAt: 'updated_at_time' } });

// Convert created_at/updated_at to Unix timestamps to maintain DB compatibility
userSchema.virtual('created_at').get(function() {
  return Math.floor(this.created_at_time.getTime() / 1000);
});
userSchema.virtual('updated_at').get(function() {
  return Math.floor(this.updated_at_time.getTime() / 1000);
});

userSchema.pre('save', async function() {
  if (this.isNew) {
    this.id = await getNextSequenceValue('users');
  }
});

const User = mongoose.model('User', userSchema);

// Share Schema
const shareSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  hash: { type: String, required: true, unique: true },
  path: { type: String, required: true },
  user_id: { type: Number, required: true }, // refers to User.id
  expire: { type: Number, default: 0 },
  password_hash: { type: String, default: '' },
  token: { type: String, default: '' },
  created_at: { type: Number, default: () => Math.floor(Date.now() / 1000) }
});

shareSchema.pre('save', async function() {
  if (this.isNew) {
    this.id = await getNextSequenceValue('shares');
  }
});

const Share = mongoose.model('Share', shareSchema);

// Settings Schema
const settingsSchema = new mongoose.Schema({
  id: { type: Number, default: 1, unique: true },
  signup: { type: Number, default: 0 },
  create_user_dir: { type: Number, default: 0 },
  user_home_base: { type: String, default: '/users' },
  auth_method: { type: String, default: 'json' },
  branding: { type: String, default: '{}' },
  commands: { type: String, default: '{}' },
  shell: { type: String, default: '[]' },
  rules: { type: String, default: '[]' },
  min_pwd_length: { type: Number, default: 8 },
  hide_dotfiles: { type: Number, default: 0 }
});

const Settings = mongoose.model('Settings', settingsSchema);

// GlobalFolder Schema
const globalFolderSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  folder_path: { type: String, required: true, unique: true },
  created_by: { type: Number, required: true }, // refers to User.id
  created_at: { type: Number, default: () => Math.floor(Date.now() / 1000) }
});

globalFolderSchema.pre('save', async function() {
  if (this.isNew) {
    this.id = await getNextSequenceValue('global_folders');
  }
});

const GlobalFolder = mongoose.model('GlobalFolder', globalFolderSchema);

// UserItem Schema
const userItemSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  user_id: { type: Number, required: true }, // refers to User.id
  item_path: { type: String, required: true },
  show_to_admin: { type: Number, default: 0 },
  created_at: { type: Number, default: () => Math.floor(Date.now() / 1000) }
});

userItemSchema.index({ user_id: 1, item_path: 1 }, { unique: true });

userItemSchema.pre('save', async function() {
  if (this.isNew) {
    this.id = await getNextSequenceValue('user_items');
  }
});

const UserItem = mongoose.model('UserItem', userItemSchema);

// UserShare Schema
const userShareSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  item_path: { type: String, required: true },
  owner_id: { type: Number, required: true }, // refers to User.id
  shared_with: { type: Number, required: true }, // refers to User.id
  can_write: { type: Number, default: 0 },
  created_at: { type: Number, default: () => Math.floor(Date.now() / 1000) }
});

userShareSchema.index({ item_path: 1, owner_id: 1, shared_with: 1 }, { unique: true });

userShareSchema.pre('save', async function() {
  if (this.isNew) {
    this.id = await getNextSequenceValue('user_shares');
  }
});

const UserShare = mongoose.model('UserShare', userShareSchema);

// TusUpload Schema
const tusUploadSchema = new mongoose.Schema({
  upload_id: { type: String, required: true, unique: true },
  file_path: { type: String, required: true },
  size: { type: Number, default: 0 },
  offset: { type: Number, default: 0 },
  metadata: { type: String, default: '{}' },
  user_id: { type: Number, required: true },
  created_at: { type: Number, default: () => Math.floor(Date.now() / 1000) },
  updated_at: { type: Number, default: () => Math.floor(Date.now() / 1000) }
});

const TusUpload = mongoose.model('TusUpload', tusUploadSchema);

// ─── Connection & Seed Logic ──────────────────────────────────────────────────

let dbConnected = false;

function getDb() {
  if (!dbConnected) {
    mongoose.connect(MONGODB_URI)
      .then(() => {
        console.log('[MongoDB] Connected to database');
        seedDb();
      })
      .catch(err => {
        console.error('[MongoDB] Connection error:', err);
      });
    dbConnected = true;
  }
  return mongoose.connection;
}

async function seedDb() {
  try {
    // Seed default settings if not exists
    const settingsCount = await Settings.countDocuments();
    if (settingsCount === 0) {
      await Settings.create({ id: 1 });
      console.log('[MongoDB] Seeded default settings');
    }

    // Seed default admin if no users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const hash = bcrypt.hashSync('admin', 10);
      await User.create({
        username: 'admin',
        password: hash,
        scope: '/',
        perm_admin: 1
      });
      console.log('[MongoDB] Default admin user created: admin / admin');
      console.log('[MongoDB] IMPORTANT: Change the default password immediately!');
    }

    // Synchronize auto-increment counters for all collections
    const collectionsToSync = [
      { model: User, seqName: 'users' },
      { model: Share, seqName: 'shares' },
      { model: GlobalFolder, seqName: 'global_folders' },
      { model: UserItem, seqName: 'user_items' },
      { model: UserShare, seqName: 'user_shares' }
    ];

    for (const item of collectionsToSync) {
      const maxDoc = await item.model.findOne().sort({ id: -1 });
      const maxId = maxDoc ? maxDoc.id : 0;
      if (maxId > 0) {
        await Counter.findByIdAndUpdate(
          item.seqName,
          { $max: { seq: maxId } },
          { upsert: true }
        );
      }
    }
    console.log('[MongoDB] Auto-increment counters synchronized');
  } catch (err) {
    console.error('[MongoDB] Seed error:', err);
  }
}

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
    createdAt: u.created_at || Math.floor(Date.now() / 1000),
    updatedAt: u.updated_at || Math.floor(Date.now() / 1000),
  };
}

module.exports = {
  getDb,
  dbUserToJson,
  Counter,
  User,
  Share,
  Settings,
  GlobalFolder,
  UserItem,
  UserShare,
  TusUpload,
};
