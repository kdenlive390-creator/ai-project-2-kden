require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs-extra');
const schedule = require('node-schedule');
const { spawn } = require('child_process');

const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const fileRoutes = require('./routes/files');
const terminalRoutes = require('./routes/terminal');
const { authenticateToken } = require('./middleware/auth');
const { setupSocketHandlers } = require('./socket/handlers');
const { cleanupExpiredServers } = require('./utils/cleanup');

const app = express();
const httpServer = http.createServer(app);
const io = socketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/codeflow';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(() => console.log('⚠️  Using file-based storage'));

app.use('/api/auth', authRoutes);
app.use('/api/servers', authenticateToken, serverRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/terminal', authenticateToken, terminalRoutes);

// Serve workspace files for live preview
app.use('/workspace-files/:serverId', (req, res, next) => {
  const workspacePath = path.join(__dirname, '../workspaces', req.params.serverId);
  express.static(workspacePath)(req, res, next);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Setup main socket handlers (collaboration)
setupSocketHandlers(io);

// Terminal socket namespace
const terminalNS = io.of('/terminal');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'codeflow-secret-key-change-in-production';
const WORKSPACES_DIR = path.join(__dirname, '../workspaces');

terminalNS.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('Invalid token')); }
});

terminalNS.on('connection', (socket) => {
  let shellProcess = null;

  socket.on('start-terminal', ({ serverId }) => {
    socket.serverId = serverId;
    const workspaceDir = path.join(WORKSPACES_DIR, serverId);
    fs.ensureDirSync(workspaceDir);

    // Spawn shell
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const args = process.platform === 'win32' ? [] : ['--login'];

    shellProcess = spawn(shell, args, {
      cwd: workspaceDir,
      env: { ...process.env, TERM: 'xterm-256color', HOME: workspaceDir },
      cols: 80, rows: 24
    });

    shellProcess.stdout.on('data', (data) => {
      socket.emit('terminal-output', data.toString());
    });

    shellProcess.stderr.on('data', (data) => {
      socket.emit('terminal-output', data.toString());
    });

    shellProcess.on('close', () => {
      socket.emit('terminal-output', '\r\n[Terminal closed]\r\n');
    });

    socket.emit('terminal-output', `\r\n⚡ Terminal ready — workspace: ${serverId.slice(0, 8)}\r\n$ `);
  });

  socket.on('terminal-input', (data) => {
    if (shellProcess && shellProcess.stdin.writable) {
      shellProcess.stdin.write(data);
    }
  });

  socket.on('terminal-resize', ({ cols, rows }) => {
    if (shellProcess && shellProcess.resize) shellProcess.resize(cols, rows);
  });

  socket.on('disconnect', () => {
    if (shellProcess) shellProcess.kill();
  });
});

schedule.scheduleJob('0 0 * * *', cleanupExpiredServers);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 CodeFlow IDE running on http://localhost:${PORT}`);
});

module.exports = { app, io };
