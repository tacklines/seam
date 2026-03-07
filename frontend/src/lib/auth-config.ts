// Defaults are for local dev with Ory Hydra. Production sets VITE_* at build time.
const AUTH_AUTHORITY = (import.meta as any).env?.VITE_AUTH_AUTHORITY ?? 'http://localhost:4444';
const APP_URL = (import.meta as any).env?.VITE_APP_URL ?? 'http://localhost:5173';
const CLIENT_ID = (import.meta as any).env?.VITE_CLIENT_ID ?? 'web-app';

export const AUTH_CONFIG = {
  authority: AUTH_AUTHORITY,
  client_id: CLIENT_ID,
  redirect_uri: `${APP_URL}/auth/callback`,
  post_logout_redirect_uri: `${APP_URL}/`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  silent_redirect_uri: `${APP_URL}/auth/silent-renew.html`,
} as const;
