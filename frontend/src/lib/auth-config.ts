const KEYCLOAK_URL = (import.meta as any).env?.VITE_KEYCLOAK_URL ?? 'http://localhost:8080';
const APP_URL = (import.meta as any).env?.VITE_APP_URL ?? 'http://localhost:5173';

export const AUTH_CONFIG = {
  authority: `${KEYCLOAK_URL}/realms/seam`,
  client_id: 'web-app',
  redirect_uri: `${APP_URL}/auth/callback`,
  post_logout_redirect_uri: `${APP_URL}/`,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  silent_redirect_uri: `${APP_URL}/auth/silent-renew.html`,
} as const;
