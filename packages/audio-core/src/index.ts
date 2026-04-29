// Audio pipeline primitives shared between Android/iOS via the JS bridge.
// All processing here is on raw 16 kHz mono PCM (Float32Array or Int16Array).

export const SAMPLE_RATE = 16000;

export interface AudioChunk {
  /** PCM samples, mono, 16 kHz */
  samples: Float32Array;
  /** Monotonic timestamp in ms relative to recording start */
  startMs: number;
  /** Duration in ms */
  durationMs: number;
}

export * from './ringBuffer.js';
export * from './vad.js';
export * from './chunker.js';
