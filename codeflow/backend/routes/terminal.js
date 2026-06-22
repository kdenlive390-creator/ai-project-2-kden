const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const mongoose = require('mongoose');
const { ServerModel, fileDB } = require('../models/Server');

const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

function useDB() { return mongoose.connection.readyState === 1; }

async function hasAccess(serverId, user) {
  let server;
  if (useDB()) server = await ServerModel.findOne({ id: serverId });
  else server = await fileDB.findById(serverId);
  if (!server) return false;
  return server.ownerId === user.id || (server.collaborators && server.collaborators.some(c => c.email === user.email));
}

// Download workspace as zip
router.get('/:serverId/download', async (req, res) => {
  try {
    if (!await hasAccess(req.params.serverId, req.user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const workspaceDir = path.join(WORKSPACES_DIR, req.params.serverId);
    if (!await fs.pathExists(workspaceDir)) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="workspace-${req.params.serverId.slice(0,8)}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    archive.directory(workspaceDir, false);
    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to create download' });
  }
});

module.exports = router;
