import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, Platform } from 'react-native';
import Colors from '../theme/colors';
import { useChatStore } from '../stores/useChatStore';
import { useMeshStore } from '../stores/useMeshStore';
import { useRagStore } from '../stores/useRagStore';
import { useModelEnablement } from '../stores/useModelEnablement';
import { useAgentStore } from '../stores/useAgentStore';

export default function RootLayout() {
  const loadChat = useChatStore((s) => s.loadFromStorage);
  const probeAll = useMeshStore((s) => s.probeAll);
  const loadApiKeys = useMeshStore((s) => s.loadApiKeys);
  const loadMeshMode = useMeshStore((s) => s.loadMeshMode);
  const loadRag = useRagStore((s) => s.loadFromStorage);
  const loadEnabled = useModelEnablement((s) => s.loadEnabled);
  const loadAgentMode = useAgentStore((s) => s.loadAgentMode);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Abliterated AI • Sovereign Neural Studio';
    }
    const initApp = async () => {
      await loadMeshMode();
      await loadApiKeys();
      await loadChat();
      await loadRag();
      await loadEnabled();
      await loadAgentMode();
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
        if (path.includes('telemetry') || path.includes('radar')) return 10000;
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
                height: 100dvh;
                max-height: 100dvh;
                margin: 0;
                padding: 0;
                overflow: hidden;
                overscroll-behavior: none;
                background-color: #08080B !important;
                color: #FAFAFA;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                -webkit-tap-highlight-color: transparent;
              }
              *, *::before, *::after { box-sizing: border-box; }
              #root, #root > div { height: 100%; min-height: 0; }
              img { max-width: 100%; height: auto; }
              button, [role="button"], a, [tabindex]:not([tabindex="-1"]) { cursor: pointer; }
              input, textarea {
                outline: none;
                font-family: inherit;
              }
              ::-webkit-scrollbar { width: 8px; height: 8px; }
              ::-webkit-scrollbar-track { background: transparent; }
              ::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.14);
                border-radius: 8px;
              }
              ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }
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
    ...(Platform.OS === 'web' ? { height: '100%' as any, minHeight: 0, overflow: 'hidden' } : null),
  },
});
