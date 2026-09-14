import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Plus, Trash2, MessageSquare, Shield, Server, X, Package } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useMeshStore } from '../../stores/useMeshStore';

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export const DrawerMenu: React.FC<DrawerMenuProps> = ({ visible, onClose }) => {
  const {
    sessions,
    environments,
    activeSessionId,
    createNewSession,
    selectSession,
    deleteSession,
  } = useChatStore();
  const { activeHost, activePort, candidates } = useMeshStore();

  const handleCreateNew = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    createNewSession();
    onClose();
  };

  const handleSelectSession = (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    selectSession(id);
    onClose();
  };

  const handleDeleteSession = (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    deleteSession(id);
  };

  const activeEndpoint = candidates.find((c) => c.host === activeHost);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop Tap to Close */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Drawer Content */}
        <SafeAreaView style={styles.drawerContainer}>
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerLeft}>
              <Shield size={18} color={Colors.brand.emerald} />
              <Text style={styles.headerTitle}>Sovereign Vault</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* New Session Button */}
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={handleCreateNew}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#09090B" />
            <Text style={styles.newChatText}>New Conversation</Text>
          </TouchableOpacity>

          {/* Sessions List */}
          <Text style={styles.sectionLabel}>SAVED SESSIONS ({sessions.length})</Text>
          <ScrollView style={styles.sessionList} showsVerticalScrollIndicator={false}>
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const formattedDate = new Date(session.updatedAt).toLocaleDateString(
                undefined,
                { month: 'short', day: 'numeric' }
              );

              const env = session.envId ? environments[session.envId] : null;
              const fileCount = env ? Object.keys(env.files).length : 0;

              return (
                <View
                  key={session.id}
                  style={[styles.sessionRow, isActive && styles.activeSessionRow]}
                >
                  <TouchableOpacity
                    style={styles.sessionSelectable}
                    onPress={() => handleSelectSession(session.id)}
                    activeOpacity={0.7}
                  >
                    <MessageSquare
                      size={15}
                      color={isActive ? Colors.brand.emerald : Colors.text.tertiary}
                    />
                    <View style={styles.sessionTextWrapper}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.sessionTitle,
                          isActive && styles.activeSessionTitle,
                        ]}
                      >
                        {session.title || 'Untitled Session'}
                      </Text>
                      <View style={styles.sessionMetaRow}>
                        <Text style={styles.sessionDate}>{formattedDate}</Text>
                        {Boolean(env) && (
                          <View style={styles.sessionEnvBadge}>
                            <Package
                              size={9}
                              color={isActive ? Colors.brand.emerald : Colors.text.tertiary}
                            />
                            <Text
                              style={[
                                styles.sessionEnvText,
                                isActive && styles.activeSessionEnvText,
                              ]}
                            >
                              {env?.name || 'sandbox'} ({fileCount})
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  {sessions.length > 1 && (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteSession(session.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={14} color={Colors.text.tertiary} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Bottom Host Info */}
          <View style={styles.bottomInfo}>
            <View style={styles.hostRow}>
              <Server size={14} color={Colors.brand.emerald} />
              <Text style={styles.hostLabel}>
                {activeEndpoint?.name || 'DGX Spark'} ({activeHost}:{activePort})
              </Text>
            </View>
            <Text style={styles.vaultSecurityNote}>
              Encrypted Local Storage • On-Device Session Branching
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerContainer: {
    width: '82%',
    maxWidth: 340,
    height: '100%',
    backgroundColor: Colors.background.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border.active,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  closeBtn: {
    padding: 6,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand.emerald,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 16,
    marginBottom: 20,
  },
  newChatText: {
    color: '#09090B',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sessionList: {
    flex: 1,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  activeSessionRow: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  sessionSelectable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionTextWrapper: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 13.5,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  activeSessionTitle: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  sessionDate: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  sessionEnvBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sessionEnvText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
  activeSessionEnvText: {
    color: Colors.brand.emerald,
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 6,
  },
  bottomInfo: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  hostLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
  },
  vaultSecurityNote: {
    fontSize: 10,
    color: Colors.text.tertiary,
  },
});
