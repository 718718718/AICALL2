/**
 * Media Streams Routes for OpenAI Realtime API Integration
 * WebSocket endpoint for Twilio Media Streams
 *
 * Note: WebSocket routes must be registered directly on the app instance,
 * not through Express router, because express-ws adds .ws() method to app only.
 */

const mediaStreamController = require('../controllers/mediaStreamController');
const simpleMediaStreamController = require('../controllers/mediaStreamController.simple');

/**
 * Register WebSocket route for Twilio Media Streams
 * This function must be called with the app instance (not router)
 *
 * @param {Express} app - Express app instance with express-ws initialized
 */
module.exports = function(app) {
  // Basic test endpoint
  app.ws('/media-stream-test', (ws, req) => {
    console.log('[MediaStreamTest] Test WebSocket connected!');
    ws.send('Hello from WebSocket!');
  });

  /**
   * SIMPLIFIED VERSION - Python sample equivalent (NO DATABASE)
   * Use this for debugging and testing
   * Route: ws://host/api/twilio/media-stream-simple
   */
  app.ws('/api/twilio/media-stream-simple', simpleMediaStreamController.handleSimpleMediaStream);

  /**
   * PRODUCTION VERSION - Full featured with database
   * Route: ws://host/api/twilio/media-stream/:callId
   *
   * @param {string} callId - MongoDB CallSession ID
   */
  app.ws('/api/twilio/media-stream/:callId', mediaStreamController.handleMediaStream);

  console.log('[MediaStreamRoutes] WebSocket routes registered:');
  console.log('[MediaStreamRoutes] - Basic test: /media-stream-test');
  console.log('[MediaStreamRoutes] - SIMPLE (Python equivalent): /api/twilio/media-stream-simple');
  console.log('[MediaStreamRoutes] - Production: /api/twilio/media-stream/:callId');
};
