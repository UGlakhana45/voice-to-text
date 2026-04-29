import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { VoiceFlowClient } from 'voiceflow-sdk-client';
import type { AuthUser } from 'voiceflow-shared-types';
import { API_BASE_URL } from '../config';

const KEY_TOKEN = 'voiceflow.token';
const KEY_REFRESH = 'voiceflow.refreshToken';
const KEY_USER = 'voiceflow.user';

interface AuthStore {
  hydrated: boolean;
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  signedIn: boolean;

  hydrate: () => Promise<void>;
  setSession: (s: { token: string; refreshToken: string; user?: AuthUser }) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set, get) => ({
  hydrated: false,
  token: null,
  refreshToken: null,
  user: null,
  signedIn: false,

  hydrate: async () => {
    const [token, refreshToken, userStr] = await Promise.all([
      SecureStore.getItemAsync(KEY_TOKEN),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_USER),
    ]);
    const user = userStr ? (JSON.parse(userStr) as AuthUser) : null;
    set({
      hydrated: true,
      token,
      refreshToken,
      user,
      signedIn: Boolean(token && refreshToken),
    });
  },

  setSession: async ({ token, refreshToken, user }) => {
    const merged = user ?? get().user;
    await Promise.all([
      SecureStore.setItemAsync(KEY_TOKEN, token),
      SecureStore.setItemAsync(KEY_REFRESH, refreshToken),
      merged ? SecureStore.setItemAsync(KEY_USER, JSON.stringify(merged)) : Promise.resolve(),
    ]);
    set({ token, refreshToken, user: merged ?? null, signedIn: true });
  },

  clear: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_TOKEN),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_USER),
    ]);
    set({ token: null, refreshToken: null, user: null, signedIn: false });
  },
}));

/**
 * The shared API client. Reads tokens directly from the store and persists
 * rotated tokens automatically when the SDK auto-refreshes on 401.
 */
export const api = new VoiceFlowClient({
  baseUrl: API_BASE_URL,
  getToken: () => useAuth.getState().token,
  getRefreshToken: () => useAuth.getState().refreshToken,
  onTokensRefreshed: async ({ token, refreshToken }) => {
    await useAuth.getState().setSession({ token, refreshToken });
  },
  onAuthExpired: async () => {
    await useAuth.getState().clear();
  },
});
