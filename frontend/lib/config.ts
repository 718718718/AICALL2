const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

/** Socket.io expects http(s); normalize ws(s) scheme from NEXT_PUBLIC_WS_URL. */
function toSocketIoUrl(url: string): string {
  return url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
}

export function getWsUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_WS_URL ||
    (isProduction
      ? process.env.NEXT_PUBLIC_WS_URL_PROD
      : process.env.NEXT_PUBLIC_WS_URL_DEV) ||
    'ws://localhost:5000';
  return toSocketIoUrl(raw);
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  isDevelopment,
  
  api: {
    baseUrl: isProduction
      ? process.env.NEXT_PUBLIC_BACKEND_URL_PROD!
      : process.env.NEXT_PUBLIC_BACKEND_URL_DEV || 'http://localhost:5000',
    wsUrl: getWsUrl(),
  },
  
  twilio: {
    phoneNumber: isProduction
      ? process.env.NEXT_PUBLIC_TWILIO_PHONE_PROD
      : process.env.NEXT_PUBLIC_TWILIO_PHONE_DEV,
  },
  
  features: {
    multiTenant: process.env.NEXT_PUBLIC_ENABLE_MULTI_TENANT === 'true',
  },
};

export default config;