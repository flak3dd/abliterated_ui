import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Bot, Check, AlertTriangle, Loader, Play } from 'lucide-react-native';
import Colors from '../../theme/colors';
import type { AgentRun, AgentStep } from '../../types/agent';

function StepRow({ step }: { step: AgentStep }) {
  const icon =
    step.status === 'running' ? (
      <Loader size={11} color={Colors.brand.sky} />
    ) : step.status === 'ok' ? (
      <Check size={11} color={Colors.brand.green} />
    ) : (
      <AlertTriangle size={11} color={Colors.brand.rose} />
    );
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        {icon}
        <Text style={styles.tool}>{step.tool}</Text>
        {step.argsPreview ? (
          <Text style={styles.args} numberOfLines={1}>
            {step.argsPreview}
          </Text>
        ) : null}
      </View>
      {step.excerpt ? (
        <Text style={styles.excerpt} numberOfLines={2}>
          {step.excerpt}
        </Text>
      ) : null}
    </View>
  );
}

function statusLabel(status: AgentRun['status']): string {
  if (status === 'running') return 'RUNNING';
  if (status === 'completed') return 'DONE';
  if (status === 'cancelled') return 'STOPPED';
  if (status === 'budget') return 'BUDGET';
  return 'FAILED';
}

function lightSummary(run: AgentRun): string | null {
  if (run.status === 'running') return null;
  const bits: string[] = [];
  if (typeof run.lastTestPassed === 'boolean') {
    bits.push(run.lastTestPassed ? 'tests passed' : 'tests failed');
  }
  if (typeof run.lastBuildOk === 'boolean') {
    bits.push(run.lastBuildOk ? 'build ok' : 'build failed');
  }
  const okSteps = run.steps.filter((s) => s.status === 'ok').length;
  const errSteps = run.steps.filter((s) => s.status === 'error').length;
  if (run.steps.length) bits.push(`${okSteps} ok / ${errSteps} err`);
  const written = run.artifacts?.filesWritten?.length || 0;
  if (written) bits.push(`${written} files written`);
  if (run.summary && run.summary !== run.error) {
    const one = run.summary.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (one) bits.push(one);
  }
  return bits.length ? bits.join(' · ') : null;
}

function canContinue(status: AgentRun['status']): boolean {
  return status === 'budget' || status === 'cancelled' || status === 'failed';
}

export const AgentRunCard: React.FC<{
  run: AgentRun;
  onContinue?: (run: AgentRun) => void;
}> = ({ run, onContinue }) => {
  const label = statusLabel(run.status);
  const summary = lightSummary(run);
  const badgeStyle =
    run.status === 'completed'
      ? styles.badgeOk
      : run.status === 'failed' || run.status === 'budget'
      ? styles.badgeFail
      : run.status === 'cancelled'
      ? styles.badgeStop
      : undefined;

  const plan = run.plan || [];
  const doneCount = plan.filter((t) => t.status === 'done').length;
  const showContinue = Boolean(onContinue) && canContinue(run.status);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Bot size={13} color={Colors.brand.emerald} />
        <Text style={styles.title}>BUILD AGENT</Text>
        <Text style={[styles.badge, badgeStyle]}>{label}</Text>
        {run.phase ? <Text style={styles.phase}>{run.phase.toUpperCase()}</Text> : null}
        <Text style={styles.meta}>
          {run.stepCount} steps · {run.execCount} exec
          {run.budgetTier ? ` · ${run.budgetTier}` : ''}
        </Text>
      </View>

      {plan.length > 0 ? (
        <View style={styles.planBox}>
          <Text style={styles.planHead}>
            Checklist {doneCount}/{plan.length}
          </Text>
          {plan.slice(0, 8).map((t) => (
            <Text key={t.id} style={styles.planItem} numberOfLines={1}>
              {t.status === 'done' ? '✓' : t.status === 'blocked' ? '⊘' : '○'} {t.title}
            </Text>
          ))}
          {plan.length > 8 ? (
            <Text style={styles.planMore}>+{plan.length - 8} more</Text>
          ) : null}
        </View>
      ) : null}

      {!run.steps.length ? (
        <Text style={styles.empty}>
          {run.status === 'running'
            ? 'Waiting for first tool call…'
            : run.error
            ? 'No tool steps recorded.'
            : 'No steps.'}
        </Text>
      ) : (
        run.steps.map((s) => <StepRow key={s.id} step={s} />)
      )}

      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {run.error ? <Text style={styles.err}>{run.error}</Text> : null}

      {showContinue ? (
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => onContinue?.(run)}
          activeOpacity={0.75}
          accessibilityLabel="Continue BUILD agent run"
        >
          <Play size={12} color={Colors.brand.emerald} fill={Colors.brand.emerald} />
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.28)',
    backgroundColor: 'rgba(9, 9, 11, 0.7)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Colors.brand.emerald,
  },
  badge: { fontSize: 9, fontWeight: '800', color: Colors.brand.sky, letterSpacing: 0.5 },
  badgeOk: { color: Colors.brand.green },
  badgeFail: { color: Colors.brand.rose },
  badgeStop: { color: Colors.brand.amber },
  phase: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.brand.sky,
    letterSpacing: 0.4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  meta: { marginLeft: 'auto', fontSize: 10, color: Colors.text.tertiary, fontFamily: 'Menlo' },
  planBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 6,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  planHead: { fontSize: 10, fontWeight: '700', color: Colors.text.secondary, marginBottom: 2 },
  planItem: { fontSize: 10, color: Colors.text.tertiary, fontFamily: 'Menlo' },
  planMore: { fontSize: 9, color: Colors.text.tertiary, fontStyle: 'italic' },
  step: { gap: 2, paddingLeft: 2 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tool: { fontSize: 11, fontWeight: '700', color: Colors.text.primary, fontFamily: 'Menlo' },
  args: { flex: 1, fontSize: 10, color: Colors.text.secondary, fontFamily: 'Menlo' },
  excerpt: { fontSize: 10, color: Colors.text.tertiary, lineHeight: 14, paddingLeft: 17 },
  empty: { fontSize: 11, color: Colors.text.tertiary, fontStyle: 'italic' },
  summary: { fontSize: 11, color: Colors.text.secondary, lineHeight: 15 },
  err: { fontSize: 11, color: Colors.brand.rose },
  continueBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  continueText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.3,
  },
});
