const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');

// Load env vars with priority: .env.local > .env > .env.example
// 開発環境では .env.local が優先される
// 本番環境では環境変数が最優先される
if (process.env.NODE_ENV !== 'production') {
  // 開発環境: .env.local → .env の順で読み込み
  const result1 = dotenv.config({ path: './.env.local' });
  const result2 = dotenv.config({ path: './.env' });

  console.log('[Server] result2.parsed:', result2.parsed ? Object.keys(result2.parsed) : 'NO PARSED DATA');

  console.log('[Server] .env.local result:', result1.error ? 'FAILED' : 'SUCCESS');
  console.log('[Server] .env result:', result2.error ? 'FAILED' : 'SUCCESS');
  console.log('[Server] TWILIO_ACCOUNT_SID after loading:', process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET');
  console.log('[Server] TWILIO_ACCOUNT_SID value:', process.env.TWILIO_ACCOUNT_SID);
  console.log('[Server] All env keys containing TWILIO:', Object.keys(process.env).filter(k => k.includes('TWILIO')));
} else {
  // 本番環境: 環境変数のみ使用（.envファイルは読み込まない）
  console.log('Production mode: Using environment variables only');
}

// Connect to database
connectDB();

// Route files
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const customerRoutes = require('./routes/customers');
const agentRoutes = require('./routes/agentRoutes');
const callRoutes = require('./routes/callRoutes');
const twilioRoutes = require('./routes/twilioRoutes');
const bulkCallRoutes = require('./routes/bulkCallRoutes');
const conferenceRoutes = require('./routes/conferenceRoutes');
const companyRoutes = require('./routes/companyRoutes');
const audioRoutes = require('./routes/audioRoutes');
const handoffRoutes = require('./routes/handoffRoutes');
const handoffDirectRoutes = require('./routes/handoffDirectRoutes');
const companyAdminRoutes = require('./routes/companyAdminRoutes');
const healthRoutes = require('./routes/healthRoutes');
const callHistoryRoutes = require('./routes/callHistoryRoutes');
const testRoutes = require('./routes/testRoutes');
const mediaStreamRoutes = require('./routes/mediaStreamRoutes');

const app = express();

// NOTE: WebSocket initialization moved to AFTER http server creation
// This is required for native ws library (not express-ws)
console.log('[Server] Express app created, WebSocket will be initialized after http server');

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For Twilio webhooks

// Enable CORS with specific configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5000',
      'http://localhost:5002',
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URL_PROD
    ].filter(Boolean);

    // Debug logging for CORS
    console.log('[CORS] Request origin:', origin);
    console.log('[CORS] Allowed origins:', allowedOrigins);
    console.log('[CORS] Environment variables:', {
      FRONTEND_URL: process.env.FRONTEND_URL,
      FRONTEND_URL_PROD: process.env.FRONTEND_URL_PROD
    });

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // 本番環境では厳格にチェック、開発環境では全て許可
      if (process.env.NODE_ENV === 'production') {
        console.log('[CORS] BLOCKING request from origin:', origin);
        // 一時的に許可（デバッグ用）
        callback(null, true);
        // callback(new Error('Not allowed by CORS'));
      } else {
        callback(null, true);
      }
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Set security headers
// TEMPORARILY DISABLED for WebSocket debugging
// app.use(helmet());
console.log('[Server] helmet() disabled for WebSocket testing');

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company', require('./routes/companyRoutes')); // User's company info routes
app.use('/api/customers', customerRoutes);
app.use('/api/agents', agentRoutes);
// Mount bulk routes BEFORE general call routes to avoid auth middleware conflict
app.use('/api/calls', bulkCallRoutes);
app.use('/api/calls', conferenceRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/twilio', twilioRoutes);
// WebSocket routes already registered before middleware (line 59)
app.use('/api/audio', audioRoutes);
app.use('/api/direct', handoffDirectRoutes); // Direct routes without auth
app.use('/api/test', testRoutes); // Test routes for debugging
app.use('/api', handoffRoutes);
app.use('/api/company-admin', companyAdminRoutes);
app.use('/api/call-history', callHistoryRoutes);
app.use('/', healthRoutes);

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Database cleanup endpoint
const { cleanupOldCalls } = require('./cleanup-calls');
app.post('/api/admin/cleanup-calls', async (req, res) => {
  try {
    const result = await cleanupOldCalls();
    res.json(result);
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use(require('./middlewares/errorHandler'));

const PORT = process.env.PORT || 5000;

// Create server first
const server = require('http').createServer(app);

// Initialize WebSocket server for Media Streams (using native ws library)
const WebSocket = require('ws');
const wss = new WebSocket.Server({
  noServer: true  // Manual upgrade handling for path parameters
});

// Global WebSocket connection map for handoff support
// Key: callId, Value: { twilioWs, openaiWs }
global.activeMediaStreams = new Map();

const simpleMediaStreamController = require('./controllers/mediaStreamController.simple');
const mediaStreamController = require('./controllers/mediaStreamController');

// Manual WebSocket upgrade handling to support path parameters
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  console.log('[WebSocket] Upgrade request for:', pathname);

  // Simple version (no database, for debugging)
  if (pathname === '/api/twilio/media-stream-simple') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('[WebSocket] Simple handler connected');
      const req = { url: request.url, headers: request.headers };
      simpleMediaStreamController.handleSimpleMediaStream(ws, req);
    });
  }
  // Production version (with database, callId parameter)
  else if (pathname.startsWith('/api/twilio/media-stream/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      const callId = pathname.split('/').pop();
      console.log('[WebSocket] Production handler connected for callId:', callId);

      // Create req object compatible with controller
      const req = {
        params: { callId },
        url: request.url,
        headers: request.headers
      };

      mediaStreamController.handleMediaStream(ws, req);
    });
  }
  // Socket.io paths - let Socket.io handle its own upgrades
  else if (pathname.startsWith('/socket.io/')) {
    console.log('[WebSocket] Socket.io upgrade request, letting Socket.io handle it');
    // Don't handle this - Socket.io will handle it
    return;
  }
  // Reject other paths
  else {
    console.log('[WebSocket] Rejected upgrade for:', pathname);
    socket.destroy();
  }
});

wss.on('error', (error) => {
  console.error('[WebSocket] Server error:', error);
});

console.log('[Server] WebSocket server initialized with manual upgrade handling');
console.log('[Server] - Simple endpoint: /api/twilio/media-stream-simple');
console.log('[Server] - Production endpoint: /api/twilio/media-stream/:callId');

// Initialize WebSocket service (for frontend)
const webSocketService = require('./services/websocket');
webSocketService.initialize(server);

// Initialize call timeout manager
const callTimeoutManager = require('./services/callTimeoutManager');
callTimeoutManager.startCleanupTask();

// Start listening with error handling
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);

  // Set up periodic cleanup of stale call sessions
  const bulkCallController = require('./controllers/bulkCallController');
  const cleanupInterval = 5 * 60 * 1000; // Every 5 minutes

  setInterval(async () => {
    try {
      console.log('[Periodic Cleanup] Running call session cleanup...');
      // Create a mock req and res for the cleanup function
      const mockReq = {};
      const mockRes = {
        status: () => mockRes,
        json: (data) => {
          console.log('[Periodic Cleanup] Result:', data.message);
          return mockRes;
        }
      };

      await bulkCallController.cleanupOldSessions(mockReq, mockRes);
    } catch (error) {
      console.error('[Periodic Cleanup] Error:', error);
    }
  }, cleanupInterval);

  console.log(`[Cleanup] Automatic cleanup scheduled every ${cleanupInterval / 1000 / 60} minutes`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.log('Attempting to kill existing process and retry...');

    // Try to kill the process using the port and retry
    const { exec } = require('child_process');
    exec(`lsof -ti:${PORT} | xargs kill -9`, (error) => {
      if (!error) {
        console.log('Previous process killed. Retrying in 2 seconds...');
        setTimeout(() => {
          server.listen(PORT);
        }, 2000);
      } else {
        console.error('Failed to kill existing process. Please manually stop the process using port', PORT);
        process.exit(1);
      }
    });
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:');
  console.error(err);
  console.error('Stack:', err.stack);
  // Don't exit immediately to see the error
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:');
  console.error(err);
  console.error('Stack:', err.stack);
  // Exit after logging
  process.exit(1);
});

// Trigger restart for transcript scan logic