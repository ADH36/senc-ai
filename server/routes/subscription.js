import express from 'express';
import Stripe from 'stripe';
import db from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize Stripe (will be configured via settings)
let stripe = null;

// Initialize Stripe with settings
const initializeStripe = () => {
  const stripeKey = db.prepare('SELECT value FROM settings WHERE key = ?').get('stripe_secret_key');
  if (stripeKey && stripeKey.value) {
    stripe = new Stripe(stripeKey.value);
  }
};

// Get all subscription plans
router.get('/plans', (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT * FROM subscription_plans 
      WHERE is_active = 1 
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

// Get user's current subscription
router.get('/current', authenticateToken, (req, res) => {
  try {
    const subscription = db.prepare(`
      SELECT us.*, sp.name, sp.description, sp.price, sp.billing_cycle, sp.features, sp.message_limit
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.status = 'active'
      ORDER BY us.created_at DESC
      LIMIT 1
    `).get(req.user.id);
    
    if (subscription) {
      subscription.features = JSON.parse(subscription.features || '[]');
    }
    
    res.json(subscription || null);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Get user's credits
router.get('/credits', authenticateToken, (req, res) => {
  try {
    let credits = db.prepare(`
      SELECT * FROM user_credits WHERE user_id = ?
    `).get(req.user.id);
    
    if (!credits) {
      // Create credits record if it doesn't exist
      db.prepare(`
        INSERT INTO user_credits (user_id, credits, total_purchased, total_used)
        VALUES (?, 0, 0, 0)
      `).run(req.user.id);
      
      credits = { user_id: req.user.id, credits: 0, total_purchased: 0, total_used: 0 };
    }
    
    res.json(credits);
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

// Create subscription checkout session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    initializeStripe();
    if (!stripe) {
      return res.status(400).json({ error: 'Payment processing not configured' });
    }
    
    const { planId } = req.body;
    
    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.description,
          },
          unit_amount: Math.round(plan.price * 100), // Convert to cents
          recurring: plan.billing_cycle === 'monthly' ? { interval: 'month' } : undefined,
        },
        quantity: 1,
      }],
      mode: plan.billing_cycle === 'monthly' ? 'subscription' : 'payment',
      success_url: `${req.headers.origin}/dashboard?success=true`,
      cancel_url: `${req.headers.origin}/billing?canceled=true`,
      customer_email: req.user.email,
      metadata: {
        userId: req.user.id.toString(),
        planId: planId.toString(),
      },
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Purchase credits
router.post('/purchase-credits', authenticateToken, async (req, res) => {
  try {
    initializeStripe();
    if (!stripe) {
      return res.status(400).json({ error: 'Payment processing not configured' });
    }
    
    const { amount } = req.body; // Amount in dollars
    
    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const creditsPerDollar = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('credits_per_dollar')?.value || '100');
    const credits = amount * creditsPerDollar;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credits} AI Credits`,
            description: `Purchase ${credits} credits for AI chat messages`,
          },
          unit_amount: Math.round(amount * 100), // Convert to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/dashboard?credits_success=true`,
      cancel_url: `${req.headers.origin}/billing?canceled=true`,
      customer_email: req.user.email,
      metadata: {
        userId: req.user.id.toString(),
        type: 'credits',
        credits: credits.toString(),
      },
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating credits checkout:', error);
    res.status(500).json({ error: 'Failed to create credits checkout' });
  }
});

// Get user's usage statistics
router.get('/usage', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's usage
    const todayUsage = db.prepare(`
      SELECT messages_sent, tokens_used, cost 
      FROM user_usage 
      WHERE user_id = ? AND date = ?
    `).get(req.user.id, today) || { messages_sent: 0, tokens_used: 0, cost: 0 };
    
    // Get this month's usage
    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthlyUsage = db.prepare(`
      SELECT 
        SUM(messages_sent) as messages_sent,
        SUM(tokens_used) as tokens_used,
        SUM(cost) as cost
      FROM user_usage 
      WHERE user_id = ? AND date LIKE ?
    `).get(req.user.id, `${thisMonth}%`) || { messages_sent: 0, tokens_used: 0, cost: 0 };
    
    // Get total usage
    const totalUsage = db.prepare(`
      SELECT 
        SUM(messages_sent) as messages_sent,
        SUM(tokens_used) as tokens_used,
        SUM(cost) as cost
      FROM user_usage 
      WHERE user_id = ?
    `).get(req.user.id) || { messages_sent: 0, tokens_used: 0, cost: 0 };
    
    res.json({
      today: todayUsage,
      thisMonth: monthlyUsage,
      total: totalUsage
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

// Get payment history
router.get('/payments', authenticateToken, (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT * FROM payment_transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

export default router;