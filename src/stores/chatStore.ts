import { create } from 'zustand';
import { useAuthStore } from './authStore';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tokens_used?: number;
  cost?: number;
  created_at: string;
  timestamp: string;
}

interface Conversation {
  id: number;
  title: string;
  provider: 'google' | 'openrouter';
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface AIModel {
  id: number;
  provider: string;
  model_name: string;
  display_name: string;
  description: string;
  cost_per_token: number;
  max_tokens: number;
  is_active: boolean;
  required_plan: string;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isSending: boolean;
  selectedProvider: string;
  selectedModel: string;
  availableModels: AIModel[];
  userCredits: number;
  
  // Actions
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: number) => Promise<void>;
  sendMessage: (message: string, conversationId?: number) => Promise<void>;
  createNewConversation: () => void;
  createConversation: (title: string) => Promise<Conversation>;
  deleteConversation: (conversationId: number) => Promise<void>;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setProvider: (provider: string) => void;
  setModel: (model: string) => void;
  setSelectedProvider: (provider: string) => void;
  setSelectedModel: (model: string) => void;
  loadAvailableModels: () => Promise<void>;
  loadUserCredits: () => Promise<void>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const getAuthHeaders = () => {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  isSending: false,
  selectedProvider: 'google',
  selectedModel: '',
  availableModels: [],
  userCredits: 0,

  loadConversations: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }

      const data = await response.json();
      set({ conversations: data.conversations, isLoading: false });
    } catch (error) {
      console.error('Load conversations error:', error);
      set({ isLoading: false });
    }
  },

  loadMessages: async (conversationId: number) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/messages`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      set({ messages: data.messages, isLoading: false });
    } catch (error) {
      console.error('Load messages error:', error);
      set({ isLoading: false });
    }
  },

  sendMessage: async (message: string, conversationId?: number) => {
    const { selectedProvider, selectedModel, messages } = get();
    set({ isSending: true });
    
    // Optimistically add user message
    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };
    
    set({ messages: [...messages, userMessage] });

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message,
          conversationId,
          provider: selectedProvider,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const data = await response.json();
      
      // Add AI response
      const aiMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.message,
        tokens_used: data.tokensUsed,
        cost: data.cost,
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
      
      set((state) => ({ 
        messages: [...state.messages, aiMessage],
        isSending: false 
      }));

      // If this was a new conversation, reload conversations list
      if (!conversationId) {
        get().loadConversations();
      }
    } catch (error) {
      console.error('Send message error:', error);
      // Remove optimistic user message on error
      set((state) => ({ 
        messages: state.messages.slice(0, -1),
        isSending: false 
      }));
      throw error;
    }
  },

  createNewConversation: () => {
    set({ 
      currentConversation: null, 
      messages: [] 
    });
  },

  createConversation: async (title: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      const data = await response.json();
      const newConversation = data.conversation;
      
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
        currentConversation: newConversation,
        messages: []
      }));
      
      return newConversation;
    } catch (error) {
      console.error('Create conversation error:', error);
      throw error;
    }
  },

  deleteConversation: async (conversationId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      // Remove from local state
      set((state) => ({
        conversations: state.conversations.filter(c => c.id !== conversationId),
        currentConversation: state.currentConversation?.id === conversationId ? null : state.currentConversation,
        messages: state.currentConversation?.id === conversationId ? [] : state.messages,
      }));
    } catch (error) {
      console.error('Delete conversation error:', error);
      throw error;
    }
  },

  setCurrentConversation: (conversation: Conversation | null) => {
    set({ currentConversation: conversation });
    if (conversation) {
      get().loadMessages(conversation.id);
    } else {
      set({ messages: [] });
    }
  },

  setProvider: (provider: string) => {
    const { availableModels } = get();
    const models = availableModels.filter(model => model.provider === provider && model.is_active);
    const defaultModel = models.length > 0 ? models[0].id.toString() : '';
    
    set({ 
      selectedProvider: provider,
      selectedModel: defaultModel 
    });
  },

  setModel: (model: string) => {
    set({ selectedModel: model });
  },

  setSelectedProvider: (provider: string) => {
    const { availableModels } = get();
    const models = availableModels.filter(model => model.provider === provider && model.is_active);
    const defaultModel = models.length > 0 ? models[0].id.toString() : '';
    
    set({ 
      selectedProvider: provider,
      selectedModel: defaultModel 
    });
  },

  setSelectedModel: (model: string) => {
    set({ selectedModel: model });
  },

  loadAvailableModels: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/billing/admin/models`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load models');
      }

      const data = await response.json();
      const activeModels = data.filter((model: AIModel) => model.is_active);
      set({ availableModels: activeModels });
      
      // Set default model if none selected
      const { selectedProvider, selectedModel } = get();
      if (!selectedModel && activeModels.length > 0) {
        const defaultModel = activeModels.find(model => model.provider === selectedProvider) || activeModels[0];
        set({ 
          selectedModel: defaultModel.id.toString(),
          selectedProvider: defaultModel.provider 
        });
      }
    } catch (error) {
      console.error('Load models error:', error);
    }
  },

  loadUserCredits: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscription/credits`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load user credits');
      }

      const data = await response.json();
      set({ userCredits: data.credits });
    } catch (error) {
      console.error('Load user credits error:', error);
    }
  },
}));