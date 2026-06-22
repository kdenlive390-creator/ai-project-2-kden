const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'codeflow-secret-key-change-in-production';
const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

// Track active users per server
const activeUsers = new Map(); // serverId -> Map(socketId -> userInfo)
// Track auto-save timers
const autoSaveTimers = new Map(); // `${serverId}:${filePath}` -> timer

function setupSocketHandlers(io) {
  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 ${socket.user.email} connected`);

    // Join a server workspace
    socket.on('join-server', ({ serverId }) => {
      socket.join(`server:${serverId}`);
      socket.currentServer = serverId;

      if (!activeUsers.has(serverId)) {
        activeUsers.set(serverId, new Map());
      }
      activeUsers.get(serverId).set(socket.id, {
        id: socket.user.id,
        email: socket.user.email,
        name: socket.user.name,
        color: getUserColor(socket.user.email),
        currentFile: null
      });

      // Notify all in room
      const users = Array.from(activeUsers.get(serverId).values());
      io.to(`server:${serverId}`).emit('users-update', users);
    });

    // User opened a file
    socket.on('open-file', ({ serverId, filePath }) => {
      if (activeUsers.has(serverId) && activeUsers.get(serverId).has(socket.id)) {
        activeUsers.get(serverId).get(socket.id).currentFile = filePath;
        const users = Array.from(activeUsers.get(serverId).values());
        io.to(`server:${serverId}`).emit('users-update', users);
      }
    });

    // Real-time code change (broadcast to others in same server)
    socket.on('code-change', ({ serverId, filePath, content, cursorPosition }) => {
      socket.to(`server:${serverId}`).emit('code-change', {
        filePath,
        content,
        cursorPosition,
        user: {
          email: socket.user.email,
          name: socket.user.name,
          color: getUserColor(socket.user.email)
        }
      });

      // Schedule auto-save (1 minute debounce)
      const key = `${serverId}:${filePath}`;
      if (autoSaveTimers.has(key)) {
        clearTimeout(autoSaveTimers.get(key));
      }
      const timer = setTimeout(async () => {
        try {
          const workspaceDir = path.join(WORKSPACES_DIR, serverId);
          const fullPath = path.join(workspaceDir, filePath);
          if (!fullPath.startsWith(workspaceDir)) return; // security
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeFile(fullPath, content, 'utf-8');
          io.to(`server:${serverId}`).emit('file-autosaved', { filePath, savedAt: new Date().toISOString() });
        } catch (err) {
          console.error('Auto-save error:', err);
        }
        autoSaveTimers.delete(key);
      }, 60000); // 1 minute

      autoSaveTimers.set(key, timer);
    });

    // Manual save
    socket.on('save-file', async ({ serverId, filePath, content }) => {
      try {
        const workspaceDir = path.join(WORKSPACES_DIR, serverId);
        const fullPath = path.join(workspaceDir, filePath);
        if (!fullPath.startsWith(workspaceDir)) return;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content, 'utf-8');

        // Cancel pending auto-save
        const key = `${serverId}:${filePath}`;
        if (autoSaveTimers.has(key)) {
          clearTimeout(autoSaveTimers.get(key));
          autoSaveTimers.delete(key);
        }

        io.to(`server:${serverId}`).emit('file-saved', {
          filePath,
          savedBy: socket.user.email,
          savedAt: new Date().toISOString()
        });
      } catch (err) {
        socket.emit('save-error', { error: 'Failed to save file' });
      }
    });

    // Cursor position broadcast
    socket.on('cursor-move', ({ serverId, filePath, line, column }) => {
      socket.to(`server:${serverId}`).emit('cursor-move', {
        filePath, line, column,
        user: { email: socket.user.email, name: socket.user.name, color: getUserColor(socket.user.email) }
      });
    });

    // File tree change notification
    socket.on('tree-changed', ({ serverId }) => {
      socket.to(`server:${serverId}`).emit('tree-changed', { serverId });
    });

    // Chat message within server
    socket.on('chat-message', ({ serverId, message }) => {
      io.to(`server:${serverId}`).emit('chat-message', {
        message,
        user: { email: socket.user.email, name: socket.user.name, color: getUserColor(socket.user.email) },
        timestamp: new Date().toISOString()
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 ${socket.user.email} disconnected`);
      if (socket.currentServer && activeUsers.has(socket.currentServer)) {
        activeUsers.get(socket.currentServer).delete(socket.id);
        const users = Array.from(activeUsers.get(socket.currentServer).values());
        io.to(`server:${socket.currentServer}`).emit('users-update', users);
        if (users.length === 0) activeUsers.delete(socket.currentServer);
      }
    });
  });
}

// Consistent color per user
function getUserColor(email) {
  const colors = ['#cba6f7', '#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#94e2d5', '#f9e2af', '#89dceb'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

module.exports = { setupSocketHandlers };
