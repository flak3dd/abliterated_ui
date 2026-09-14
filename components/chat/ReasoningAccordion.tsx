import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronRight, BrainCircuit } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';

interface ReasoningAccordionProps {
  reasoning: string;
  isStreaming?: boolean;
}

export const ReasoningAccordion: React.FC<ReasoningAccordionProps> = ({
  reasoning,
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  const toggleExpand = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setIsExpanded((prev) => !prev);
  };

  if (!reasoning?.trim()) return null;

  const wordCount = reasoning.trim().split(/\s+/).length;
  // Estimate tokens assuming roughly 1.3 tokens per word for reasoning
  const tokenCount = Math.ceil(wordCount * 1.3);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.header, isStreaming && styles.headerStreaming]}
        onPress={toggleExpand}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <BrainCircuit size={12} color={isStreaming ? Colors.brand.emerald : Colors.text.tertiary} />
          <Text style={[styles.title, isStreaming && styles.titleStreaming]}>
            {isStreaming ? 'Thinking...' : 'Thought Process'}
          </Text>
          {isStreaming && (
            <View style={styles.streamingBadge}>
              <View style={styles.pulsingDot} />
            </View>
          )}
        </View>

        {!isStreaming && (
          <View style={styles.headerRight}>
            <Text style={styles.tokenCount}>· {tokenCount} tokens</Text>
            {isExpanded ? (
              <ChevronDown size={12} color={Colors.text.tertiary} />
            ) : (
              <ChevronRight size={12} color={Colors.text.tertiary} />
            )}
          </View>
        )}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.contentContainer}>
          <Text style={styles.reasoningText} selectable>
            {reasoning.trim()}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
  },
  headerStreaming: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.text.tertiary,
  },
  titleStreaming: {
    color: Colors.brand.emerald,
  },
  streamingBadge: {
    marginLeft: 2,
  },
  pulsingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand.emerald,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tokenCount: {
    fontSize: 10,
    color: Colors.text.tertiary,
  },
  contentContainer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    maxHeight: 200,
  },
  reasoningText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
});
