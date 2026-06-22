const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const { ServerModel, fileDB } = require('../models/Server');

const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

function useDB() { return mongoose.connection.readyState === 1; }

async function getServer(id) {
  return useDB() ? ServerModel.findOne({ id }) : fileDB.findById(id);
}

async function hasAccess(serverId, user) {
  const server = await getServer(serverId);
  if (!server) return false;
  return server.ownerId === user.id || (server.collaborators && server.collaborators.some(c => c.email === user.email));
}

function sanitizePath(base, userPath) {
  const full = path.resolve(base, userPath.replace(/^\/+/, ''));
  if (!full.startsWith(base)) throw new Error('Path traversal detected');
  return full;
}

// Multer — store in memory then write to workspace
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Get file tree
router.get('/:serverId/tree', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    await fs.ensureDir(workspaceDir);
    res.json(await buildTree(workspaceDir, workspaceDir));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read tree' });
  }
});

async function buildTree(basePath, currentPath) {
  const items = await fs.readdir(currentPath);
  const result = [];
  for (const item of items) {
    const fullPath = path.join(currentPath, item);
    const stat = await fs.stat(fullPath);
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
    if (stat.isDirectory()) {
      result.push({ name: item, path: relativePath, type: 'folder', children: await buildTree(basePath, fullPath) });
    } else {
      result.push({ name: item, path: relativePath, type: 'file', size: stat.size, ext: path.extname(item).substring(1), modified: stat.mtime });
    }
  }
  return result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Read file
router.get('/:serverId/read', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const filePath = sanitizePath(workspaceDir, req.query.path || '');
    if (!await fs.pathExists(filePath)) return res.status(404).json({ error: 'File not found' });
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Path is a directory' });
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content, path: req.query.path });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Write/create file
router.post('/:serverId/write', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const fullPath = sanitizePath(workspaceDir, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content || '', 'utf-8');
    res.json({ message: 'File saved', path: filePath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// Upload files from user's computer
router.post('/:serverId/upload', upload.array('files', 50), async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const targetDir = req.body.targetPath ? sanitizePath(workspaceDir, req.body.targetPath) : workspaceDir;
    await fs.ensureDir(targetDir);

    const uploaded = [];
    for (const file of req.files) {
      const destPath = path.join(targetDir, file.originalname);
      await fs.writeFile(destPath, file.buffer);
      uploaded.push(path.relative(workspaceDir, destPath).replace(/\\/g, '/'));
    }
    res.json({ message: 'Files uploaded', files: uploaded });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Create folder
router.post('/:serverId/mkdir', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'Folder path required' });
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const fullPath = sanitizePath(workspaceDir, folderPath);
    await fs.ensureDir(fullPath);
    res.json({ message: 'Folder created', path: folderPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename/move
router.post('/:serverId/rename', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { oldPath, newPath } = req.body;
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const fullOld = sanitizePath(workspaceDir, oldPath);
    const fullNew = sanitizePath(workspaceDir, newPath);
    await fs.move(fullOld, fullNew);
    res.json({ message: 'Renamed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename' });
  }
});

// Delete
router.delete('/:serverId/delete', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { filePath } = req.body;
    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    const fullPath = sanitizePath(workspaceDir, filePath);
    await fs.remove(fullPath);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
