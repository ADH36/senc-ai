import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export const initDatabase = () => {
  console.log('🗄️  Initializing database...');
  
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      avatar TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'openrouter')),
      model TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      cost DECIMAL(10, 6) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
    )
  `);

  // API keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK (provider IN ('google', 'openrouter')),
      key_name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      usage_limit INTEGER DEFAULT NULL,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // System settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User usage statistics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      messages_sent INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      cost DECIMAL(10, 6) DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    )
  `);

  // User preferences table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
      language TEXT DEFAULT 'en',
      notifications BOOLEAN DEFAULT 1,
      auto_save BOOLEAN DEFAULT 1,
      default_provider TEXT DEFAULT 'google' CHECK (default_provider IN ('google', 'openrouter')),
      default_model TEXT DEFAULT 'gemini-pro',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id)
    )
  `);

  // Subscription plans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly', 'one_time')),
      features TEXT, -- JSON string of features
      message_limit INTEGER DEFAULT NULL, -- NULL for unlimited
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'pending')),
      current_period_start DATETIME NOT NULL,
      current_period_end DATETIME NOT NULL,
      cancel_at_period_end BOOLEAN DEFAULT 0,
      stripe_subscription_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans (id)
    )
  `);

  // User credits table (for pay-per-message)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credits DECIMAL(10, 2) DEFAULT 0,
      total_purchased DECIMAL(10, 2) DEFAULT 0,
      total_used DECIMAL(10, 2) DEFAULT 0,
      last_purchase_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id)
    )
  `);

  // Payment transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('subscription', 'credits', 'refund')),
      amount DECIMAL(10, 2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      stripe_payment_intent_id TEXT,
      stripe_invoice_id TEXT,
      description TEXT,
      metadata TEXT, -- JSON string for additional data
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // AI models configuration table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      cost_per_token DECIMAL(10, 8) DEFAULT 0,
      max_tokens INTEGER DEFAULT 4096,
      is_active BOOLEAN DEFAULT 1,
      required_plan TEXT DEFAULT 'free' CHECK (required_plan IN ('free', 'premium', 'credits')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, model_name)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_user_usage_user_date ON user_usage(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);
  `);

  // Insert default admin user if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run('admin@example.com', hashedPassword, 'Administrator', 'admin');
    
    console.log('✅ Default admin user created:');
    console.log('   Email: admin@example.com');
    console.log('   Password: admin123');
  }

  // Insert default subscription plans
  const defaultPlans = [
    {
      name: 'Free',
      description: 'Perfect for getting started',
      price: 0,
      billing_cycle: 'monthly',
      features: JSON.stringify(['10 messages per day', 'Basic AI models', 'Community support']),
      message_limit: 10
    },
    {
      name: 'Premium',
      description: 'Unlimited access to all features',
      price: 19.99,
      billing_cycle: 'monthly',
      features: JSON.stringify(['Unlimited messages', 'All AI models', 'Priority support', 'Advanced analytics']),
      message_limit: null
    },
    {
      name: 'Pay-per-Message',
      description: 'Pay only for what you use',
      price: 0,
      billing_cycle: 'one_time',
      features: JSON.stringify(['No monthly fees', 'All AI models', 'Flexible usage']),
      message_limit: null
    }
  ];

  const insertPlan = db.prepare(`
    INSERT OR IGNORE INTO subscription_plans (name, description, price, billing_cycle, features, message_limit)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  defaultPlans.forEach(plan => {
    insertPlan.run(plan.name, plan.description, plan.price, plan.billing_cycle, plan.features, plan.message_limit);
  });

  // Insert default AI models
  const defaultModels = [
    {
      provider: 'google',
      model_name: 'gemini-pro',
      display_name: 'Gemini Pro',
      description: 'Google\'s most capable AI model',
      cost_per_token: 0.0000005,
      max_tokens: 8192,
      required_plan: 'free'
    },
    {
      provider: 'google',
      model_name: 'gemini-pro-vision',
      display_name: 'Gemini Pro Vision',
      description: 'Gemini Pro with vision capabilities',
      cost_per_token: 0.0000008,
      max_tokens: 4096,
      required_plan: 'premium'
    },
    {
      provider: 'openrouter',
      model_name: 'openai/gpt-4',
      display_name: 'GPT-4',
      description: 'OpenAI\'s most advanced model',
      cost_per_token: 0.00003,
      max_tokens: 8192,
      required_plan: 'premium'
    },
    {
      provider: 'openrouter',
      model_name: 'anthropic/claude-3-sonnet',
      display_name: 'Claude 3 Sonnet',
      description: 'Anthropic\'s balanced AI model',
      cost_per_token: 0.000015,
      max_tokens: 4096,
      required_plan: 'credits'
    }
  ];

  const insertModel = db.prepare(`
    INSERT OR IGNORE INTO ai_models (provider, model_name, display_name, description, cost_per_token, max_tokens, required_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  defaultModels.forEach(model => {
    insertModel.run(model.provider, model.model_name, model.display_name, model.description, model.cost_per_token, model.max_tokens, model.required_plan);
  });

  // Insert default system settings
  const defaultSettings = [
    { key: 'site_name', value: 'AI Chatbot Platform', description: 'Website name' },
    { key: 'max_messages_per_day', value: '10', description: 'Maximum messages per free user per day' },
    { key: 'registration_enabled', value: 'true', description: 'Allow new user registration' },
    { key: 'default_provider', value: 'google', description: 'Default AI provider' },
    { key: 'default_model', value: 'gemini-pro', description: 'Default AI model' },
    { key: 'stripe_publishable_key', value: '', description: 'Stripe publishable key' },
    { key: 'stripe_secret_key', value: '', description: 'Stripe secret key' },
    { key: 'credits_per_dollar', value: '100', description: 'Credits per dollar for pay-per-message' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  defaultSettings.forEach(setting => {
    insertSetting.run(setting.key, setting.value, setting.description);
  });

  console.log('✅ Database initialized successfully');
};

export default db;