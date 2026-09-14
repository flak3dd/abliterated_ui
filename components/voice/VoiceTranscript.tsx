import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '../../theme/colors';

interface VoiceTranscriptProps {
  userText: string;
  assistantText: string;
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export const VoiceTranscript: React.FC<VoiceTranscriptProps> = ({
  userText,
  assistantText,
  state,
}) => {
  return (
    <View style={styles.container}>
      {/* User Spoken Input (Top Line) */}
      <View style={styles.lineWrapper}>
        <Text style={styles.speakerTag}>YOU</Text>
        <Text style={styles.userText} numberOfLines={2}>
          {userText || (state === 'listening' ? 'Listening...' : '—')}
        </Text>
      </View>

      <View style={styles.separator} />

      {/* Assistant Response (Bottom Line) */}
      <View style={styles.lineWrapper}>
        <Text style={styles.assistantTag}>SPARK AI (GB10)</Text>
        <Text style={styles.assistantText} numberOfLines={3}>
          {assistantText || 'Ready for query.'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    padding: 16,
    marginVertical: 18,
  },
  lineWrapper: {
    paddingVertical: 4,
  },
  speakerTag: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assistantTag: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  userText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  assistantText: {
    fontSize: 15,
    color: Colors.text.primary,
    fontWeight: '500',
    lineHeight: 22,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border.default,
    marginVertical: 8,
  },
});
