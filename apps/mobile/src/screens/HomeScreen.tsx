import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useDictation } from '../features/dictation/useDictation';
import { theme } from '../theme';

const TARGET_LANGUAGES = ['Off', 'English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese'] as const;
type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export function HomeScreen() {
  const { state, transcript, cleaned, errorMessage, start, stop, polish, translate } = useDictation();
  const [showCleaned, setShowCleaned] = useState(false);
  const [targetLang, setTargetLang] = useState<TargetLanguage>('Off');

  const onPressMic = useCallback(() => {
    if (state === 'recording') void stop();
    else void start();
  }, [state, start, stop]);

  const isRecording = state === 'recording';

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
        {cleaned ? (
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setShowCleaned(false)}
              style={[styles.toggleBtn, !showCleaned && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, !showCleaned && styles.toggleTextActive]}>Raw</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowCleaned(true)}
              style={[styles.toggleBtn, showCleaned && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, showCleaned && styles.toggleTextActive]}>Cleaned</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.transcript}>
          {showCleaned && cleaned ? cleaned : transcript || 'Press the mic and start speaking.'}
        </Text>
      </ScrollView>

      <View style={styles.controls}>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {transcript ? (
          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondary}
              onPress={async () => {
                await polish();
                setShowCleaned(true);
              }}
            >
              <Text style={styles.secondaryText}>Polish</Text>
            </Pressable>
            {targetLang !== 'Off' ? (
              <Pressable
                style={styles.secondary}
                onPress={async () => {
                  await translate(targetLang);
                  setShowCleaned(true);
                }}
              >
                <Text style={styles.secondaryText}>Translate → {targetLang}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          style={[styles.mic, isRecording && styles.micActive]}
          onPress={onPressMic}
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <Text style={styles.micText}>{isRecording ? '■' : '●'}</Text>
        </Pressable>

        <Text style={styles.hint}>
          {isRecording
            ? 'Listening… (auto-stops after 3s of silence)'
            : state === 'transcribing'
              ? 'Transcribing…'
              : state === 'cleaning'
                ? 'Polishing…'
                : 'Tap to dictate'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  transcriptArea: { flex: 1, padding: 20 },
  transcriptContent: { paddingBottom: 40 },
  transcript: { color: theme.colors.text, fontSize: 18, lineHeight: 26 },
  controls: { padding: 24, alignItems: 'center', gap: 16 },
  mic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: theme.colors.danger },
  micText: { color: 'white', fontSize: 36, fontWeight: '700' },
  hint: { color: theme.colors.textDim, fontSize: 14 },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  toggleBtnActive: { backgroundColor: theme.colors.accent },
  toggleText: { color: theme.colors.textDim, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: 'white' },
  langStrip: {
    flexGrow: 0,
    backgroundColor: theme.colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  langStripContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
  },
  langStripLabel: {
    color: theme.colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginRight: 6,
  },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  langChipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  langChipText: { color: theme.colors.textDim, fontSize: 13 },
  langChipTextActive: { color: 'white', fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
});
