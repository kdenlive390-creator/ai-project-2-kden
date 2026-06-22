const fs = require('fs-extra');
const path = require('path');
const { fileDB } = require('../models/Server');
const mongoose = require('mongoose');
const { ServerModel } = require('../models/Server');

const WORKSPACES_DIR = path.join(__dirname, '../../workspaces');

async function cleanupExpiredServers() {
  try {
    console.log('🧹 Running cleanup for expired servers...');
    const now = new Date();

    if (mongoose.connection.readyState === 1) {
      const expired = await ServerModel.find({ expiresAt: { $lt: now } });
      for (const server of expired) {
        await fs.remove(path.join(WORKSPACES_DIR, server.id));
        await ServerModel.findByIdAndDelete(server._id);
        console.log(`Deleted expired server: ${server.id}`);
      }
    } else {
      const servers = await fileDB.getServers();
      const active = [];
      for (const server of servers) {
        if (new Date(server.expiresAt) < now) {
          await fs.remove(path.join(WORKSPACES_DIR, server.id));
          console.log(`Deleted expired server: ${server.id}`);
        } else {
          active.push(server);
        }
      }
      await fileDB.saveServers(active);
    }
    console.log('✅ Cleanup complete');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

module.exports = { cleanupExpiredServers };
