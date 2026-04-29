/**
 * Fixed-capacity ring buffer for Float32 PCM samples.
 * Used to retain a rolling window of audio for VAD lookback + chunk emission.
 */
export class RingBuffer {
  private readonly buf: Float32Array;
  private writePos = 0;
  private filled = 0;

  constructor(public readonly capacity: number) {
    this.buf = new Float32Array(capacity);
  }

  write(input: Float32Array): void {
    for (let i = 0; i < input.length; i++) {
      this.buf[this.writePos] = input[i] ?? 0;
      this.writePos = (this.writePos + 1) % this.capacity;
    }
    this.filled = Math.min(this.capacity, this.filled + input.length);
  }

  /** Snapshot the most recent `n` samples, oldest-first. */
  tail(n: number): Float32Array {
    const len = Math.min(n, this.filled);
    const out = new Float32Array(len);
    let pos = (this.writePos - len + this.capacity) % this.capacity;
    for (let i = 0; i < len; i++) {
      out[i] = this.buf[pos] ?? 0;
      pos = (pos + 1) % this.capacity;
    }
    return out;
  }

  get size(): number {
    return this.filled;
  }

  clear(): void {
    this.writePos = 0;
    this.filled = 0;
  }
}
