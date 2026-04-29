import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { theme } from '../../theme';

const KEY = 'voiceflow.onboardingComplete.v1';

interface Props {
  onDone: () => void;
}

type Step = 'welcome' | 'mic' | 'privacy';

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

  const finish = useCallback(async () => {
    await AsyncStorage.setItem(KEY, '1');
    onDone();
  }, [onDone]);

  const requestMic = useCallback(async () => {
    setRequesting(true);
    try {
      await Audio.requestPermissionsAsync();
    } finally {
      setRequesting(false);
      setStep('privacy');
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        {step === 'welcome' ? (
          <>
            <Text style={styles.eyebrow}>VoiceFlow</Text>
            <Text style={styles.title}>Voice → text, on your device.</Text>
            <Text style={styles.subtitle}>
              Speech recognition and AI cleanup run locally. Your audio never leaves the device
              unless you opt-in to cloud backup.
            </Text>
          </>
        ) : step === 'mic' ? (
          <>
            <Text style={styles.eyebrow}>Step 2 of 3</Text>
            <Text style={styles.title}>Microphone access</Text>
            <Text style={styles.subtitle}>
              We need the microphone to capture your speech. The audio stays on this device —
              transcription happens locally with whisper.cpp.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>Step 3 of 3</Text>
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
          <Primary label="Get started" onPress={() => setStep('mic')} />
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
});
