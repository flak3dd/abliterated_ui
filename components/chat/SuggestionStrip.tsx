import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';

interface EnhancementOption {
  label: string;
  empty: string;
  enhance: (draft: string) => string;
}

/** Ten chat enhancement chips: fill an empty composer, or rewrite the current draft. */
export const CHAT_ENHANCEMENTS: EnhancementOption[] = [
  {
    label: 'Tighten',
    empty: 'Answer in exact facts and runnable steps. No preamble. Name files, ports, and commands.',
    enhance: (d) =>
      'Rewrite the following for Spark: no fluff, exact APIs, file paths, and a runnable result.\n\n' + d,
  },
  {
    label: 'Pytest suite',
    empty: 'Write a complete Python module plus test_*.py pytest suite ready to run in the sandbox.',
    enhance: (d) =>
      'Turn this into a complete Python module and a pytest suite that the sandbox can run. Include fixtures and failure cases.\n\n' +
      d,
  },
  {
    label: 'Cite RAG',
    empty: 'Answer only from retrieved local knowledge. Cite chunk titles. If the index lacks it, say so.',
    enhance: (d) =>
      'Answer this using retrieved local knowledge only. Cite chunk titles. If the index does not contain it, say the index lacks it.\n\n' +
      d,
  },
  {
    label: 'GB10 budget',
    empty: 'Plan this for NVIDIA GB10: 128 GB unified LPDDR5x, ~121.7 GiB CUDA-visible, sm_121, vLLM :8000, image :7860.',
    enhance: (d) =>
      'Constraint: NVIDIA DGX Spark GB10, 128 GB unified LPDDR5x, ~121.7 GiB CUDA-visible, sm_121. Respect vLLM :8000 and image :7860 memory. Apply to:\n\n' +
      d,
  },
  {
    label: 'Debug',
    empty: 'Isolate the failure: repro, expected vs actual, likely cause, then a minimal patch.',
    enhance: (d) =>
      'Debug this. Give: (1) smallest repro (2) expected vs actual (3) likely cause (4) minimal patch.\n\n' + d,
  },
  {
    label: 'Sandbox files',
    empty: 'Emit complete files for the active sandbox (paths + full contents). No placeholders.',
    enhance: (d) =>
      'Emit complete sandbox files for this (path + full contents, no placeholders). Ready to write and test.\n\n' +
      d,
  },
  {
    label: 'Direct',
    empty: 'Answer completely and directly. No hedging, no refusal framing, no omitted steps.',
    enhance: (d) =>
      'Answer this completely and directly. No hedging, no omitted steps, no placeholder code.\n\n' + d,
  },
  {
    label: 'Mesh ops',
    empty: 'Explain live mesh routing: Spark :8000 vLLM, :7860 image, Mac :17325 controller. Include curl checks.',
    enhance: (d) =>
      'Treat this as a mesh ops question. Use Spark vLLM :8000, image :7860, controller :17325. Include verification curls.\n\n' +
      d,
  },
  {
    label: 'Image pipe',
    empty: 'Work against the Diffusers bridge on :7860 (load weights, then generate). No ComfyUI.',
    enhance: (d) =>
      'Route this through the Spark Diffusers bridge on :7860. Load weights before generate. No ComfyUI.\n\n' + d,
  },
  {
    label: 'Patch only',
    empty: 'Return a unified diff against the current files. No rewritten files unless a new path is required.',
    enhance: (d) =>
      'Return a unified diff only against current files. Do not rewrite whole files unless a new path is required.\n\n' +
      d,
  },
];

/** BUILD agent chips — goals the tool-loop can execute (write/test/fix). */
export const AGENT_ENHANCEMENTS: EnhancementOption[] = [
  {
    label: 'Write + pytest',
    empty: 'Create a Python module and matching test_*.py. Run pytest and fix until green.',
    enhance: (d) =>
      'BUILD agent: implement this as complete sandbox files, then run pytest and fix until green.\n\n' + d,
  },
  {
    label: 'List then patch',
    empty: 'List sandbox files first, read what exists, then patch with write_file. No placeholders.',
    enhance: (d) =>
      'BUILD agent: list_files and read_file first, then write_file patches only. Goal:\n\n' + d,
  },
  {
    label: 'Minimal module',
    empty: 'Ship the smallest complete module that satisfies the goal, plus one focused pytest file.',
    enhance: (d) =>
      'BUILD agent: smallest complete module + one pytest file. No extra scaffolding.\n\n' + d,
  },
  {
    label: 'Fix tests',
    empty: 'Run the sandbox test suite, read failures, patch source, re-test until all pass.',
    enhance: (d) =>
      'BUILD agent: run test, fix failures with write_file, re-test until pass.\n\n' + d,
  },
  {
    label: 'Node smoke',
    empty: 'Add a small Node/JS module and a runnable smoke check via npm test or node.',
    enhance: (d) =>
      'BUILD agent: implement Node/JS files and verify with npm test or node. Goal:\n\n' + d,
  },
  {
    label: 'Build check',
    empty: 'Write the project files, run build, and fix compile errors until build succeeds.',
    enhance: (d) =>
      'BUILD agent: write files, run build, fix until build ok.\n\n' + d,
  },
];

export const SWARM_ENHANCEMENTS: EnhancementOption[] = [
  {
    label: 'Decompose',
    empty: 'Build a multi-file project with workers for implement, test, and critique. Prefer pytest.',
    enhance: (d) =>
      'Swarm task: decompose across implement/test/critique workers.\n\n' + d,
  },
  {
    label: 'Cache service',
    empty: 'Build an asynchronous cache manager with redis-compatible API and pytest suite.',
    enhance: (d) => 'Swarm task (cache service):\n\n' + d,
  },
  {
    label: 'API + tests',
    empty: 'Scaffold a small HTTP API with handlers, types, and an automated test matrix.',
    enhance: (d) => 'Swarm task (API + tests):\n\n' + d,
  },
];

interface SuggestionStripProps {
  draft?: string;
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
  mode?: 'chat' | 'agent' | 'swarm';
}

export const SuggestionStrip: React.FC<SuggestionStripProps> = ({
  draft = '',
  onSelectPrompt,
  disabled = false,
  mode = 'chat',
}) => {
  const items =
    mode === 'agent' ? AGENT_ENHANCEMENTS : mode === 'swarm' ? SWARM_ENHANCEMENTS : CHAT_ENHANCEMENTS;

  const handlePress = (item: EnhancementOption) => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const trimmed = draft.trim();
    onSelectPrompt(trimmed ? item.enhance(trimmed) : item.empty);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[
              styles.chip,
              mode === 'agent' && styles.chipAgent,
              disabled && styles.chipDisabled,
            ]}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Text style={[styles.chipText, mode === 'agent' && styles.chipTextAgent]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: 860,
    paddingVertical: 4,
    marginBottom: 6,
  },
  scrollContent: {
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  chipAgent: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: -0.1,
  },
  chipTextAgent: {
    color: Colors.brand.emerald,
  },
});
