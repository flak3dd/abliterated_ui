import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  SafeAreaView,
  Platform,
  Image,
} from 'react-native';
import {
  X,
  Play,
  FlaskConical,
  Hammer,
  Trash2,
  Terminal,
  Cpu,
  Laptop,
  CornerDownLeft,
  Globe,
  Camera,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch {
  WebView = null;
}
import { useSandboxStore } from '../../stores/useSandboxStore';
import { useChatStore } from '../../stores/useChatStore';
import { PtyTerminalBubble } from './PtyTerminalBubble';

type DrawerTab = 'terminal' | 'preview' | 'browser';

export const SandboxTerminalDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    setDrawerOpen,
    status,
    target,
    setTarget,
    logs,
    clearLogs,
    runTestsForEnv,
    buildActiveEnv,
    materializeActiveEnv,
    runCommandInSandbox,
    drawerTab,
    setDrawerTab,
    webPreviewUrl,
    serveActiveApp,
    runBrowserTestForEnv,
    lastBrowserTest,
  } = useSandboxStore();

  const { getActiveEnvironment } = useChatStore();
  const activeEnv = getActiveEnvironment();

  const [cmdInput, setCmdInput] = useState('');
  const [showPty, setShowPty] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isDrawerOpen && drawerTab === 'terminal') {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [isDrawerOpen, logs.length, drawerTab]);

  if (!isDrawerOpen) return null;

  const handleRunCommand = () => {
    const trimmed = cmdInput.trim();
    if (!trimmed) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    runCommandInSandbox(trimmed);
    setCmdInput('');
  };

  const handleTest = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setDrawerTab('terminal');
    runTestsForEnv();
  };

  const handleBuild = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setDrawerTab('terminal');
    buildActiveEnv();
  };

  const handleSync = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    materializeActiveEnv();
  };

  const handleServe = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setDrawerTab('preview');
    serveActiveApp();
  };

  const handleBrowserTest = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setDrawerTab('browser');
    runBrowserTestForEnv();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
      case 'testing':
      case 'building':
      case 'materializing':
        return Colors.brand.sky;
      case 'success':
        return Colors.brand.emerald;
      case 'failed':
        return Colors.brand.rose;
      default:
        return Colors.text.tertiary;
    }
  };

  const TabBtn = ({ id, label, icon }: { id: DrawerTab; label: string; icon: React.ReactNode }) => (
    <TouchableOpacity
      style={[styles.tabBtn, drawerTab === id && styles.tabBtnActive]}
      onPress={() => setDrawerTab(id)}
      activeOpacity={0.75}
    >
      {icon}
      <Text style={[styles.tabBtnText, drawerTab === id && styles.tabBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isDrawerOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setDrawerOpen(false)}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Terminal size={16} color={Colors.brand.emerald} />
              <View>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>
                    {activeEnv?.name || 'temp-sandbox'}
                  </Text>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                  <Text style={[styles.statusLabel, { color: getStatusColor() }]}>
                    {status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.subtitle}>
                  /tmp/spark-sandboxes/{activeEnv?.id || 'env'}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.targetBtn, target === 'local_mac' && styles.targetBtnActive]}
                onPress={() => setTarget('local_mac')}
                activeOpacity={0.7}
              >
                <Laptop size={11} color={target === 'local_mac' ? Colors.brand.emerald : Colors.text.tertiary} />
                <Text style={[styles.targetBtnText, target === 'local_mac' && styles.targetBtnTextActive]}>
                  Mac
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.targetBtn, target === 'dgx_spark' && styles.targetBtnActive]}
                onPress={() => setTarget('dgx_spark')}
                activeOpacity={0.7}
              >
                <Cpu size={11} color={target === 'dgx_spark' ? Colors.brand.sky : Colors.text.tertiary} />
                <Text style={[styles.targetBtnText, target === 'dgx_spark' && styles.targetBtnTextActiveSky]}>
                  DGX GB10
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDrawerOpen(false)}
                activeOpacity={0.7}
              >
                <X size={17} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tabRow}>
            <TabBtn
              id="terminal"
              label="Terminal"
              icon={<Terminal size={11} color={drawerTab === 'terminal' ? Colors.brand.emerald : Colors.text.tertiary} />}
            />
            <TabBtn
              id="preview"
              label="Live Preview"
              icon={<Globe size={11} color={drawerTab === 'preview' ? Colors.brand.emerald : Colors.text.tertiary} />}
            />
            <TabBtn
              id="browser"
              label="Browser Test"
              icon={<Camera size={11} color={drawerTab === 'browser' ? Colors.brand.emerald : Colors.text.tertiary} />}
            />
          </View>

          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              <TouchableOpacity
                style={styles.toolBtnPrimary}
                onPress={handleTest}
                activeOpacity={0.8}
                disabled={status === 'testing'}
              >
                <FlaskConical size={12} color="#09090B" />
                <Text style={styles.toolBtnPrimaryText}>Run Tests</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolBtnSecondary}
                onPress={handleBuild}
                activeOpacity={0.8}
                disabled={status === 'building'}
              >
                <Hammer size={12} color={Colors.text.primary} />
                <Text style={styles.toolBtnSecondaryText}>Build</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolBtnSecondary} onPress={handleSync} activeOpacity={0.8}>
                <Play size={11} color={Colors.brand.emerald} />
                <Text style={styles.toolBtnSecondaryText}>Sync</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolBtnSecondary} onPress={handleServe} activeOpacity={0.8}>
                <Globe size={11} color={Colors.brand.sky} />
                <Text style={styles.toolBtnSecondaryText}>Serve</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolBtnSecondary} onPress={handleBrowserTest} activeOpacity={0.8}>
                <Camera size={11} color={Colors.brand.amber} />
                <Text style={styles.toolBtnSecondaryText}>Browser</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtnSecondary} onPress={() => setShowPty((v) => !v)} activeOpacity={0.8}>
                <Terminal size={11} color={Colors.brand.sky} />
                <Text style={styles.toolBtnSecondaryText}>PTY</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.clearBtn} onPress={clearLogs} activeOpacity={0.7}>
              <Trash2 size={12} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          {showPty && activeEnv ? (
            <View style={{ padding: 8, maxHeight: 280 }}>
              <PtyTerminalBubble envId={activeEnv.id} />
            </View>
          ) : null}

          {drawerTab === 'terminal' && (
            <>
              <View style={styles.terminalWindow}>
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.terminalScroll}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled
                >
                  {logs.map((line, idx) => {
                    const isErr =
                      line.includes('[STDERR]') || line.includes('Error:') || line.includes('FAILED');
                    const isSuccess = line.includes('PASSED') || line.includes('✓');
                    const isCmd = line.startsWith('$');

                    return (
                      <Text
                        key={idx}
                        style={[
                          styles.logLine,
                          isErr && styles.logLineErr,
                          isSuccess && styles.logLineSuccess,
                          isCmd && styles.logLineCmd,
                        ]}
                        selectable
                      >
                        {line}
                      </Text>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.commandDock}>
                <Text style={styles.promptSymbol}>$</Text>
                <TextInput
                  style={styles.cmdInput}
                  value={cmdInput}
                  onChangeText={setCmdInput}
                  placeholder="Execute in sandbox (e.g. pytest, python3 main.py, ls -la)..."
                  placeholderTextColor={Colors.text.tertiary}
                  onSubmitEditing={handleRunCommand}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !cmdInput.trim() && styles.sendBtnDisabled]}
                  onPress={handleRunCommand}
                  disabled={!cmdInput.trim()}
                  activeOpacity={0.7}
                >
                  <CornerDownLeft size={13} color={cmdInput.trim() ? '#09090B' : Colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {drawerTab === 'preview' && (
            <View style={styles.previewPane}>
              <View style={styles.previewBar}>
                <Text style={styles.previewUrl} numberOfLines={1}>
                  {webPreviewUrl || 'No live server — tap Serve'}
                </Text>
                <TouchableOpacity style={styles.toolBtnSecondary} onPress={handleServe} activeOpacity={0.8}>
                  <Text style={styles.toolBtnSecondaryText}>{webPreviewUrl ? 'Restart' : 'Start'}</Text>
                </TouchableOpacity>
              </View>
              {webPreviewUrl && Platform.OS === 'web' ? (
                React.createElement('iframe', {
                  title: 'sandbox-preview',
                  src: webPreviewUrl,
                  style: {
                    flex: 1,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#fff',
                  } as any,
                })
              ) : webPreviewUrl && WebView ? (
                <WebView
                  source={{ uri: webPreviewUrl }}
                  style={{ flex: 1, backgroundColor: '#fff' }}
                  allowFileAccess
                  originWhitelist={['*']}
                />
              ) : webPreviewUrl ? (
                <View style={styles.previewFallback}>
                  <Text style={styles.logLine}>
                    Preview URL ready (open in browser):
                  </Text>
                  <Text style={[styles.logLine, styles.logLineCmd]} selectable>
                    {webPreviewUrl}
                  </Text>
                  <Text style={styles.logLineDim}>
                    Install react-native-webview for in-app preview on native.
                  </Text>
                </View>
              ) : (
                <View style={styles.previewFallback}>
                  <Text style={styles.logLineDim}>
                    Start a persistent app with Serve. The runner proxies at /api/sandbox/preview/:envId/*
                  </Text>
                </View>
              )}
            </View>
          )}

          {drawerTab === 'browser' && (
            <View style={styles.previewPane}>
              <View style={styles.previewBar}>
                <Text style={styles.previewUrl} numberOfLines={1}>
                  {lastBrowserTest?.ok
                    ? `OK · ${lastBrowserTest.title || 'untitled'} · ${lastBrowserTest.url || ''}`
                    : lastBrowserTest?.error || 'Headed Playwright visual test'}
                </Text>
                <TouchableOpacity style={styles.toolBtnPrimary} onPress={handleBrowserTest} activeOpacity={0.8}>
                  <Camera size={12} color="#09090B" />
                  <Text style={styles.toolBtnPrimaryText}>Run</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.terminalScroll} contentContainerStyle={{ padding: 12 }}>
                {lastBrowserTest?.screenshotBase64 ? (
                  <Image
                    source={{ uri: lastBrowserTest.screenshotBase64 }}
                    style={styles.screenshot}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.logLineDim}>
                    No screenshot yet. Run a browser test after Serve (Playwright headed on Mac; Xvfb on Linux/Spark).
                  </Text>
                )}
                {lastBrowserTest?.artifacts?.screenshot ? (
                  <Text style={styles.logLine} selectable>
                    file: {lastBrowserTest.artifacts.screenshot}
                  </Text>
                ) : null}
                {lastBrowserTest?.artifacts?.video ? (
                  <Text style={styles.logLine} selectable>
                    video: {lastBrowserTest.artifacts.video}
                  </Text>
                ) : null}
                {lastBrowserTest?.hint ? (
                  <Text style={[styles.logLine, styles.logLineErr]}>{lastBrowserTest.hint}</Text>
                ) : null}
              </ScrollView>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  sheetContainer: {
    height: '78%',
    backgroundColor: '#07070A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  subtitle: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  targetBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  targetBtnText: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  targetBtnTextActive: {
    color: Colors.brand.emerald,
  },
  targetBtnTextActiveSky: {
    color: Colors.brand.sky,
  },
  closeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  tabBtnText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  tabBtnTextActive: {
    color: Colors.brand.emerald,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  toolBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  toolBtnPrimaryText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#09090B',
  },
  toolBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  toolBtnSecondaryText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  clearBtn: {
    padding: 6,
    borderRadius: 4,
  },
  terminalWindow: {
    flex: 1,
    backgroundColor: '#040406',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  terminalScroll: {
    flex: 1,
  },
  logLine: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: Colors.text.code,
    lineHeight: 16,
  },
  logLineDim: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
    lineHeight: 16,
  },
  logLineErr: {
    color: Colors.brand.rose,
  },
  logLineSuccess: {
    color: Colors.brand.emerald,
  },
  logLineCmd: {
    color: Colors.brand.sky,
    fontWeight: '700',
    marginVertical: 2,
  },
  commandDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#09090D',
  },
  promptSymbol: {
    fontFamily: 'Menlo',
    fontSize: 13,
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  cmdInput: {
    flex: 1,
    fontFamily: 'Menlo',
    fontSize: 11.5,
    color: Colors.text.primary,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  } as any,
  sendBtn: {
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 4,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  previewPane: {
    flex: 1,
    backgroundColor: '#040406',
  },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  previewUrl: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.text.secondary,
  },
  previewFallback: {
    flex: 1,
    padding: 16,
    gap: 8,
  },
  screenshot: {
    width: '100%',
    height: 360,
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 10,
  },
});
