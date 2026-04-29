import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { theme } from '../theme';
import { useDictationHistory, historyActions } from '../features/history/useHistory';

export function HistoryScreen() {
  const items = useDictationHistory();

  const confirmDelete = (id: string) => {
    Alert.alert('Delete dictation?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void historyActions.delete(id);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No dictations yet.</Text>
          <Text style={styles.emptyHint}>Recordings you make will sync here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onLongPress={() => confirmDelete(item.id)}
            >
              <Text style={styles.rowTime}>
                {new Date(item.createdAt).toLocaleString()} · {(item.durationMs / 1000).toFixed(1)}s
              </Text>
              <Text style={styles.rowText}>{item.cleanedText ?? item.rawText}</Text>
              {item.tone ? <Text style={styles.rowTag}>tone: {item.tone}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: theme.colors.textDim, fontSize: 16, marginBottom: 6 },
  emptyHint: { color: theme.colors.textDim, fontSize: 13, opacity: 0.7 },
  row: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowTime: { color: theme.colors.textDim, fontSize: 12, marginBottom: 6 },
  rowText: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
  rowTag: {
    color: theme.colors.accent,
    fontSize: 11,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
