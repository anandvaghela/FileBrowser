# FileBrowser — Node.js Backend

A full-featured file browser backend built with **Node.js + Express + SQLite**, mirroring every feature of the original Go filebrowser project.

## Features

| Feature | Details |
|---|---|
| **Authentication** | JWT (login, signup, token renew) |
| **File operations** | List, upload (multipart + raw), download, delete, rename, copy, move |
| **Directories** | Create, list (with sorting), recursive walk |
| **Search** | Streaming NDJSON results, glob patterns, type filters |
| **Sharing** | Create share links with optional password + expiry, public download/zip |
| **Resumable uploads** | TUS 1.0.0 protocol (creation, head, patch, delete) |
| **Thumbnails** | On-demand image thumbnails via sharp (small/medium/big) |
| **Raw download** | Stream files / zip directories, range requests for media |
| **Disk usage** | Report total + used for a path |
| **User management** | Admin CRUD, granular permissions |
| **Settings** | Admin-only global settings (signup, branding, rules, …) |
| **Preview** | Image preview with server-side resize and disk cache |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env and configure
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET

# 3. Start (dev)
npm run dev

# 4. Start (production)
npm start
```

Default admin credentials: **admin / admin** — change immediately!

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Listen host |
| `JWT_SECRET` | *(required)* | Secret for signing JWTs |
| `JWT_EXPIRY` | `2h` | Token lifetime (e.g. `1h`, `24h`) |
| `FILES_ROOT` | `./uploads` | Root directory for all user files |
| `DB_PATH` | `./data/filebrowser.db` | SQLite database path |
| `MAX_UPLOAD_SIZE` | `10737418240` | Max upload size in bytes (10 GB) |
| `ENABLE_THUMBNAILS` | `true` | Generate image thumbnails |
| `BASE_URL` | *(empty)* | URL prefix, e.g. `/files` |
| `ALLOW_SIGNUP` | `false` | Allow public self-registration |
| `MIN_PASSWORD_LENGTH` | `8` | Minimum password length |
| `CORS_ORIGIN` | `*` | CORS origin |

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/login` | Login → `{ token, user }` |
| `POST` | `/api/signup` | Self-register (if enabled) |
| `POST` | `/api/renew` | Exchange token for fresh one |

**Login body:**
```json
{ "username": "admin", "password": "admin" }
```

**Auth header for all protected routes:**
```
Authorization: Bearer <token>
```
or `X-Auth: <token>` header or `auth` cookie.

---

### Resources (Files & Directories)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/resources/*` | Get file info or list directory |
| `POST` | `/api/resources/*` | Upload file or create directory (path ends with `/`) |
| `PUT` | `/api/resources/*` | Overwrite existing file |
| `DELETE` | `/api/resources/*` | Delete file or directory |
| `PATCH` | `/api/resources/*?action=rename&destination=/new/path` | Rename/move |
| `PATCH` | `/api/resources/*?action=copy&destination=/new/path` | Copy |
| `GET` | `/api/resources/recursive/*` | Flat recursive listing |

**Query params for GET:**
- `?checksum=sha256` — include checksum in response

**Query params for POST:**
- `?override=true` — overwrite existing file

**Query params for PATCH:**
- `action=rename|copy`
- `destination=/url/path`
- `override=true` — overwrite destination
- `rename=true` — auto-suffix if conflict (`file(1).txt`)

**Upload methods:**
- Multipart form: `Content-Type: multipart/form-data`, field name `file`
- Raw body: pipe raw bytes with any `Content-Type`

---

### Search

```
GET /api/search/*?query=<term>
```

Streams NDJSON — one `{"path":"...","dir":false}` per line.

**Query patterns:**
- `document` — name contains "document"
- `*.pdf` — ends with `.pdf`
- `type:image` — images only
- `type:dir` — directories only
- `type:video report` — videos whose name contains "report"

---

### Sharing

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/shares` | List all shares (admin) or own shares |
| `GET` | `/api/share/*` | Shares for a specific path |
| `POST` | `/api/share/*` | Create share link |
| `DELETE` | `/api/share/:hash` | Delete share link |
| `GET` | `/api/public/share/:hash` | Public: get share info |
| `GET` | `/api/public/dl/:hash` | Public: download file/zip |

**Create share body:**
```json
{
  "expires": "7",
  "unit": "days",
  "password": "optional-secret"
}
```
Units: `seconds`, `minutes`, `hours`, `days`

**Password-protected share access:**
Add `?password=<pass>` or `X-Share-Password: <pass>` header.

---

### TUS Resumable Uploads

TUS 1.0.0 endpoint at `/api/tus`.

```
OPTIONS  /api/tus
POST     /api/tus          — create upload, returns Location header
HEAD     /api/tus/:id      — check offset
PATCH    /api/tus/:id      — append chunk
DELETE   /api/tus/:id      — cancel
```

TUS metadata keys:
- `filePath` — destination path (base64-encoded)
- `filename` — fallback if filePath not set

---

### Preview (Thumbnails)

```
GET /api/preview/:size/*
```

Sizes: `small` (128px), `medium` (480px), `big` (1080px)

Thumbnails are cached in `./data/thumbcache/`.

---

### Raw Download

```
GET /api/raw/*
```

- Files: streamed with correct MIME type, supports HTTP range requests
- Directories: zipped on-the-fly

Query: `?inline=true` — serve inline (e.g. for images in browser)

---

### Disk Usage

```
GET /api/usage/*
```

Returns: `{ "total": <bytes>, "used": <bytes> }`

---

### Users (Admin)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |

**Permissions object:**
```json
{
  "admin": false,
  "execute": false,
  "create": true,
  "rename": true,
  "modify": true,
  "delete": true,
  "share": true,
  "download": true
}
```

---

### Settings (Admin)

```
GET /api/settings
PUT /api/settings
```

```json
{
  "signup": false,
  "createUserDir": false,
  "userHomeBasePath": "/users",
  "minimumPasswordLength": 8,
  "hideDotfiles": false,
  "branding": {},
  "commands": {},
  "shell": [],
  "rules": []
}
```

---

## Directory Structure

```
filebrowser-backend/
├── src/
│   ├── index.js              # Express app + server startup
│   ├── db.js                 # SQLite init, schema, helpers
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   ├── routes/
│   │   ├── auth.js           # Login, signup, renew
│   │   ├── resources.js      # File CRUD
│   │   ├── users.js          # User management
│   │   ├── shares.js         # Share links
│   │   ├── raw.js            # Raw file download
│   │   ├── search.js         # Streaming search
│   │   ├── preview.js        # Thumbnails
│   │   ├── settings.js       # App settings
│   │   ├── usage.js          # Disk usage
│   │   └── tus.js            # TUS resumable uploads
│   └── services/
│       └── fileSystem.js     # Path resolution, file helpers
├── uploads/                  # User files (created at runtime)
├── data/                     # SQLite DB + thumbnail cache (created at runtime)
├── .env.example
├── package.json
└── README.md
```

---

## Security Notes

- All file paths are confined to the user's `scope` directory — path traversal is blocked.
- Passwords are hashed with bcrypt (cost 10).
- JWTs expire (default 2h) and include a `X-Renew-Token: true` hint when < 1h remains.
- Rate limiting is recommended in production (use a reverse proxy or add `express-rate-limit`).
- Set `CORS_ORIGIN` to your frontend's URL in production instead of `*`.
