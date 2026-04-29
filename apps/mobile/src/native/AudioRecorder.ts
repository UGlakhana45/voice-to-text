import { NativeEventEmitter, NativeModules } from 'react-native';

/**
 * Bridge to the native audio recorder. Streams 16 kHz mono PCM (Float32) frames
 * to JS via "VoiceFlowAudio" event emitter. Implemented natively to avoid the
 * latency of Expo's WAV-file capture path.
 */

export interface AudioFrameEvent {
  /** Float32 PCM samples in [-1, 1], 16 kHz mono */
  samples: number[];
  /** Monotonic timestamp ms since start() */
  timestampMs: number;
}

interface AudioNativeSpec {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRecording(): Promise<boolean>;
}

const native = (NativeModules as Record<string, unknown>).VoiceFlowAudio as
  | AudioNativeSpec
  | undefined;

export const AudioRecorder: AudioNativeSpec = {
  start: () =>
    native?.start() ??
    Promise.reject(new Error('VoiceFlowAudio not linked. Run a dev build.')),
  stop: () => native?.stop() ?? Promise.resolve(),
  isRecording: () => native?.isRecording() ?? Promise.resolve(false),
};

export const AudioEvents = new NativeEventEmitter(
  (native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]) ?? undefined,
);
