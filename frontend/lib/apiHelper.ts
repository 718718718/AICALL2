// Common API helper functions for environment-aware API calls

export function getApiBaseUrl(): string {
  // 本番環境ではRenderのバックエンドURL、開発環境ではローカルバックエンドを使用
  if (process.env.NODE_ENV === 'production') {
    const url = process.env.NEXT_PUBLIC_BACKEND_URL_PROD;
    if (!url) throw new Error('NEXT_PUBLIC_BACKEND_URL_PROD is not configured');
    return url;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
}

export function getApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  
  // Ensure endpoint starts with /
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (baseUrl) {
    return `${baseUrl}${cleanEndpoint}`;
  }
  
  return cleanEndpoint;
}

// Token refresh state management
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
}

function redirectToLogin() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userData');
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// Enhanced fetch with better error handling and logging
export async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = getApiUrl(endpoint);
  
  console.log('[API] Making request to:', url);
  console.log('[API] Environment:', process.env.NODE_ENV);
  console.log('[API] Method:', options.method || 'GET');
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    console.log('[API] Response status:', response.status);
    console.log('[API] Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[API] Error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const responseText = await response.text();
    console.log('[API] Response text length:', responseText.length);
    
    if (!responseText) {
      throw new Error('Empty response from server');
    }
    
    return JSON.parse(responseText);
  } catch (error) {
    console.error('[API] Request failed:', error);
    throw error;
  }
}

// Authenticated API request helper with automatic token refresh
export async function authenticatedApiRequest(
  endpoint: string, 
  options: RequestInit = {},
  _retryCount: number = 0
): Promise<any> {
  const token = localStorage.getItem('accessToken');
  console.log('[API] authenticatedApiRequest - Token found:', !!token, 'Token length:', token?.length || 0);
  
  const headers = {
    ...options.headers,
    ...(token && { Authorization: `Bearer ${token}` }),
  };
  
  console.log('[API] Authorization header:', headers.Authorization ? 'Present' : 'Missing');
  
  try {
    return await apiRequest(endpoint, {
      ...options,
      headers,
    });
  } catch (error: any) {
    // Check if error is 401 (Unauthorized) and we haven't retried yet
    if (error.message?.includes('401') && _retryCount === 0) {
      console.log('[API] Got 401 error, attempting token refresh...');
      
      // If already refreshing, queue this request
      if (isRefreshing) {
        console.log('[API] Token refresh in progress, queueing request...');
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(newToken => {
          console.log('[API] Retrying queued request with new token');
          return authenticatedApiRequest(endpoint, options, _retryCount + 1);
        }).catch(err => {
          throw err;
        });
      }
      
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        console.log('[API] No refresh token available, redirecting to login');
        processQueue(new Error('No refresh token'), null);
        isRefreshing = false;
        redirectToLogin();
        throw error;
      }
      
      try {
        console.log('[API] Calling refresh token endpoint...');
        const refreshResponse = await fetch(getApiUrl('/api/auth/refresh-token'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
        
        if (!refreshResponse.ok) {
          throw new Error('Token refresh failed');
        }
        
        const data = await refreshResponse.json();
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = data;
        
        console.log('[API] Token refresh successful');
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        
        processQueue(null, newAccessToken);
        isRefreshing = false;
        
        // Retry original request with new token
        return authenticatedApiRequest(endpoint, options, _retryCount + 1);
        
      } catch (refreshError) {
        console.error('[API] Token refresh failed:', refreshError);
        processQueue(refreshError, null);
        isRefreshing = false;
        redirectToLogin();
        throw refreshError;
      }
    }
    
    // For non-401 errors or after retry, just throw
    throw error;
  }
}