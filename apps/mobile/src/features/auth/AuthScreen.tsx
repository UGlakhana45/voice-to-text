import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../../theme';
import { api, useAuth } from '../../services/auth';

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const setSession = useAuth((s) => s.setSession);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.signup({ email, password, displayName: displayName || undefined });
      await setSession({
        token: res.token,
        refreshToken: res.refreshToken,
        user: res.user,
      });
    } catch (e) {
      const msg = String(e);
      if (msg.includes('409')) setError('That email is already registered.');
      else if (msg.includes('401')) setError('Invalid email or password.');
      else setError(msg.replace(/^\[.*?\]\s*/, ''));
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, displayName, setSession]);

  const canSubmit = email.includes('@') && password.length >= 8 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>VoiceFlow</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Sign in to sync settings & history.' : 'Create a free account.'}
        </Text>

        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            placeholder="Your name (optional)"
            placeholderTextColor={theme.colors.textDim}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.colors.textDim}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (8+ characters)"
          placeholderTextColor={theme.colors.textDim}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          onPress={submit}
          disabled={!canSubmit}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.ctaText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          <Text style={styles.switchLink}>
            {mode === 'login'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  title: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: theme.colors.textDim,
    fontSize: 15,
    marginBottom: 28,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
  },
  cta: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: 'white', fontSize: 16, fontWeight: '700' },
  switchLink: {
    textAlign: 'center',
    color: theme.colors.accent,
    fontSize: 14,
    marginTop: 18,
  },
});
