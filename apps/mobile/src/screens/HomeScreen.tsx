import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { useDictation } from '../features/dictation/useDictation';
import { Waveform } from '../components/Waveform';
import { theme } from '../theme';

const TARGET_LANGUAGES = ['Off', 'English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese'] as const;
type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HomeScreen() {
  const { state, transcript, cleaned, errorMessage, start, stop, polish, translate } = useDictation();
  const [showCleaned, setShowCleaned] = useState(false);
  const [targetLang, setTargetLang] = useState<TargetLanguage>('Off');
  const [elapsed, setElapsed] = useState(0);
  const recordStartRef = useRef<number | null>(null);

  const isRecording = state === 'recording';
  const isBusy = state === 'transcribing' || state === 'cleaning';

  // Recording timer — counts up while we're capturing audio.
  useEffect(() => {
    if (!isRecording) {
      recordStartRef.current = null;
      setElapsed(0);
      return;
    }
    recordStartRef.current = Date.now();
    const id = setInterval(() => {
      if (recordStartRef.current) {
        setElapsed(Date.now() - recordStartRef.current);
      }
    }, 250);
    return () => clearInterval(id);
  }, [isRecording]);

  // Pulse animation on the mic while recording.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  const onPressMic = useCallback(() => {
    if (isRecording) void stop();
    else if (!isBusy) void start();
  }, [isRecording, isBusy, start, stop]);

  const statusLabel =
    state === 'recording'
      ? `Listening · ${formatDuration(elapsed)}`
      : state === 'transcribing'
      ? 'Transcribing…'
      : state === 'cleaning'
      ? 'Polishing…'
      : state === 'error'
      ? 'Error'
      : transcript
      ? 'Tap to record again'
      : 'Tap the mic to dictate';

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.langStrip}
        contentContainerStyle={styles.langStripContent}
      >
        <Text style={styles.langStripLabel}>Translate to</Text>
        {TARGET_LANGUAGES.map((lang) => {
          const active = lang === targetLang;
          return (
            <Pressable
              key={lang}
              onPress={() => setTargetLang(lang)}
              style={[styles.langChip, active && styles.langChipActive]}
            >
              <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                {lang}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.transcriptArea} contentContainerStyle={styles.transcriptContent}>
        {transcript || cleaned ? (
          <View style={styles.card}>
            {cleaned ? (
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => setShowCleaned(false)}
                  style={[styles.toggleBtn, !showCleaned && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, !showCleaned && styles.toggleTextActive]}>
                    Raw
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowCleaned(true)}
                  style={[styles.toggleBtn, showCleaned && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, showCleaned && styles.toggleTextActive]}>
                    Polished
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <Text style={styles.transcript} selectable>
              {showCleaned && cleaned ? cleaned : transcript}
            </Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎙️</Text>
            <Text style={styles.emptyTitle}>Ready when you are</Text>
            <Text style={styles.emptyBody}>
              Tap the mic and start speaking. Recording stops automatically after 3 seconds of
              silence.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.controls}>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {transcript && !isRecording ? (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
              onPress={async () => {
                await polish();
                setShowCleaned(true);
              }}
              disabled={isBusy}
            >
              <Text style={styles.actionEmoji}>✨</Text>
              <Text style={styles.actionText}>Polish</Text>
            </Pressable>
            {targetLang !== 'Off' ? (
              <Pressable
                style={({ pressed }) => [styles.actionPill, pressed && styles.actionPillPressed]}
                onPress={async () => {
                  await translate(targetLang);
                  setShowCleaned(true);
                }}
                disabled={isBusy}
              >
                <Text style={styles.actionEmoji}>🌐</Text>
                <Text style={styles.actionText}>Translate → {targetLang}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Waveform active={isRecording} />

        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Pressable
            style={[
              styles.mic,
              isRecording && styles.micActive,
              isBusy && styles.micBusy,
            ]}
            onPress={onPressMic}
            disabled={isBusy}
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            accessibilityState={{ disabled: isBusy, busy: isBusy }}
          >
            <Text style={styles.micGlyph}>
              {isRecording ? '■' : isBusy ? '…' : '●'}
            </Text>
          </Pressable>
        </Animated.View>

        <Text style={[styles.hint, isRecording && styles.hintActive]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },

  // Language strip
  langStrip: {
    flexGrow: 0,
    backgroundColor: theme.colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  langStripContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
  },
  langStripLabel: {
    color: theme.colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 6,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  langChipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  langChipText: { color: theme.colors.textDim, fontSize: 13 },
  langChipTextActive: { color: 'white', fontWeight: '600' },

  // Transcript area
  transcriptArea: { flex: 1 },
  transcriptContent: { padding: 20, paddingBottom: 32 },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  transcript: { color: theme.colors.text, fontSize: 18, lineHeight: 28 },
  toggleRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bg,
    borderRadius: 18,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  toggleBtnActive: { backgroundColor: theme.colors.accent },
  toggleText: { color: theme.colors.textDim, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: 'white' },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 56, marginBottom: 14 },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyBody: {
    color: theme.colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Controls
  controls: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 14,
  },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionPillPressed: { backgroundColor: theme.colors.accentDim, borderColor: theme.colors.accent },
  actionEmoji: { fontSize: 14 },
  actionText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },

  // Mic
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  micActive: { backgroundColor: theme.colors.danger, shadowColor: theme.colors.danger },
  micBusy: { backgroundColor: theme.colors.accentDim, shadowOpacity: 0 },
  micGlyph: { color: 'white', fontSize: 36, fontWeight: '700' },

  // Status line
  hint: { color: theme.colors.textDim, fontSize: 14, fontWeight: '500' },
  hintActive: { color: theme.colors.danger, fontWeight: '700' },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
});
