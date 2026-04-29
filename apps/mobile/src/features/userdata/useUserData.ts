import { useEffect } from 'react';
import { create } from 'zustand';
import type { Snippet, VocabItem } from 'voiceflow-shared-types';
import { api, useAuth } from '../../services/auth';

interface UserDataStore {
  vocab: VocabItem[];
  snippets: Snippet[];
  hydrated: boolean;
  error: string | null;
  set: (v: { vocab: VocabItem[]; snippets: Snippet[] }) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

export const useUserDataStore = create<UserDataStore>((set) => ({
  vocab: [],
  snippets: [],
  hydrated: false,
  error: null,
  set: ({ vocab, snippets }) => set({ vocab, snippets, hydrated: true }),
  setError: (error) => set({ error }),
  clear: () => set({ vocab: [], snippets: [], hydrated: false }),
}));

/** Hydrates vocab + snippets from /sync/pull on first sign-in. */
export function useUserData() {
  const signedIn = useAuth((s) => s.signedIn);
  const hydrated = useUserDataStore((s) => s.hydrated);

  useEffect(() => {
    if (!signedIn || hydrated) return;
    let cancelled = false;
    api
      .pull()
      .then((res) => {
        if (cancelled) return;
        useUserDataStore.getState().set({ vocab: res.vocab, snippets: res.snippets });
      })
      .catch((e) => {
        if (!cancelled) useUserDataStore.getState().setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, hydrated]);

  return useUserDataStore();
}

/** Snapshot helpers for non-React contexts (e.g. dictation pipeline). */
export const userDataActions = {
  snippetMap(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const s of useUserDataStore.getState().snippets) out[s.trigger] = s.expansion;
    return out;
  },
  hotwords(): { term: string; weight?: number }[] {
    return useUserDataStore.getState().vocab.map((v) => ({ term: v.term, weight: v.weight }));
  },
};
