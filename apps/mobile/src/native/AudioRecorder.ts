import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * Bridge to the native audio recorder. Streams 16 kHz mono PCM (Float32) frames
 * to JS via the "VoiceFlowAudio" event emitter, and optionally writes the same
 * samples straight to a WAV file on disk so cloud uploads can skip the
 * base64-in-JS round-trip entirely.
 *
 * Implemented natively (Kotlin on Android, Swift on iOS) to avoid the latency
 * and memory overhead of Expo's high-level WAV-file capture path.
 */

export interface AudioFrameEvent {
  /** Float32 PCM samples in [-1, 1], 16 kHz mono */
  samples: number[];
  /** Monotonic timestamp ms since start() */
  timestampMs: number;
}

export interface AudioStartOptions {
  /**
   * When true, the native recorder also writes the captured PCM straight to a
   * temp WAV file (`stop()` resolves with its `file://` URI). When false or
   * omitted, only `frame` events are emitted (legacy on-device behaviour).
   */
  recordToFile?: boolean;
}

export interface AudioStopResult {
  /** `file://` URI of the WAV file when `recordToFile` was set, else null. */
  fileUri: string | null;
  /** Total recording duration in milliseconds. */
  durationMs: number;
}

interface AudioNativeSpec {
  start(options: AudioStartOptions): Promise<void>;
  stop(): Promise<AudioStopResult | null>;
  isRecording(): Promise<boolean>;
}

const native = (NativeModules as Record<string, unknown>).VoiceFlowAudio as
  | AudioNativeSpec
  | undefined;

const EMPTY_STOP: AudioStopResult = { fileUri: null, durationMs: 0 };

export const AudioRecorder = {
  start: (options: AudioStartOptions = {}) =>
    native?.start(options) ??
    Promise.reject(new Error('VoiceFlowAudio not linked. Run a dev build.')),
  /**
   * Always resolves; returns an `AudioStopResult` so callers can pick up the
   * WAV file URI in one round-trip. Falls back to a zeroed result when the
   * native module isn't linked or returned `null` (legacy iOS path).
   */
  stop: async (): Promise<AudioStopResult> => {
    if (!native) return EMPTY_STOP;
    const res = await native.stop();
    return res ?? EMPTY_STOP;
  },
  isRecording: () => native?.isRecording() ?? Promise.resolve(false),
};

export const AudioEvents = new NativeEventEmitter(
  (native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]) ?? undefined,
);
