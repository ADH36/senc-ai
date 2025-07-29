import express from 'express';
import db from '../database/init.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Admin: Get all subscription plans
router.get('/admin/plans', authenticateToken, requireAdmin, (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT * FROM subscription_plans 
      ORDER BY price ASC
    `).all();
    
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: JSON.parse(plan.features || '[]')
    }));
    
    res.json(formattedPlans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

// Admin: Create or update subscription plan
router.post('/admin/plans', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id, name, description, price, billing_cycle, features, message_limit, is_active } = req.body;
    
    if (!name || !billing_cycle || price === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const featuresJson = JSON.stringify(features || []);
    
    if (id) {
      // Update existing plan
      db.prepare(`
        UPDATE subscription_plans 
        SET name = ?, description = ?, price = ?, billing_cycle = ?, 
            features = ?, message_limit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, description, price, billing_cycle, featuresJson, message_limit, is_active, id);
      
      res.json({ message: 'Plan updated successfully' });
    } else {
      // Create new plan
      const result = db.prepare(`
        INSERT INTO subscription_plans (name, description, price, billing_cycle, features, message_limit, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(name, description, price, billing_cycle, featuresJson, message_limit, is_active ?? 1);
      
      res.json({ message: 'Plan created successfully', id: result.lastInsertRowid });
    }
  } catch (error) {
    console.error('Error saving plan:', error);
    res.status(500).json({ error: 'Failed to save subscription plan' });
  }
});

// Admin: Delete subscription plan
router.delete('/admin/plans/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if plan has active subscriptions
    const activeSubscriptions = db.prepare(`
      SELECT COUNT(*) as count FROM user_subscriptions 
      WHERE plan_id = ? AND status = 'active'
    `).get(id);
    
    if (activeSubscriptions.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete plan with active subscriptions. Deactivate it instead.' 
      });
    }
    
    db.prepare('DELETE FROM subscription_plans WHERE id = ?').run(id);
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Failed to delete subscription plan' });
  }
});

// Admin: Get all AI models
router.get('/admin/models', authenticateToken, requireAdmin, (req, res) => {
  try {
    const models = db.prepare(`
      SELECT * FROM ai_models 
      ORDER BY provider, model_name
    `).all();
    
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch AI models' });
  }
});

// Admin: Create or update AI model
router.post('/admin/models', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { 
      id, provider, model_name, display_name, description, 
      cost_per_token, max_tokens, is_active, required_plan 
    } = req.body;
    
    if (!provider || !model_name || !display_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (id) {
      // Update existing model
      db.prepare(`
        UPDATE ai_models 
        SET provider = ?, model_name = ?, display_name = ?, description = ?,
            cost_per_token = ?, max_tokens = ?, is_active = ?, required_plan = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(provider, model_name, display_name, description, cost_per_token, max_tokens, is_active, required_plan, id);
      
      res.json({ message: 'Model updated successfully' });
    } else {
      // Create new model
      const result = db.prepare(`
        INSERT INTO ai_models (provider, model_name, display_name, description, cost_per_token, max_tokens, is_active, required_plan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(provider, model_name, display_name, description, cost_per_token, max_tokens, is_active ?? 1, required_plan);
      
      res.json({ message: 'Model created successfully', id: result.lastInsertRowid });
    }
  } catch (error) {
    console.error('Error saving model:', error);
    res.status(500).json({ error: 'Failed to save AI model' });
  }
});

// Admin: Delete AI model
router.delete('/admin/models/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM ai_models WHERE id = ?').run(id);
    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    console.error('Error deleting model:', error);
    res.status(500).json({ error: 'Failed to delete AI model' });
  }
});

// Admin: Get revenue analytics
router.get('/admin/analytics', authenticateToken, requireAdmin, (req, res) => {
  try {
    // Total revenue
    const totalRevenue = db.prepare(`
      SELECT SUM(amount) as total FROM payment_transactions 
      WHERE status = 'completed'
    `).get();
    
    // Monthly revenue (last 12 months)
    const monthlyRevenue = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        SUM(amount) as revenue,
        COUNT(*) as transactions
      FROM payment_transactions 
      WHERE status = 'completed' 
        AND created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all();
    
    // Subscription metrics
    const subscriptionMetrics = db.prepare(`
      SELECT 
        sp.name,
        COUNT(us.id) as active_subscriptions,
        SUM(sp.price) as monthly_recurring_revenue
      FROM subscription_plans sp
      LEFT JOIN user_subscriptions us ON sp.id = us.plan_id AND us.status = 'active'
      GROUP BY sp.id, sp.name
      ORDER BY monthly_recurring_revenue DESC
    `).all();
    
    // User growth
    const userGrowth = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as new_users
      FROM users 
      WHERE created_at >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all();
    
    res.json({
      totalRevenue: totalRevenue.total || 0,
      monthlyRevenue,
      subscriptionMetrics,
      userGrowth
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Admin: Get all user subscriptions
router.get('/admin/subscriptions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const subscriptions = db.prepare(`
      SELECT 
        us.*,
        u.email,
        u.name,
        sp.name as plan_name,
        sp.price
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      JOIN subscription_plans sp ON us.plan_id = sp.id
      ORDER BY us.created_at DESC
      LIMIT 100
    `).all();
    
    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// Admin: Update user subscription
router.put('/admin/subscriptions/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, current_period_end } = req.body;
    
    db.prepare(`
      UPDATE user_subscriptions 
      SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, current_period_end, id);
    
    res.json({ message: 'Subscription updated successfully' });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

export default router;