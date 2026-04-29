import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Dictation } from 'voiceflow-shared-types';
import { api, useAuth } from './auth';

/**
 * Offline outbox for dictations. When `historyActions.push` fails (no network,
 * 5xx, etc.), the dictation is queued here and flushed automatically:
 *  - on app start (after auth hydrate)
 *  - whenever the auth state transitions to signedIn
 *  - on demand via `flushOutbox()`
 *
 * AsyncStorage is good enough for the volume we expect (a handful of pending
 * items at most). For larger volumes we'd move to expo-sqlite.
 */
const KEY = 'voiceflow.outbox.dictations.v1';

type Pending = Omit<Dictation, 'id' | 'createdAt'> & { _localId: string };

async function readAll(): Promise<Pending[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Pending[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(items: Pending[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function enqueueDictation(d: Omit<Dictation, 'id' | 'createdAt'>): Promise<void> {
  const items = await readAll();
  items.push({ ...d, _localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  await writeAll(items);
}

export async function outboxSize(): Promise<number> {
  return (await readAll()).length;
}

let flushing = false;

/**
 * Best-effort flush. Returns the number of items successfully drained.
 * Stops on the first network failure to preserve order.
 */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  if (!useAuth.getState().signedIn) return 0;
  flushing = true;
  let drained = 0;
  try {
    let items = await readAll();
    while (items.length > 0) {
      const head = items[0];
      if (!head) break;
      try {
        const { _localId: _id, ...payload } = head;
        void _id;
        await api.push({ dictations: [payload] });
        items = items.slice(1);
        await writeAll(items);
        drained += 1;
      } catch {
        break; // network/server flake; try later
      }
    }
  } finally {
    flushing = false;
  }
  return drained;
}

/** Subscribe to auth state changes; flush whenever the user signs in. */
export function attachOutboxAutoFlush(): () => void {
  // Flush once on attach (covers app start after hydrate).
  void flushOutbox();
  return useAuth.subscribe((state, prev) => {
    if (state.signedIn && !prev.signedIn) void flushOutbox();
  });
}
