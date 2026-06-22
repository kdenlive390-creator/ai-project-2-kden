const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data/servers.json');

const serverSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true },
  ownerId: { type: String, required: true },
  ownerEmail: { type: String, required: true },
  inviteCode: { type: String, default: () => Math.random().toString(36).substring(2, 10).toUpperCase() },
  collaborators: [{ email: String, userId: String, joinedAt: Date }],
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 120 * 24 * 60 * 60 * 1000) }, // 4 months
  lastActive: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

// File-based storage fallback
const fileDB = {
  async getServers() {
    await fs.ensureDir(path.dirname(DB_FILE));
    if (!await fs.pathExists(DB_FILE)) return [];
    return fs.readJson(DB_FILE);
  },
  async saveServers(servers) {
    await fs.ensureDir(path.dirname(DB_FILE));
    await fs.writeJson(DB_FILE, servers, { spaces: 2 });
  },
  async findById(id) {
    const servers = await this.getServers();
    return servers.find(s => s.id === id) || null;
  },
  async findByOwner(ownerId) {
    const servers = await this.getServers();
    return servers.filter(s => s.ownerId === ownerId);
  },
  async findByCollaborator(email) {
    const servers = await this.getServers();
    return servers.filter(s => s.collaborators && s.collaborators.some(c => c.email === email));
  },
  async findByInviteCode(code) {
    const servers = await this.getServers();
    return servers.find(s => s.inviteCode === code) || null;
  },
  async create(data) {
    const servers = await this.getServers();
    const server = {
      id: uuidv4(),
      name: data.name,
      ownerId: data.ownerId,
      ownerEmail: data.ownerEmail,
      inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
      collaborators: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true
    };
    servers.push(server);
    await this.saveServers(servers);
    return server;
  },
  async update(id, updates) {
    const servers = await this.getServers();
    const idx = servers.findIndex(s => s.id === id);
    if (idx === -1) return null;
    servers[idx] = { ...servers[idx], ...updates };
    await this.saveServers(servers);
    return servers[idx];
  },
  async delete(id) {
    const servers = await this.getServers();
    const filtered = servers.filter(s => s.id !== id);
    await this.saveServers(filtered);
  }
};

let ServerModel;
try {
  ServerModel = mongoose.model('Server', serverSchema);
} catch(e) {
  ServerModel = mongoose.models.Server;
}

module.exports = { ServerModel, fileDB };
