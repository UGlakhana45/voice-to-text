import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { useSettingsStore } from '../features/settings/useSettings';
import { API_BASE_URL } from '../config';

/**
 * Lightweight, opt-in telemetry. Buffers events in memory + AsyncStorage,
 * batches sends every BATCH_INTERVAL_MS, drops events when the user has
 * opted out. No PII is collected by default — props should only contain
 * counters / enums / coarse durations.
 */

interface BufferedEvent {
  name: string;
  props?: Record<string, unknown>;
  ts: number;
}

const KEY = 'voiceflow.telemetry.buffer.v1';
const BATCH_INTERVAL_MS = 30_000;
const MAX_BATCH = 50;

let buffer: BufferedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function isEnabled(): boolean {
  const s = useSettingsStore.getState();
  return s.hydratedFromServer && s.settings.telemetryEnabled === true;
}

async function persist(): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(buffer));
}

async function load(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return;
  try {
    const arr = JSON.parse(raw) as BufferedEvent[];
    if (Array.isArray(arr)) buffer = arr;
  } catch {
    // ignore
  }
}

async function flushNow(): Promise<void> {
  if (buffer.length === 0) return;
  if (!isEnabled()) {
    buffer = [];
    await persist();
    return;
  }
  const batch = buffer.slice(0, MAX_BATCH);
  const token = useAuth.getState().token;
  try {
    const res = await fetch(`${API_BASE_URL}/telemetry/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events: batch }),
    });
    if (!res.ok) return; // try again next interval
    buffer = buffer.slice(batch.length);
    await persist();
  } catch {
    // network error; try again next interval
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    await flushNow();
    if (buffer.length > 0) schedule();
  }, BATCH_INTERVAL_MS);
}

export async function startTelemetry(): Promise<void> {
  if (started) return;
  started = true;
  await load();
  if (buffer.length > 0) schedule();
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (!isEnabled()) return;
  buffer.push({ name, props, ts: Date.now() });
  void persist();
  schedule();
}
