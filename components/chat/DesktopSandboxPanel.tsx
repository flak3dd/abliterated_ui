import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import {
  X,
  FlaskConical,
  Hammer,
  FileCode,
  Terminal,
  Download,
  Trash2,
  Copy,
  Check,
  Eye,
  CornerDownLeft,
  Package,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { WorkspaceFile } from '../../types';
import { downloadSingleFile, downloadEnvironmentAsZip } from '../../services/zipService';
import { TestResultCard } from './TestResultCard';

interface DesktopSandboxPanelProps {
  onClose: () => void;
}

export const DesktopSandboxPanel: React.FC<DesktopSandboxPanelProps> = ({ onClose }) => {
  const { getActiveEnvironment, removeFile } = useChatStore();
  const {
    status: sandboxStatus,
    logs,
    clearLogs,
    runTestsForEnv,
    buildActiveEnv,
    activeTestReport,
    activeBuildReport,
    runCommandInSandbox,
  } = useSandboxStore();

  const activeEnv = getActiveEnvironment();
  const [activeTab, setActiveTab] = useState<'tests' | 'files' | 'terminal'>('tests');
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [cmdInput, setCmdInput] = useState('');
  const terminalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (activeTab === 'terminal') {
      setTimeout(() => {
        terminalScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [activeTab, logs.length]);

  if (!activeEnv) return null;

  const files = Object.values(activeEnv.files);

  const handleRunCommand = () => {
    const trimmed = cmdInput.trim();
    if (!trimmed) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    runCommandInSandbox(trimmed);
    setCmdInput('');
  };

  const handleCopyFile = async () => {
    if (!selectedFile) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    if (Platform.OS === 'web' && navigator?.clipboard) {
      await navigator.clipboard.writeText(selectedFile.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = () => {
    switch (sandboxStatus) {
      case 'testing':
      case 'running':
      case 'building':
        return Colors.brand.sky;
      case 'success':
        return Colors.brand.emerald;
      case 'failed':
        return Colors.brand.rose;
      default:
        return Colors.text.tertiary;
    }
  };

  return (
    <View style={styles.panel}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Package size={14} color={getStatusColor()} />
          <Text style={styles.panelTitle}>Sandbox Console</Text>
          <View style={[styles.statusBadge, { borderColor: getStatusColor() }]}>
            <Text style={[styles.statusBadgeText, { color: getStatusColor() }]}>
              {sandboxStatus.toUpperCase()}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <X size={15} color={Colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'tests' && styles.tabBtnActive]}
          onPress={() => setActiveTab('tests')}
          activeOpacity={0.7}
        >
          <FlaskConical size={12} color={activeTab === 'tests' ? Colors.brand.emerald : Colors.text.tertiary} />
          <Text style={[styles.tabBtnText, activeTab === 'tests' && styles.tabBtnTextActive]}>
            Tests
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'terminal' && styles.tabBtnActive]}
          onPress={() => setActiveTab('terminal')}
          activeOpacity={0.7}
        >
          <Terminal size={12} color={activeTab === 'terminal' ? Colors.brand.emerald : Colors.text.tertiary} />
          <Text style={[styles.tabBtnText, activeTab === 'terminal' && styles.tabBtnTextActive]}>
            Terminal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'files' && styles.tabBtnActive]}
          onPress={() => setActiveTab('files')}
          activeOpacity={0.7}
        >
          <FileCode size={12} color={activeTab === 'files' ? Colors.brand.emerald : Colors.text.tertiary} />
          <Text style={[styles.tabBtnText, activeTab === 'files' && styles.tabBtnTextActive]}>
            Files ({files.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: TESTS & BUILD */}
      {activeTab === 'tests' && (
        <ScrollView style={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.primaryActionBtn}
              onPress={() => runTestsForEnv()}
              activeOpacity={0.8}
              disabled={sandboxStatus === 'testing'}
            >
              <FlaskConical size={12} color="#09090B" />
              <Text style={styles.primaryActionBtnText}>
                {sandboxStatus === 'testing' ? 'Testing...' : 'Run Tests'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={() => buildActiveEnv()}
              activeOpacity={0.8}
              disabled={sandboxStatus === 'building'}
            >
              <Hammer size={12} color={Colors.text.primary} />
              <Text style={styles.secondaryActionBtnText}>Build</Text>
            </TouchableOpacity>
          </View>

          {activeTestReport ? (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionHeader}>TEST RESULTS</Text>
              <TestResultCard report={activeTestReport} />
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <FlaskConical size={20} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Ready for Test Run</Text>
              <Text style={styles.emptyDesc}>
                Click "Run Tests" to execute automated pytest / vitest suites.
              </Text>
            </View>
          )}

          {activeBuildReport && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionHeader}>BUILD OUTPUT</Text>
              <View style={styles.buildCard}>
                <Text style={styles.buildTitle}>
                  {activeBuildReport.success ? '✓ Build Passed' : '✗ Build Failed'}
                </Text>
                <Text style={styles.buildOutput} selectable>
                  {activeBuildReport.output}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* TAB 2: TERMINAL */}
      {activeTab === 'terminal' && (
        <View style={styles.terminalContainer}>
          <View style={styles.terminalToolbar}>
            <Text style={styles.terminalTitle}>stdout / stderr</Text>
            <TouchableOpacity onPress={clearLogs} style={styles.clearLogsBtn}>
              <Trash2 size={11} color={Colors.text.tertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={terminalScrollRef}
            style={styles.terminalScroll}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {logs.map((line, idx) => {
              const isErr = line.includes('[STDERR]') || line.includes('Error:') || line.includes('FAILED');
              const isSuccess = line.includes('PASSED') || line.includes('✓');
              const isCmd = line.startsWith('$');

              return (
                <Text
                  key={idx}
                  style={[
                    styles.terminalLine,
                    isErr && styles.terminalLineErr,
                    isSuccess && styles.terminalLineSuccess,
                    isCmd && styles.terminalLineCmd,
                  ]}
                  selectable
                >
                  {line}
                </Text>
              );
            })}
          </ScrollView>

          <View style={styles.terminalInputDock}>
            <Text style={styles.promptDollar}>$</Text>
            <TextInput
              style={styles.cmdTextInput}
              value={cmdInput}
              onChangeText={setCmdInput}
              placeholder="Run command in sandbox..."
              placeholderTextColor={Colors.text.tertiary}
              onSubmitEditing={handleRunCommand}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.cmdSendBtn, !cmdInput.trim() && styles.cmdSendBtnDisabled]}
              onPress={handleRunCommand}
              disabled={!cmdInput.trim()}
            >
              <CornerDownLeft size={12} color={cmdInput.trim() ? '#09090B' : Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TAB 3: FILES */}
      {activeTab === 'files' && (
        <ScrollView style={styles.tabScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.filesTopRow}>
            <Text style={styles.sectionHeader}>WORKSPACE FILES ({files.length})</Text>
            <TouchableOpacity
              style={styles.zipExportBtn}
              onPress={() => downloadEnvironmentAsZip(activeEnv)}
            >
              <Download size={11} color="#09090B" />
              <Text style={styles.zipExportText}>ZIP</Text>
            </TouchableOpacity>
          </View>

          {files.map((file) => {
            const isSelected = selectedFile?.path === file.path;
            return (
              <View key={file.path} style={[styles.fileItem, isSelected && styles.fileItemActive]}>
                <TouchableOpacity
                  style={styles.fileItemMain}
                  onPress={() => setSelectedFile(isSelected ? null : file)}
                  activeOpacity={0.7}
                >
                  <FileCode size={13} color={isSelected ? Colors.brand.sky : Colors.text.secondary} />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.path}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.fileActionSmall}
                  onPress={() => downloadSingleFile(file.path, file.content)}
                >
                  <Download size={11} color={Colors.text.tertiary} />
                </TouchableOpacity>
              </View>
            );
          })}

          {selectedFile && (
            <View style={styles.previewBox}>
              <View style={styles.previewBoxHeader}>
                <Text style={styles.previewBoxTitle} numberOfLines={1}>
                  {selectedFile.path}
                </Text>
                <TouchableOpacity style={styles.copyBtnSmall} onPress={handleCopyFile}>
                  {copied ? (
                    <Check size={10} color={Colors.brand.emerald} />
                  ) : (
                    <Copy size={10} color={Colors.text.tertiary} />
                  )}
                  <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.previewScroll} horizontal nestedScrollEnabled>
                <Text style={styles.previewCodeText} selectable>
                  {selectedFile.content}
                </Text>
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    width: 360,
    backgroundColor: '#09090D',
    borderLeftWidth: 1,
    borderLeftColor: Colors.border.default,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    userSelect: 'none' as any,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  closeBtn: {
    padding: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  tabBtnTextActive: {
    color: Colors.text.primary,
  },
  tabScroll: {
    flex: 1,
    padding: 10,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.brand.emerald,
    paddingVertical: 7,
    borderRadius: 6,
  },
  primaryActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#09090B',
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  sectionHeader: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  emptyCard: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  emptyDesc: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    textAlign: 'center',
    maxWidth: 220,
  },
  buildCard: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#050508',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  buildTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.brand.emerald,
    marginBottom: 4,
    fontFamily: 'Menlo',
  },
  buildOutput: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.text.code,
    lineHeight: 14,
  },
  terminalContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  terminalToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  terminalTitle: {
    fontSize: 9.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  clearLogsBtn: {
    padding: 3,
  },
  terminalScroll: {
    flex: 1,
    backgroundColor: '#040406',
    padding: 8,
  },
  terminalLine: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.text.code,
    lineHeight: 15,
  },
  terminalLineErr: {
    color: Colors.brand.rose,
  },
  terminalLineSuccess: {
    color: Colors.brand.emerald,
  },
  terminalLineCmd: {
    color: Colors.brand.sky,
    fontWeight: '700',
    marginVertical: 1,
  },
  terminalInputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#07070A',
  },
  promptDollar: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  cmdTextInput: {
    flex: 1,
    fontFamily: 'Menlo',
    fontSize: 11,
    color: Colors.text.primary,
    paddingVertical: 2,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  cmdSendBtn: {
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 3,
  },
  cmdSendBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filesTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  zipExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  zipExportText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#09090B',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    marginBottom: 4,
  },
  fileItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  fileItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileName: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: Colors.text.primary,
  },
  fileActionSmall: {
    padding: 4,
  },
  previewBox: {
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: '#050508',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  previewBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#0c0c10',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  previewBoxTitle: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.secondary,
    maxWidth: 200,
  },
  copyBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  copyBtnText: {
    fontSize: 9,
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
  },
  previewScroll: {
    padding: 8,
    maxHeight: 180,
  },
  previewCodeText: {
    fontFamily: 'Menlo',
    fontSize: 10,
    color: Colors.text.code,
    lineHeight: 14,
  },
});
