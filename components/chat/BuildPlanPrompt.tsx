import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ClipboardList, Play, Sparkles } from 'lucide-react-native';
import Colors from '../../theme/colors';
import type { BuildPlanPrompt as BuildPlanPromptState } from '../../types';

export const BuildPlanPromptCard: React.FC<{
  prompt: BuildPlanPromptState;
  onDraft: () => void;
  onStart: () => void;
  disabled?: boolean;
}> = ({ prompt, onDraft, onStart, disabled }) => {
  const drafting = prompt.status === 'drafting';
  const ready = prompt.status === 'ready' && Boolean(prompt.planText?.trim());
  const busy = Boolean(disabled) || drafting;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <ClipboardList size={13} color={Colors.brand.amber} />
        <Text style={styles.title}>BUILD PLAN REQUIRED</Text>
        <Text style={styles.badge}>
          {drafting ? 'DRAFTING' : ready ? 'READY' : 'AWAITING'}
        </Text>
      </View>

      <Text style={styles.body}>
        Before BUILD runs, create a build plan. Draft one below, or reply with your own plan,
        then tap <Text style={styles.em}>Start BUILD</Text> (or say <Text style={styles.em}>start build</Text>).
      </Text>

      {prompt.goal ? (
        <Text style={styles.goal} numberOfLines={4}>
          Goal: {prompt.goal}
        </Text>
      ) : null}

      {prompt.planText?.trim() ? (
        <View style={styles.planBox}>
          <Text style={styles.planHead}>Plan</Text>
          <Text style={styles.planText}>{prompt.planText.trim()}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
          onPress={onDraft}
          disabled={busy}
          activeOpacity={0.75}
          accessibilityLabel="Draft build plan"
        >
          {drafting ? (
            <ActivityIndicator size="small" color={Colors.brand.sky} />
          ) : (
            <Sparkles size={12} color={Colors.brand.sky} />
          )}
          <Text style={styles.btnSecondaryText}>
            {drafting ? 'Drafting…' : ready ? 'Redraft plan' : 'Draft plan'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            (!ready || busy) && styles.btnDisabled,
          ]}
          onPress={onStart}
          disabled={!ready || busy}
          activeOpacity={0.75}
          accessibilityLabel="Approve plan and start BUILD"
        >
          <Play size={12} color={Colors.brand.green} fill={Colors.brand.green} />
          <Text style={styles.btnPrimaryText}>Start BUILD</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(9, 9, 11, 0.75)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Colors.brand.amber,
  },
  badge: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.brand.sky,
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 17,
  },
  em: { color: Colors.text.primary, fontWeight: '700' },
  goal: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    lineHeight: 15,
  },
  planBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 8,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  planHead: { fontSize: 10, fontWeight: '700', color: Colors.text.secondary },
  planText: {
    fontSize: 11,
    color: Colors.text.primary,
    lineHeight: 16,
    fontFamily: 'Menlo',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnSecondary: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  btnPrimary: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  btnDisabled: { opacity: 0.45 },
  btnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.sky,
    letterSpacing: 0.3,
  },
  btnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.green,
    letterSpacing: 0.3,
  },
});
