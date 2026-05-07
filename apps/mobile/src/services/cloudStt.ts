import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from '../config';
import { useAuth } from './auth';

const API_KEY_STORAGE_KEY = 'openai_api_key';
const USE_CLOUD_STT_KEY = 'use_cloud_stt';
const PROVIDER_KEY = 'cloud_stt_provider';
const ROUTE_KEY = 'cloud_stt_route'; // 'proxy' | 'direct'
const MODE_KEY = 'transcription_mode'; // 'cloud' | 'on-device' | 'hybrid'

export type CloudProvider = 'openai' | 'groq';
export type CloudRoute = 'proxy' | 'direct';
/**
 * How dictation should run:
 *  - 'cloud'     : always cloud, no on-device models needed (smallest install)
 *  - 'on-device' : never cloud, download Whisper (and optionally Gemma)
 *  - 'hybrid'    : prefer cloud, fall back to on-device if cloud fails
 */
export type TranscriptionMode = 'cloud' | 'on-device' | 'hybrid';

const PROVIDER_CONFIG: Record<CloudProvider, { url: string; model: string; label: string }> = {
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    label: 'OpenAI',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    label: 'Groq (free)',
  },
};

export interface CloudSttOptions {
  language?: string;
  prompt?: string;
  /** When true, ask the provider to translate to English (uses the
   *  /audio/translations endpoint). For other target languages, use
   *  `cloudStt.translate(text, targetLanguage)` after transcription. */
  translate?: boolean;
}

// Convert Float32Array PCM to base64-encoded WAV
function float32ToWavBase64(samples: Float32Array, sampleRate: number): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  // btoa is available in RN
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).btoa(binary);
}

class CloudSttService {
  async getApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  async setApiKey(key: string): Promise<void> {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
  }

  async removeApiKey(): Promise<void> {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  }

  async isCloudEnabled(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync(USE_CLOUD_STT_KEY);
      return value === 'true';
    } catch {
      return false;
    }
  }

  async setCloudEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(USE_CLOUD_STT_KEY, enabled ? 'true' : 'false');
  }

  async getProvider(): Promise<CloudProvider> {
    try {
      const v = await SecureStore.getItemAsync(PROVIDER_KEY);
      return v === 'groq' ? 'groq' : 'openai';
    } catch {
      return 'openai';
    }
  }

  async setProvider(provider: CloudProvider): Promise<void> {
    await SecureStore.setItemAsync(PROVIDER_KEY, provider);
  }

  /** How cloud calls should be routed:
   *  - 'proxy'  : through the VoiceFlow backend (uses signed-in JWT, server's key)
   *  - 'direct' : straight from device to OpenAI/Groq (uses the user's BYO key) */
  async getRoute(): Promise<CloudRoute> {
    try {
      const v = await SecureStore.getItemAsync(ROUTE_KEY);
      return v === 'direct' ? 'direct' : 'proxy';
    } catch {
      return 'proxy';
    }
  }

  async setRoute(route: CloudRoute): Promise<void> {
    await SecureStore.setItemAsync(ROUTE_KEY, route);
  }

  /** Returns the active transcription mode, or `null` if the user has not picked yet. */
  async getMode(): Promise<TranscriptionMode | null> {
    try {
      const v = await SecureStore.getItemAsync(MODE_KEY);
      if (v === 'cloud' || v === 'on-device' || v === 'hybrid') return v;
      return null;
    } catch {
      return null;
    }
  }

  /** Persist the mode and keep `isCloudEnabled()` in sync so existing call-sites
   *  (`useDictation`, `polish`) automatically pick the right path. */
  async setMode(mode: TranscriptionMode): Promise<void> {
    await SecureStore.setItemAsync(MODE_KEY, mode);
    await this.setCloudEnabled(mode !== 'on-device');
  }

  async transcribePcm(
    samples: Float32Array,
    sampleRate: number,
    options?: CloudSttOptions,
  ): Promise<string> {
    const fileUri = await this.writePcmToWavFile(samples, sampleRate);
    const route = await this.getRoute();
    if (route === 'proxy') return this.transcribeViaProxy(fileUri, options);
    return this.transcribeDirect(fileUri, options);
  }

  /** Translate text to the given language via the backend proxy. */
  async translate(text: string, targetLanguage: string, tone?: string): Promise<string> {
    const token = useAuth.getState().token;
    if (!token) throw new Error('Not signed in');
    const resp = await fetch(`${API_BASE_URL}/ai/translate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, targetLanguage, tone }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Translate proxy error ${resp.status}: ${body}`);
    }
    const data = (await resp.json()) as { text?: string };
    return data.text ?? '';
  }

  /** Polish/cleanup transcript via the backend proxy (replaces local Gemma when in cloud mode). */
  async cleanup(text: string, tone?: string): Promise<string> {
    const token = useAuth.getState().token;
    if (!token) throw new Error('Not signed in');
    const resp = await fetch(`${API_BASE_URL}/ai/cleanup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, tone }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Cleanup proxy error ${resp.status}: ${body}`);
    }
    const data = (await resp.json()) as { text?: string };
    return data.text ?? '';
  }

  // ---------- internals ----------

  private async writePcmToWavFile(samples: Float32Array, sampleRate: number): Promise<string> {
    const base64 = float32ToWavBase64(samples, sampleRate);
    const fileUri = `${FileSystem.cacheDirectory}voiceflow_recording.wav`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  }

  private async transcribeDirect(fileUri: string, options?: CloudSttOptions): Promise<string> {
    const apiKey = await this.getApiKey();
    const provider = await this.getProvider();
    const config = PROVIDER_CONFIG[provider];
    if (!apiKey) throw new Error(`${config.label} API key not configured`);

    const url = options?.translate
      ? config.url.replace('/transcriptions', '/translations')
      : config.url;

    const formData = new FormData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append('file', { uri: fileUri, type: 'audio/wav', name: 'audio.wav' } as any);
    formData.append('model', config.model);
    if (options?.language && !options.translate) formData.append('language', options.language);
    if (options?.prompt) formData.append('prompt', options.prompt);

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${config.label} API error: ${response.status} - ${error}`);
    }
    const data = await response.json();
    return data.text || '';
  }

  private async transcribeViaProxy(fileUri: string, options?: CloudSttOptions): Promise<string> {
    const token = useAuth.getState().token;
    if (!token) throw new Error('Not signed in — sign in or switch to direct mode');

    const formData = new FormData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append('file', { uri: fileUri, type: 'audio/wav', name: 'audio.wav' } as any);
    if (options?.language) formData.append('language', options.language);
    if (options?.prompt) formData.append('prompt', options.prompt);
    if (options?.translate) formData.append('translate', 'true');

    const response = await fetch(`${API_BASE_URL}/ai/stt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`STT proxy error ${response.status}: ${body}`);
    }
    const data = (await response.json()) as { text?: string };
    return data.text ?? '';
  }
}

export const cloudStt = new CloudSttService();
