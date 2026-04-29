import { useEffect } from 'react';
import { create } from 'zustand';
import type { Dictation, DictationPatch } from 'voiceflow-shared-types';
import { api, useAuth } from '../../services/auth';

interface HistoryStore {
  items: Dictation[];
  loading: boolean;
  error: string | null;
  add: (d: Dictation) => void;
  setItems: (items: Dictation[]) => void;
  remove: (id: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

const useStore = create<HistoryStore>((set) => ({
  items: [],
  loading: false,
  error: null,
  add: (d) => set((s) => ({ items: [d, ...s.items] })),
  setItems: (items) => set({ items }),
  remove: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clear: () => set({ items: [] }),
}));

export function useDictationHistory(): Dictation[] {
  const items = useStore((s) => s.items);
  const setItems = useStore((s) => s.setItems);
  const setLoading = useStore((s) => s.setLoading);
  const setError = useStore((s) => s.setError);
  const signedIn = useAuth((s) => s.signedIn);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .pull()
      .then((res) => {
        if (!cancelled) setItems(res.dictations);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, setItems, setLoading, setError]);

  return items;
}

export const historyActions = {
  add: (d: Dictation) => useStore.getState().add(d),
  remove: (id: string) => useStore.getState().remove(id),
  clear: () => useStore.getState().clear(),
  /** Persist a new dictation to the server, refresh locally, return server id. */
  push: async (input: Omit<Dictation, 'id' | 'createdAt'>): Promise<string | null> => {
    const res = await api.push({ dictations: [input] });
    const pull = await api.pull();
    useStore.getState().setItems(pull.dictations);
    return res.dictationIds[0] ?? null;
  },
  /** PATCH a dictation (e.g. attach LLM-cleaned text + tone) and update local state. */
  patch: async (id: string, patch: DictationPatch) => {
    const updated = await api.patchDictation(id, patch);
    useStore.setState((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...updated } : it)),
    }));
    return updated;
  },
  /** Server-side delete, then local removal. */
  delete: async (id: string) => {
    await api.deleteDictation(id);
    useStore.getState().remove(id);
  },
};
