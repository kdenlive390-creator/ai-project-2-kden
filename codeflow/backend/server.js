require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs-extra');
const schedule = require('node-schedule');

const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const fileRoutes = require('./routes/files');
const { authenticateToken } = require('./middleware/auth');
const { setupSocketHandlers } = require('./socket/handlers');
const { cleanupExpiredServers } = require('./utils/cleanup');

const app = express();
const httpServer = http.createServer(app);
const io = socketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// DB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/codeflow';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.log('⚠️  MongoDB not available, using file-based storage');
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/servers', authenticateToken, serverRoutes);
app.use('/api/files', authenticateToken, fileRoutes);

// Live preview route
app.use('/preview/:serverId', authenticateToken, (req, res, next) => {
  const { serverId } = req.params;
  const filePath = req.query.file || 'index.html';
  const fullPath = path.join(__dirname, '../workspaces', serverId, filePath);
  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send('<h2>File not found in workspace</h2>');
  }
});

// Serve workspace files for live preview
app.use('/workspace-files/:serverId', (req, res, next) => {
  const { serverId } = req.params;
  const workspacePath = path.join(__dirname, '../workspaces', serverId);
  express.static(workspacePath)(req, res, next);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Socket setup
setupSocketHandlers(io);

// Cleanup job - runs daily
schedule.scheduleJob('0 0 * * *', cleanupExpiredServers);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 CodeFlow IDE running on http://localhost:${PORT}`);
});

module.exports = { app, io };
