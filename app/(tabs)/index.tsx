import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { HeaderBar } from '../../components/ui/HeaderBar';
import { DrawerMenu } from '../../components/ui/DrawerMenu';
import { DesktopSidebar } from '../../components/ui/DesktopSidebar';
import { DesktopSandboxPanel } from '../../components/chat/DesktopSandboxPanel';
import { EnvironmentCapsule } from '../../components/chat/EnvironmentCapsule';
import { EnvironmentModal } from '../../components/chat/EnvironmentModal';
import { SandboxTerminalDrawer } from '../../components/chat/SandboxTerminalDrawer';
import { MatrixModal } from '../../components/matrix/MatrixModal';
import { MatrixCanvasView } from '../../components/matrix/MatrixCanvasView';
import { SuggestionStrip } from '../../components/chat/SuggestionStrip';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { InputDock } from '../../components/chat/InputDock';
import { useMatrixStore } from '../../stores/useMatrixStore';

export default function ChatScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSandboxPanelOpen, setIsSandboxPanelOpen] = useState(false);

  const { isOpen: isMatrixOpen, setIsOpen: setMatrixOpen } = useMatrixStore();
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    activeSessionId,
    isStreaming,
    streamingSessionId,
    sendMessage,
    stopStreaming,
  } = useChatStore();
  const sessionStreaming = isStreaming && streamingSessionId === activeSessionId;

  const { status: sandboxStatus } = useSandboxStore();

  const currentMessages = activeSessionId ? messages[activeSessionId] || [] : [];

  // Auto-open desktop sandbox panel when tests or code execution is started on desktop
  useEffect(() => {
    if (isDesktop && (sandboxStatus === 'testing' || sandboxStatus === 'running' || sandboxStatus === 'building')) {
      setIsSandboxPanelOpen(true);
    }
  }, [isDesktop, sandboxStatus]);

  useEffect(() => {
    if (currentMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [currentMessages.length, sessionStreaming]);

  const handleSelectPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  const handleSendMessage = (text: string) => {
    sendMessage(text);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.appContainer}>
        {/* Left: Desktop Sidebar (Web/Computer layout) */}
        {isDesktop && isSidebarOpen && (
          <DesktopSidebar onOpenEnvModal={() => setEnvModalOpen(true)} />
        )}

        {/* Center: Main Conversation Pane */}
        <KeyboardAvoidingView
          style={styles.centerPane}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Matrix Rain Background Layer */}
          <MatrixCanvasView variant="ambient" />

          {/* Desktop-Aware Header Bar */}
          <HeaderBar
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenMatrix={() => setMatrixOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onToggleSandboxPanel={() => setIsSandboxPanelOpen(!isSandboxPanelOpen)}
            isSandboxPanelOpen={isSandboxPanelOpen}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
            title="Spark AI"
            subtitle="GB10"
          />

          {/* Ephemeral Environment Capsule (Mobile/Tablet fallback) */}
          {!isDesktop && (
            <EnvironmentCapsule onOpenModal={() => setEnvModalOpen(true)} />
          )}

          {/* Centered Column for Desktop Ergonomics */}
          <View style={styles.contentColumn}>
            {/* Quick-Prompt Suggestions */}
            {currentMessages.length <= 1 && (
              <SuggestionStrip
                onSelectPrompt={handleSelectPrompt}
                disabled={sessionStreaming}
              />
            )}

            {/* Messages FlatList */}
            <FlatList
              ref={flatListRef}
              data={currentMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <ChatBubble
                  message={item}
                  isStreaming={sessionStreaming && index === currentMessages.length - 1}
                />
              )}
              contentContainerStyle={styles.messageListContent}
              style={styles.messageList}
              keyboardShouldPersistTaps="handled"
            />

            {/* Desktop-Optimized Input Dock */}
            <InputDock
              onSendMessage={handleSendMessage}
              onStopStreaming={stopStreaming}
              isStreaming={sessionStreaming}
            />
          </View>
        </KeyboardAvoidingView>

        {/* Right: Desktop Split Sandbox Panel (Files, Tests, Terminal) */}
        {isDesktop && isSandboxPanelOpen && (
          <DesktopSandboxPanel onClose={() => setIsSandboxPanelOpen(false)} />
        )}

        {/* Mobile Slide-out Drawer Menu (Only for phone/tablet) */}
        {!isDesktop && (
          <DrawerMenu
            visible={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        )}

        {/* Sandbox Environment Files & Archive Modal */}
        <EnvironmentModal
          visible={envModalOpen}
          onClose={() => setEnvModalOpen(false)}
        />

        {/* Mobile Bottom Terminal Drawer */}
        {!isDesktop && <SandboxTerminalDrawer />}

        {/* Matrix Engine Director Modal */}
        <MatrixModal
          visible={isMatrixOpen}
          onClose={() => setMatrixOpen(false)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08080B',
  },
  appContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#08080B',
    overflow: 'hidden',
  },
  centerPane: {
    flex: 1,
    backgroundColor: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  contentColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexGrow: 1,
  },
});
