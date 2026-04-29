import { NativeModules } from 'react-native';

/**
 * Bridge to the on-device LLM cleanup module (llama.cpp + Gemma-2B / Phi-3-mini).
 * Same fallback pattern as Whisper.ts.
 */

export type ToneMode = 'neutral' | 'casual' | 'formal' | 'email' | 'slack' | 'notes';

export interface CleanupOptions {
  tone: ToneMode;
  maxTokens?: number;
}

interface LlmNativeSpec {
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): Promise<void>;
  cleanup(rawText: string, opts: CleanupOptions): Promise<string>;
  isLoaded(): Promise<boolean>;
}

const native = (NativeModules as Record<string, unknown>).VoiceFlowLlm as LlmNativeSpec | undefined;

function unavailable<T>(method: string): Promise<T> {
  return Promise.reject(new Error(`VoiceFlowLlm native module not linked. Method "${method}" requires a dev build.`));
}

export const Llm: LlmNativeSpec = {
  loadModel: (p) => native?.loadModel(p) ?? unavailable('loadModel'),
  unloadModel: () => native?.unloadModel() ?? unavailable('unloadModel'),
  cleanup: (t, o) => native?.cleanup(t, o) ?? unavailable('cleanup'),
  isLoaded: () => native?.isLoaded() ?? Promise.resolve(false),
};
