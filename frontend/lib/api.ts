import axios from 'axios';

// API base URL configuration for different environments
function getApiBaseUrl(): string {
  // 常にNext.js API Routesを使用（開発・本番環境共通）
  return '/api';
}

const API_BASE_URL = getApiBaseUrl();

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リフレッシュ中フラグ
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        isRefreshing = false;
        redirectToLogin();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;
        
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        
        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        
        processQueue(null, newAccessToken);
        
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

function redirectToLogin() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// Auth APIs
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
    }
    return response;
  },
  
  register: (data: any) =>
    api.post('/auth/register', data),
  
  getProfile: () =>
    api.get('/auth/profile'),

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      redirectToLogin();
    }
  }
};

// Agent APIs
export const agentAPI = {
  getProfile: () =>
    api.get('/agents/profile'),
  
  updateProfile: (data: any) =>
    api.put('/agents/profile', data),
  
  updatePhone: (phoneNumber: string) =>
    api.put('/agents/phone', { phoneNumber }),
  
  updateConversation: (settings: any) =>
    api.put('/agents/conversation', settings),
  
  updateStatus: (status: string, isAvailable?: boolean) =>
    api.put('/agents/status', { status, isAvailable }),
  
  getAvailable: () =>
    api.get('/agents/available'),
  
  getStatistics: (params?: any) =>
    api.get('/agents/statistics', { params }),
  
  updateNotifications: (preferences: any) =>
    api.put('/agents/notifications', preferences),
};

// Call APIs
export const callAPI = {
  startCall: (customerId: string, agentId?: string) =>
    api.post('/calls/start', { customerId, agentId }),
  
  getActiveCalls: () =>
    api.get('/calls/active'),
  
  handoffCall: (callId: string, agentId?: string, reason?: string) =>
    api.post(`/calls/${callId}/handoff`, { agentId, reason }),
  
  endCall: (callId: string, result?: string, notes?: string) =>
    api.post(`/calls/${callId}/end`, { result, notes }),
  
  getCallHistory: (params?: any) =>
    api.get('/calls/history', { params }),
  
  getCallDetails: (callId: string) =>
    api.get(`/calls/${callId}`),
  
  updateTranscript: (callId: string, data: any) =>
    api.put(`/calls/${callId}/transcript`, data),
  
  getStatistics: (params?: any) =>
    api.get('/calls/statistics', { params }),
};

// Customer APIs
export const customerAPI = {
  getAll: (params?: any) =>
    api.get('/customers', { params }),
  
  getById: (id: string) =>
    api.get(`/customers/${id}`),
  
  create: (data: any) =>
    api.post('/customers', data),
  
  update: (id: string, data: any) =>
    api.put(`/customers/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/customers/${id}`),
  
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/customers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

export default api;