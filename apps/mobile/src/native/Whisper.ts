import { NativeModules } from 'react-native';

/**
 * Bridge to the native Whisper inference module.
 *
 * - Android: implemented via JNI binding to whisper.cpp in
 *   `android/whisper-jni/`. Registered as a TurboModule named "VoiceFlowWhisper".
 * - iOS: implemented in `ios/WhisperBridge/` using whisper.cpp + Core ML.
 *
 * Phase-1 stub: if the native module is unavailable (e.g. running in Expo Go
 * without a custom dev client), all methods reject with a clear error so the
 * JS layer can degrade gracefully (e.g. show "install dev build" hint).
 */

export interface WhisperTranscribeOptions {
  language?: string; // ISO 639-1 or "auto"
  initialPrompt?: string; // hotword biasing
  translate?: boolean; // translate to English
}

export interface WhisperResult {
  text: string;
  language: string;
  durationMs: number;
}

interface WhisperNativeSpec {
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): Promise<void>;
  transcribePcm(samples: number[], opts: WhisperTranscribeOptions): Promise<WhisperResult>;
  isLoaded(): Promise<boolean>;
}

const native = (NativeModules as Record<string, unknown>).VoiceFlowWhisper as
  | WhisperNativeSpec
  | undefined;

function unavailable<T>(method: string): Promise<T> {
  return Promise.reject(
    new Error(
      `VoiceFlowWhisper native module not linked. Method "${method}" requires a dev build (run "expo run:android" / "expo run:ios").`,
    ),
  );
}

export const Whisper: WhisperNativeSpec = {
  loadModel: (p) => native?.loadModel(p) ?? unavailable('loadModel'),
  unloadModel: () => native?.unloadModel() ?? unavailable('unloadModel'),
  transcribePcm: (s, o) => native?.transcribePcm(s, o) ?? unavailable('transcribePcm'),
  isLoaded: () => native?.isLoaded() ?? Promise.resolve(false),
};
