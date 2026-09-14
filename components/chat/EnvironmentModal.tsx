import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  SafeAreaView,
  Pressable,
  Platform,
  TextInput,
} from 'react-native';
import {
  X,
  Package,
  Download,
  FileCode,
  FileText,
  Trash2,
  Eye,
  Copy,
  Check,
  ShieldCheck,
  FlaskConical,
  Hammer,
  Terminal,
  Cpu,
  Laptop,
  CornerDownLeft,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { WorkspaceFile } from '../../types';
import { downloadSingleFile, downloadEnvironmentAsZip } from '../../services/zipService';
import { TestResultCard } from './TestResultCard';

interface EnvironmentModalProps {
  visible: boolean;
  onClose: () => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  visible,
  onClose,
}) => {
  const { getActiveEnvironment, removeFile } = useChatStore();
  const {
    status: sandboxStatus,
    target,
    setTarget,
    logs,
    clearLogs,
    runTestsForEnv,
    buildActiveEnv,
    materializeActiveEnv,
    activeTestReport,
    activeBuildReport,
    runCommandInSandbox,
  } = useSandboxStore();

  const activeEnv = getActiveEnvironment();
  const [activeTab, setActiveTab] = useState<'files' | 'tests' | 'terminal'>('files');
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [cmdInput, setCmdInput] = useState('');

  if (!activeEnv) return null;

  const files = Object.values(activeEnv.files);
  const totalBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownloadZip = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    downloadEnvironmentAsZip(activeEnv);
  };

  const handleDownloadFile = (file: WorkspaceFile) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    downloadSingleFile(file.path, file.content);
  };

  const handleDeleteFile = (path: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    removeFile(activeEnv.id, path);
    if (selectedFile?.path === path) {
      setSelectedFile(null);
    }
  };

  const handleCopySelected = async () => {
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

  const handleRunCommand = () => {
    const trimmed = cmdInput.trim();
    if (!trimmed) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    runCommandInSandbox(trimmed);
    setCmdInput('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <SafeAreaView style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Package size={18} color={Colors.brand.emerald} />
              <View>
                <Text style={styles.title}>{activeEnv.name || activeEnv.id}</Text>
                <Text style={styles.subtitle}>
                  Isolated Sandbox • {files.length} {files.length === 1 ? 'file' : 'files'} ({formatSize(totalBytes)})
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'files' && styles.tabBtnActive]}
              onPress={() => setActiveTab('files')}
              activeOpacity={0.7}
            >
              <FileCode size={13} color={activeTab === 'files' ? Colors.brand.emerald : Colors.text.tertiary} />
              <Text style={[styles.tabBtnText, activeTab === 'files' && styles.tabBtnTextActive]}>
                Files ({files.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'tests' && styles.tabBtnActive]}
              onPress={() => setActiveTab('tests')}
              activeOpacity={0.7}
            >
              <FlaskConical size={13} color={activeTab === 'tests' ? Colors.brand.emerald : Colors.text.tertiary} />
              <Text style={[styles.tabBtnText, activeTab === 'tests' && styles.tabBtnTextActive]}>
                Build & Tests
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'terminal' && styles.tabBtnActive]}
              onPress={() => setActiveTab('terminal')}
              activeOpacity={0.7}
            >
              <Terminal size={13} color={activeTab === 'terminal' ? Colors.brand.emerald : Colors.text.tertiary} />
              <Text style={[styles.tabBtnText, activeTab === 'terminal' && styles.tabBtnTextActive]}>
                Terminal Logs
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: FILES */}
          {activeTab === 'files' && (
            <View style={styles.tabContent}>
              {/* Security / Isolation Callout */}
              <View style={styles.callout}>
                <ShieldCheck size={14} color={Colors.brand.emerald} />
                <Text style={styles.calloutText}>
                  Every new conversation creates a dedicated environment. Files generated by the agent sync here automatically.
                </Text>
              </View>

              {/* Primary Action Button: Download Entire Workspace ZIP */}
              <TouchableOpacity
                style={styles.downloadZipBtn}
                onPress={handleDownloadZip}
                activeOpacity={0.85}
              >
                <Download size={16} color="#09090B" />
                <Text style={styles.downloadZipText}>
                  Download Workspace Archive ({activeEnv.name}.zip)
                </Text>
              </TouchableOpacity>

              {/* Files List */}
              <Text style={styles.sectionLabel}>WORKSPACE FILES</Text>
              <ScrollView style={styles.fileList} showsVerticalScrollIndicator={false}>
                {files.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No files in this sandbox yet.</Text>
                    <Text style={styles.emptySubtext}>
                      Ask the assistant to generate code or scripts to populate files.
                    </Text>
                  </View>
                ) : (
                  files.map((file) => {
                    const isSelected = selectedFile?.path === file.path;
                    const isCode =
                      file.language &&
                      !['markdown', 'text', 'txt'].includes(file.language.toLowerCase());

                    return (
                      <View
                        key={file.path}
                        style={[styles.fileCard, isSelected && styles.fileCardActive]}
                      >
                        <TouchableOpacity
                          style={styles.fileMain}
                          onPress={() => setSelectedFile(isSelected ? null : file)}
                          activeOpacity={0.7}
                        >
                          {isCode ? (
                            <FileCode size={16} color={Colors.brand.sky} />
                          ) : (
                            <FileText size={16} color={Colors.brand.emerald} />
                          )}
                          <View style={styles.fileMeta}>
                            <Text style={styles.filePath} numberOfLines={1}>
                              {file.path}
                            </Text>
                            <Text style={styles.fileDetails}>
                              {formatSize(file.sizeBytes || file.content.length)}
                              {file.language ? ` • ${file.language}` : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        <View style={styles.fileActions}>
                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => setSelectedFile(isSelected ? null : file)}
                          >
                            <Eye
                              size={14}
                              color={isSelected ? Colors.brand.sky : Colors.text.tertiary}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => handleDownloadFile(file)}
                          >
                            <Download size={14} color={Colors.text.tertiary} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionIconBtn}
                            onPress={() => handleDeleteFile(file.path)}
                          >
                            <Trash2 size={13} color={Colors.brand.rose} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}

                {/* Inline File Preview if Selected */}
                {selectedFile && (
                  <View style={styles.previewContainer}>
                    <View style={styles.previewHeader}>
                      <Text style={styles.previewTitle} numberOfLines={1}>
                        {selectedFile.path}
                      </Text>
                      <View style={styles.previewActions}>
                        <TouchableOpacity
                          style={styles.previewBtn}
                          onPress={handleCopySelected}
                        >
                          {copied ? (
                            <>
                              <Check size={11} color={Colors.brand.emerald} />
                              <Text style={styles.previewBtnTextActive}>Copied</Text>
                            </>
                          ) : (
                            <>
                              <Copy size={11} color={Colors.text.secondary} />
                              <Text style={styles.previewBtnText}>Copy</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.previewBtn}
                          onPress={() => handleDownloadFile(selectedFile)}
                        >
                          <Download size={11} color={Colors.text.secondary} />
                          <Text style={styles.previewBtnText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <ScrollView
                      style={styles.previewContentBox}
                      nestedScrollEnabled
                      horizontal
                    >
                      <Text style={styles.previewCode} selectable>
                        {selectedFile.content}
                      </Text>
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* TAB 2: TESTS & BUILD */}
          {activeTab === 'tests' && (
            <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
              {/* Target Selector */}
              <View style={styles.targetSection}>
                <Text style={styles.targetLabel}>EXECUTION TARGET</Text>
                <View style={styles.targetRow}>
                  <TouchableOpacity
                    style={[styles.targetChoice, target === 'local_mac' && styles.targetChoiceActive]}
                    onPress={() => setTarget('local_mac')}
                    activeOpacity={0.7}
                  >
                    <Laptop size={14} color={target === 'local_mac' ? Colors.brand.emerald : Colors.text.tertiary} />
                    <View>
                      <Text style={[styles.targetChoiceTitle, target === 'local_mac' && styles.targetChoiceTitleActive]}>
                        Local Mac Host
                      </Text>
                      <Text style={styles.targetChoiceDesc}>
                        /tmp/spark-sandboxes/{activeEnv.id}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.targetChoice, target === 'dgx_spark' && styles.targetChoiceActive]}
                    onPress={() => setTarget('dgx_spark')}
                    activeOpacity={0.7}
                  >
                    <Cpu size={14} color={target === 'dgx_spark' ? Colors.brand.sky : Colors.text.tertiary} />
                    <View>
                      <Text style={[styles.targetChoiceTitle, target === 'dgx_spark' && styles.targetChoiceTitleActiveSky]}>
                        DGX Spark Blackwell
                      </Text>
                      <Text style={styles.targetChoiceDesc}>
                        192.168.4.103 (GB10 GPU)
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.testActionsRow}>
                <TouchableOpacity
                  style={styles.runAllTestsBtn}
                  onPress={() => runTestsForEnv()}
                  activeOpacity={0.8}
                  disabled={sandboxStatus === 'testing'}
                >
                  <FlaskConical size={14} color="#09090B" />
                  <Text style={styles.runAllTestsBtnText}>
                    {sandboxStatus === 'testing' ? 'Running Tests...' : 'Run Test Suite'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.buildBtn}
                  onPress={() => buildActiveEnv()}
                  activeOpacity={0.8}
                  disabled={sandboxStatus === 'building'}
                >
                  <Hammer size={14} color={Colors.text.primary} />
                  <Text style={styles.buildBtnText}>
                    {sandboxStatus === 'building' ? 'Building...' : 'Build & Check'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Active Test Report */}
              {activeTestReport ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sectionLabel}>LATEST TEST RUN</Text>
                  <TestResultCard report={activeTestReport} />
                </View>
              ) : (
                <View style={styles.emptyTestsState}>
                  <FlaskConical size={24} color={Colors.text.tertiary} />
                  <Text style={styles.emptyTestsTitle}>No Test Results Yet</Text>
                  <Text style={styles.emptyTestsDesc}>
                    Tap "Run Test Suite" to execute pytest / vitest assertions inside the sandbox.
                  </Text>
                </View>
              )}

              {/* Active Build Report */}
              {activeBuildReport && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.sectionLabel}>BUILD REPORT</Text>
                  <View style={styles.buildReportBox}>
                    <Text style={styles.buildReportTitle}>
                      {activeBuildReport.success ? '✓ Build Succeeded' : '✗ Build Failed'} ({activeBuildReport.runtime})
                    </Text>
                    <Text style={styles.buildReportOutput} selectable>
                      {activeBuildReport.output}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          )}

          {/* TAB 3: TERMINAL LOGS */}
          {activeTab === 'terminal' && (
            <View style={styles.tabContentTerminal}>
              <View style={styles.terminalWindowModal}>
                <ScrollView style={styles.terminalScroll} showsVerticalScrollIndicator nestedScrollEnabled>
                  {logs.map((line, idx) => {
                    const isErr = line.includes('[STDERR]') || line.includes('Error:') || line.includes('FAILED');
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

              <View style={styles.commandDockModal}>
                <Text style={styles.promptSymbol}>$</Text>
                <TextInput
                  style={styles.cmdInput}
                  value={cmdInput}
                  onChangeText={setCmdInput}
                  placeholder="Execute in sandbox..."
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
                >
                  <CornerDownLeft size={13} color={cmdInput.trim() ? '#09090B' : Colors.text.tertiary} />
                </TouchableOpacity>
              </View>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    maxHeight: '88%',
    height: '85%',
    backgroundColor: Colors.background.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  subtitle: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  tabBtnTextActive: {
    color: Colors.brand.emerald,
  },
  tabContent: {
    flex: 1,
    paddingTop: 8,
  },
  tabContentTerminal: {
    flex: 1,
    paddingTop: 8,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  calloutText: {
    flex: 1,
    fontSize: 11,
    color: Colors.text.secondary,
    lineHeight: 15,
  },
  downloadZipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand.emerald,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
    marginBottom: 12,
  },
  downloadZipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#09090B',
  },
  sectionLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  fileList: {
    flexGrow: 0,
    maxHeight: 340,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 4,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginBottom: 6,
  },
  fileCardActive: {
    borderColor: Colors.brand.sky,
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
  },
  fileMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileMeta: {
    flex: 1,
  },
  filePath: {
    fontSize: 12.5,
    fontFamily: 'Menlo',
    color: Colors.text.primary,
    fontWeight: '500',
  },
  fileDetails: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 2,
    fontFamily: 'Menlo',
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  previewContainer: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 8,
    backgroundColor: '#070709',
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#101014',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  previewTitle: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: Colors.text.secondary,
    maxWidth: 200,
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  previewBtnText: {
    fontSize: 10,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  previewBtnTextActive: {
    fontSize: 10,
    color: Colors.brand.emerald,
    fontWeight: '600',
  },
  previewContentBox: {
    padding: 10,
    maxHeight: 180,
  },
  previewCode: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text.code,
  },
  targetSection: {
    marginBottom: 12,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  targetChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  targetChoiceActive: {
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  targetChoiceTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  targetChoiceTitleActive: {
    color: Colors.brand.emerald,
  },
  targetChoiceTitleActiveSky: {
    color: Colors.brand.sky,
  },
  targetChoiceDesc: {
    fontSize: 9.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 2,
  },
  testActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  runAllTestsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.brand.emerald,
    paddingVertical: 10,
    borderRadius: 8,
  },
  runAllTestsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#09090B',
  },
  buildBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  buildBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  emptyTestsState: {
    paddingVertical: 30,
    alignItems: 'center',
    gap: 6,
  },
  emptyTestsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  emptyTestsDesc: {
    fontSize: 11,
    color: Colors.text.tertiary,
    textAlign: 'center',
    maxWidth: 260,
  },
  buildReportBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#07070A',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  buildReportTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.brand.emerald,
    marginBottom: 4,
    fontFamily: 'Menlo',
  },
  buildReportOutput: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.text.code,
    lineHeight: 15,
  },
  terminalWindowModal: {
    flex: 1,
    backgroundColor: '#040406',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border.default,
    padding: 10,
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
  commandDockModal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: '#09090D',
    marginTop: 8,
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
    paddingVertical: 2,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  sendBtn: {
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 4,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
});
