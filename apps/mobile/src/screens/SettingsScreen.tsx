import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable, Alert, TextInput } from 'react-native';
import { theme } from '../theme';
import { useSettings } from '../features/settings/useSettings';
import { api, useAuth } from '../services/auth';
import { TONES } from 'voiceflow-postprocess';
import type { ToneMode } from 'voiceflow-shared-types';
import { ModelManagerScreen } from './ModelManagerScreen';
import { cloudStt, type CloudProvider, type CloudRoute, type TranscriptionMode } from '../services/cloudStt';

export function SettingsScreen() {
  const [view, setView] = useState<'root' | 'models'>('root');
  const { settings, update, syncing, error } = useSettings();
  const user = useAuth((s) => s.user);
  const refreshToken = useAuth((s) => s.refreshToken);
  const clearAuth = useAuth((s) => s.clear);

  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState<CloudProvider>('openai');
  const [mode, setMode] = useState<TranscriptionMode>('cloud');
  const [route, setRoute] = useState<CloudRoute>('proxy');

  useEffect(() => {
    cloudStt.isCloudEnabled().then(setCloudEnabled);
    cloudStt.getApiKey().then((k) => setApiKey(k ?? ''));
    cloudStt.getProvider().then(setProvider);
    cloudStt.getMode().then((m) => setMode(m ?? 'cloud'));
    cloudStt.getRoute().then(setRoute);
  }, []);

  if (view === 'models') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <Pressable onPress={() => setView('root')} style={styles.backRow}>
          <Text style={styles.backText}>← Settings</Text>
        </Pressable>
        <ModelManagerScreen />
      </View>
    );
  }

  const signOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (refreshToken) await api.logout(refreshToken);
          } catch {
            /* ignore network errors during logout */
          }
          await clearAuth();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {user && (
        <Section title="Account">
          <Row label="Signed in as" value={user.email} />
          {user.displayName ? <Row label="Name" value={user.displayName} /> : null}
        </Section>
      )}

      <Section title="Transcription">
        <PickerRow
          label="Mode"
          value={mode}
          options={['cloud', 'hybrid', 'on-device']}
          onChange={async (v) => {
            const next = v as TranscriptionMode;
            await cloudStt.setMode(next);
            setMode(next);
            setCloudEnabled(next !== 'on-device');
          }}
        />
        <Text style={styles.helpText}>
          {mode === 'cloud'
            ? 'Cloud only — fastest and most accurate. Needs internet.'
            : mode === 'on-device'
            ? 'Fully offline. Whisper model runs on this phone.'
            : 'Cloud when online, local Whisper as offline fallback.'}
        </Text>

        {cloudEnabled && (
          <>
            <PickerRow
              label="Routing"
              value={route}
              options={['proxy', 'direct']}
              onChange={async (v) => {
                const next = v as CloudRoute;
                await cloudStt.setRoute(next);
                setRoute(next);
              }}
            />
            <Text style={styles.helpText}>
              {route === 'proxy'
                ? 'Calls VoiceFlow servers — no API key needed.'
                : 'Calls OpenAI/Groq directly with your own API key.'}
            </Text>

            {route === 'direct' && (
              <>
                <PickerRow
                  label="Provider"
                  value={provider}
                  options={['openai', 'groq']}
                  onChange={async (v) => {
                    await cloudStt.setProvider(v as CloudProvider);
                    setProvider(v as CloudProvider);
                  }}
                />
                <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingVertical: 12 }]}>
                  <Text style={styles.rowLabel}>{provider === 'groq' ? 'Groq API Key (free)' : 'OpenAI API Key'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={apiKeyStyles.input}
                      value={apiKey}
                      onChangeText={setApiKey}
                      placeholder="sk-..."
                      placeholderTextColor={theme.colors.textDim}
                      secureTextEntry={!showKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable onPress={() => setShowKey(!showKey)} style={apiKeyStyles.eye}>
                      <Text style={{ color: theme.colors.accent }}>{showKey ? '🙈' : '👁️'}</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={async () => {
                      await cloudStt.setApiKey(apiKey.trim());
                      Alert.alert('Saved', 'API key saved securely');
                    }}
                    style={apiKeyStyles.saveBtn}
                  >
                    <Text style={apiKeyStyles.saveText}>Save API Key</Text>
                  </Pressable>
                  <Text style={{ color: theme.colors.textDim, fontSize: 12, marginTop: 4 }}>
                    {provider === 'groq'
                      ? 'Get a FREE Groq key at console.groq.com/keys'
                      : 'Get an OpenAI key at platform.openai.com/api-keys'}
                  </Text>
                </View>
              </>
            )}
          </>
        )}
        <Row label="Model size" value={settings.modelSize} />
        <Row label="Language" value={settings.preferredLanguage} />
      </Section>

      <Section title="Cleanup">
        <ToggleRow
          label="AI cleanup enabled"
          value={settings.cleanupEnabled}
          onChange={(v) => update({ cleanupEnabled: v })}
        />
        <PickerRow
          label="Default tone"
          value={settings.defaultTone}
          options={TONES}
          onChange={(v) => update({ defaultTone: v as ToneMode })}
        />
      </Section>

      <Section title="Appearance">
        <PickerRow
          label="Theme"
          value={settings.themeMode}
          options={['system', 'light', 'dark']}
          onChange={(v) => update({ themeMode: v as 'system' | 'light' | 'dark' })}
        />
      </Section>

      <Section title="Privacy">
        <ToggleRow
          label="Anonymous usage telemetry"
          value={settings.telemetryEnabled}
          onChange={(v) => update({ telemetryEnabled: v })}
        />
      </Section>

      <Section title="Storage">
        <Pressable onPress={() => setView('models')} style={styles.row}>
          <Text style={styles.rowLabel}>Manage models</Text>
          <Text style={styles.rowValue}>›</Text>
        </Pressable>
      </Section>

      <Section title="About">
        <Row label="Version" value="0.0.1" />
        <Row label="Engine" value="whisper.cpp + llama.cpp (on-device)" />
      </Section>

      {error ? (
        <Text style={styles.errorText}>Sync error: {error}</Text>
      ) : syncing ? (
        <Text style={styles.syncText}>Syncing…</Text>
      ) : null}

      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function PickerRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={pickerStyles.wrap}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[pickerStyles.chip, active && pickerStyles.chipActive]}
            >
              <Text style={[pickerStyles.chipText, active && pickerStyles.chipTextActive]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { color: theme.colors.textDim, fontSize: 13 },
  chipTextActive: { color: 'white', fontWeight: '600' },
});

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const apiKeyStyles = StyleSheet.create({
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
  },
  eye: {
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  section: { marginBottom: 20 },
  sectionTitle: {
    color: theme.colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { color: theme.colors.text, fontSize: 15 },
  rowValue: { color: theme.colors.textDim, fontSize: 14 },
  helpText: {
    color: theme.colors.textDim,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 2,
    lineHeight: 17,
  },
  signOut: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  signOutText: { color: theme.colors.danger, fontSize: 15, fontWeight: '600' },
  errorText: { color: theme.colors.danger, fontSize: 13, marginVertical: 8 },
  syncText: { color: theme.colors.textDim, fontSize: 13, marginVertical: 8 },
  backRow: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  backText: { color: theme.colors.accent, fontSize: 15 },
});
