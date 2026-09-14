import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, MessageSquare } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { InputDock } from '../../components/chat/InputDock';

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const {
    sessions,
    messages,
    activeSessionId,
    isStreaming,
    selectSession,
    sendMessage,
    stopStreaming,
  } = useChatStore();

  useEffect(() => {
    if (id && id !== activeSessionId) {
      selectSession(id);
    }
  }, [id]);

  const currentSession = sessions.find((s) => s.id === id);
  const currentMessages = id ? messages[id] || [] : [];

  const handleBack = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Session Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <ArrowLeft size={18} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentSession?.title || 'Session Vault'}
          </Text>
          <Text style={styles.headerSub}>
            {currentMessages.length} Messages • Local Storage
          </Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* Message History */}
      <FlatList
        data={currentMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ChatBubble
            message={item}
            isStreaming={isStreaming && index === currentMessages.length - 1}
          />
        )}
        contentContainerStyle={styles.listContent}
        style={styles.list}
      />

      {/* Input Dock */}
      <InputDock
        onSendMessage={(text) => sendMessage(text)}
        onStopStreaming={stopStreaming}
        isStreaming={isStreaming}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.background.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
  },
});
