import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { theme } from '../../theme';
import { cloudStt, type TranscriptionMode } from '../../services/cloudStt';

const KEY = 'voiceflow.onboardingComplete.v1';

interface Props {
  onDone: () => void;
}

type Step = 'welcome' | 'mode' | 'mic' | 'privacy';

interface ModeOption {
  id: TranscriptionMode;
  title: string;
  size: string;
  body: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'cloud',
    title: 'Cloud (recommended)',
    size: 'No download · ~10 MB app',
    body:
      'Speech is transcribed and translated by our servers. Fastest, most accurate, multilingual. Needs an internet connection.',
  },
  {
    id: 'on-device',
    title: 'On-device only',
    size: '~150 MB Whisper download',
    body:
      'Everything runs locally with whisper.cpp. Works offline, audio never leaves your phone. Slower and English-leaning.',
  },
  {
    id: 'hybrid',
    title: 'Hybrid',
    size: 'Downloads on first offline use',
    body:
      'Use the cloud when online for best accuracy, fall back to on-device Whisper when offline. Models download lazily.',
  },
];

/**
 * One-time post-signup wizard. Persists completion in AsyncStorage so it
 * never re-shows. Three steps:
 *  1. Welcome — pitch + on-device note.
 *  2. Microphone permission — explain *why* we need it before prompting.
 *  3. Privacy — set expectation that audio stays on device by default.
 *
 * After completion the host App swaps in the ModelDownloadGate.
 */
export function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [requesting, setRequesting] = useState(false);
  const [mode, setMode] = useState<TranscriptionMode>('cloud');
  const [savingMode, setSavingMode] = useState(false);

  const finish = useCallback(async () => {
    await AsyncStorage.setItem(KEY, '1');
    onDone();
  }, [onDone]);

  const confirmMode = useCallback(async () => {
    setSavingMode(true);
    try {
      await cloudStt.setMode(mode);
    } finally {
      setSavingMode(false);
      setStep('mic');
    }
  }, [mode]);

  const requestMic = useCallback(async () => {
    setRequesting(true);
    try {
      await Audio.requestPermissionsAsync();
    } finally {
      setRequesting(false);
      setStep('privacy');
    }
  }, []);

  const stepIndex = step === 'welcome' ? 0 : step === 'mode' ? 1 : step === 'mic' ? 2 : 3;

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === stepIndex && styles.dotActive,
              i < stepIndex && styles.dotDone,
            ]}
          />
        ))}
      </View>
      <View style={styles.body}>
        {step === 'welcome' ? (
          <>
            <Text style={styles.eyebrow}>Step 1 of 4</Text>
            <Text style={styles.title}>Voice → text, your way.</Text>
            <Text style={styles.subtitle}>
              Dictate into any app. Choose between fast cloud accuracy or fully on-device privacy —
              you can switch any time in Settings.
            </Text>
          </>
        ) : step === 'mode' ? (
          <>
            <Text style={styles.eyebrow}>Step 2 of 4</Text>
            <Text style={styles.title}>How should VoiceFlow run?</Text>
            <Text style={styles.subtitle}>
              You can change this any time in Settings. Cloud is the smallest install — nothing to
              download.
            </Text>
            <View style={{ marginTop: 18 }}>
              {MODE_OPTIONS.map((opt) => {
                const selected = opt.id === mode;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setMode(opt.id)}
                    style={[styles.modeCard, selected && styles.modeCardSelected]}
                  >
                    <View style={styles.modeHead}>
                      <Text style={styles.modeTitle}>{opt.title}</Text>
                      <View style={[styles.radio, selected && styles.radioOn]} />
                    </View>
                    <Text style={styles.modeSize}>{opt.size}</Text>
                    <Text style={styles.modeBody}>{opt.body}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : step === 'mic' ? (
          <>
            <Text style={styles.eyebrow}>Step 3 of 4</Text>
            <Text style={styles.title}>Microphone access</Text>
            <Text style={styles.subtitle}>
              We need the microphone to capture your speech. {mode === 'on-device'
                ? 'The audio stays on this device — transcription happens locally with whisper.cpp.'
                : mode === 'cloud'
                ? 'Audio is streamed to our servers for transcription, then discarded.'
                : 'Audio goes to the cloud when online and stays on-device when offline.'}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>Step 4 of 4</Text>
            <Text style={styles.title}>You control your data.</Text>
            <Text style={styles.subtitle}>
              History is stored locally and synced to your account so you can recover it across
              devices. Cloud audio backup, telemetry, and account sync are opt-in in Settings.
            </Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        {step === 'welcome' ? (
          <Primary label="Get started" onPress={() => setStep('mode')} />
        ) : step === 'mode' ? (
          <Primary
            label={savingMode ? 'Saving…' : 'Continue'}
            disabled={savingMode}
            onPress={confirmMode}
          />
        ) : step === 'mic' ? (
          <Primary
            label={requesting ? 'Requesting…' : 'Allow microphone'}
            disabled={requesting}
            onPress={requestMic}
          />
        ) : (
          <Primary label="Continue" onPress={finish} />
        )}
      </View>
    </View>
  );
}

function Primary({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.primary, disabled && { opacity: 0.6 }]}
    >
      {disabled ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

/** Hook that returns whether onboarding has been completed. `null` until hydrated. */
export function useOnboardingDone(): { done: boolean | null; markDone: () => Promise<void> } {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setDone(v === '1'));
  }, []);
  return {
    done,
    markDone: async () => {
      await AsyncStorage.setItem(KEY, '1');
      setDone(true);
    },
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, justifyContent: 'space-between', padding: 24 },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: { backgroundColor: theme.colors.accent, width: 22 },
  dotDone: { backgroundColor: theme.colors.accentDim },
  body: { flex: 1, justifyContent: 'center' },
  eyebrow: { color: theme.colors.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '700', marginTop: 12 },
  subtitle: { color: theme.colors.textDim, fontSize: 16, lineHeight: 24, marginTop: 14 },
  actions: { paddingBottom: 12 },
  primary: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
  },
  primaryText: { color: 'white', fontSize: 16, fontWeight: '600' },
  modeCard: {
    borderWidth: 1,
    borderColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
  },
  modeCardSelected: { borderColor: theme.colors.accent },
  modeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  modeSize: { color: theme.colors.accent, fontSize: 12, marginTop: 2, fontWeight: '600' },
  modeBody: { color: theme.colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 6 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.textDim,
  },
  radioOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent },
});
