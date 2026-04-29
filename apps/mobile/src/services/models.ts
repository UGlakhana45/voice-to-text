import * as FileSystem from 'expo-file-system';
import { Whisper } from '../native/Whisper';
import { Llm } from '../native/Llm';

export type ModelKind = 'whisper' | 'llm';

export interface ModelDescriptor {
  kind: ModelKind;
  id: string;
  filename: string;
  url: string;
  /** Approximate size for progress UI */
  sizeBytes: number;
}

/**
 * Default model catalog. Mobile downloads these on first launch into the app's
 * private documents directory; nothing ships in the bundle.
 */
export const DEFAULT_MODELS: Record<ModelKind, ModelDescriptor> = {
  whisper: {
    kind: 'whisper',
    id: 'whisper-base',
    filename: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    sizeBytes: 147_964_211,
  },
  llm: {
    kind: 'llm',
    id: 'gemma-2-2b-it-q4',
    filename: 'gemma-2-2b-it-q4.gguf',
    // NOTE: substitute with a publicly downloadable mirror or expose as setting
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_708_563_584,
  },
};

const MODELS_DIR = `${FileSystem.documentDirectory}models/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
}

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

export async function getModelPath(kind: ModelKind): Promise<string> {
  await ensureDir();
  return `${MODELS_DIR}${DEFAULT_MODELS[kind].filename}`;
}

export async function isModelDownloaded(kind: ModelKind): Promise<boolean> {
  const p = await getModelPath(kind);
  const info = await FileSystem.getInfoAsync(p);
  return info.exists && (info.size ?? 0) > 1024;
}

export async function downloadModel(
  kind: ModelKind,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  await ensureDir();
  const desc = DEFAULT_MODELS[kind];
  const dst = await getModelPath(kind);

  if (await isModelDownloaded(kind)) return dst;

  const tmp = `${dst}.part`;
  const dl = FileSystem.createDownloadResumable(desc.url, tmp, {}, (p) => onProgress?.(p));
  const res = await dl.downloadAsync();
  if (!res?.uri) throw new Error('Download failed');
  await FileSystem.moveAsync({ from: tmp, to: dst });
  return dst;
}

export async function ensureWhisperLoaded() {
  if (await Whisper.isLoaded()) return;
  const path = await downloadModel('whisper');
  await Whisper.loadModel(path);
}

export async function ensureLlmLoaded() {
  if (await Llm.isLoaded()) return;
  const path = await downloadModel('llm');
  await Llm.loadModel(path);
}

export async function deleteModel(kind: ModelKind): Promise<void> {
  const p = await getModelPath(kind);
  const info = await FileSystem.getInfoAsync(p);
  if (info.exists) await FileSystem.deleteAsync(p, { idempotent: true });
}
