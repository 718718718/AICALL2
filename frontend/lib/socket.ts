import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initializeSocket = (token?: string): Socket => {
  if (socket) {
    return socket;
  }

  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

  // 開発環境では認証をオプショナルに
  const authConfig = token ? { auth: { token } } : {};

  socket = io(SOCKET_URL, {
    ...authConfig,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'] // 明示的にトランスポートを指定
  });

  socket.on('connect', () => {
    console.log('Connected to WebSocket server');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
  });

  socket.on('connect_error', (error: any) => {
    console.error('Connection error:', error.message || error);
    
    // Retry with development mode authentication if initial connection fails
    if (error.type === 'TransportError' || error.message?.includes('xhr poll error')) {
      console.log('Retrying connection without authentication...');
      socket.auth = {};
      socket.connect();
    }
  });

  return socket;
};

export const getSocket = (): Socket | null => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Event listeners helpers
export const subscribeToCallEvents = (callbacks: {
  onCallStarted?: (data: any) => void;
  onCallUpdated?: (data: any) => void;
  onCallEnded?: (data: any) => void;
  onTranscriptUpdate?: (data: any) => void;
}) => {
  if (!socket) return;

  if (callbacks.onCallStarted) {
    socket.on('call-started', callbacks.onCallStarted);
  }
  if (callbacks.onCallUpdated) {
    socket.on('call-updated', callbacks.onCallUpdated);
  }
  if (callbacks.onCallEnded) {
    socket.on('call-ended', callbacks.onCallEnded);
  }
  if (callbacks.onTranscriptUpdate) {
    socket.on('transcript-update', callbacks.onTranscriptUpdate);
  }
};

export const unsubscribeFromCallEvents = () => {
  if (!socket) return;

  socket.off('call-started');
  socket.off('call-updated');
  socket.off('call-ended');
  socket.off('transcript-update');
};

export const monitorCall = (callId: string) => {
  if (!socket) return;
  socket.emit('monitor-call', callId);
  socket.emit('subscribe-transcript', callId);
};

export const stopMonitoringCall = (callId: string) => {
  if (!socket) return;
  socket.emit('stop-monitor-call', callId);
  socket.emit('unsubscribe-transcript', callId);
};

export const requestHandoff = (callId: string, reason?: string) => {
  if (!socket) return;
  socket.emit('request-handoff', { callId, reason });
};

export const updateAgentStatus = (status: 'available' | 'busy' | 'offline') => {
  if (!socket) return;
  socket.emit('update-agent-status', status);
};