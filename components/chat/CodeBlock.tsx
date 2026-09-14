import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform, ActivityIndicator } from 'react-native';
import { Copy, Check, Download, FileCode, Play, FlaskConical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { downloadSingleFile } from '../../services/zipService';
import { useSandboxStore } from '../../stores/useSandboxStore';

interface CodeBlockProps {
  language?: string;
  code: string;
  filename?: string;
  blockIndex?: number;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language = 'plaintext',
  code,
  filename,
  blockIndex,
}) => {
  const [copied, setCopied] = useState(false);
  const { runCodeBlock, runTestsForEnv, runningCodeBlockIndex, status, setDrawerOpen } = useSandboxStore();

  const isRunningThis = runningCodeBlockIndex === blockIndex;

  const langKey = language.toLowerCase().trim();
  const isRunnable =
    ['python', 'py', 'typescript', 'ts', 'javascript', 'js', 'sh', 'bash', 'zsh'].includes(langKey) ||
    Boolean(filename?.match(/\.(py|ts|js|sh)$/i));

  const isTest =
    Boolean(filename?.toLowerCase().includes('test')) ||
    code.includes('def test_') ||
    code.includes('pytest') ||
    code.includes('it(') ||
    code.includes('describe(');

  const handleCopy = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}

    if (Platform.OS === 'web' && navigator?.clipboard) {
      await navigator.clipboard.writeText(code);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const downloadName = filename || `file.${language === 'plaintext' ? 'txt' : language}`;
    downloadSingleFile(downloadName, code);
  };

  const handleRun = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    if (isTest) {
      runTestsForEnv();
    } else {
      runCodeBlock(filename, code, blockIndex);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {filename ? (
            <>
              <FileCode size={12} color={Colors.brand.sky} />
              <Text style={styles.filenameText} numberOfLines={1}>
                {filename}
              </Text>
            </>
          ) : (
            <Text style={styles.languageText}>{language.toLowerCase()}</Text>
          )}

          {/* Quick Indicator if runnable */}
          {isRunnable && (
            <View style={styles.runnableTag}>
              <Text style={styles.runnableTagText}>
                {isTest ? 'TEST' : 'SANDBOX'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Run / Test Button in Sandbox */}
          {isRunnable && (
            <TouchableOpacity
              style={[styles.actionBtnRun, isRunningThis && styles.actionBtnRunning]}
              onPress={handleRun}
              activeOpacity={0.7}
              disabled={isRunningThis}
            >
              {isRunningThis ? (
                <ActivityIndicator size={10} color={Colors.brand.sky} />
              ) : isTest ? (
                <FlaskConical size={11} color={Colors.brand.emerald} />
              ) : (
                <Play size={10} color={Colors.brand.emerald} />
              )}
              <Text style={styles.actionBtnRunText}>
                {isRunningThis ? 'Running' : isTest ? 'Test' : 'Run'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleDownload}
            activeOpacity={0.7}
          >
            <Download size={11} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            {copied ? (
              <>
                <Check size={11} color={Colors.brand.emerald} />
                <Text style={styles.copiedLabel}>Copied</Text>
              </>
            ) : (
              <>
                <Copy size={11} color={Colors.text.tertiary} />
                <Text style={styles.actionLabel}>Copy</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.codeContainer}>
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0A0A0E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filenameText: {
    fontSize: 11,
    color: Colors.text.primary,
    fontFamily: 'Menlo',
    fontWeight: '600',
  },
  languageText: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  copiedLabel: {
    fontSize: 10,
    color: Colors.brand.emerald,
    fontWeight: '600',
  },
  codeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'scroll',
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 11.5,
    lineHeight: 18,
    color: Colors.text.code,
  },
  runnableTag: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  runnableTagText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: Colors.brand.emerald,
    fontFamily: 'Menlo',
  },
  actionBtnRun: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  actionBtnRunning: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  actionBtnRunText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brand.emerald,
    fontFamily: 'Menlo',
  },
});
