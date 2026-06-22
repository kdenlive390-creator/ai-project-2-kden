const express = require('express');
const router = express.Router();
const { UserModel, fileDB } = require('../models/User');
const { generateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

function useDB() {
  return mongoose.connection.readyState === 1;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    let existingUser;
    if (useDB()) {
      existingUser = await UserModel.findOne({ email: email.toLowerCase() });
    } else {
      existingUser = await fileDB.findByEmail(email);
    }

    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    let user;
    if (useDB()) {
      user = new UserModel({ email, password, name });
      await user.save();
    } else {
      user = await fileDB.create({ email, password, name });
    }

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id || user._id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let user, isMatch;
    if (useDB()) {
      user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      isMatch = await user.comparePassword(password);
    } else {
      user = await fileDB.findByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      isMatch = await fileDB.comparePassword(password, user.password);
    }

    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = generateToken({ id: user.id || user._id, email: user.email, name: user.name });
    res.json({
      token,
      user: { id: user.id || user._id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
