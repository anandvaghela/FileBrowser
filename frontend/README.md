# FileBrowser — Next.js Frontend

Modern file browser frontend built with **Next.js 14 + Tailwind CSS**, matching the UBverse design theme.

## Quick Start

```bash
unzip filebrowser-frontend.zip && cd filebrowser-frontend
npm install
cp .env.local.example .env.local
# Edit .env.local — set NEXT_PUBLIC_API_URL to your backend URL
npm run dev
```

Open http://localhost:3000

Login with: **admin / admin**

---

## Design Theme

Inspired by the UBverse design language:
- **Split login page** — animated gradient blobs left, clean form right
- **Blue primary** (`#2563eb`) with indigo accents
- **Outfit font** — clean, modern sans-serif
- **Rounded cards** (`rounded-2xl`) with soft shadows
- **Blue CTA buttons** with subtle hover lift + shadow
- Smooth animations: slide-up, fade-in, blob morph

---

## Pages & Features

| Route | Description |
|---|---|
| `/login` | Login page with UBverse-style split layout + animated blobs |
| `/dashboard` | Home — welcome card, stats, recent files, storage meter |
| `/dashboard/files` | Full file browser — grid/list, upload, search, preview, share, rename, delete |
| `/dashboard/shares` | All share links with copy, open, delete |
| `/dashboard/users` | Admin user management — create, edit, delete, permissions |
| `/dashboard/settings` | Admin global settings — toggles, sliders, branding |
| `/share/:hash` | Public share page — password gate, file info, download |

---

## File Browser Features

- **Drag & drop upload** — drop files anywhere on the page
- **Click to upload** — Upload button opens file picker
- **Grid / List view** toggle
- **Multi-select** — checkbox select, bulk delete
- **Sort** by name / size / modified
- **Search** — live streaming search with glob patterns (`*.pdf`, `type:image`)
- **Breadcrumb** navigation
- **File preview** — images (zoom), video (player), audio, PDF (iframe), text (syntax)
- **Share links** — create with expiry + password, copy URL
- **Rename / Move**
- **Delete** with confirm dialog
- **Download** files and folders (folders as ZIP)
- **Upload progress** bar

---

## Environment Variables

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## Project Structure

```
filebrowser-frontend/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx               # Redirect to /login or /dashboard
│   ├── login/page.tsx         # Login page
│   ├── dashboard/
│   │   ├── layout.tsx         # AppLayout wrapper
│   │   ├── page.tsx           # Dashboard home
│   │   ├── files/page.tsx     # File browser
│   │   ├── shares/page.tsx    # Share links
│   │   ├── users/page.tsx     # User management (admin)
│   │   └── settings/page.tsx  # Settings (admin)
│   └── share/[hash]/page.tsx  # Public share page
├── components/
│   ├── layout/AppLayout.tsx   # Sidebar + header
│   └── files/
│       ├── ShareModal.tsx
│       ├── RenameModal.tsx    # Also exports NewFolderModal + DeleteConfirm
│       ├── FilePreviewModal.tsx
│       ├── NewFolderModal.tsx
│       └── DeleteConfirm.tsx
├── lib/api.ts                 # Axios client + all API helpers
├── tailwind.config.js
├── next.config.js
└── tsconfig.json
```
