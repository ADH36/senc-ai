import express from 'express';
import db from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user dashboard data
router.get('/dashboard', (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's conversation count
    const conversationCount = db.prepare(`
      SELECT COUNT(*) as count FROM conversations WHERE user_id = ?
    `).get(userId);

    // Get user's message count
    const messageCount = db.prepare(`
      SELECT COUNT(m.id) as count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ?
    `).get(userId);

    // Get user's usage statistics for the last 30 days
    const usageStats = db.prepare(`
      SELECT 
        SUM(messages_sent) as total_messages,
        SUM(tokens_used) as total_tokens,
        SUM(cost) as total_cost
      FROM user_usage
      WHERE user_id = ? AND date >= DATE('now', '-30 days')
    `).get(userId);

    // Get daily usage for the last 7 days
    const dailyUsage = db.prepare(`
      SELECT 
        date,
        messages_sent,
        tokens_used,
        cost
      FROM user_usage
      WHERE user_id = ? AND date >= DATE('now', '-7 days')
      ORDER BY date DESC
    `).all(userId);

    // Get recent conversations
    const recentConversations = db.prepare(`
      SELECT 
        c.id,
        c.title,
        c.provider,
        c.model,
        c.updated_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT 5
    `).all(userId);

    // Get today's usage
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = db.prepare(`
      SELECT messages_sent, tokens_used, cost
      FROM user_usage
      WHERE user_id = ? AND date = ?
    `).get(userId, today);

    // Get usage limits
    const maxMessages = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('max_messages_per_day')?.value || '100');

    res.json({
      stats: {
        totalConversations: conversationCount.count,
        totalMessages: messageCount.count,
        monthlyMessages: usageStats.total_messages || 0,
        monthlyTokens: usageStats.total_tokens || 0,
        monthlyCost: usageStats.total_cost || 0,
        todayMessages: todayUsage?.messages_sent || 0,
        maxDailyMessages: maxMessages
      },
      dailyUsage,
      recentConversations
    });
  } catch (error) {
    console.error('User dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's usage history
router.get('/usage-history', (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get usage history
    const usageHistory = db.prepare(`
      SELECT 
        date,
        messages_sent,
        tokens_used,
        cost
      FROM user_usage
      WHERE user_id = ? AND date >= DATE('now', '-' || ? || ' days')
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `).all(userId, days, limit, offset);

    // Get total count for pagination
    const totalCount = db.prepare(`
      SELECT COUNT(*) as total
      FROM user_usage
      WHERE user_id = ? AND date >= DATE('now', '-' || ? || ' days')
    `).get(userId, days);

    res.json({
      usageHistory,
      pagination: {
        page,
        limit,
        total: totalCount.total,
        pages: Math.ceil(totalCount.total / limit)
      }
    });
  } catch (error) {
    console.error('Usage history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's conversation history with search
router.get('/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        c.id,
        c.title,
        c.provider,
        c.model,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count,
        SUM(m.tokens_used) as total_tokens,
        SUM(m.cost) as total_cost
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ?
    `;
    
    const params = [userId];
    
    if (search) {
      query += ` AND c.title LIKE ?`;
      params.push(`%${search}%`);
    }
    
    query += `
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const conversations = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM conversations WHERE user_id = ?';
    const countParams = [userId];
    
    if (search) {
      countQuery += ' AND title LIKE ?';
      countParams.push(`%${search}%`);
    }
    
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update conversation title
router.put('/conversations/:id/title', (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { title } = req.body;
    
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Verify conversation belongs to user
    const result = db.prepare(`
      UPDATE conversations 
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(title.trim(), conversationId, req.user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ message: 'Conversation title updated successfully' });
  } catch (error) {
    console.error('Update conversation title error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user preferences/settings
router.get('/preferences', (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user preferences from database
    let preferences = db.prepare(`
      SELECT theme, language, notifications, auto_save, default_provider, default_model
      FROM user_preferences
      WHERE user_id = ?
    `).get(userId);
    
    // If no preferences exist, create default ones
    if (!preferences) {
      db.prepare(`
        INSERT INTO user_preferences (user_id, theme, language, notifications, auto_save, default_provider, default_model)
        VALUES (?, 'light', 'en', 1, 1, 'google', 'gemini-pro')
      `).run(userId);
      
      preferences = {
        theme: 'light',
        language: 'en',
        notifications: true,
        auto_save: true,
        default_provider: 'google',
        default_model: 'gemini-pro'
      };
    } else {
      // Convert database format to frontend format
      preferences = {
        theme: preferences.theme,
        language: preferences.language,
        notifications: Boolean(preferences.notifications),
        autoSave: Boolean(preferences.auto_save),
        defaultProvider: preferences.default_provider,
        defaultModel: preferences.default_model
      };
    }

    res.json({ preferences });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user preferences
router.put('/preferences', (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;
    
    if (!preferences) {
      return res.status(400).json({ error: 'Preferences data is required' });
    }
    
    // Update or insert user preferences
    const result = db.prepare(`
      INSERT OR REPLACE INTO user_preferences 
      (user_id, theme, language, notifications, auto_save, default_provider, default_model, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      preferences.theme || 'light',
      preferences.language || 'en',
      preferences.notifications ? 1 : 0,
      preferences.autoSave ? 1 : 0,
      preferences.defaultProvider || 'google',
      preferences.defaultModel || 'gemini-pro'
    );
    
    if (result.changes > 0) {
      res.json({ message: 'Preferences updated successfully' });
    } else {
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export conversation data
router.get('/conversations/:id/export', (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    // Verify conversation belongs to user
    const conversation = db.prepare(`
      SELECT c.*, u.name as user_name
      FROM conversations c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ? AND c.user_id = ?
    `).get(conversationId, req.user.id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get all messages
    const messages = db.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    const exportData = {
      conversation: {
        title: conversation.title,
        provider: conversation.provider,
        model: conversation.model,
        created_at: conversation.created_at,
        user_name: conversation.user_name
      },
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.created_at
      }))
    };

    res.json({ exportData });
  } catch (error) {
    console.error('Export conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export all user data
router.get('/export', (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user info
    const user = db.prepare(`
      SELECT id, email, name, role, created_at
      FROM users
      WHERE id = ?
    `).get(userId);
    
    // Get user preferences
    const preferences = db.prepare(`
      SELECT theme, language, notifications, auto_save, default_provider, default_model
      FROM user_preferences
      WHERE user_id = ?
    `).get(userId);
    
    // Get all conversations
    const conversations = db.prepare(`
      SELECT id, title, provider, model, created_at, updated_at
      FROM conversations
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);
    
    // Get all messages for each conversation
    const conversationsWithMessages = conversations.map(conv => {
      const messages = db.prepare(`
        SELECT role, content, tokens_used, cost, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `).all(conv.id);
      
      return {
        ...conv,
        messages
      };
    });
    
    // Get usage statistics
    const usageStats = db.prepare(`
      SELECT date, messages_sent, tokens_used, cost
      FROM user_usage
      WHERE user_id = ?
      ORDER BY date DESC
    `).all(userId);
    
    const exportData = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at
      },
      preferences: preferences || {},
      conversations: conversationsWithMessages,
      usage_statistics: usageStats,
      export_date: new Date().toISOString(),
      total_conversations: conversations.length,
      total_messages: conversationsWithMessages.reduce((sum, conv) => sum + conv.messages.length, 0)
    };
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="chatbot-data-${user.email}-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json(exportData);
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user activity summary
router.get('/activity', (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 7;
    
    // Get activity by provider
    const providerActivity = db.prepare(`
      SELECT 
        c.provider,
        COUNT(DISTINCT c.id) as conversations,
        COUNT(m.id) as messages,
        SUM(m.tokens_used) as tokens,
        SUM(m.cost) as cost
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ? AND c.created_at >= DATE('now', '-' || ? || ' days')
      GROUP BY c.provider
    `).all(userId, days);

    // Get activity by model
    const modelActivity = db.prepare(`
      SELECT 
        c.model,
        c.provider,
        COUNT(DISTINCT c.id) as conversations,
        COUNT(m.id) as messages,
        SUM(m.tokens_used) as tokens,
        SUM(m.cost) as cost
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ? AND c.created_at >= DATE('now', '-' || ? || ' days')
      GROUP BY c.model, c.provider
      ORDER BY messages DESC
    `).all(userId, days);

    // Get hourly activity pattern
    const hourlyActivity = db.prepare(`
      SELECT 
        CAST(strftime('%H', m.created_at) AS INTEGER) as hour,
        COUNT(*) as message_count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at >= DATE('now', '-' || ? || ' days')
      GROUP BY hour
      ORDER BY hour
    `).all(userId, days);

    res.json({
      providerActivity,
      modelActivity,
      hourlyActivity
    });
  } catch (error) {
    console.error('Activity summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;