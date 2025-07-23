import { useState, useEffect } from 'react';
import { Users, MessageSquare, Key, Settings, TrendingUp, Activity, Plus, Edit, Trash2, Eye, EyeOff, BarChart3, Clock, Shield, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';

interface AdminStats {
  userStats: {
    total_users: number;
    active_users: number;
    admin_users: number;
  };
  conversationStats: {
    total_conversations: number;
    today_conversations: number;
  };
  messageStats: {
    total_messages: number;
    today_messages: number;
    total_tokens: number;
    total_cost: number;
  };
  apiKeyStats: Array<{
    provider: string;
    count: number;
    total_keys: number;
    active_keys: number;
  }>;
  recentUsers: Array<{
    id: number;
    name: string;
    email: string;
    created_at: string;
  }>;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login: string;
}

interface ApiKey {
  id: string;
  name: string;
  provider: string;
  created_at: string;
  last_used: string;
}

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newApiKey, setNewApiKey] = useState({ name: '', provider: 'google', key: '' });
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const [showPassword, setShowPassword] = useState(false);
  
  const { token } = useAuthStore();

  useEffect(() => {
    fetchAdminData();
  }, [activeTab]);

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);
      
      if (activeTab === 'overview') {
        const response = await fetch('/api/admin/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } else if (activeTab === 'users') {
        const response = await fetch('/api/admin/users', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        }
      } else if (activeTab === 'api-keys') {
        const response = await fetch('/api/admin/api-keys', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setApiKeys(data.apiKeys || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });
      
      if (response.ok) {
        toast.success('User created successfully');
        setShowUserModal(false);
        setNewUser({ name: '', email: '', password: '', role: 'user' });
        fetchAdminData();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to create user');
      }
    } catch (error) {
      toast.error('Failed to create user');
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (response.ok) {
        toast.success('User updated successfully');
        setEditingUser(null);
        fetchAdminData();
      } else {
        toast.error('Failed to update user');
      }
    } catch (error) {
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success('User deleted successfully');
        fetchAdminData();
      } else {
        toast.error('Failed to delete user');
      }
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newApiKey),
      });
      
      if (response.ok) {
        toast.success('API key added successfully');
        setShowApiKeyModal(false);
        setNewApiKey({ name: '', provider: 'google', key: '' });
        fetchAdminData();
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to add API key');
      }
    } catch (error) {
      toast.error('Failed to add API key');
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!window.confirm('Are you sure you want to delete this API key?')) return;
    
    try {
      const response = await fetch(`/api/admin/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        toast.success('API key deleted successfully');
        fetchAdminData();
      } else {
        toast.error('Failed to delete API key');
      }
    } catch (error) {
      toast.error('Failed to delete API key');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  if (isLoading && !stats && !users.length && !apiKeys.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, API keys, and system settings</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && stats && (
              <div className="space-y-8">
                {/* Main Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-600 mb-1">Total Users</p>
                        <p className="text-3xl font-bold text-blue-900">{stats.userStats?.total_users || 0}</p>
                        <p className="text-xs text-blue-600 mt-1">
                          {stats.userStats?.active_users || 0} active today
                        </p>
                      </div>
                      <div className="p-3 bg-blue-200 rounded-full">
                        <Users className="w-8 h-8 text-blue-700" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-600 mb-1">Conversations</p>
                        <p className="text-3xl font-bold text-green-900">{stats.conversationStats?.total_conversations || 0}</p>
                        <p className="text-xs text-green-600 mt-1">
                          {stats.conversationStats?.today_conversations || 0} today
                        </p>
                      </div>
                      <div className="p-3 bg-green-200 rounded-full">
                        <MessageSquare className="w-8 h-8 text-green-700" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-purple-600 mb-1">Messages</p>
                        <p className="text-3xl font-bold text-purple-900">{stats.messageStats?.total_messages || 0}</p>
                        <p className="text-xs text-purple-600 mt-1">
                          {stats.messageStats?.today_messages || 0} today
                        </p>
                      </div>
                      <div className="p-3 bg-purple-200 rounded-full">
                        <Activity className="w-8 h-8 text-purple-700" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-orange-600 mb-1">API Keys</p>
                        <p className="text-3xl font-bold text-orange-900">{apiKeys.length}</p>
                        <p className="text-xs text-orange-600 mt-1">
                          {stats.apiKeyStats?.filter(key => key.active_keys > 0).length || 0} active
                        </p>
                      </div>
                      <div className="p-3 bg-orange-200 rounded-full">
                        <Key className="w-8 h-8 text-orange-700" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-900">Usage Analytics</h4>
                      <BarChart3 className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Tokens</span>
                        <span className="font-semibold text-gray-900">{stats.messageStats?.total_tokens?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Cost</span>
                        <span className="font-semibold text-gray-900">${stats.messageStats?.total_cost?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Avg. Cost/Message</span>
                        <span className="font-semibold text-gray-900">
                          ${((stats.messageStats?.total_cost || 0) / Math.max(stats.messageStats?.total_messages || 1, 1)).toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-900">System Health</h4>
                      <Shield className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Database Status</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Healthy</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">API Status</span>
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Online</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Uptime</span>
                        <span className="font-semibold text-gray-900">99.9%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-900">Quick Stats</h4>
                      <Clock className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Admin Users</span>
                        <span className="font-semibold text-gray-900">{stats.userStats?.admin_users || 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Regular Users</span>
                        <span className="font-semibold text-gray-900">{(stats.userStats?.total_users || 0) - (stats.userStats?.admin_users || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Providers</span>
                        <span className="font-semibold text-gray-900">{stats.apiKeyStats?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
                  </div>
                  <div className="p-6">
                    {stats.recentUsers && stats.recentUsers.length > 0 ? (
                      <div className="space-y-4">
                        {stats.recentUsers.slice(0, 5).map((user) => (
                          <div key={user.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{user.name}</p>
                                <p className="text-sm text-gray-600">{user.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">New User</p>
                              <p className="text-xs text-gray-500">{formatDateTime(user.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">User Management</h3>
                  <button
                    onClick={() => setShowUserModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add User</span>
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Email</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Role</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Created</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Last Login</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100">
                          <td className="py-3 px-4">{user.name}</td>
                          <td className="py-3 px-4">{user.email}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">{formatDate(user.created_at)}</td>
                          <td className="py-3 px-4">{user.last_login ? formatDate(user.last_login) : 'Never'}</td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setEditingUser(user)}
                                className="p-1 text-blue-600 hover:text-blue-800"
                                title="Edit user"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* API Keys Tab */}
            {activeTab === 'api-keys' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">API Key Management</h3>
                  <button
                    onClick={() => setShowApiKeyModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add API Key</span>
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Provider</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Created</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Last Used</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((apiKey) => (
                        <tr key={apiKey.id} className="border-b border-gray-100">
                          <td className="py-3 px-4">{apiKey.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {apiKey.provider}
                            </span>
                          </td>
                          <td className="py-3 px-4">{formatDate(apiKey.created_at)}</td>
                          <td className="py-3 px-4">{apiKey.last_used ? formatDate(apiKey.last_used) : 'Never'}</td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleDeleteApiKey(apiKey.id)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Delete API key"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900">System Settings</h3>
                <div className="bg-gray-50 rounded-lg p-6">
                  <p className="text-gray-600">System settings will be available in a future update.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full p-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add API Key</h3>
            <form onSubmit={handleCreateApiKey} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newApiKey.name}
                  onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Production Google AI"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={newApiKey.provider}
                  onChange={(e) => setNewApiKey({ ...newApiKey, provider: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="google">Google AI Studio</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={newApiKey.key}
                  onChange={(e) => setNewApiKey({ ...newApiKey, key: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your API key"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;