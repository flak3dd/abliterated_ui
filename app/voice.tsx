import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Mic,
  MicOff,
  PhoneOff,
  HandMetal,
  Volume2,
  Sparkles,
  Zap,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../theme/colors';
import { useVoiceStore } from '../stores/useVoiceStore';
import { PulsingVoiceOrb } from '../components/voice/PulsingVoiceOrb';
import { VoiceTranscript } from '../components/voice/VoiceTranscript';

const QUICK_VOICE_QUERIES = [
  'What are your GB10 hardware specs?',
  'Explain quantum error correction on Blackwell.',
  'How does local vLLM bypass cloud APIs?',
];

export default function VoiceModalScreen() {
  const router = useRouter();
  const {
    voiceState,
    userTranscript,
    assistantReply,
    isInterrupted,
    startListening,
    submitSpokenTurn,
    interrupt,
    resetVoiceSession,
  } = useVoiceStore();

  const [simulatedSpeech, setSimulatedSpeech] = useState(false);

  useEffect(() => {
    startListening();
    return () => {
      resetVoiceSession();
    };
  }, []);

  const handleEndConversation = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    resetVoiceSession();
    router.back();
  };

  const handleInterrupt = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}
    interrupt();
  };

  const handleAskQuery = (query: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    submitSpokenTurn(query);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.statusIndicator}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  voiceState === 'speaking'
                    ? Colors.brand.emerald
                    : voiceState === 'thinking'
                    ? Colors.brand.sky
                    : Colors.brand.emerald,
              },
            ]}
          />
          <Text style={styles.statusText}>
            {voiceState === 'listening'
              ? 'LISTENING FOR AUDIO'
              : voiceState === 'thinking'
              ? 'DGX SPARK REASONING'
              : 'SPEAKING SYNTHESIS'}
          </Text>
        </View>

        <View style={styles.hardwareBadge}>
          <Zap size={12} color={Colors.brand.emerald} />
          <Text style={styles.hardwareBadgeText}>GB10 DUPLEX</Text>
        </View>
      </View>

      {/* Main Reactive Audio Orb Area */}
      <View style={styles.orbArea}>
        <PulsingVoiceOrb state={voiceState} />
      </View>

      {/* Dual-Line Live Subtitles */}
      <VoiceTranscript
        userText={userTranscript}
        assistantText={assistantReply}
        state={voiceState}
      />

      {/* Quick Test Voice Queries Strip */}
      <View style={styles.quickQueriesWrapper}>
        <Text style={styles.quickTitle}>SAMPLE SPOKEN QUERIES</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.queryScroll}
        >
          {QUICK_VOICE_QUERIES.map((q, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.queryChip}
              onPress={() => handleAskQuery(q)}
              activeOpacity={0.7}
            >
              <Text style={styles.queryChipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Bottom Voice Controls */}
      <View style={styles.controlsRow}>
        {/* Barge-in / Interrupt Button */}
        {voiceState === 'speaking' && (
          <TouchableOpacity
            style={styles.interruptBtn}
            onPress={handleInterrupt}
            activeOpacity={0.7}
          >
            <HandMetal size={18} color="#F43F5E" />
            <Text style={styles.interruptBtnText}>Interrupt Assistant</Text>
          </TouchableOpacity>
        )}

        {/* End Conversation Button */}
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={handleEndConversation}
          activeOpacity={0.8}
        >
          <PhoneOff size={18} color="#F43F5E" />
          <Text style={styles.dismissBtnText}>End Conversation</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  topHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.background.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.6,
  },
  hardwareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  hardwareBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.5,
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 260,
  },
  quickQueriesWrapper: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  quickTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },
  queryScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  queryChip: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  queryChipText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  controlsRow: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 8,
  },
  interruptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  interruptBtnText: {
    color: '#F43F5E',
    fontSize: 13.5,
    fontWeight: '700',
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 9999,
    width: '80%',
    maxWidth: 280,
  },
  dismissBtnText: {
    color: '#F43F5E',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
