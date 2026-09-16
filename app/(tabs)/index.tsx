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
import { ChatBubble } from '../../components/chat/ChatBubble';
import { InputDock } from '../../components/chat/InputDock';
import { useMatrixStore } from '../../stores/useMatrixStore';
import { isDesktopWeb, WEB_SHELL } from '../../theme/layout';

export default function ChatScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSandboxPanelOpen, setIsSandboxPanelOpen] = useState(false);

  const { isOpen: isMatrixOpen } = useMatrixStore();
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
          <MatrixCanvasView variant="ambient" />

          {/* Desktop-Aware Header Bar */}
          <HeaderBar
            onOpenDrawer={() => setDrawerOpen(true)}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onToggleSandboxPanel={() => setIsSandboxPanelOpen(!isSandboxPanelOpen)}
            isSandboxPanelOpen={isSandboxPanelOpen}
            isSidebarOpen={isSidebarOpen}
            isDesktop={isDesktop}
            spectrumCycle
          />

          {/* Ephemeral Environment Capsule (Mobile/Tablet fallback) */}
          {!isDesktop && (
            <EnvironmentCapsule onOpenModal={() => setEnvModalOpen(true)} />
          )}

          {/* Centered Column for Desktop Ergonomics */}
          <View style={styles.contentColumn}>
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
    backgroundColor: '#2A2A2E',
    ...WEB_SHELL,
  },
  appContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#2A2A2E',
    overflow: 'hidden',
    ...WEB_SHELL,
  },
  centerPane: {
    flex: 1,
    backgroundColor: '#2A2A2E',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    minHeight: 0,
    minWidth: 0,
  },
  contentColumn: {
    flex: 1,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
  },
  messageList: {
    flex: 1,
    minHeight: 0,
  },
  messageListContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexGrow: 1,
  },
});
