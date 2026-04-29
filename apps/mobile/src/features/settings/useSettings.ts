import { useEffect } from 'react';
import { create } from 'zustand';
import type { UserSettings, UserSettingsPatch } from 'voiceflow-shared-types';
import { api, useAuth } from '../../services/auth';

const DEFAULTS: UserSettings = {
  preferredLanguage: 'auto',
  defaultTone: 'neutral',
  modelSize: 'base',
  cleanupEnabled: true,
  themeMode: 'system',
  telemetryEnabled: false,
};

interface SettingsStore {
  settings: UserSettings;
  syncing: boolean;
  error: string | null;
  hydratedFromServer: boolean;
  setLocal: (patch: Partial<UserSettings>) => void;
  setServer: (s: UserSettings) => void;
  setError: (e: string | null) => void;
  setSyncing: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULTS,
  syncing: false,
  error: null,
  hydratedFromServer: false,
  setLocal: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setServer: (settings) => set({ settings, hydratedFromServer: true }),
  setError: (error) => set({ error }),
  setSyncing: (syncing) => set({ syncing }),
  setHydrated: (hydratedFromServer) => set({ hydratedFromServer }),
}));

export function useSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const syncing = useSettingsStore((s) => s.syncing);
  const error = useSettingsStore((s) => s.error);
  const hydratedFromServer = useSettingsStore((s) => s.hydratedFromServer);
  const signedIn = useAuth((s) => s.signedIn);

  // Pull on first mount after sign-in.
  useEffect(() => {
    if (!signedIn || hydratedFromServer) return;
    let cancelled = false;
    api
      .pull()
      .then((res) => {
        if (cancelled) return;
        if (res.settings) useSettingsStore.getState().setServer(res.settings);
        else useSettingsStore.getState().setHydrated(true);
      })
      .catch((e) => {
        if (!cancelled) useSettingsStore.getState().setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, hydratedFromServer]);

  /**
   * Optimistic local update + server PATCH. Reverts on failure.
   */
  async function update(patch: UserSettingsPatch) {
    const before = useSettingsStore.getState().settings;
    useSettingsStore.getState().setLocal(patch as Partial<UserSettings>);
    useSettingsStore.getState().setSyncing(true);
    useSettingsStore.getState().setError(null);
    try {
      const updated = await api.patchSettings(patch);
      useSettingsStore.getState().setServer(updated);
    } catch (e) {
      useSettingsStore.getState().setLocal(before); // revert
      useSettingsStore.getState().setError(String(e));
    } finally {
      useSettingsStore.getState().setSyncing(false);
    }
  }

  return { settings, syncing, error, update };
}
