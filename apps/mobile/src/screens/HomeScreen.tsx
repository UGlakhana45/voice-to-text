import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useDictation } from '../features/dictation/useDictation';
import { theme } from '../theme';

export function HomeScreen() {
  const { state, transcript, cleaned, start, stop, polish } = useDictation();
  const [showCleaned, setShowCleaned] = useState(false);

  const onPressMic = useCallback(() => {
    if (state === 'recording') void stop();
    else void start();
  }, [state, start, stop]);

  const isRecording = state === 'recording';

  return (
    <View style={styles.container}>
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
        {transcript ? (
          <Pressable
            style={styles.secondary}
            onPress={async () => {
              await polish();
              setShowCleaned(true);
            }}
          >
            <Text style={styles.secondaryText}>Polish</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.mic, isRecording && styles.micActive]}
          onPress={onPressMic}
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <Text style={styles.micText}>{isRecording ? '■' : '●'}</Text>
        </Pressable>

        <Text style={styles.hint}>
          {isRecording ? 'Recording…' : state === 'transcribing' ? 'Transcribing…' : 'Tap to dictate'}
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
});
