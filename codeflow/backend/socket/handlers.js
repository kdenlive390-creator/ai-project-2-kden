const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'codeflow-secret-key-change-in-production';
const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

const activeUsers = new Map();
const autoSaveTimers = new Map();

function setupSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 ${socket.user.email} connected [${socket.id}]`);

    // ── JOIN SERVER ──
    socket.on('join-server', ({ serverId }) => {
      // Leave any previous server room
      if (socket.currentServer && socket.currentServer !== serverId) {
        socket.leave(`server:${socket.currentServer}`);
        if (activeUsers.has(socket.currentServer)) {
          activeUsers.get(socket.currentServer).delete(socket.id);
          broadcastUsers(io, socket.currentServer);
        }
      }

      socket.join(`server:${serverId}`);
      socket.currentServer = serverId;

      if (!activeUsers.has(serverId)) activeUsers.set(serverId, new Map());
      activeUsers.get(serverId).set(socket.id, {
        id: socket.user.id,
        email: socket.user.email,
        name: socket.user.name,
        color: getUserColor(socket.user.email),
        currentFile: null
      });

      broadcastUsers(io, serverId);

      // Tell the new joiner to refresh their file tree
      socket.emit('tree-changed', { serverId });
    });

    // ── FILE OPENED ──
    socket.on('open-file', ({ serverId, filePath }) => {
      if (activeUsers.has(serverId) && activeUsers.get(serverId).has(socket.id)) {
        activeUsers.get(serverId).get(socket.id).currentFile = filePath;
        broadcastUsers(io, serverId);
      }
    });

    // ── CODE CHANGE (real-time) ──
    socket.on('code-change', ({ serverId, filePath, content }) => {
      // Broadcast to everyone ELSE in the room
      socket.to(`server:${serverId}`).emit('code-change', {
        filePath,
        content,
        user: { email: socket.user.email, name: socket.user.name, color: getUserColor(socket.user.email) }
      });

      // Auto-save after 60s of inactivity
      const key = `${serverId}:${filePath}`;
      if (autoSaveTimers.has(key)) clearTimeout(autoSaveTimers.get(key));
      autoSaveTimers.set(key, setTimeout(async () => {
        try {
          const fullPath = path.join(WORKSPACES_DIR, serverId, filePath);
          if (!fullPath.startsWith(path.join(WORKSPACES_DIR, serverId))) return;
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeFile(fullPath, content, 'utf-8');
          io.to(`server:${serverId}`).emit('file-autosaved', { filePath });
        } catch (e) { console.error('Auto-save error:', e); }
        autoSaveTimers.delete(key);
      }, 60000));
    });

    // ── MANUAL SAVE ──
    socket.on('save-file', async ({ serverId, filePath, content }) => {
      try {
        const fullPath = path.join(WORKSPACES_DIR, serverId, filePath);
        if (!fullPath.startsWith(path.join(WORKSPACES_DIR, serverId))) return;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf-8');

        const key = `${serverId}:${filePath}`;
        if (autoSaveTimers.has(key)) { clearTimeout(autoSaveTimers.get(key)); autoSaveTimers.delete(key); }

        // Tell EVERYONE (including sender) file was saved
        io.to(`server:${serverId}`).emit('file-saved', {
          filePath,
          savedBy: socket.user.email,
          savedAt: new Date().toISOString()
        });
      } catch (e) {
        socket.emit('save-error', { error: 'Save failed' });
      }
    });

    // ── TYPING INDICATOR ──
    socket.on('typing', ({ serverId, filePath, line, column }) => {
      socket.to(`server:${serverId}`).emit('typing', {
        filePath, line, column,
        user: { id: socket.user.id, email: socket.user.email, name: socket.user.name, color: getUserColor(socket.user.email) }
      });
    });

    // ── FILE TREE CHANGED — broadcast to ALL including sender ──
    socket.on('tree-changed', ({ serverId }) => {
      io.to(`server:${serverId}`).emit('tree-changed', { serverId });
    });

    // ── CHAT ──
    socket.on('chat-message', ({ serverId, message }) => {
      if (!message || !message.trim()) return;
      // Broadcast to ALL in room including sender so everyone sees it
      io.to(`server:${serverId}`).emit('chat-message', {
        message: message.trim(),
        user: { email: socket.user.email, name: socket.user.name, color: getUserColor(socket.user.email) },
        timestamp: new Date().toISOString()
      });
    });

    // ── DISCONNECT ──
    socket.on('disconnect', () => {
      console.log(`🔌 ${socket.user.email} disconnected`);
      if (socket.currentServer && activeUsers.has(socket.currentServer)) {
        activeUsers.get(socket.currentServer).delete(socket.id);
        broadcastUsers(io, socket.currentServer);
        if (activeUsers.get(socket.currentServer).size === 0) {
          activeUsers.delete(socket.currentServer);
        }
      }
    });
  });
}

function broadcastUsers(io, serverId) {
  const users = activeUsers.has(serverId)
    ? Array.from(activeUsers.get(serverId).values())
    : [];
  io.to(`server:${serverId}`).emit('users-update', users);
}

function getUserColor(email) {
  const colors = ['#cba6f7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#f9e2af', '#89dceb'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

module.exports = { setupSocketHandlers };
