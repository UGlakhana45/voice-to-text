import { z } from 'zod';

// ---------- Auth ----------
export const SignupRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80).optional(),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const LoginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  token: string;
  refreshToken: string;
}

// ---------- Domain ----------
export type ToneMode = 'neutral' | 'casual' | 'formal' | 'email' | 'slack' | 'notes';
export type ModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export interface UserSettings {
  preferredLanguage: string;
  defaultTone: ToneMode;
  modelSize: ModelSize;
  cleanupEnabled: boolean;
  themeMode: 'light' | 'dark' | 'system';
  telemetryEnabled: boolean;
}

export interface Dictation {
  id: string;
  rawText: string;
  cleanedText: string | null;
  language: string | null;
  durationMs: number;
  tone: ToneMode | null;
  createdAt: string;
}

export interface VocabItem {
  id: string;
  term: string;
  weight: number;
}

export interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}

// ---------- Sync ----------
export interface SyncPullResponse {
  vocab: VocabItem[];
  snippets: Snippet[];
  dictations: Dictation[];
  settings: UserSettings | null;
  ts: number;
}

export interface SyncPushBody {
  vocab?: { term: string; weight: number }[];
  snippets?: { trigger: string; expansion: string }[];
  dictations?: Omit<Dictation, 'id' | 'createdAt'>[];
}

export interface SyncPushResponse {
  ok: boolean;
  ts: number;
  /** Server-generated IDs for inserted dictations, in the same order as the request. */
  dictationIds: string[];
}

export interface DictationPatch {
  cleanedText?: string | null;
  tone?: ToneMode | null;
  language?: string | null;
}

// ---------- Settings ----------
export interface UserSettingsPatch {
  preferredLanguage?: string;
  defaultTone?: ToneMode;
  modelSize?: ModelSize;
  cleanupEnabled?: boolean;
  themeMode?: 'light' | 'dark' | 'system';
  telemetryEnabled?: boolean;
}

// ---------- Uploads ----------
export interface PresignedUploadResponse {
  url: string;
  key: string;
  expiresIn: number;
}

export interface PresignedDownloadResponse {
  url: string;
  expiresIn: number;
}
