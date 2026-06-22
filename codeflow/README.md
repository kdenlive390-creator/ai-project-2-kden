# ⚡ CodeFlow IDE — Deployment Guide

A browser-based collaborative IDE. VS Code-like editor, real-time multi-user collaboration, live preview, built-in chat.

---

## What's Inside

- **Monaco Editor** (the engine behind VS Code) with IntelliSense, autocomplete, syntax highlighting
- **Material icon theme** for files
- **Live Server** — instant preview of your HTML/CSS/JS in a side panel
- **Real-time collaboration** — multiple users edit files simultaneously, changes sync live
- **Auto-save** — every 60 seconds automatically. Manual save with Ctrl+S
- **Undo/redo** — full history per user (Ctrl+Z / Ctrl+Y)
- **Team chat** — built-in chat per workspace
- **Invite codes** — share an 8-character code, anyone can join

---

## Option 1: Deploy to Railway (Recommended — Free)

1. Go to https://railway.app and sign up (free)
2. Click **New Project → Deploy from GitHub**
3. Upload this folder to a GitHub repo first:
   - Create a repo at github.com
   - Drag and drop this entire folder into it
4. Connect your repo on Railway
5. Railway auto-detects Node.js and deploys
6. Add environment variable:
   - `JWT_SECRET` = any random string (e.g. `mysecretkey123abc`)
7. Your IDE is live at the URL Railway gives you

**Free tier:** 500 hours/month — enough for continuous use for months.

---

## Option 2: Deploy to Render (Also Free)

1. Go to https://render.com and sign up
2. Click **New → Web Service**
3. Connect your GitHub repo (upload this folder to GitHub first)
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/server.js`
5. Add environment variable: `JWT_SECRET` = any random string
6. Click **Create Web Service**

**Free tier:** Spins down after 15 min inactivity (first load may be slow). Upgrade to $7/mo to keep it always on.

---

## Option 3: Run Locally

```bash
# Install dependencies
npm install

# Start server
npm start

# Open browser
# Go to: http://localhost:3000
```

---

## Optional: Add MongoDB (for better data persistence)

Without MongoDB, data is stored in JSON files in the `data/` folder — this works fine for most cases.

For MongoDB (recommended for production):
1. Go to https://www.mongodb.com/atlas and create a free account
2. Create a free cluster (M0 — always free)
3. Get your connection string
4. Add to environment variables:
   ```
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/codeflow
   ```

---

## How It Works

### Creating a workspace
1. Register/login at your deployed URL
2. Click **+ New Workspace**
3. Give it a name
4. You get a workspace with default `index.html`, `style.css`, `script.js`

### Inviting collaborators
1. Inside the IDE, click the 🔗 button (top right)
2. Share the 8-character invite code with your team
3. They go to your URL, create an account, click **Join via Code**
4. They're in — changes sync to everyone live

### File operations
- **New file:** Click 📄 in the sidebar
- **New folder:** Click 📁 in the sidebar
- **Rename/Delete:** Right-click any file or folder
- **Open:** Click any file in the sidebar

### Live Preview
- Click **▶ Live Preview** in the top bar
- A panel opens showing your `index.html` live
- Saves auto-trigger a refresh of the preview

### Keyboard shortcuts
| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save current file |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+Space | IntelliSense / autocomplete |
| Ctrl+/ | Toggle comment |
| Ctrl+D | Select next occurrence |
| Ctrl+F | Find |
| Ctrl+H | Find & Replace |
| Ctrl+G | Go to line |
| F1 | Command palette |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | `codeflow-change-this-secret` | Secret for auth tokens. Change this! |
| `PORT` | No | `3000` | Server port |
| `MONGO_URI` | No | File storage | MongoDB connection string |

---

## Workspace Expiry

Each workspace lasts **4 months** from creation. After that it's automatically deleted. The owner can see the expiry countdown on the dashboard.

---

## Folder Structure

```
codeflow/
├── backend/
│   ├── server.js          # Main server
│   ├── routes/
│   │   ├── auth.js        # Login/register
│   │   ├── servers.js     # Workspace management
│   │   └── files.js       # File read/write
│   ├── socket/
│   │   └── handlers.js    # Real-time collaboration
│   ├── models/
│   │   ├── User.js        # User model
│   │   └── Server.js      # Workspace model
│   └── utils/
│       └── cleanup.js     # Expired workspace cleanup
├── frontend/
│   └── public/
│       ├── index.html     # Main app
│       ├── css/
│       │   ├── style.css  # VS Code dark theme
│       │   └── icons.css  # Material icons
│       └── js/
│           ├── app.js     # App orchestrator
│           ├── api.js     # API helper
│           ├── auth.js    # Auth logic
│           ├── dashboard.js # Dashboard
│           ├── filetree.js  # File explorer
│           ├── editor.js    # Monaco editor
│           ├── socket.js    # Real-time socket
│           └── preview.js   # Live preview
├── workspaces/            # User project files (auto-created)
├── data/                  # JSON storage (auto-created)
├── package.json
├── railway.toml           # Railway config
└── render.yaml            # Render config
```
