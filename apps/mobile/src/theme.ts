import type { Theme } from '@react-navigation/native';
import { DarkTheme } from '@react-navigation/native';

const colors = {
  bg: '#0b0d12',
  surface: '#141821',
  border: '#1f2530',
  text: '#e7ecf3',
  textDim: '#8a93a6',
  accent: '#7c5cff',
  accentDim: '#3b2e80',
  danger: '#ff6b6b',
  ok: '#4ade80',
};

const navigation: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export const theme = { colors, navigation };
export type AppTheme = typeof theme;
