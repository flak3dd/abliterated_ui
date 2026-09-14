import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Mic, ArrowUp, Square, ShieldCheck, Zap, BookOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSwarmStore } from '../../stores/useSwarmStore';
import { useRagStore } from '../../stores/useRagStore';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface InputDockProps {
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export const InputDock: React.FC<InputDockProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  disabled = false,
}) => {
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const { antiHallucination, toggleAntiHallucination } = useChatStore();
  const { isSwarmMode, toggleSwarmMode } = useSwarmStore();
  const { enabled: ragEnabled, chunks, toggleEnabled: toggleRag } = useRagStore();
  
  // Animations
  const sendButtonScale = useSharedValue(0.8);
  const sendButtonOpacity = useSharedValue(0);

  const canSend = inputText.trim().length > 0 && !isStreaming;

  useEffect(() => {
    if (canSend) {
      sendButtonScale.value = withSpring(1, { damping: 12 });
      sendButtonOpacity.value = withTiming(1, { duration: 200 });
    } else {
      sendButtonScale.value = withSpring(0.8, { damping: 12 });
      sendButtonOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [canSend]);

  const animatedSendStyle = useAnimatedStyle(() => {
    return {
      opacity: sendButtonOpacity.value,
      transform: [{ scale: sendButtonScale.value }],
    };
  });

  const handleSend = () => {
    if (!canSend) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    onSendMessage(inputText);
    setInputText('');
  };

  const handleStop = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    onStopStreaming();
  };

  const handleVoicePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    router.push('/voice');
  };

  const handleKeyPress = (e: any) => {
    if (
      Platform.OS === 'web' &&
      e.nativeEvent?.key === 'Enter' &&
      !e.nativeEvent?.shiftKey
    ) {
      e.preventDefault?.();
      handleSend();
    }
  };

  return (
    <View style={styles.dockContainer}>
      <View style={styles.glassPill}>
        {/* Voice Mode Button */}
        <TouchableOpacity
          style={styles.micButton}
          onPress={handleVoicePress}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Mic size={18} color={Colors.text.secondary} />
        </TouchableOpacity>

        {/* Text Input Field */}
        <TextInput
          style={styles.textInput}
          placeholder={isSwarmMode ? "Swarm Task (e.g. Build asynchronous cache manager with redis and pytest)..." : "Ask Spark AI (e.g. Write a Python rate limiter with pytest suite)..."}
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={inputText}
          onChangeText={setInputText}
          onKeyPress={handleKeyPress}
          multiline
          maxLength={4000}
          editable={!disabled}
          returnKeyType="send"
        />

        {/* Send or Stop Button */}
        {isStreaming ? (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={handleStop}
            activeOpacity={0.7}
          >
            <Square size={12} color="#F43F5E" fill="#F43F5E" />
          </TouchableOpacity>
        ) : (
          <Animated.View style={animatedSendStyle}>
            <TouchableOpacity
              style={styles.sendButtonActive}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              <ArrowUp
                size={16}
                color="#04070c"
                strokeWidth={3}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Desktop Keyboard, Sandbox Hint & Swarm/Anti-Hallucination Toggles */}
      {Platform.OS === 'web' && (
        <View style={styles.desktopHintRow}>
          <Text style={styles.desktopHintText}>
            <Text style={{ fontWeight: '700' }}>Enter</Text> to send • <Text style={{ fontWeight: '700' }}>Shift+Enter</Text> for newline
          </Text>

          <View style={styles.dockRightControls}>
            <TouchableOpacity
              style={[
                styles.swarmPill,
                isSwarmMode && styles.swarmPillActive,
              ]}
              accessibilityLabel="Toggle Multi-Agent Swarm"
              accessibilityHint="When enabled, the agent intelligently decides whether to spawn a multi-agent swarm for complex tasks or respond directly."
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (e) {}
                toggleSwarmMode();
              }}
              activeOpacity={0.75}
            >
              <Zap
                size={11}
                color={isSwarmMode ? Colors.brand.emerald : '#71717A'}
              />
              <Text
                style={[
                  styles.swarmPillText,
                  isSwarmMode && styles.swarmPillTextActive,
                ]}
              >
                {isSwarmMode ? 'Swarm: AUTO' : 'Swarm: OFF'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.antiHallucinationPill, ragEnabled && styles.antiHallucinationPillActive]}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (e) {}
                toggleRag();
              }}
              activeOpacity={0.75}
            >
              <BookOpen size={11} color={ragEnabled ? Colors.brand.emerald : '#71717A'} />
              <Text
                style={[
                  styles.antiHallucinationPillText,
                  ragEnabled && styles.antiHallucinationPillTextActive,
                ]}
              >
                {ragEnabled ? 'RAG: ' + chunks.length + ' chunks' : 'RAG: OFF'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.antiHallucinationPill,
                antiHallucination && styles.antiHallucinationPillActive,
              ]}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (e) {}
                toggleAntiHallucination();
              }}
              activeOpacity={0.75}
            >
              <ShieldCheck
                size={11}
                color={antiHallucination ? Colors.brand.emerald : '#71717A'}
              />
              <Text
                style={[
                  styles.antiHallucinationPillText,
                  antiHallucination && styles.antiHallucinationPillTextActive,
                ]}
              >
                {antiHallucination ? 'Anti-Hallucination: STRICT' : 'Anti-Hallucination: OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dockContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    width: '100%',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(18, 18, 22, 0.85)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: '100%',
    maxWidth: 860,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    color: '#EFF6FF',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 38,
    maxHeight: 140,
    textAlignVertical: 'center',
    fontFamily: Platform.OS === 'web' ? 'system-ui, -apple-system, sans-serif' : undefined,
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  sendButtonActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brand.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.brand.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    marginBottom: 2,
  },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  desktopHintRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 860,
    paddingHorizontal: 4,
  },
  desktopHintText: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.35)',
    fontFamily: 'Menlo',
  },
  dockRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swarmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  swarmPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  swarmPillText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: '#71717A',
    fontWeight: '600',
  },
  swarmPillTextActive: {
    color: Colors.brand.emerald,
    fontWeight: '800',
  },
  antiHallucinationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  antiHallucinationPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  antiHallucinationPillText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: '#71717A',
    fontWeight: '600',
  },
  antiHallucinationPillTextActive: {
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
});
