import type {
  AuthResponse,
  AuthUser,
  Dictation,
  DictationPatch,
  LoginRequest,
  PresignedDownloadResponse,
  PresignedUploadResponse,
  RefreshResponse,
  SignupRequest,
  SyncPullResponse,
  SyncPushBody,
  SyncPushResponse,
  UserSettings,
  UserSettingsPatch,
} from 'voiceflow-shared-types';

export interface VoiceFlowClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null if not signed in. */
  getToken?: () => string | null | Promise<string | null>;
  /** Returns the current refresh token; required for auto-refresh on 401. */
  getRefreshToken?: () => string | null | Promise<string | null>;
  /** Called when a refresh succeeds; persist the new tokens. */
  onTokensRefreshed?: (tokens: { token: string; refreshToken: string }) => void | Promise<void>;
  /** Called when refresh fails (e.g. revoked); typically logs the user out. */
  onAuthExpired?: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export class VoiceFlowClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null | Promise<string | null>;
  private readonly getRefreshToken: () => string | null | Promise<string | null>;
  private readonly onTokensRefreshed?: (t: { token: string; refreshToken: string }) => void | Promise<void>;
  private readonly onAuthExpired?: () => void | Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private refreshInflight: Promise<string | null> | null = null;

  constructor(opts: VoiceFlowClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.getToken = opts.getToken ?? (() => null);
    this.getRefreshToken = opts.getRefreshToken ?? (() => null);
    this.onTokensRefreshed = opts.onTokensRefreshed;
    this.onAuthExpired = opts.onAuthExpired;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async tryRefresh(): Promise<string | null> {
    if (this.refreshInflight) return this.refreshInflight;
    this.refreshInflight = (async () => {
      const rt = await this.getRefreshToken();
      if (!rt) return null;
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          await this.onAuthExpired?.();
          return null;
        }
        const data = (await res.json()) as RefreshResponse;
        await this.onTokensRefreshed?.(data);
        return data.token;
      } catch {
        return null;
      }
    })();
    const result = await this.refreshInflight;
    this.refreshInflight = null;
    return result;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    opts: { skipAuth?: boolean; retried?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
    if (!opts.skipAuth) {
      const token = await this.getToken();
      if (token) headers.set('authorization', `Bearer ${token}`);
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && !opts.retried && !opts.skipAuth) {
      const newToken = await this.tryRefresh();
      if (newToken) return this.request<T>(path, init, { ...opts, retried: true });
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[${res.status}] ${body || res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ---- auth ----
  signup(body: SignupRequest): Promise<AuthResponse> {
    return this.request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }, { skipAuth: true });
  }

  login(body: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(body) }, { skipAuth: true });
  }

  refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.request(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
      { skipAuth: true },
    );
  }

  logout(refreshToken?: string): Promise<void> {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
  }

  me(): Promise<AuthUser> {
    return this.request('/auth/me');
  }

  // ---- sync ----
  pull(since?: number): Promise<SyncPullResponse> {
    const q = since ? `?since=${since}` : '';
    return this.request(`/sync/pull${q}`);
  }

  push(body: SyncPushBody): Promise<SyncPushResponse> {
    return this.request('/sync/push', { method: 'POST', body: JSON.stringify(body) });
  }

  patchDictation(id: string, patch: DictationPatch): Promise<Dictation> {
    return this.request(`/sync/dictations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  patchSettings(patch: UserSettingsPatch): Promise<UserSettings> {
    return this.request('/sync/settings', { method: 'PATCH', body: JSON.stringify(patch) });
  }

  deleteVocab(id: string): Promise<{ ok: boolean }> {
    return this.request(`/sync/vocab/${id}`, { method: 'DELETE' });
  }

  deleteSnippet(id: string): Promise<{ ok: boolean }> {
    return this.request(`/sync/snippets/${id}`, { method: 'DELETE' });
  }

  deleteDictation(id: string): Promise<{ ok: boolean }> {
    return this.request(`/sync/dictations/${id}`, { method: 'DELETE' });
  }

  // ---- uploads ----
  audioUploadUrl(dictationId: string, contentType = 'audio/wav'): Promise<PresignedUploadResponse> {
    return this.request('/uploads/audio-url', {
      method: 'POST',
      body: JSON.stringify({ dictationId, contentType }),
    });
  }

  audioDownloadUrl(dictationId: string): Promise<PresignedDownloadResponse> {
    return this.request(`/uploads/audio-url/${dictationId}`);
  }

  // ---- health ----
  health(): Promise<{ status: string }> {
    return this.request('/health', {}, { skipAuth: true });
  }
}
