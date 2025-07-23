import { create } from 'zustand';
import { useAuthStore } from './authStore';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tokens_used?: number;
  cost?: number;
  created_at: string;
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

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isSending: boolean;
  selectedProvider: 'google' | 'openrouter';
  selectedModel: string;
  availableModels: Record<string, Array<{ id: string; name: string; description: string }>>;
  
  // Actions
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: number) => Promise<void>;
  sendMessage: (message: string, conversationId?: number) => Promise<void>;
  createNewConversation: () => void;
  deleteConversation: (conversationId: number) => Promise<void>;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setProvider: (provider: 'google' | 'openrouter') => void;
  setModel: (model: string) => void;
  loadAvailableModels: () => Promise<void>;
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
  selectedModel: 'gemini-pro',
  availableModels: {},

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

  setProvider: (provider: 'google' | 'openrouter') => {
    const { availableModels } = get();
    const models = availableModels[provider] || [];
    const defaultModel = models.length > 0 ? models[0].id : '';
    
    set({ 
      selectedProvider: provider,
      selectedModel: defaultModel 
    });
  },

  setModel: (model: string) => {
    set({ selectedModel: model });
  },

  loadAvailableModels: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/models`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load models');
      }

      const data = await response.json();
      set({ availableModels: data.models });
      
      // Set default model if none selected
      const { selectedProvider, selectedModel } = get();
      if (!selectedModel && data.models[selectedProvider]?.length > 0) {
        set({ selectedModel: data.models[selectedProvider][0].id });
      }
    } catch (error) {
      console.error('Load models error:', error);
    }
  },
}));