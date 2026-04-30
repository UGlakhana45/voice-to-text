import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './screens/HomeScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ModelDownloadGate } from './features/onboarding/ModelDownloadGate';
import { OnboardingWizard, useOnboardingDone } from './features/onboarding/OnboardingWizard';
import { AuthGate } from './features/auth/AuthGate';
import { useUserData } from './features/userdata/useUserData';
import { attachOutboxAutoFlush } from './services/outbox';
import { startTelemetry } from './services/telemetry';
import { theme } from './theme';

const Tabs = createBottomTabNavigator();

export default function App() {
  const [modelsReady, setModelsReady] = useState(false);
  const { done: onboardingDone, markDone } = useOnboardingDone();

  // Side-effects that should run once for the app lifetime.
  useEffect(() => {
    const detach = attachOutboxAutoFlush();
    void startTelemetry();
    return detach;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthGate>
        {onboardingDone === null ? null : !onboardingDone ? (
          <OnboardingWizard onDone={() => void markDone()} />
        ) : !modelsReady ? (
          <ModelDownloadGate onReady={() => setModelsReady(true)} />
        ) : (
          <MainTabs />
        )}
      </AuthGate>
    </SafeAreaProvider>
  );
}

function MainTabs() {
  // Hydrate vocab + snippets once we're inside the authenticated tree.
  useUserData();
  return (
    <NavigationContainer theme={theme.navigation}>
      <Tabs.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          tabBarStyle: {
            backgroundColor: theme.colors.bg,
            borderTopColor: theme.colors.border,
            height: 64,
            paddingTop: 6,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.textDim,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="Dictate"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>🎙️</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>📝</Text>
            ),
          }}
        />
        <Tabs.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Text style={{ fontSize: 22, color }}>⚙️</Text>
            ),
          }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
