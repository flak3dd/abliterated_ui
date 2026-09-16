import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, Image as RNImage } from 'react-native';
import Colors from '../../theme/colors';
import { Message } from '../../types';
import { ReasoningAccordion } from './ReasoningAccordion';
import { CodeBlock } from './CodeBlock';
import { detectFilenameAndContent } from '../../services/zipService';
import { Cpu, Copy, Check, FlaskConical, Hammer, Terminal, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, BookOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { TestResultCard } from './TestResultCard';
import { SwarmInspectorCard } from './SwarmInspectorCard';
import { AgentRunCard } from './AgentRunCard';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { useChatStore } from '../../stores/useChatStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { resolveWsUrl } from '../../services/apiConfig';

/**
 * Cross-platform clipboard write helper with safe fallbacks.
 */
async function copyToClipboardSafe(text: string): Promise<boolean> {
  // 1. Try expo-clipboard if installed
  try {
    const pkg = 'expo-clipboard';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExpoClipboard = require(pkg);
    if (ExpoClipboard?.setStringAsync) {
      await ExpoClipboard.setStringAsync(text);
      return true;
    }
  } catch {}

  // 2. Try modern Web navigator.clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[ChatBubble] navigator.clipboard failed:', err);
  }

  // 3. Fallback for non-secure / older browser web contexts
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-9999px';
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) return true;
    } catch (err) {
      console.warn('[ChatBubble] execCommand fallback failed:', err);
    }
  }

  return false;
}

interface CodeBlockChunk {
  isCode: boolean;
  content: string;
}

/**
 * Deterministic linear code block parser (O(N), ReDoS-immune).
 * Handles streaming unclosed markdown code blocks seamlessly.
 */
function parseMarkdownCodeBlocks(text: string): CodeBlockChunk[] {
  const chunks: CodeBlockChunk[] = [];
  let cursor = 0;
  const len = text.length;

  while (cursor < len) {
    const codeStart = text.indexOf('```', cursor);
    if (codeStart === -1) {
      const rest = text.slice(cursor);
      if (rest) {
        chunks.push({ isCode: false, content: rest });
      }
      break;
    }

    if (codeStart > cursor) {
      chunks.push({ isCode: false, content: text.slice(cursor, codeStart) });
    }

    const contentStart = codeStart + 3;
    const codeEnd = text.indexOf('```', contentStart);

    if (codeEnd === -1) {
      // Unclosed code block (e.g. streaming LLM output)
      chunks.push({ isCode: true, content: text.slice(codeStart) });
      break;
    } else {
      chunks.push({ isCode: true, content: text.slice(codeStart, codeEnd + 3) });
      cursor = codeEnd + 3;
    }
  }

  return chunks;
}

interface ChatBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export const ChatBubbleBase: React.FC<ChatBubbleProps> = ({
  message,
  isStreaming = false,
}) => {
  const isUser = message.role === 'user';
  const { getActiveEnvironment } = useChatStore();
  const { runTestsForEnv, buildActiveEnv, setDrawerOpen, activeTestReport } = useSandboxStore();
  const activeEnv = getActiveEnvironment();
  const [copied, setCopied] = useState(false);
  const [streamFrame, setStreamFrame] = useState<string | null>(null);
  const [showStream, setShowStream] = useState(false);
  const [showGroundingDetails, setShowGroundingDetails] = useState(false);
  const [showRagDetails, setShowRagDetails] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (isStreaming && !isUser) {
      setLoadingSeconds(0);
      timerRef.current = setInterval(() => {
        setLoadingSeconds((prev) => prev + 1);
      }, 1000);

      if (showStream) {
        try {
          const meshHost = useMeshStore.getState().activeHost || '127.0.0.1';
          const wsUrl = resolveWsUrl(meshHost, 7860, '/v1/images/stream');

          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onmessage = (event) => {
            if (typeof event.data === 'string' && event.data.startsWith('data:image/webp;base64,')) {
              setStreamFrame(event.data);
            }
          };

          ws.onerror = (err) => {
            console.warn('[ChatBubble] Latent WS error:', err);
          };

          ws.onclose = () => {
            if (wsRef.current === ws) {
              wsRef.current = null;
            }
          };
        } catch (e) {
          console.warn('Latent WS init failed:', e);
        }
      }

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (wsRef.current) {
          try {
            wsRef.current.onmessage = null;
            wsRef.current.onerror = null;
            wsRef.current.onclose = null;
            if (
              wsRef.current.readyState === WebSocket.OPEN ||
              wsRef.current.readyState === WebSocket.CONNECTING
            ) {
              wsRef.current.close();
            }
          } catch {}
          wsRef.current = null;
        }
      };
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          if (
            wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING
          ) {
            wsRef.current.close();
          }
        } catch {}
        wsRef.current = null;
      }
      setStreamFrame(null);
    }
  }, [isStreaming, isUser, showStream]);

  const handleCopy = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    await copyToClipboardSafe(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderInline = (text: string) => {
    const tokens = text.split(/(\*\*(?:[^*\r\n]|\*(?!\*))+\*\*|`[^`\r\n]+`)/g);
    return tokens.map((t, i) => {
      if (t.startsWith('**') && t.endsWith('**') && t.length >= 4) {
        return <Text key={i} style={styles.boldText}>{t.slice(2, -2)}</Text>;
      }
      if (t.startsWith('`') && t.endsWith('`') && t.length >= 2) {
        return <Text key={i} style={styles.inlineCode}>{t.slice(1, -1)}</Text>;
      }
      return <Text key={i}>{t}</Text>;
    });
  };

  const renderMarkdownText = (text: string) => {
    return text.split('\n').map((line, index) => {
      if (!line.trim() && line === '') {
        return <View key={index} style={{ height: 8 }} />;
      }
      
      if (line.startsWith('### ')) {
        return <Text key={index} style={styles.h3} selectable>{renderInline(line.replace('### ', ''))}</Text>;
      }
      if (line.startsWith('## ')) {
        return <Text key={index} style={styles.h2} selectable>{renderInline(line.replace('## ', ''))}</Text>;
      }
      if (line.startsWith('# ')) {
        return <Text key={index} style={styles.h1} selectable>{renderInline(line.replace('# ', ''))}</Text>;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.assistantText} selectable>{renderInline(line.substring(2))}</Text>
          </View>
        );
      }

      return (
        <Text key={index} style={styles.assistantText} selectable>
          {renderInline(line)}
        </Text>
      );
    });
  };

  const renderFormattedContent = (text: string) => {
    if (!text) return null;

    const parts = parseMarkdownCodeBlocks(text);

    return parts.map((chunk, index) => {
      if (chunk.isCode) {
        let withoutTicks = chunk.content.slice(3);
        if (withoutTicks.endsWith('```')) {
          withoutTicks = withoutTicks.slice(0, -3);
        }
        
        const firstLineBreak = withoutTicks.indexOf('\n');
        let rawHeader = '';
        let rawCode = withoutTicks;

        if (firstLineBreak !== -1) {
          rawHeader = withoutTicks.slice(0, firstLineBreak).trim();
          rawCode = withoutTicks.slice(firstLineBreak + 1);
        }

        let language = rawHeader;
        let headerFile = '';
        if (rawHeader.includes(':')) {
          const splitParts = rawHeader.split(':');
          language = splitParts[0]?.trim() || '';
          headerFile = splitParts[1]?.trim() || '';
        } else if (rawHeader.includes(' ')) {
          const splitParts = rawHeader.split(/\s+/);
          language = splitParts[0]?.trim() || '';
          headerFile = splitParts[1]?.trim() || '';
        }

        const { filename, cleanContent } = detectFilenameAndContent(
          rawCode,
          language,
          index
        );
        const finalFilename =
          headerFile || (filename.startsWith('file_') ? undefined : filename);

        return (
          <CodeBlock
            key={index}
            language={language || 'plaintext'}
            code={cleanContent}
            filename={finalFilename}
            blockIndex={index}
          />
        );
      }

      if (!chunk.content.trim()) return null;

      return <View key={index}>{renderMarkdownText(chunk.content)}</View>;
    });
  };

  if (isUser) {
    return (
      <Animated.View style={styles.userContainer} entering={FadeInUp.duration(300).springify()}>
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={styles.assistantContainer} entering={FadeIn.duration(400)}>
      <View style={[styles.assistantCard, isStreaming && styles.assistantCardStreaming]}>
        {/* Assistant Header */}
        <View style={styles.assistantHeader}>
          <View style={styles.assistantHeaderLeft}>
            <Cpu size={14} color={Colors.brand.emerald} />
            <Text style={styles.assistantHeaderText}>Spark AI • GB10</Text>
          </View>

          <View style={styles.assistantHeaderLeft}>
          {message.ragCitations && message.ragCitations.length > 0 && (
            <TouchableOpacity
              style={[styles.groundingBadge, styles.groundingBadgeGrounded]}
              onPress={() => setShowRagDetails(!showRagDetails)}
              activeOpacity={0.75}
            >
              <BookOpen size={11} color={Colors.brand.emerald} />
              <Text style={[styles.groundingBadgeText, styles.groundingBadgeTextGrounded]}>
                RAG {message.ragCitations.length}
              </Text>
              {showRagDetails ? (
                <ChevronUp size={10} color={Colors.brand.emerald} />
              ) : (
                <ChevronDown size={10} color={Colors.brand.emerald} />
              )}
            </TouchableOpacity>
          )}

          {message.groundingReport && (
            <TouchableOpacity
              style={[
                styles.groundingBadge,
                message.groundingReport.isGrounded
                  ? styles.groundingBadgeGrounded
                  : styles.groundingBadgeWarning,
              ]}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch (e) {}
                setShowGroundingDetails(!showGroundingDetails);
              }}
              activeOpacity={0.75}
            >
              {message.groundingReport.isGrounded ? (
                <ShieldCheck size={11} color={Colors.brand.emerald} />
              ) : (
                <ShieldAlert size={11} color="#F59E0B" />
              )}
              <Text
                style={[
                  styles.groundingBadgeText,
                  message.groundingReport.isGrounded
                    ? styles.groundingBadgeTextGrounded
                    : styles.groundingBadgeTextWarning,
                ]}
              >
                {message.groundingReport.groundingScore}% Grounded
              </Text>
              {showGroundingDetails ? (
                <ChevronUp
                  size={10}
                  color={
                    message.groundingReport.isGrounded
                      ? Colors.brand.emerald
                      : '#F59E0B'
                  }
                />
              ) : (
                <ChevronDown
                  size={10}
                  color={
                    message.groundingReport.isGrounded
                      ? Colors.brand.emerald
                      : '#F59E0B'
                  }
                />
              )}
            </TouchableOpacity>
          )}
          </View>
        </View>

        {showRagDetails && message.ragCitations && message.ragCitations.length > 0 && (
          <View style={styles.groundingDetailsBox}>
            <View style={styles.groundingDetailsHeader}>
              <BookOpen size={13} color={Colors.brand.emerald} />
              <Text style={styles.groundingDetailsTitle}>LOCAL RAG SOURCES</Text>
            </View>
            {message.ragCitations.map((cite, idx) => (
              <View key={idx} style={styles.warningItem}>
                <Text style={styles.verifiedTagText}>
                  [{idx + 1}] {cite.path || cite.title} ({cite.source}, {cite.score.toFixed(2)})
                </Text>
                <Text style={styles.warningText}>{cite.snippet}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Detailed Anti-Hallucination Grounding Drawer */}
        {showGroundingDetails && message.groundingReport && (
          <View style={styles.groundingDetailsBox}>
            <View style={styles.groundingDetailsHeader}>
              <ShieldCheck size={13} color={Colors.brand.emerald} />
              <Text style={styles.groundingDetailsTitle}>ANTI-HALLUCINATION VERIFICATION REPORT</Text>
            </View>

            <View style={styles.groundingMetricsRow}>
              <View style={styles.groundingMetricItem}>
                <Text style={styles.metricLabel}>CONFIDENCE</Text>
                <Text style={styles.metricVal}>{message.groundingReport.groundingScore}%</Text>
              </View>
              <View style={styles.groundingMetricItem}>
                <Text style={styles.metricLabel}>STUBS & PLACEHOLDERS</Text>
                <Text style={[styles.metricVal, { color: message.groundingReport.hasPlaceholders ? '#F43F5E' : Colors.brand.emerald }]}>
                  {message.groundingReport.hasPlaceholders ? 'Detected' : 'Zero (100% Complete)'}
                </Text>
              </View>
              <View style={styles.groundingMetricItem}>
                <Text style={styles.metricLabel}>VERIFIED MODULES</Text>
                <Text style={styles.metricVal}>{message.groundingReport.verifiedFiles.length} Checked</Text>
              </View>
            </View>

            {message.groundingReport.warnings.length > 0 && (
              <View style={styles.groundingWarnings}>
                {message.groundingReport.warnings.map((w, idx) => (
                  <View key={idx} style={styles.warningItem}>
                    <ShieldAlert size={11} color="#F59E0B" />
                    <Text style={styles.warningText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}

            {message.groundingReport.verifiedFiles.length > 0 && (
              <View style={styles.verifiedTagsRow}>
                {message.groundingReport.verifiedFiles.map((vf, idx) => (
                  <View key={idx} style={styles.verifiedTag}>
                    <Text style={styles.verifiedTagText}>✓ {vf}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Reasoning Trace Disclosure */}
        {Boolean(message.reasoning) && (
          <ReasoningAccordion
            reasoning={message.reasoning || ''}
            isStreaming={isStreaming && !message.content}
          />
        )}

        {/* Multi-Agent Swarm Inspector Card */}
        {message.swarmSession && (
          <SwarmInspectorCard swarm={message.swarmSession} />
        )}
        {message.agentRun && (
          <AgentRunCard
            run={message.agentRun}
            onContinue={(run) => {
              void useChatStore.getState().continueAgentRun(run);
            }}
          />
        )}

        {/* Content */}
        <View style={styles.contentWrapper}>
          {message.content ? (
            renderFormattedContent(message.content)
          ) : isStreaming ? (
            <View style={styles.streamingIndicator}>
              {showStream ? (
                streamFrame ? (
                  <RNImage 
                    source={{ uri: streamFrame }} 
                    style={{ width: 256, height: 256, borderRadius: 8, marginVertical: 8 }} 
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.generatingText}>
                      {loadingSeconds > 2 ? `Loading Model... ${loadingSeconds}s` : 'Generating on GB10...'}
                    </Text>
                  </View>
                )
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.generatingText}>
                    {loadingSeconds > 2 ? `Loading Model... ${loadingSeconds}s` : 'Generating on GB10...'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowStream(true)}>
                    <Text style={{ color: Colors.brand.emerald, fontSize: 11, marginLeft: 8 }}>Show Stream</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Ephemeral Sandbox Quick Actions Strip */}
        {!isStreaming && message.content && message.content.includes('```') ? (
          <View style={styles.sandboxBar}>
            <View style={styles.sandboxBarLeft}>
              <Terminal size={12} color={Colors.brand.emerald} />
              <Text style={styles.sandboxNameText} numberOfLines={1}>
                {activeEnv?.name || 'sandbox'}
              </Text>
            </View>

            <View style={styles.sandboxBarActions}>
              <TouchableOpacity
                style={styles.sandboxPillBtn}
                onPress={() => runTestsForEnv()}
                activeOpacity={0.7}
              >
                <FlaskConical size={11} color={Colors.brand.emerald} />
                <Text style={styles.sandboxPillBtnText}>Run Tests</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sandboxPillBtn}
                onPress={() => buildActiveEnv()}
                activeOpacity={0.7}
              >
                <Hammer size={11} color={Colors.brand.sky} />
                <Text style={styles.sandboxPillBtnText}>Build</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sandboxPillBtn}
                onPress={() => setDrawerOpen(true)}
                activeOpacity={0.7}
              >
                <Terminal size={11} color={Colors.text.tertiary} />
                <Text style={styles.sandboxPillBtnText}>Terminal</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Inline Test Result Card if active report exists */}
        {!isStreaming && message.content && message.content.includes('```') && activeTestReport ? (
          <TestResultCard report={activeTestReport} />
        ) : null}

        {/* Assistant Footer */}
        {!isStreaming && message.content ? (
          <View style={styles.assistantFooter}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.7}>
              {copied ? (
                <>
                  <Check size={12} color={Colors.brand.emerald} />
                  <Text style={styles.copiedLabel}>Copied</Text>
                </>
              ) : (
                <>
                  <Copy size={12} color={Colors.text.tertiary} />
                  <Text style={styles.actionLabel}>Copy Response</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
};

export const ChatBubble = React.memo(ChatBubbleBase, (prevProps, nextProps) => {
  return (
    prevProps.message.content === nextProps.message.content &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.message.reasoning === nextProps.message.reasoning &&
    prevProps.message.groundingReport === nextProps.message.groundingReport &&
    prevProps.message.swarmSession === nextProps.message.swarmSession &&
    prevProps.message.agentRun === nextProps.message.agentRun
  );
});

const styles = StyleSheet.create({
  userContainer: {
    alignItems: 'flex-end',
    marginVertical: 3,
    paddingHorizontal: 12,
  },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: Colors.brand.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  userText: {
    color: '#EFF6FF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  assistantContainer: {
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingHorizontal: 12,
    width: '100%',
  },
  assistantCard: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(18, 18, 22, 0.7)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  assistantCardStreaming: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    shadowColor: Colors.brand.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  assistantHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assistantHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.brand.emerald,
    letterSpacing: 0.5,
  },
  groundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
  },
  groundingBadgeGrounded: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  groundingBadgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  groundingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groundingBadgeTextGrounded: {
    color: Colors.brand.emerald,
  },
  groundingBadgeTextWarning: {
    color: '#F59E0B',
  },
  groundingDetailsBox: {
    backgroundColor: 'rgba(10, 10, 14, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  groundingDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groundingDetailsTitle: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.6,
  },
  groundingMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  groundingMetricItem: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 8.5,
    fontFamily: 'Menlo',
    color: '#71717A',
    fontWeight: '700',
  },
  metricVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E4E4E7',
  },
  groundingWarnings: {
    gap: 4,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  warningText: {
    fontSize: 10.5,
    color: '#FCD34D',
  },
  verifiedTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  verifiedTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedTagText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
    fontWeight: '600',
  },
  contentWrapper: {
    flexDirection: 'column',
    gap: 2,
  },
  assistantText: {
    color: Colors.text.primary,
    fontSize: 13.5,
    lineHeight: 21,
    marginVertical: 2,
  },
  boldText: {
    fontWeight: '700',
    color: Colors.text.primary,
  },
  inlineCode: {
    fontFamily: 'Menlo',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    color: Colors.brand.sky,
    fontSize: 12,
  },
  h1: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 12,
    marginBottom: 4,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  h3: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 8,
    marginBottom: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4,
  },
  bullet: {
    color: Colors.text.tertiary,
    fontSize: 14,
    lineHeight: 21,
    marginRight: 6,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand.emerald,
  },
  generatingText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  assistantFooter: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  copiedLabel: {
    fontSize: 11,
    color: Colors.brand.emerald,
    fontWeight: '500',
  },
  sandboxBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 8,
  },
  sandboxBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sandboxNameText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  sandboxBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sandboxPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sandboxPillBtnText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: Colors.text.secondary,
  },
});
