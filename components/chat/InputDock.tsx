import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Mic, ArrowUp, Square, ShieldCheck, Zap, BookOpen, Terminal, Bot, Paperclip } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSwarmStore } from '../../stores/useSwarmStore';
import { useAgentStore } from '../../stores/useAgentStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { agentGateHint } from '../../services/agent/gate';
import { useRagStore } from '../../stores/useRagStore';
import { useMatrixStore } from '../../stores/useMatrixStore';
import { uploadFilesToActiveSandbox } from '../../services/sandboxUpload';
import { readFilesAsAttachments } from '../../services/chatEnhancements';
import type { MessageAttachment } from '../../types';
import { useDiagnosticsStore } from '../../stores/useDiagnosticsStore';
import { ModelSelector } from '../models/ModelSelector';
import { SuggestionStrip } from './SuggestionStrip';
import { isDesktopWeb } from '../../theme/layout';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface InputDockProps {
  onSendMessage: (text: string, attachments?: MessageAttachment[]) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  onRetryLast?: () => void;
}

export const InputDock: React.FC<InputDockProps> = ({
  onSendMessage,
  onStopStreaming,
  isStreaming,
  disabled = false,
  onRetryLast,
}) => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);
  const [inputText, setInputText] = useState('');
  const { antiHallucination, toggleAntiHallucination } = useChatStore();
  const { isSwarmMode, setSwarmMode } = useSwarmStore();
  const { isAgentMode, setAgentMode } = useAgentStore();
  const { enabled: ragEnabled, chunks, toggleEnabled: toggleRag } = useRagStore();
  const setMatrixOpen = useMatrixStore((s) => s.setIsOpen);
  const meshMode = useMeshStore((s) => s.meshMode);
  const hasActiveEnv = useChatStore((s) => Boolean(s.getActiveEnvironment()));
  const agentHint = agentGateHint({ isAgentMode, meshMode, hasActiveEnv });
  const [uploadChips, setUploadChips] = useState<string[]>([]);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const runnerOk = useDiagnosticsStore((s) => s.items.find((i) => i.id === 'runner')?.status === 'ok');
  const uploadClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animations
  const sendButtonScale = useSharedValue(0.8);
  const sendButtonOpacity = useSharedValue(0);

  const canSend = (inputText.trim().length > 0 || pendingAttachments.length > 0) && !isStreaming;

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

    onSendMessage(inputText, pendingAttachments.length ? pendingAttachments : undefined);
    setInputText('');
    setPendingAttachments([]);
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

  const flashUploadFeedback = (chips: string[], hint?: string | null) => {
    if (uploadClearTimer.current) clearTimeout(uploadClearTimer.current);
    setUploadChips(chips);
    setUploadHint(hint || null);
    uploadClearTimer.current = setTimeout(() => {
      setUploadChips([]);
      setUploadHint(null);
    }, 6000);
  };

  const handleChatAttach = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setUploadHint('Chat attachments work best on web');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.txt,.md,.json,.ts,.tsx,.js,.py';
    input.onchange = async () => {
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      try {
        const atts = await readFilesAsAttachments(picked);
        setPendingAttachments((prev) => [...prev, ...atts].slice(0, 8));
      } catch (e: any) {
        setUploadHint(e?.message || 'Attach failed');
      }
    };
    input.click();
  };

  const handleSandboxUpload = () => {
    if (!hasActiveEnv) {
      flashUploadFeedback([], 'Needs active sandbox — open or create a chat session first');
      return;
    }
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      flashUploadFeedback([], 'Sandbox file upload is available on web (use Choose Files)');
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept =
      '.md,.txt,.json,.py,.ts,.tsx,.js,.jsx,.css,.html,.csv,.yml,.yaml,.toml,.sh,.rs,.go,.java,.c,.h,.cpp,.rb,.php,.sql,.xml,.svg';
    input.onchange = async () => {
      const picked = Array.from(input.files || []);
      if (!picked.length) return;
      setIsUploading(true);
      try {
        const result = await uploadFilesToActiveSandbox(
          picked.map((f) => ({
            name: f.name,
            size: f.size,
            text: () => f.text(),
          })),
          { chatNote: true }
        );
        const chips = result.uploaded.map((p) => `uploaded: ${p}`);
        const skipHints = result.skipped.map((s) => `${s.name}: ${s.reason}`);
        const hint =
          skipHints.length > 0
            ? skipHints.slice(0, 3).join(' · ') +
              (skipHints.length > 3 ? ` (+${skipHints.length - 3} more)` : '')
            : result.uploaded.length
              ? null
              : 'No files uploaded';
        flashUploadFeedback(chips, hint);
      } catch (err: any) {
        flashUploadFeedback([], err?.message || 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    };
    input.click();
  };

  const uploadDisabled = disabled || isStreaming || isUploading || !hasActiveEnv;

  return (
    <View style={styles.dockContainer}>
      <SuggestionStrip
        draft={inputText}
        onSelectPrompt={setInputText}
        disabled={disabled || isStreaming}
        mode={isAgentMode ? 'agent' : isSwarmMode ? 'swarm' : 'chat'}
      />
      {(uploadChips.length > 0 || uploadHint) && (
        <View style={styles.uploadFeedbackRow}>
          {uploadChips.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.uploadChipScroll}
            >
              {uploadChips.map((chip) => (
                <View key={chip} style={styles.uploadChip}>
                  <Text style={styles.uploadChipText} numberOfLines={1}>
                    {chip}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {uploadHint ? (
            <Text style={styles.uploadHintText} numberOfLines={2}>
              {uploadHint}
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.glassPill}>
        <TouchableOpacity
          style={styles.micButton}
          onPress={handleVoicePress}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Mic size={18} color={Colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.uploadButton}
          onPress={handleChatAttach}
          disabled={disabled || isStreaming}
          accessibilityLabel="Attach files to this chat message"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Paperclip size={16} color={pendingAttachments.length ? Colors.brand.sky : Colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.uploadButton,
            uploadDisabled && styles.uploadButtonDisabled,
            !hasActiveEnv && styles.uploadButtonWarn,
          ]}
          onPress={handleSandboxUpload}
          disabled={isUploading || disabled || isStreaming}
          accessibilityLabel="Upload files into sandbox"
          accessibilityHint={
            hasActiveEnv
              ? 'Adds files to the active sandbox environment for BUILD agent list_files/write_file'
              : 'Requires an active sandbox environment'
          }
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Paperclip
            size={16}
            color={
              !hasActiveEnv
                ? Colors.brand.amber
                : uploadDisabled
                  ? '#52525B'
                  : Colors.text.secondary
            }
          />
        </TouchableOpacity>

        {/* Text Input Field */}
        <TextInput
          style={styles.textInput}
          placeholder={
            isAgentMode
              ? 'BUILD agent goal (e.g. Create fib.py + pytest suite and fix until green)...'
              : isSwarmMode
              ? 'Swarm Task (e.g. Build asynchronous cache manager with redis and pytest)...'
              : 'Ask Spark AI (e.g. Write a Python rate limiter with pytest suite)...'
          }
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

        <TouchableOpacity
          style={styles.blingCircle}
          onPress={() => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (e) {}
            setMatrixOpen(true);
          }}
          accessibilityLabel="BLINGbling matrix"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          activeOpacity={0.75}
        >
          <Terminal size={14} color={Colors.brand.sky} />
        </TouchableOpacity>
      </View>

      {pendingAttachments.length > 0 && (
        <ScrollView horizontal style={{ maxHeight: 36, marginBottom: 4 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
          {pendingAttachments.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              style={{ backgroundColor: 'rgba(56,189,248,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: Colors.brand.sky, fontSize: 10, fontFamily: 'Menlo' }}>{a.name} ×</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginBottom: 2 }}>
        <Text style={{ fontSize: 10, fontFamily: 'Menlo', color: runnerOk ? Colors.brand.emerald : Colors.brand.rose }}>
          runner:{runnerOk ? 'ok' : 'down'}
        </Text>
        {onRetryLast ? (
          <TouchableOpacity onPress={onRetryLast}>
            <Text style={{ fontSize: 10, fontFamily: 'Menlo', color: Colors.brand.amber }}>retry last</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Keyboard hint (web) + Agent/Swarm/RAG toggles (all platforms) */}
      <View style={styles.desktopHintRow}>
          {Platform.OS === 'web' ? (
            <Text style={styles.desktopHintText}>
              <Text style={{ fontWeight: '700' }}>Enter</Text> to send • <Text style={{ fontWeight: '700' }}>Shift+Enter</Text> for newline
              {!hasActiveEnv ? (
                <Text style={styles.agentHintText}>
                  {'  ·  '}
                  Paperclip needs active sandbox
                </Text>
              ) : null}
              {agentHint ? (
                <Text style={styles.agentHintText}>
                  {'  ·  '}
                  {agentHint}
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text style={styles.desktopHintText}>
              {!hasActiveEnv
                ? 'Paperclip needs active sandbox'
                : agentHint || (isAgentMode ? 'Agent: BUILD' : ' ')}
            </Text>
          )}

          <View style={styles.dockRightControls}>
            <TouchableOpacity
              style={[
                styles.swarmPill,
                isAgentMode && styles.swarmPillActive,
                isAgentMode && agentHint && agentHint.includes('needs') && styles.swarmPillWarn,
              ]}
              accessibilityLabel="Toggle BUILD agent"
              accessibilityHint="When enabled on Spark mesh with a sandbox, messages run the BUILD tool-loop agent instead of normal chat."
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch (e) {}
                const next = !isAgentMode;
                setAgentMode(next);
                if (next) setSwarmMode(false);
              }}
              activeOpacity={0.75}
            >
              <Bot size={11} color={isAgentMode ? Colors.brand.emerald : '#71717A'} />
              <Text
                style={[
                  styles.swarmPillText,
                  isAgentMode && styles.swarmPillTextActive,
                ]}
              >
                {isAgentMode ? 'Agent: BUILD' : 'Agent: OFF'}
              </Text>
            </TouchableOpacity>

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
                const turningOn = !isSwarmMode;
                setSwarmMode(turningOn);
                if (turningOn) setAgentMode(false);
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

            {!isDesktop ? <ModelSelector lane="chat" variant="trigger" /> : null}

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
    </View>
  );
};

const styles = StyleSheet.create({
  dockContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'web' ? 10 : Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    width: '100%',
  },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
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
  blingCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
      web: { outlineStyle: 'none' } as any,
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
    flexWrap: 'wrap',
    gap: 8,
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
  swarmPillWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  agentHintText: {
    fontSize: 10.5,
    color: Colors.brand.amber,
    fontFamily: 'Menlo',
    fontWeight: '600',
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
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tierPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tierPillActive: {
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
  },
  tierPillText: {
    fontSize: 9,
    fontFamily: 'Menlo',
    color: '#71717A',
    fontWeight: '600',
  },
  tierPillTextActive: {
    color: Colors.brand.emerald,
    fontWeight: '800',
  },
  uploadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 2,
  },
  uploadButtonDisabled: {
    opacity: 0.45,
  },
  uploadButtonWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  uploadFeedbackRow: {
    width: '100%',
    maxWidth: 860,
    marginBottom: 6,
    gap: 4,
  },
  uploadChipScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  uploadChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 280,
  },
  uploadChipText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.brand.green,
    fontWeight: '700',
  },
  uploadHintText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.brand.amber,
    paddingHorizontal: 4,
  },
});
