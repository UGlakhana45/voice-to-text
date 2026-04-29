import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../theme';
import {
  DEFAULT_MODELS,
  deleteModel,
  downloadModel,
  isModelDownloaded,
  type ModelKind,
} from '../services/models';

interface Row {
  kind: ModelKind;
  installed: boolean;
  progress: number;
  busy: 'download' | 'delete' | null;
  error: string | null;
}

const KINDS: ModelKind[] = ['whisper', 'llm'];

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ModelManagerScreen() {
  const [rows, setRows] = useState<Record<ModelKind, Row>>({
    whisper: { kind: 'whisper', installed: false, progress: 0, busy: null, error: null },
    llm: { kind: 'llm', installed: false, progress: 0, busy: null, error: null },
  });

  const refresh = useCallback(async () => {
    const next = { ...rows };
    for (const k of KINDS) {
      next[k] = { ...next[k], installed: await isModelDownloaded(k) };
    }
    setRows(next);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDownload = useCallback(
    async (kind: ModelKind) => {
      setRows((r) => ({ ...r, [kind]: { ...r[kind], busy: 'download', error: null, progress: 0 } }));
      try {
        await downloadModel(kind, (p) => {
          const pct =
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesWritten / p.totalBytesExpectedToWrite
              : 0;
          setRows((r) => ({ ...r, [kind]: { ...r[kind], progress: pct } }));
        });
        setRows((r) => ({ ...r, [kind]: { ...r[kind], busy: null, installed: true, progress: 1 } }));
      } catch (e) {
        setRows((r) => ({
          ...r,
          [kind]: { ...r[kind], busy: null, error: String(e), progress: 0 },
        }));
      }
    },
    [],
  );

  const onDelete = useCallback((kind: ModelKind) => {
    Alert.alert('Delete model?', `Removes ${DEFAULT_MODELS[kind].filename} from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setRows((r) => ({ ...r, [kind]: { ...r[kind], busy: 'delete' } }));
          try {
            await deleteModel(kind);
            setRows((r) => ({
              ...r,
              [kind]: { ...r[kind], busy: null, installed: false, progress: 0 },
            }));
          } catch (e) {
            setRows((r) => ({
              ...r,
              [kind]: { ...r[kind], busy: null, error: String(e) },
            }));
          }
        },
      },
    ]);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.intro}>
        Models run entirely on this device. Wi-Fi recommended for the first download.
      </Text>

      {KINDS.map((kind) => {
        const desc = DEFAULT_MODELS[kind];
        const row = rows[kind];
        return (
          <View key={kind} style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{kind === 'whisper' ? 'Whisper STT' : 'LLM cleanup'}</Text>
              <Text style={styles.size}>{bytes(desc.sizeBytes)}</Text>
            </View>
            <Text style={styles.filename}>{desc.filename}</Text>

            {row.busy === 'download' ? (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(row.progress * 100)}%` }]} />
              </View>
            ) : null}

            {row.error ? <Text style={styles.error}>{row.error}</Text> : null}

            <View style={styles.actions}>
              {row.busy ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : row.installed ? (
                <>
                  <Tag label="Installed" />
                  <Pressable onPress={() => onDelete(kind)} style={styles.danger}>
                    <Text style={styles.dangerText}>Delete</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => onDownload(kind)} style={styles.primary}>
                  <Text style={styles.primaryText}>Download</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  intro: { color: theme.colors.textDim, fontSize: 13, marginBottom: 12 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  size: { color: theme.colors.textDim, fontSize: 12 },
  filename: { color: theme.colors.textDim, fontSize: 12, marginTop: 4 },
  progressTrack: {
    marginTop: 12,
    height: 6,
    backgroundColor: theme.colors.bg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  primary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.accent,
  },
  primaryText: { color: 'white', fontWeight: '600' },
  danger: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  dangerText: { color: theme.colors.danger, fontWeight: '600' },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.bg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tagText: { color: theme.colors.textDim, fontSize: 12 },
  error: { color: theme.colors.danger, fontSize: 12, marginTop: 6 },
});
