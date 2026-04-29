import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { useAuth } from '../../services/auth';
import { AuthScreen } from './AuthScreen';

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const hydrated = useAuth((s) => s.hydrated);
  const signedIn = useAuth((s) => s.signedIn);
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!signedIn) return <AuthScreen />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
});
