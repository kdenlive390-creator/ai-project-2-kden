const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

// File-based fallback storage
const DB_FILE = path.join(__dirname, '../../data/users.json');

const userSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// File-based storage fallback
const fileDB = {
  async getUsers() {
    await fs.ensureDir(path.dirname(DB_FILE));
    if (!await fs.pathExists(DB_FILE)) return [];
    return fs.readJson(DB_FILE);
  },
  async saveUsers(users) {
    await fs.ensureDir(path.dirname(DB_FILE));
    await fs.writeJson(DB_FILE, users, { spaces: 2 });
  },
  async findByEmail(email) {
    const users = await this.getUsers();
    return users.find(u => u.email === email.toLowerCase()) || null;
  },
  async findById(id) {
    const users = await this.getUsers();
    return users.find(u => u.id === id) || null;
  },
  async create(data) {
    const users = await this.getUsers();
    const hash = await bcrypt.hash(data.password, 12);
    const user = { id: uuidv4(), email: data.email.toLowerCase(), password: hash, name: data.name, createdAt: new Date().toISOString() };
    users.push(user);
    await this.saveUsers(users);
    return user;
  },
  async comparePassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  }
};

let UserModel;
try {
  UserModel = mongoose.model('User', userSchema);
} catch(e) {
  UserModel = mongoose.models.User;
}

module.exports = { UserModel, fileDB };
