import express from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import db from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Validation schemas
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('user', 'admin').default('user')
});

const updateUserSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().min(2).max(50).optional(),
  role: Joi.string().valid('user', 'admin').optional(),
  is_active: Joi.boolean().optional()
});

const apiKeySchema = Joi.object({
  provider: Joi.string().valid('google', 'openrouter').required(),
  key_name: Joi.string().min(1).max(100).required(),
  api_key: Joi.string().min(1).required(),
  usage_limit: Joi.number().integer().min(0).optional()
});

const settingSchema = Joi.object({
  key: Joi.string().min(1).required(),
  value: Joi.string().required(),
  description: Joi.string().optional()
});

// Dashboard statistics
router.get('/dashboard', (req, res) => {
  try {
    // Get user statistics
    const userStats = db.prepare(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users
      FROM users
    `).get();

    // Get conversation statistics
    const conversationStats = db.prepare(`
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_conversations
      FROM conversations
    `).get();

    // Get message statistics
    const messageStats = db.prepare(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as today_messages,
        SUM(tokens_used) as total_tokens,
        SUM(cost) as total_cost
      FROM messages
    `).get();

    // Get API key statistics
    const apiKeyStats = db.prepare(`
      SELECT 
        COUNT(*) as total_keys,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_keys,
        provider,
        COUNT(*) as count
      FROM api_keys
      GROUP BY provider
    `).all();

    // Get recent activity
    const recentUsers = db.prepare(`
      SELECT id, name, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    res.json({
      userStats,
      conversationStats,
      messageStats,
      apiKeyStats,
      recentUsers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Management

// Get all users
router.get('/users', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at,
             COUNT(c.id) as conversation_count,
             COALESCE(uu.messages_sent, 0) as total_messages
      FROM users u
      LEFT JOIN conversations c ON u.id = c.user_id
      LEFT JOIN (
        SELECT user_id, SUM(messages_sent) as messages_sent
        FROM user_usage
        GROUP BY user_id
      ) uu ON u.id = uu.user_id
    `;
    
    const params = [];
    if (search) {
      query += ` WHERE u.email LIKE ? OR u.name LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const users = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    const countParams = [];
    if (search) {
      countQuery += ' WHERE email LIKE ? OR name LIKE ?';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user
router.post('/users', async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, name, role } = value;

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(email, hashedPassword, name, role);

    res.status(201).json({
      message: 'User created successfully',
      userId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const updates = [];
    const params = [];
    
    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) {
        updates.push(`${key} = ?`);
        params.push(val);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    const result = db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
router.delete('/users/:id', (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Prevent deleting self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API Key Management

// Get all API keys
router.get('/api-keys', (req, res) => {
  try {
    const apiKeys = db.prepare(`
      SELECT id, provider, key_name, 
             SUBSTR(api_key, 1, 8) || '...' as masked_key,
             is_active, usage_limit, usage_count, created_at
      FROM api_keys
      ORDER BY created_at DESC
    `).all();

    res.json({ apiKeys });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create API key
router.post('/api-keys', (req, res) => {
  try {
    const { error, value } = apiKeySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { provider, key_name, api_key, usage_limit } = value;

    const result = db.prepare(`
      INSERT INTO api_keys (provider, key_name, api_key, usage_limit)
      VALUES (?, ?, ?, ?)
    `).run(provider, key_name, api_key, usage_limit || null);

    res.status(201).json({
      message: 'API key created successfully',
      keyId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update API key
router.put('/api-keys/:id', (req, res) => {
  try {
    const keyId = parseInt(req.params.id);
    const { key_name, is_active, usage_limit } = req.body;

    const updates = [];
    const params = [];
    
    if (key_name !== undefined) {
      updates.push('key_name = ?');
      params.push(key_name);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }
    if (usage_limit !== undefined) {
      updates.push('usage_limit = ?');
      params.push(usage_limit);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(keyId);

    const result = db.prepare(`
      UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key updated successfully' });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete API key
router.delete('/api-keys/:id', (req, res) => {
  try {
    const keyId = parseInt(req.params.id);
    
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// System Settings

// Get all settings
router.get('/settings', (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT key, value, description, updated_at
      FROM settings
      ORDER BY key
    `).all();

    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update setting
router.put('/settings/:key', (req, res) => {
  try {
    const settingKey = req.params.key;
    const { value, description } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const result = db.prepare(`
      UPDATE settings 
      SET value = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `).run(value, description, settingKey);

    if (result.changes === 0) {
      // Create new setting if it doesn't exist
      db.prepare(`
        INSERT INTO settings (key, value, description)
        VALUES (?, ?, ?)
      `).run(settingKey, value, description || null);
    }

    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Usage Analytics
router.get('/analytics', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Daily usage statistics
    const dailyUsage = db.prepare(`
      SELECT 
        date,
        SUM(messages_sent) as messages,
        SUM(tokens_used) as tokens,
        SUM(cost) as cost,
        COUNT(DISTINCT user_id) as active_users
      FROM user_usage
      WHERE date >= DATE('now', '-${days} days')
      GROUP BY date
      ORDER BY date DESC
    `).all();

    // Top users by usage
    const topUsers = db.prepare(`
      SELECT 
        u.name, u.email,
        SUM(uu.messages_sent) as total_messages,
        SUM(uu.tokens_used) as total_tokens,
        SUM(uu.cost) as total_cost
      FROM users u
      JOIN user_usage uu ON u.id = uu.user_id
      WHERE uu.date >= DATE('now', '-${days} days')
      GROUP BY u.id
      ORDER BY total_messages DESC
      LIMIT 10
    `).all();

    // Provider usage
    const providerUsage = db.prepare(`
      SELECT 
        c.provider,
        COUNT(m.id) as message_count,
        SUM(m.tokens_used) as total_tokens,
        SUM(m.cost) as total_cost
      FROM conversations c
      JOIN messages m ON c.id = m.conversation_id
      WHERE m.created_at >= DATE('now', '-${days} days')
      GROUP BY c.provider
    `).all();

    res.json({
      dailyUsage,
      topUsers,
      providerUsage
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;