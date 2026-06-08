# Global Folders & User Privacy Features

## Feature 1: Admin Global Folders

### Overview
Admins can create folders that are visible to all users. These folders appear in the root directory for every user.

### How It Works

#### For Admins:
1. **Create a new folder with global option:**
   - Click "New Folder" button
   - Enter folder name
   - Check "Make this folder global (visible to all users)"
   - Click Create

2. **Make existing folder global:**
   - Hover over any folder in list or grid view
   - Click the Globe icon button
   - Folder becomes global instantly

#### For Users:
- Global folders automatically appear at the root level (/)
- Global folders are marked with a "Global" badge (blue badge in list view, "G" badge in grid view)
- Users can view and use global folders
- Changes users make are in their own scope (isolated)

### API Endpoints

**GET /api/global-folders**
- Returns: `{ folders: [...] }`
- Auth: Any authenticated user
- Lists all global folders

**POST /api/global-folders**
- Body: `{ folder_path: "/folder-name/" }`
- Auth: Admin only
- Makes a folder global

**DELETE /api/global-folders**
- Body: `{ folder_path: "/folder-name/" }`
- Auth: Admin only
- Removes global status from folder

### Database Schema
```sql
CREATE TABLE global_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_path TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Feature 2: User Privacy Control

### Overview
Users can control whether their files/folders are visible to admins. By default, items are hidden from admin view.

### How It Works

#### For Regular Users:
1. **When creating a new folder:**
   - Click "New Folder" button
   - Enter folder name
   - Check "Show to admin" if you want admin to see it
   - Click Create

2. **Privacy settings:**
   - Default: Items are NOT visible to admin
   - User must explicitly enable "Show to admin" to share with admin

#### For Admins:
- Can only view user items that have `show_to_admin = true`
- Can query visible items via `/api/user-items/visible`

### API Endpoints

**GET /api/user-items?item_path=/path/to/item**
- Returns: `{ showToAdmin: true/false }`
- Auth: Authenticated user
- Gets visibility setting for a specific item

**POST /api/user-items**
- Body: `{ item_path: "/path/", show_to_admin: true/false }`
- Auth: Authenticated user
- Sets visibility for an item

**GET /api/user-items/visible**
- Returns: `{ items: [...] }`
- Auth: Admin only
- Lists all items users have shared with admin

### Database Schema
```sql
CREATE TABLE user_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_path TEXT NOT NULL,
  show_to_admin INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, item_path),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## UI Components

### Modified Components:
1. **NewFolderModal** (`frontend/components/files/RenameModal.tsx`)
   - Added checkbox for "Make this folder global" (admins only)
   - Added checkbox for "Show to admin" (regular users only)

2. **FilesPage** (`frontend/app/dashboard/files/page.tsx`)
   - Fetches and merges global folders at root level
   - Shows "Global" badge on global folders
   - Added Globe button to make folders global

### New Components:
1. **GlobalFolderButton** (`frontend/components/files/GlobalFolderButton.tsx`)
   - Reusable button component
   - Shows Globe icon
   - Calls API to make folder global

---

## Testing

### Test Global Folders:
1. Login as admin
2. Create folder with "Make global" checked
3. Login as different user
4. Verify folder appears at root with "Global" badge

### Test User Privacy:
1. Login as regular user
2. Create folder without "Show to admin" checked
3. Login as admin
4. Verify folder is NOT visible
5. Regular user enables "Show to admin"
6. Admin can now see the folder

---

## Technical Notes

- Global folders are merged at the frontend level when viewing root (/)
- Privacy settings are stored per user-item pair
- Default privacy is hide from admin (show_to_admin = 0)
- Admin permission required to create/delete global folders
- All routes are protected with authentication middleware
