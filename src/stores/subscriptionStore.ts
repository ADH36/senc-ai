import { create } from 'zustand';
import axios from 'axios';

interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  features: string[];
  message_limit: number | null;
  is_active: boolean;
}

interface UserSubscription {
  id: number;
  user_id: number;
  plan_id: number;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  features: string[];
  message_limit: number | null;
}

interface UserCredits {
  user_id: number;
  credits: number;
  total_purchased: number;
  total_used: number;
  last_purchase_at: string | null;
}

interface UsageStats {
  today: {
    messages_sent: number;
    tokens_used: number;
    cost: number;
  };
  thisMonth: {
    messages_sent: number;
    tokens_used: number;
    cost: number;
  };
  total: {
    messages_sent: number;
    tokens_used: number;
    cost: number;
  };
}

interface PaymentTransaction {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  created_at: string;
}

interface SubscriptionStore {
  plans: SubscriptionPlan[];
  currentSubscription: UserSubscription | null;
  credits: UserCredits | null;
  usage: UsageStats | null;
  payments: PaymentTransaction[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchPlans: () => Promise<void>;
  fetchCurrentSubscription: () => Promise<void>;
  fetchCredits: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchPayments: () => Promise<void>;
  createCheckoutSession: (planId: number) => Promise<string>;
  purchaseCredits: (amount: number) => Promise<string>;
  clearError: () => void;
}

const API_BASE = 'http://localhost:3001/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  plans: [],
  currentSubscription: null,
  credits: null,
  usage: null,
  payments: [],
  loading: false,
  error: null,

  fetchPlans: async () => {
    try {
      set({ loading: true, error: null });
      const response = await axios.get(`${API_BASE}/subscription/plans`);
      set({ plans: response.data, loading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to fetch plans', 
        loading: false 
      });
    }
  },

  fetchCurrentSubscription: async () => {
    try {
      set({ loading: true, error: null });
      const response = await axios.get(`${API_BASE}/subscription/current`, {
        headers: getAuthHeaders()
      });
      set({ currentSubscription: response.data, loading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to fetch subscription', 
        loading: false 
      });
    }
  },

  fetchCredits: async () => {
    try {
      set({ loading: true, error: null });
      const response = await axios.get(`${API_BASE}/subscription/credits`, {
        headers: getAuthHeaders()
      });
      set({ credits: response.data, loading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to fetch credits', 
        loading: false 
      });
    }
  },

  fetchUsage: async () => {
    try {
      set({ loading: true, error: null });
      const response = await axios.get(`${API_BASE}/subscription/usage`, {
        headers: getAuthHeaders()
      });
      set({ usage: response.data, loading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to fetch usage', 
        loading: false 
      });
    }
  },

  fetchPayments: async () => {
    try {
      set({ loading: true, error: null });
      const response = await axios.get(`${API_BASE}/subscription/payments`, {
        headers: getAuthHeaders()
      });
      set({ payments: response.data, loading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to fetch payments', 
        loading: false 
      });
    }
  },

  createCheckoutSession: async (planId: number): Promise<string> => {
    try {
      set({ loading: true, error: null });
      const response = await axios.post(
        `${API_BASE}/subscription/create-checkout-session`,
        { planId },
        { headers: getAuthHeaders() }
      );
      set({ loading: false });
      return response.data.url;
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to create checkout session', 
        loading: false 
      });
      throw error;
    }
  },

  purchaseCredits: async (amount: number): Promise<string> => {
    try {
      set({ loading: true, error: null });
      const response = await axios.post(
        `${API_BASE}/subscription/purchase-credits`,
        { amount },
        { headers: getAuthHeaders() }
      );
      set({ loading: false });
      return response.data.url;
    } catch (error: any) {
      set({ 
        error: error.response?.data?.error || 'Failed to purchase credits', 
        loading: false 
      });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));