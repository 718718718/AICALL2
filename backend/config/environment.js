const dotenv = require('dotenv');
const path = require('path');

// Load .env files with priority: .env.local > .env
if (process.env.NODE_ENV !== 'production') {
  const fs = require('fs');
  const envLocalPath = path.join(__dirname, '../.env.local');
  const envPath = path.join(__dirname, '../.env');
  
  console.log('[Config] Loading .env files:');
  console.log('[Config] .env.local path:', envLocalPath, 'exists:', fs.existsSync(envLocalPath));
  console.log('[Config] .env path:', envPath, 'exists:', fs.existsSync(envPath));
  
  if (fs.existsSync(envLocalPath)) {
    const result = dotenv.config({ path: envLocalPath });
    console.log('[Config] .env.local loaded:', result.error ? 'FAILED' : 'SUCCESS');
  }
  
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    console.log('[Config] .env loaded:', result.error ? 'FAILED' : 'SUCCESS');
  }
  
  console.log('[Config] After loading - TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'NOT SET');
  console.log('[Config] NODE_ENV:', process.env.NODE_ENV);
} else {
  dotenv.config();
}

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  isDevelopment,
  
  server: {
    port: process.env.PORT || 5000,
  },
  
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-call-system',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'default-jwt-secret',
    expiresIn: '7d',
  },
  
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: isProduction 
      ? process.env.TWILIO_PHONE_NUMBER_PROD 
      : (process.env.TWILIO_PHONE_NUMBER_DEV || process.env.TWILIO_PHONE_NUMBER),
    webhookBaseUrl: isProduction
      ? process.env.WEBHOOK_BASE_URL_PROD
      : (process.env.WEBHOOK_BASE_URL_DEV || process.env.BASE_URL || process.env.NGROK_URL || 'http://localhost:5000'),
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
  
  coefont: {
    accessKey: process.env.COE_FONT_KEY,
    clientSecret: process.env.COE_FONT_CLIENT_SECRET,
    voiceId: process.env.COEFONT_VOICE_ID,
  },

  cartesia: {
    apiKey: process.env.CARTESIA_API_KEY,
    voiceId: process.env.CARTESIA_VOICE_ID || 'fd1ee8f5-223a-4a87-a2fe-37eb3706cd69',
    modelId: process.env.CARTESIA_MODEL_ID || 'sonic-2',
  },
};

// Validate required environment variables (only critical ones)
const requiredVars = {
  'JWT_SECRET': config.jwt.secret,
};

const missingVars = Object.entries(requiredVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
}

module.exports = config;