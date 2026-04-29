import { SAMPLE_RATE, type AudioChunk } from './index.js';
import { EnergyVad } from './vad.js';

export interface ChunkerOptions {
  /** Target chunk length in ms when speaking continuously */
  maxChunkMs?: number;
  /** Minimum chunk length (avoid emitting tiny fragments) */
  minChunkMs?: number;
  /** Silence in ms that flushes the current chunk */
  flushOnSilenceMs?: number;
}

/**
 * Streams arbitrarily-sized PCM frames in, emits speech-aligned chunks ready
 * for Whisper inference. Uses VAD to align cuts on natural pauses.
 */
export class Chunker {
  private readonly maxSamples: number;
  private readonly minSamples: number;
  private readonly flushSilenceMs: number;
  private readonly vad = new EnergyVad();
  private buffer: number[] = [];
  private startMs = 0;
  private elapsedMs = 0;
  private silenceMs = 0;

  constructor(opts: ChunkerOptions = {}) {
    const max = opts.maxChunkMs ?? 8000;
    const min = opts.minChunkMs ?? 800;
    this.maxSamples = Math.floor((max / 1000) * SAMPLE_RATE);
    this.minSamples = Math.floor((min / 1000) * SAMPLE_RATE);
    this.flushSilenceMs = opts.flushOnSilenceMs ?? 600;
  }

  /** Push samples; receive zero or more emitted chunks. */
  push(samples: Float32Array): AudioChunk[] {
    const out: AudioChunk[] = [];
    const state = this.vad.feed(samples);
    const frameMs = (samples.length / SAMPLE_RATE) * 1000;

    for (let i = 0; i < samples.length; i++) this.buffer.push(samples[i] ?? 0);
    this.elapsedMs += frameMs;
    this.silenceMs = state === 'silent' ? this.silenceMs + frameMs : 0;

    const shouldFlushOnSize = this.buffer.length >= this.maxSamples;
    const shouldFlushOnSilence =
      this.silenceMs >= this.flushSilenceMs && this.buffer.length >= this.minSamples;

    if (shouldFlushOnSize || shouldFlushOnSilence) {
      out.push(this.flush());
    }
    return out;
  }

  /** Force-flush whatever is buffered (e.g. on stop). */
  flush(): AudioChunk {
    const chunk: AudioChunk = {
      samples: Float32Array.from(this.buffer),
      startMs: this.startMs,
      durationMs: this.elapsedMs,
    };
    this.startMs += this.elapsedMs;
    this.buffer = [];
    this.elapsedMs = 0;
    this.silenceMs = 0;
    return chunk;
  }

  reset(): void {
    this.buffer = [];
    this.startMs = 0;
    this.elapsedMs = 0;
    this.silenceMs = 0;
    this.vad.reset();
  }
}
