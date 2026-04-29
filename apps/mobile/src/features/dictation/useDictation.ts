import { create } from 'zustand';
import { useCallback } from 'react';
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

export type DictationState = 'idle' | 'recording' | 'transcribing' | 'cleaning' | 'error';

interface DictationStore {
  state: DictationState;
  transcript: string;
  cleaned: string | null;
  errorMessage: string | null;
  /** Server-side id of the most recently pushed dictation (for PATCH on polish). */
  serverId: string | null;
  setState: (s: DictationState) => void;
  setTranscript: (t: string) => void;
  setCleaned: (c: string | null) => void;
  setError: (m: string | null) => void;
  setServerId: (id: string | null) => void;
  reset: () => void;
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

export function useDictation() {
  const { state, transcript, cleaned, errorMessage, setState, setTranscript, setCleaned, setError } =
    useStore();

  const start = useCallback(async () => {
    try {
      useStore.getState().reset();
      setState('recording');
      chunker = new Chunker();

      const initialPrompt = buildInitialPrompt(userDataActions.hotwords());

      frameSub = AudioEvents.addListener('frame', (e: AudioFrameEvent) => {
        if (!chunker) return;
        const samples = Float32Array.from(e.samples);
        const chunks = chunker.push(samples);
        if (chunks.length > 0) {
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

      recordStartedAt = Date.now();
      await AudioRecorder.start();
    } catch (err) {
      setError(String(err));
    }
  }, [setState, setTranscript, setError]);

  const stop = useCallback(async () => {
    try {
      await AudioRecorder.stop();
      frameSub?.remove();
      frameSub = null;

      setState('transcribing');
      const initialPrompt = buildInitialPrompt(userDataActions.hotwords());
      if (chunker) {
        const final = chunker.flush();
        if (final.samples.length > 0) {
          const res = await Whisper.transcribePcm(Array.from(final.samples), {
            language: 'auto',
            initialPrompt: initialPrompt || undefined,
          });
          const acc = (useStore.getState().transcript + ' ' + res.text).trim();

          // Phase-4: apply voice commands, expand snippets, then punctuate.
          const ops = parseCommands(acc);
          const { text: afterCmds } = applyCommandOps(ops);
          const expanded = expandSnippets(afterCmds, userDataActions.snippetMap());
          setTranscript(basicPunctuate(expanded));
        }
      }
      chunker = null;
      setState('idle');

      // Persist the completed dictation server-side. Polish (LLM cleanup) runs
      // afterwards and updates local state only; sending cleanedText back to
      // the server is a future PATCH /sync/dictations/:id (not yet implemented).
      const finalText = useStore.getState().transcript;
      if (finalText) {
        const durationMs = Math.max(0, Date.now() - recordStartedAt);
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
          // Network or server flake: keep local transcript and queue for later.
          await enqueueDictation(payload);
          track('dictation_queued', { durationMs });
          // eslint-disable-next-line no-console
          console.warn('[dictation] server push failed; queued offline:', e);
        }
      }
    } catch (err) {
      setError(String(err));
    }
  }, [setState, setTranscript, setError]);

  const polish = useCallback(async () => {
    const raw = useStore.getState().transcript;
    if (!raw) return;
    const tone = useSettingsStore.getState().settings.defaultTone ?? 'neutral';
    let out: string;
    try {
      setState('cleaning');
      out = await Llm.cleanup(raw, { tone });
    } catch {
      // graceful fallback: filler-word strip + punctuation only
      out = basicPunctuate(fallbackCleanup(raw));
    }
    setCleaned(out);
    setState('idle');

    // Persist cleaned text + tone to server if we have a server id.
    const id = useStore.getState().serverId;
    if (id) {
      try {
        await historyActions.patch(id, { cleanedText: out, tone });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[dictation] PATCH cleanedText failed:', e);
      }
    }
  }, [setState, setCleaned]);

  return { state, transcript, cleaned, errorMessage, start, stop, polish };
}
