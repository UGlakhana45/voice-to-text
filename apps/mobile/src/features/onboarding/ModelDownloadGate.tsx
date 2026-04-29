import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '../../theme';
import {
  DEFAULT_MODELS,
  downloadModel,
  isModelDownloaded,
  type ModelKind,
} from '../../services/models';

interface Props {
  onReady: () => void;
}

interface ProgressMap {
  whisper: number;
  llm: number;
}

export function ModelDownloadGate({ onReady }: Props) {
  const [needed, setNeeded] = useState<ModelKind[] | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({ whisper: 0, llm: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const missing: ModelKind[] = [];
      if (!(await isModelDownloaded('whisper'))) missing.push('whisper');
      if (!(await isModelDownloaded('llm'))) missing.push('llm');
      if (missing.length === 0) onReady();
      else setNeeded(missing);
    })();
  }, [onReady]);

  const start = useCallback(async () => {
    if (!needed) return;
    try {
      for (const kind of needed) {
        await downloadModel(kind, (p) => {
          const pct = p.totalBytesExpectedToWrite
            ? p.totalBytesWritten / p.totalBytesExpectedToWrite
            : 0;
          setProgress((prev) => ({ ...prev, [kind]: pct }));
        });
      }
      onReady();
    } catch (e) {
      setError(String(e));
    }
  }, [needed, onReady]);

  if (!needed) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set up VoiceFlow</Text>
      <Text style={styles.body}>
        On-device speech-to-text and AI cleanup require a one-time model download.
        Nothing leaves your device after this.
      </Text>

      {needed.map((kind) => (
        <View key={kind} style={styles.row}>
          <Text style={styles.rowLabel}>
            {kind === 'whisper' ? 'Whisper (speech-to-text)' : 'Gemma 2B (cleanup)'}
          </Text>
          <Text style={styles.rowSize}>
            {(DEFAULT_MODELS[kind].sizeBytes / 1_000_000).toFixed(0)} MB · {(progress[kind] * 100).toFixed(0)}%
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progress[kind] * 100}%` }]} />
          </View>
        </View>
      ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.cta} onPress={start}>
        <Text style={styles.ctaText}>Download &amp; continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  container: { flex: 1, padding: 24, backgroundColor: theme.colors.bg, justifyContent: 'center' },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '700', marginBottom: 8 },
  body: { color: theme.colors.textDim, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  row: { marginBottom: 18 },
  rowLabel: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  rowSize: { color: theme.colors.textDim, fontSize: 12, marginTop: 2 },
  bar: { height: 6, backgroundColor: theme.colors.surface, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.colors.accent },
  cta: {
    marginTop: 16,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaText: { color: 'white', fontSize: 16, fontWeight: '700' },
  error: { color: theme.colors.danger, marginTop: 8 },
});
