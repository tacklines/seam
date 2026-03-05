import { UserManager, type User } from 'oidc-client-ts';
import { AUTH_CONFIG } from '../lib/auth-config.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  error: string | null;
}

export type AuthStateEvent =
  | { type: 'auth-loading' }
  | { type: 'auth-success'; user: AuthUser }
  | { type: 'auth-logout' }
  | { type: 'auth-error'; error: string };

type Listener = (event: AuthStateEvent) => void;

class AuthStore {
  private state: AuthState = {
    isAuthenticated: false,
    isLoading: true,
    user: null,
    accessToken: null,
    error: null,
  };

  private listeners = new Set<Listener>();
  private userManager: UserManager;

  constructor() {
    this.userManager = new UserManager({
      authority: AUTH_CONFIG.authority,
      client_id: AUTH_CONFIG.client_id,
      redirect_uri: AUTH_CONFIG.redirect_uri,
      post_logout_redirect_uri: AUTH_CONFIG.post_logout_redirect_uri,
      response_type: AUTH_CONFIG.response_type,
      scope: AUTH_CONFIG.scope,
      automaticSilentRenew: AUTH_CONFIG.automaticSilentRenew,
      silent_redirect_uri: AUTH_CONFIG.silent_redirect_uri,
    });

    this.userManager.events.addUserLoaded((user: User) => {
      this.setUser(user);
    });

    this.userManager.events.addUserUnloaded(() => {
      this.clearUser();
    });

    this.userManager.events.addSilentRenewError(() => {
      this.clearUser();
    });

    this.userManager.events.addAccessTokenExpired(() => {
      this.clearUser();
    });
  }

  get(): AuthState {
    return this.state;
  }

  get user(): AuthUser | null {
    return this.state.user;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(event: AuthStateEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  private setUser(user: User): void {
    const authUser: AuthUser = {
      id: user.profile.sub,
      name: user.profile.preferred_username ?? user.profile.name ?? 'Unknown',
      email: user.profile.email ?? '',
    };
    this.state = {
      isAuthenticated: true,
      isLoading: false,
      user: authUser,
      accessToken: user.access_token,
      error: null,
    };
    this.notify({ type: 'auth-success', user: authUser });
  }

  private clearUser(): void {
    this.state = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      error: null,
    };
    this.notify({ type: 'auth-logout' });
  }

  async login(): Promise<void> {
    try {
      await this.userManager.signinRedirect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      this.state = { ...this.state, error: message, isLoading: false };
      this.notify({ type: 'auth-error', error: message });
    }
  }

  async handleCallback(): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true };
      this.notify({ type: 'auth-loading' });
      const user = await this.userManager.signinRedirectCallback();
      this.setUser(user);
      window.history.replaceState({}, '', '/' + window.location.hash);
    } catch (err) {
      // Stale OIDC state (e.g. authority changed) — clear and restart
      await this.userManager.removeUser();
      await this.userManager.clearStaleState();
      this.clearUser();
      window.history.replaceState({}, '', '/');
    }
  }

  async initialize(): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true };
      this.notify({ type: 'auth-loading' });
      const user = await this.userManager.getUser();
      if (user && !user.expired) {
        this.setUser(user);
      } else {
        this.clearUser();
      }
    } catch {
      // Stale OIDC state (e.g. authority changed) — clear and restart
      await this.userManager.removeUser();
      await this.userManager.clearStaleState();
      this.clearUser();
    }
  }

  async logout(): Promise<void> {
    try {
      await this.userManager.signoutRedirect();
    } catch {
      await this.userManager.removeUser();
      this.clearUser();
    }
  }

  getAccessToken(): string | null {
    return this.state.accessToken;
  }
}

export const authStore = new AuthStore();
