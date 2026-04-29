import { Platform } from 'react-native';

declare const process: { env: Record<string, string | undefined> };

/**
 * API base URL.
 *
 * - Android emulator: 10.0.2.2 maps to host's localhost.
 * - iOS simulator: localhost works directly.
 * - Real devices: set EXPO_PUBLIC_API_BASE_URL to your dev machine's LAN IP, e.g.
 *     EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:4000
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000');
