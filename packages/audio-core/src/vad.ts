/**
 * Lightweight energy-based Voice Activity Detector.
 *
 * Phase-1 stub: pure RMS gating with hysteresis.
 * Phase-2 will swap this for a Silero VAD model running natively (whisper.cpp
 * already vendors a small VAD; native module exposes it via the JS bridge).
 */

export interface VadOptions {
  /** RMS threshold above which a frame is considered speech (0..1) */
  threshold?: number;
  /** ms of speech required before transitioning to "speaking" */
  minSpeechMs?: number;
  /** ms of silence required before transitioning to "silent" */
  minSilenceMs?: number;
  /** sample rate */
  sampleRate?: number;
}

export type VadState = 'silent' | 'speaking';

export class EnergyVad {
  private state: VadState = 'silent';
  private runMs = 0;
  private readonly threshold: number;
  private readonly minSpeechMs: number;
  private readonly minSilenceMs: number;
  private readonly sampleRate: number;

  constructor(opts: VadOptions = {}) {
    this.threshold = opts.threshold ?? 0.015;
    this.minSpeechMs = opts.minSpeechMs ?? 150;
    this.minSilenceMs = opts.minSilenceMs ?? 600;
    this.sampleRate = opts.sampleRate ?? 16000;
  }

  /** Feed a frame; returns the (possibly new) state. */
  feed(samples: Float32Array): VadState {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    const frameMs = (samples.length / this.sampleRate) * 1000;
    const isSpeech = rms > this.threshold;

    if (this.state === 'silent') {
      if (isSpeech) {
        this.runMs += frameMs;
        if (this.runMs >= this.minSpeechMs) {
          this.state = 'speaking';
          this.runMs = 0;
        }
      } else {
        this.runMs = 0;
      }
    } else {
      if (!isSpeech) {
        this.runMs += frameMs;
        if (this.runMs >= this.minSilenceMs) {
          this.state = 'silent';
          this.runMs = 0;
        }
      } else {
        this.runMs = 0;
      }
    }
    return this.state;
  }

  reset(): void {
    this.state = 'silent';
    this.runMs = 0;
  }

  current(): VadState {
    return this.state;
  }
}
