import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';

interface SuggestionStripProps {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
}

const QUICK_PROMPTS = [
  { label: '🧪 Pytest Sandbox', prompt: 'Write a complete Python module for token bucket rate limiting with an accompanying test_ratelimit.py pytest suite ready for sandbox execution.' },
  { label: 'GB10 Specs', prompt: 'Summarize the architecture and specs of NVIDIA DGX Spark GB10 Blackwell.' },
  { label: 'Async vLLM Client', prompt: 'Write an ultra-fast streaming Python async client for our local DGX Spark vLLM server.' },
  { label: 'Code Gen', prompt: 'Show an optimized React Native component using reanimated and clean state.' },
  { label: 'System Topology', prompt: 'Explain the local mesh topology: ports 8000, 7860, 8188, and 17325.' },
];

export const SuggestionStrip: React.FC<SuggestionStripProps> = ({
  onSelectPrompt,
  disabled = false,
}) => {
  const handlePress = (prompt: string) => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onSelectPrompt(prompt);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {QUICK_PROMPTS.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.chip, disabled && styles.chipDisabled]}
            onPress={() => handlePress(item.prompt)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Text style={styles.chipText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: Colors.background.primary,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
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
});
