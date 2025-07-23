import express from 'express';
import axios from 'axios';
import Joi from 'joi';
import db from '../database/init.js';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const sendMessageSchema = Joi.object({
  message: Joi.string().min(1).max(4000).required(),
  conversationId: Joi.number().integer().optional(),
  provider: Joi.string().valid('google', 'openrouter').required(),
  model: Joi.string().required()
});

// Apply rate limiting to chat endpoints
router.use(authenticateToken);
router.use(userRateLimit(30, 60000)); // 30 requests per minute

// Get user's conversations
router.get('/conversations', (req, res) => {
  try {
    const conversations = db.prepare(`
      SELECT c.*, 
             COUNT(m.id) as message_count,
             MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT 50
    `).all(req.user.id);

    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation messages
router.get('/conversations/:id/messages', (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    // Verify conversation belongs to user
    const conversation = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .get(conversationId, req.user.id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = db.prepare(`
      SELECT id, role, content, tokens_used, cost, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send message to AI
router.post('/send', async (req, res) => {
  try {
    const { error, value } = sendMessageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { message, conversationId, provider, model } = value;
    const userId = req.user.id;

    // Check daily message limit
    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = db.prepare(`
      SELECT messages_sent FROM user_usage 
      WHERE user_id = ? AND date = ?
    `).get(userId, today);

    const maxMessages = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?')
      .get('max_messages_per_day')?.value || '100');

    if (dailyUsage && dailyUsage.messages_sent >= maxMessages) {
      return res.status(429).json({ error: 'Daily message limit reached' });
    }

    // Get or create conversation
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      const result = db.prepare(`
        INSERT INTO conversations (user_id, title, provider, model)
        VALUES (?, ?, ?, ?)
      `).run(userId, message.substring(0, 50) + '...', provider, model);
      currentConversationId = result.lastInsertRowid;
    }

    // Save user message
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (?, 'user', ?)
    `).run(currentConversationId, message);

    // Get conversation history for context
    const conversationHistory = db.prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT 20
    `).all(currentConversationId);

    // Call AI API
    let aiResponse;
    let tokensUsed = 0;
    let cost = 0;

    try {
      if (provider === 'google') {
        aiResponse = await callGoogleAI(conversationHistory, model);
      } else if (provider === 'openrouter') {
        const result = await callOpenRouter(conversationHistory, model);
        aiResponse = result.response;
        tokensUsed = result.tokensUsed;
        cost = result.cost;
      }
    } catch (apiError) {
      console.error('AI API error:', apiError);
      return res.status(500).json({ error: 'AI service temporarily unavailable' });
    }

    // Save AI response
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content, tokens_used, cost)
      VALUES (?, 'assistant', ?, ?, ?)
    `).run(currentConversationId, aiResponse, tokensUsed, cost);

    // Update conversation timestamp
    db.prepare(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(currentConversationId);

    // Update user usage statistics
    db.prepare(`
      INSERT INTO user_usage (user_id, date, messages_sent, tokens_used, cost)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        messages_sent = messages_sent + 1,
        tokens_used = tokens_used + ?,
        cost = cost + ?
    `).run(userId, today, tokensUsed, cost, tokensUsed, cost);

    res.json({
      message: aiResponse,
      conversationId: currentConversationId,
      tokensUsed,
      cost
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete conversation
router.delete('/conversations/:id', (req, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    
    // Verify conversation belongs to user
    const result = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
      .run(conversationId, req.user.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available AI models
router.get('/models', (req, res) => {
  const models = {
    google: [
      { id: 'gemini-pro', name: 'Gemini Pro', description: 'Google\'s most capable model' },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', description: 'Multimodal model with vision capabilities' }
    ],
    openrouter: [
      { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient OpenAI model' },
      { id: 'openai/gpt-4', name: 'GPT-4', description: 'Most capable OpenAI model' },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast and affordable Anthropic model' },
      { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', description: 'Balanced Anthropic model' }
    ]
  };
  
  res.json({ models });
});

// Helper function to call Google AI Studio API
async function callGoogleAI(messages, model) {
  const apiKey = db.prepare('SELECT api_key FROM api_keys WHERE provider = ? AND is_active = 1 LIMIT 1')
    .get('google')?.api_key;
  
  if (!apiKey) {
    throw new Error('Google AI API key not configured');
  }

  const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [{
        parts: [{ text: prompt }]
      }]
    },
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}

// Helper function to call OpenRouter API
async function callOpenRouter(messages, model) {
  const apiKey = db.prepare('SELECT api_key FROM api_keys WHERE provider = ? AND is_active = 1 LIMIT 1')
    .get('openrouter')?.api_key;
  
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const formattedMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content
  }));

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: formattedMessages,
      max_tokens: 1000
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'AI Chatbot Platform'
      }
    }
  );

  const usage = response.data.usage || {};
  return {
    response: response.data.choices[0].message.content,
    tokensUsed: usage.total_tokens || 0,
    cost: calculateCost(model, usage.total_tokens || 0)
  };
}

// Helper function to calculate cost (simplified)
function calculateCost(model, tokens) {
  const rates = {
    'openai/gpt-3.5-turbo': 0.002 / 1000,
    'openai/gpt-4': 0.03 / 1000,
    'anthropic/claude-3-haiku': 0.00025 / 1000,
    'anthropic/claude-3-sonnet': 0.003 / 1000
  };
  
  return (rates[model] || 0.001) * tokens;
}

export default router;