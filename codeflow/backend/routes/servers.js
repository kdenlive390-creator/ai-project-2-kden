const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const mongoose = require('mongoose');
const { ServerModel, fileDB } = require('../models/Server');

const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

function useDB() { return mongoose.connection.readyState === 1; }

async function getServer(id) {
  return useDB() ? ServerModel.findOne({ id }) : fileDB.findById(id);
}

async function updateServer(id, data) {
  if (useDB()) return ServerModel.findOneAndUpdate({ id }, data, { new: true });
  return fileDB.update(id, data);
}

router.get('/', async (req, res) => {
  try {
    let owned, collab;
    if (useDB()) {
      owned = await ServerModel.find({ ownerId: req.user.id });
      collab = await ServerModel.find({ 'collaborators.email': req.user.email });
    } else {
      owned = await fileDB.findByOwner(req.user.id);
      collab = await fileDB.findByCollaborator(req.user.email);
    }
    res.json({ owned, collaborated: collab });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Server name required' });

    let server;
    if (useDB()) {
      server = new ServerModel({ name, ownerId: req.user.id, ownerEmail: req.user.email });
      await server.save();
    } else {
      server = await fileDB.create({ name, ownerId: req.user.id, ownerEmail: req.user.email });
    }

    // Create workspace directory — EMPTY, no default files
    const workspaceDir = path.join(WORKSPACES_DIR, server.id);
    await fs.ensureDir(workspaceDir);

    res.status(201).json(server);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const server = await getServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server not found' });

    const isOwner = server.ownerId === req.user.id;
    const isCollab = server.collaborators && server.collaborators.some(c => c.email === req.user.email);

    if (!isOwner && !isCollab) return res.status(403).json({ error: 'Access denied' });

    res.json({ ...server, isOwner });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch server' });
  }
});

router.post('/join', async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

    let server;
    if (useDB()) {
      server = await ServerModel.findOne({ inviteCode: inviteCode.toUpperCase() });
    } else {
      server = await fileDB.findByInviteCode(inviteCode.toUpperCase());
    }

    if (!server) return res.status(404).json({ error: 'Invalid invite code' });

    const alreadyCollab = server.collaborators && server.collaborators.some(c => c.email === req.user.email);
    const isOwner = server.ownerId === req.user.id;

    if (!alreadyCollab && !isOwner) {
      const newCollab = { email: req.user.email, userId: req.user.id, joinedAt: new Date() };
      const updatedCollabs = [...(server.collaborators || []), newCollab];
      await updateServer(server.id, { collaborators: updatedCollabs });
    }

    res.json({ server, message: 'Joined successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join server' });
  }
});

router.post('/:id/regenerate-code', async (req, res) => {
  try {
    const server = await getServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'Not found' });
    if (server.ownerId !== req.user.id) return res.status(403).json({ error: 'Only owner can regenerate code' });

    const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    await updateServer(req.params.id, { inviteCode: newCode });
    res.json({ inviteCode: newCode });
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate code' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const server = await getServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'Not found' });
    if (server.ownerId !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });

    if (useDB()) {
      await ServerModel.findOneAndDelete({ id: req.params.id });
    } else {
      await fileDB.delete(req.params.id);
    }

    await fs.remove(path.join(WORKSPACES_DIR, req.params.id));
    res.json({ message: 'Server deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

module.exports = router;
