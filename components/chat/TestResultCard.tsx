import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { CheckCircle2, XCircle, Wrench, Terminal, ChevronDown, ChevronUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { TestRunReport } from '../../types';
import { useSandboxStore } from '../../stores/useSandboxStore';

interface TestResultCardProps {
  report: TestRunReport;
}

export const TestResultCard: React.FC<TestResultCardProps> = ({ report }) => {
  const [expanded, setExpanded] = useState(false);
  const { setDrawerOpen, autoFixWithSpark } = useSandboxStore();

  const isSuccess = report.failed === 0;
  const passPercent = report.total > 0 ? (report.passed / report.total) * 100 : 100;

  const handleAutoFix = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    // Extract failure message from failing tests or rawOutput
    const failedTests = report.tests.filter((t) => t.status === 'failed');
    let errorSummary = failedTests
      .map((t) => `FAILED: ${t.name}\n${t.failureMessage || ''}\n${t.traceback || ''}`)
      .join('\n\n');

    if (!errorSummary.trim()) {
      errorSummary = report.rawOutput;
    }

    autoFixWithSpark(errorSummary);
  };

  const handleOpenTerminal = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setDrawerOpen(true);
  };

  return (
    <View style={[styles.card, isSuccess ? styles.cardSuccess : styles.cardFailed]}>
      {/* Header Row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isSuccess ? (
            <CheckCircle2 size={16} color={Colors.brand.emerald} />
          ) : (
            <XCircle size={16} color={Colors.brand.rose} />
          )}
          <Text style={styles.title}>
            {isSuccess ? 'Sandbox Tests Passed' : 'Sandbox Tests Failed'}
          </Text>
          <View
            style={[
              styles.badge,
              isSuccess ? styles.badgeSuccess : styles.badgeFailed,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                isSuccess ? styles.badgeTextSuccess : styles.badgeTextFailed,
              ]}
            >
              {report.passed}/{report.total}
            </Text>
          </View>
        </View>

        <Text style={styles.duration}>
          {(report.durationMs / 1000).toFixed(2)}s • {report.framework}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${passPercent}%` },
            isSuccess ? styles.progressSuccess : styles.progressFailed,
          ]}
        />
      </View>

      {/* Failures List if tests failed */}
      {!isSuccess && (
        <View style={styles.failuresBox}>
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setExpanded(!expanded)}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleText}>
              {report.failed} {report.failed === 1 ? 'failure' : 'failures'} in test suite
            </Text>
            {expanded ? (
              <ChevronUp size={14} color={Colors.text.tertiary} />
            ) : (
              <ChevronDown size={14} color={Colors.text.tertiary} />
            )}
          </TouchableOpacity>

          {expanded && (
            <ScrollView style={styles.failureList} nestedScrollEnabled>
              {report.tests
                .filter((t) => t.status === 'failed')
                .map((t, idx) => (
                  <View key={idx} style={styles.failureItem}>
                    <Text style={styles.failureName} numberOfLines={1}>
                      ✗ {t.name}
                    </Text>
                    {Boolean(t.failureMessage) && (
                      <Text style={styles.failureDetail}>
                        {t.failureMessage}
                      </Text>
                    )}
                    {Boolean(t.traceback) && (
                      <Text style={styles.failureTrace} numberOfLines={8} selectable>
                        {t.traceback}
                      </Text>
                    )}
                  </View>
                ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Action Footer */}
      <View style={styles.actionsRow}>
        {!isSuccess && (
          <TouchableOpacity
            style={styles.autoFixBtn}
            onPress={handleAutoFix}
            activeOpacity={0.8}
          >
            <Wrench size={12} color="#09090B" />
            <Text style={styles.autoFixText}>Auto-Fix with Spark AI</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.terminalBtn}
          onPress={handleOpenTerminal}
          activeOpacity={0.7}
        >
          <Terminal size={12} color={Colors.text.secondary} />
          <Text style={styles.terminalText}>View Terminal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    backgroundColor: 'rgba(10, 10, 14, 0.95)',
  },
  cardSuccess: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  cardFailed: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeFailed: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  badgeTextSuccess: {
    color: Colors.brand.emerald,
  },
  badgeTextFailed: {
    color: Colors.brand.rose,
  },
  duration: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  progressBarBg: {
    height: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressSuccess: {
    backgroundColor: Colors.brand.emerald,
  },
  progressFailed: {
    backgroundColor: Colors.brand.rose,
  },
  failuresBox: {
    backgroundColor: 'rgba(244, 63, 94, 0.05)',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.12)',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleText: {
    fontSize: 11,
    color: Colors.brand.rose,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  failureList: {
    marginTop: 6,
    maxHeight: 140,
  },
  failureItem: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  failureName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brand.rose,
    fontFamily: 'Menlo',
  },
  failureDetail: {
    fontSize: 10.5,
    color: Colors.text.secondary,
    marginTop: 2,
    fontFamily: 'Menlo',
  },
  failureTrace: {
    fontSize: 9.5,
    color: Colors.text.tertiary,
    backgroundColor: '#050507',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
    fontFamily: 'Menlo',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  autoFixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.emerald,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 5,
  },
  autoFixText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#09090B',
  },
  terminalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  terminalText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});
