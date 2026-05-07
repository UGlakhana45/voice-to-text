import { create } from 'zustand';
import { useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import { Whisper } from '../../native/Whisper';
import { Llm } from '../../native/Llm';
import { AudioRecorder, AudioEvents, type AudioFrameEvent } from '../../native/AudioRecorder';
import { Chunker } from 'voiceflow-audio-core';
import {
  applyCommandOps,
  basicPunctuate,
  buildInitialPrompt,
  expandSnippets,
  fallbackCleanup,
  parseCommands,
} from 'voiceflow-postprocess';
import { historyActions } from '../history/useHistory';
import { useSettingsStore } from '../settings/useSettings';
import { userDataActions } from '../userdata/useUserData';
import { enqueueDictation } from '../../services/outbox';
import { track } from '../../services/telemetry';
import { ensureLlmLoaded, ensureWhisperLoaded } from '../../services/models';
import { cloudStt } from '../../services/cloudStt';

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'cleaning' | 'error';

const SAMPLE_RATE = 16_000;
const SILENCE_RMS_THRESHOLD = 0.012;
const SILENCE_TIMEOUT_MS = 3_000;
const MIN_RECORD_MS = 800;

interface DictationStore {
  state: DictationState;
  transcript: string;
  cleaned: string | null;
  errorMessage: string | null;
  serverId: string | null;
  setState: (s: DictationState) => void;
  setTranscript: (t: string) => void;
  setCleaned: (c: string | null) => void;
  setError: (m: string | null) => void;
  setServerId: (id: string | null) => void;
  reset: () => void;
}

/**
 * Live audio metering, kept in its own store so the waveform UI can subscribe
 * at high frequency without re-rendering the rest of the screen.
 */
interface MeterStore {
  /** Recent RMS values, oldest first. Capped at WAVEFORM_BARS samples. */
  levels: number[];
  /** Wall-clock time of the most recent `frame` event, used to fade old bars. */
  updatedAt: number;
  pushLevel: (rms: number) => void;
  reset: () => void;
}

export const WAVEFORM_BARS = 28;

export const useMeter = create<MeterStore>((set) => ({
  levels: [],
  updatedAt: 0,
  pushLevel: (rms) =>
    set((s) => {
      const next = s.levels.length >= WAVEFORM_BARS
        ? s.levels.slice(1)
        : s.levels.slice();
      next.push(rms);
      return { levels: next, updatedAt: Date.now() };
    }),
  reset: () => set({ levels: [], updatedAt: 0 }),
}));

function publishLevel(rms: number) {
  useMeter.getState().pushLevel(rms);
}

const useStore = create<DictationStore>((set) => ({
  state: 'idle',
  transcript: '',
  cleaned: null,
  errorMessage: null,
  serverId: null,
  setState: (state) => set({ state }),
  setTranscript: (transcript) => set({ transcript }),
  setCleaned: (cleaned) => set({ cleaned }),
  setError: (errorMessage) => set({ errorMessage, state: 'error' }),
  setServerId: (serverId) => set({ serverId }),
  reset: () =>
    set({ state: 'idle', transcript: '', cleaned: null, errorMessage: null, serverId: null }),
}));

let chunker: Chunker | null = null;
let frameSub: { remove: () => void } | null = null;
let recordStartedAt = 0;
/**
 * Holds Float32 PCM frames during recording in **on-device mode only**. In
 * cloud / hybrid mode the native audio module streams the WAV directly to a
 * temp file (see `AudioRecorder.start({recordToFile:true})`), so this stays
 * empty and we no longer risk OOM on long recordings.
 */
let audioBuffers: Float32Array[] = [];
/** WAV file URI returned by the native recorder when `recordToFile` was used. */
let lastWavFileUri: string | null = null;
let lastVoiceAt = 0;
let silenceTimer: ReturnType<typeof setInterval> | null = null;
let stopRequested = false;

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

function concatBuffers(buffers: Float32Array[]): Float32Array {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

async function transcribeLocal(prompt: string): Promise<string> {
  await ensureWhisperLoaded();
  // On-device mode: drain the streaming Chunker for the tail samples.
  if (chunker) {
    const final = chunker.flush();
    if (final.samples.length === 0) return useStore.getState().transcript;
    const res = await Whisper.transcribePcm(Array.from(final.samples), {
      language: 'auto',
      initialPrompt: prompt || undefined,
    });
    return (useStore.getState().transcript + ' ' + res.text).trim();
  }
  // Hybrid-mode fallback: no chunker, but we kept the PCM buffers for exactly
  // this case. Transcribe the whole recording in one Whisper call.
  const combined = concatBuffers(audioBuffers);
  if (combined.length === 0) return useStore.getState().transcript;
  const res = await Whisper.transcribePcm(Array.from(combined), {
    language: 'auto',
    initialPrompt: prompt || undefined,
  });
  return res.text.trim();
}

async function transcribeCloud(prompt: string): Promise<string> {
  // Preferred path: the native recorder streamed PCM straight to a WAV file,
  // so we just upload the file URI without round-tripping audio through JS.
  if (lastWavFileUri) {
    return cloudStt.transcribeWavFile(lastWavFileUri, { language: 'en', prompt });
  }
  // Fallback for the unusual case where no WAV file was produced (e.g. native
  // module out of sync). Reconstructs the upload from JS buffers.
  const combined = concatBuffers(audioBuffers);
  if (combined.length === 0) throw new Error('No audio recorded');
  return cloudStt.transcribePcm(combined, SAMPLE_RATE, { language: 'en', prompt });
}

/** Best-effort cleanup of the temp WAV file produced by the native recorder. */
async function cleanupRecording(): Promise<void> {
  const uri = lastWavFileUri;
  lastWavFileUri = null;
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('[dictation] failed to delete temp WAV:', e);
  }
}

export function useDictation() {
  const {
    state,
    transcript,
    cleaned,
    errorMessage,
    setState,
    setTranscript,
    setCleaned,
    setError,
  } = useStore();

  const finalize = useCallback(async () => {
    if (silenceTimer) {
      clearInterval(silenceTimer);
      silenceTimer = null;
    }
    try {
      const stopResult = await AudioRecorder.stop();
      lastWavFileUri = stopResult.fileUri;
    } catch {
      /* recorder already stopped */
      lastWavFileUri = null;
    }
    frameSub?.remove();
    frameSub = null;

    setState('transcribing');
    const prompt = buildInitialPrompt(userDataActions.hotwords());
    const useCloud = await cloudStt.isCloudEnabled();
    let finalText = '';

    try {
      if (useCloud) {
        try {
          finalText = await transcribeCloud(prompt);
        } catch (err) {
          console.warn('[cloud-stt] failed, falling back to local:', err);
          finalText = await transcribeLocal(prompt);
        }
      } else {
        finalText = await transcribeLocal(prompt);
      }
    } catch (err) {
      setError(String(err));
      audioBuffers = [];
      chunker = null;
      void cleanupRecording();
      return;
    }

    audioBuffers = [];
    chunker = null;
    void cleanupRecording();

    if (finalText) {
      const ops = parseCommands(finalText);
      const { text: afterCmds } = applyCommandOps(ops);
      const expanded = expandSnippets(afterCmds, userDataActions.snippetMap());
      finalText = basicPunctuate(expanded);
      setTranscript(finalText);
    }

    const durationMs = Math.max(0, Date.now() - recordStartedAt);
    if (finalText) {
      const payload = {
        rawText: finalText,
        cleanedText: null,
        language: null,
        durationMs,
        tone: null,
      };
      try {
        const id = await historyActions.push(payload);
        useStore.getState().setServerId(id);
        track('dictation_pushed', { durationMs, length: finalText.length });
      } catch (e) {
        await enqueueDictation(payload);
        track('dictation_queued', { durationMs });
        console.warn('[dictation] server push failed; queued offline:', e);
      }
    }

    // Reset board after a brief moment so user sees result land in history.
    setState('idle');
    setTimeout(() => {
      if (useStore.getState().state === 'idle') {
        useStore.getState().reset();
      }
    }, 1500);
  }, [setState, setTranscript, setError]);

  const stop = useCallback(async () => {
    if (stopRequested) return;
    stopRequested = true;
    await finalize();
  }, [finalize]);

  const start = useCallback(async () => {
    try {
      stopRequested = false;
      useStore.getState().reset();
      useMeter.getState().reset();
      audioBuffers = [];
      lastWavFileUri = null;
      lastVoiceAt = Date.now();

      const mode = (await cloudStt.getMode()) ?? 'cloud';
      const useCloud = mode !== 'on-device';
      // Keep PCM in JS only when we might need to feed it to on-device Whisper:
      //  - 'on-device' : always
      //  - 'hybrid'    : as a fallback if the cloud call fails
      //  - 'cloud'     : never (file is already on disk via native recorder)
      const keepInMemoryPcm = mode !== 'cloud';
      if (mode !== 'cloud') await ensureWhisperLoaded();

      setState('recording');
      chunker = mode === 'on-device' ? new Chunker() : null;
      const initialPrompt = buildInitialPrompt(userDataActions.hotwords());

      frameSub = AudioEvents.addListener('frame', (e: AudioFrameEvent) => {
        const samples = Float32Array.from(e.samples);

        // VAD on every frame, regardless of mode.
        const level = rms(samples);
        if (level >= SILENCE_RMS_THRESHOLD) lastVoiceAt = Date.now();
        publishLevel(level);

        if (keepInMemoryPcm) {
          audioBuffers.push(samples);
        }

        if (mode === 'on-device' && chunker) {
          // Stream live partial transcripts via on-device Whisper.
          const chunks = chunker.push(samples);
          for (const c of chunks) {
            void Whisper.transcribePcm(Array.from(c.samples), {
              language: 'auto',
              initialPrompt: initialPrompt || undefined,
            })
              .then((res) => setTranscript(res.text))
              .catch((err) => setError(String(err)));
          }
        }
      });

      // Auto-stop on prolonged silence.
      silenceTimer = setInterval(() => {
        if (stopRequested) return;
        const now = Date.now();
        if (now - recordStartedAt < MIN_RECORD_MS) return;
        if (now - lastVoiceAt >= SILENCE_TIMEOUT_MS) {
          void stop();
        }
      }, 250);

      recordStartedAt = Date.now();
      // Cloud / hybrid → native recorder also writes a WAV to disk so we can
      // upload the file directly without ever building a base64 in JS.
      await AudioRecorder.start({ recordToFile: useCloud });
    } catch (err) {
      setError(String(err));
    }
  }, [setState, setTranscript, setError, stop]);

  const polish = useCallback(async () => {
    const raw = useStore.getState().transcript;
    if (!raw) return;
    const tone = useSettingsStore.getState().settings.defaultTone ?? 'neutral';
    const useCloud = await cloudStt.isCloudEnabled();
    let out: string;
    try {
      setState('cleaning');
      if (useCloud) {
        try {
          out = await cloudStt.cleanup(raw, tone);
        } catch (err) {
          console.warn('[cloud-cleanup] failed, falling back to local LLM:', err);
          await ensureLlmLoaded();
          out = await Llm.cleanup(raw, { tone });
        }
      } else {
        await ensureLlmLoaded();
        out = await Llm.cleanup(raw, { tone });
      }
    } catch {
      out = basicPunctuate(fallbackCleanup(raw));
    }
    setCleaned(out);
    setState('idle');

    const id = useStore.getState().serverId;
    if (id) {
      try {
        await historyActions.patch(id, { cleanedText: out, tone });
      } catch (e) {
        console.warn('[dictation] PATCH cleanedText failed:', e);
      }
    }
  }, [setState, setCleaned]);

  /**
   * Translate the current transcript into `targetLanguage` and store the
   * result in `cleaned`. Always uses the cloud proxy — translation has no
   * on-device equivalent in this app.
   */
  const translate = useCallback(
    async (targetLanguage: string) => {
      const raw = useStore.getState().transcript;
      if (!raw) return;
      const tone = useSettingsStore.getState().settings.defaultTone ?? 'neutral';
      try {
        setState('cleaning');
        const out = await cloudStt.translate(raw, targetLanguage, tone);
        setCleaned(out);

        const id = useStore.getState().serverId;
        if (id) {
          try {
            await historyActions.patch(id, { cleanedText: out, tone, language: targetLanguage });
          } catch (e) {
            console.warn('[dictation] PATCH translation failed:', e);
          }
        }
      } catch (err) {
        setError(String(err));
        return;
      }
      setState('idle');
    },
    [setState, setCleaned, setError],
  );

  return { state, transcript, cleaned, errorMessage, start, stop, polish, translate };
}
