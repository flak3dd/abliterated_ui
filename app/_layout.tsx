import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, Platform } from 'react-native';
import Colors from '../theme/colors';
import { useChatStore } from '../stores/useChatStore';
import { useMeshStore } from '../stores/useMeshStore';
import { useRagStore } from '../stores/useRagStore';

export default function RootLayout() {
  const loadChat = useChatStore((s) => s.loadFromStorage);
  const probeAll = useMeshStore((s) => s.probeAll);
  const loadApiKeys = useMeshStore((s) => s.loadApiKeys);
  const loadMeshMode = useMeshStore((s) => s.loadMeshMode);
  const loadRag = useRagStore((s) => s.loadFromStorage);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Abliterated AI • Sovereign Neural Studio';
    }
    const initApp = async () => {
      await loadMeshMode();
      await loadApiKeys();
      await loadChat();
      await loadRag();
      probeAll();
    };
    initApp();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const probeDelayMs = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) {
        return 0;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const path = window.location?.pathname || '';
        if (path.includes('telemetry')) return 10000;
      }
      return 30000;
    };
    const scheduleProbe = () => {
      if (timer) clearTimeout(timer);
      const delay = probeDelayMs();
      timer = setTimeout(() => {
        if (probeDelayMs() !== 0) probeAll();
        scheduleProbe();
      }, delay || 30000);
    };
    scheduleProbe();
    const onVis = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.hidden) {
        probeAll();
      }
      scheduleProbe();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, []);

  return (
    <SafeAreaProvider style={styles.container}>
      {Platform.OS === 'web' && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #08080B !important;
                color: #FAFAFA;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              ::-webkit-scrollbar {
                width: 6px;
                height: 6px;
              }
              ::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.2);
              }
              ::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 3px;
              }
              ::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.25);
              }
              ::selection {
                background: rgba(59, 130, 246, 0.35);
                color: #EFF6FF;
              }
            `,
          }}
        />
      )}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background.primary },
          animation: Platform.OS === 'ios' ? 'default' : 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="voice"
          options={{
            presentation: 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="radar"
          options={{
            presentation: 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
});
