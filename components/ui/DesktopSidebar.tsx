import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  MessageSquare,
  Sparkles,
  Activity,
  Mic,
  Radio,
  Plus,
  Trash2,
  Cpu,
  Package,
  FlaskConical,
  Download,
  Terminal,
  ChevronRight,
  Laptop,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useChatStore } from '../../stores/useChatStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { PingIndicator } from '../telemetry/PingIndicator';

interface DesktopSidebarProps {
  onOpenEnvModal?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ onOpenEnvModal }) => {
  const router = useRouter();
  const pathname = usePathname();

  const {
    sessions,
    activeSessionId,
    createNewSession,
    selectSession,
    deleteSession,
    getActiveEnvironment,
    downloadActiveEnvironmentZip,
  } = useChatStore();

  const { activeHost } = useMeshStore();
  const {
    status: sandboxStatus,
    target,
    setTarget,
    runTestsForEnv,
    setDrawerOpen,
  } = useSandboxStore();

  const activeEnv = getActiveEnvironment();
  const filesCount = activeEnv ? Object.keys(activeEnv.files).length : 0;

  const handleNewChat = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    createNewSession();
    if (pathname !== '/') {
      router.push('/');
    }
  };

  const handleSelectSession = (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    selectSession(id);
    if (pathname !== '/') {
      router.push('/');
    }
  };

  const handleDeleteSession = (id: string, e: any) => {
    e.stopPropagation?.();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {}
    deleteSession(id);
  };

  const navItems = [
    { label: 'Chat', path: '/', icon: MessageSquare },
    { label: 'Image Studio', path: '/studio', icon: Sparkles },
    { label: 'Telemetry', path: '/telemetry', icon: Activity },
    { label: 'Voice Mode', path: '/voice', icon: Mic },
    { label: 'Radar Mesh', path: '/radar', icon: Radio },
  ];

  const getStatusDotColor = () => {
    switch (sandboxStatus) {
      case 'running':
      case 'testing':
      case 'building':
        return Colors.brand.sky;
      case 'success':
        return Colors.brand.emerald;
      case 'failed':
        return Colors.brand.rose;
      default:
        return Colors.brand.emerald;
    }
  };

  return (
    <View style={styles.sidebar}>
      {/* 1. App Branding & Cluster Title */}
      <View style={styles.brandRow}>
        <View style={styles.brandIconWrap}>
          <Cpu size={18} color={Colors.brand.emerald} />
        </View>
        <View style={styles.brandMeta}>
          <Text style={styles.brandTitle}>Abliterated AI</Text>
          <Text style={styles.brandSubtitle}>Sovereign Cloud • NVFP4</Text>
        </View>
      </View>

      {/* 2. New Conversation Button */}
      <TouchableOpacity
        style={styles.newChatBtn}
        onPress={handleNewChat}
        activeOpacity={0.8}
      >
        <Plus size={15} color="#09090B" />
        <Text style={styles.newChatText}>New Conversation</Text>
        <Text style={styles.shortcutText}>⌘N</Text>
      </TouchableOpacity>

      {/* 3. Primary Navigation Rails */}
      <View style={styles.navSection}>
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          const IconComponent = item.icon;

          return (
            <TouchableOpacity
              key={item.path}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => router.push(item.path as any)}
              activeOpacity={0.7}
            >
              <IconComponent
                size={16}
                color={isActive ? Colors.brand.emerald : Colors.text.tertiary}
              />
              <Text
                style={[styles.navItemText, isActive && styles.navItemTextActive]}
              >
                {item.label}
              </Text>
              {isActive && <View style={styles.activePill} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 4. Active Sandbox Widget Card */}
      {activeEnv && (
        <View style={styles.sandboxWidget}>
          <View style={styles.sandboxWidgetHeader}>
            <View style={styles.sandboxHeaderLeft}>
              <Package size={13} color={getStatusDotColor()} />
              <Text style={styles.sandboxName} numberOfLines={1}>
                {activeEnv.name || activeEnv.id}
              </Text>
              <View
                style={[styles.sandboxLiveDot, { backgroundColor: getStatusDotColor() }]}
              />
            </View>
            <Text style={styles.sandboxFileCount}>{filesCount} files</Text>
          </View>

          <View style={styles.sandboxActionsRow}>
            <TouchableOpacity
              style={styles.sandboxActionBtn}
              onPress={() => runTestsForEnv()}
              activeOpacity={0.7}
            >
              <FlaskConical size={11} color={Colors.brand.emerald} />
              <Text style={styles.sandboxActionBtnText}>Run Tests</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sandboxActionBtn}
              onPress={() => onOpenEnvModal?.()}
              activeOpacity={0.7}
            >
              <Text style={styles.sandboxActionBtnText}>Files</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sandboxActionBtn}
              onPress={downloadActiveEnvironmentZip}
              activeOpacity={0.7}
            >
              <Download size={11} color={Colors.text.tertiary} />
              <Text style={styles.sandboxActionBtnText}>ZIP</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 5. Sessions Vault History List */}
      <View style={styles.sessionHeaderRow}>
        <Text style={styles.sectionTitle}>CONVERSATIONS</Text>
        <Text style={styles.sessionCount}>{sessions.length}</Text>
      </View>

      <ScrollView
        style={styles.sessionScroll}
        showsVerticalScrollIndicator={false}
      >
        {sessions.length === 0 ? (
          <Text style={styles.emptySessions}>No saved conversations.</Text>
        ) : (
          sessions.map((s) => {
            const isSelected = s.id === activeSessionId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.sessionCard, isSelected && styles.sessionCardActive]}
                onPress={() => handleSelectSession(s.id)}
                activeOpacity={0.7}
              >
                <MessageSquare
                  size={13}
                  color={isSelected ? Colors.brand.emerald : Colors.text.tertiary}
                />
                <Text
                  style={[
                    styles.sessionTitle,
                    isSelected && styles.sessionTitleActive,
                  ]}
                  numberOfLines={1}
                >
                  {s.title}
                </Text>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={(e) => handleDeleteSession(s.id, e)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Trash2 size={11} color={Colors.text.tertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 6. Footer Hardware Telemetry & Target Switch */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <View style={styles.targetToggleRow}>
            <TouchableOpacity
              style={[styles.targetChoice, target === 'local_mac' && styles.targetChoiceActive]}
              onPress={() => setTarget('local_mac')}
            >
              <Laptop size={11} color={target === 'local_mac' ? Colors.brand.emerald : Colors.text.tertiary} />
              <Text style={[styles.targetChoiceText, target === 'local_mac' && styles.targetChoiceTextActive]}>
                Mac
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.targetChoice, target === 'dgx_spark' && styles.targetChoiceActive]}
              onPress={() => setTarget('dgx_spark')}
            >
              <Cpu size={11} color={target === 'dgx_spark' ? Colors.brand.sky : Colors.text.tertiary} />
              <Text style={[styles.targetChoiceText, target === 'dgx_spark' && styles.targetChoiceTextActiveSky]}>
                Cloud
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.terminalShortcutBtn}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Terminal size={12} color={Colors.text.secondary} />
            <Text style={styles.terminalShortcutText}>Terminal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.clusterInfoRow}>
          <Text style={styles.clusterHostText} numberOfLines={1}>
            {activeHost || 'api.abliterated.io'}
          </Text>
          <PingIndicator />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sidebar: {
    width: 260,
    backgroundColor: '#09090D',
    borderRightWidth: 1,
    borderRightColor: Colors.border.default,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    userSelect: 'none' as any,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  brandIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMeta: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    marginTop: 1,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.brand.emerald,
    paddingVertical: 8,
    borderRadius: 7,
    marginBottom: 14,
  },
  newChatText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#09090B',
  },
  shortcutText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '700',
    marginLeft: 4,
  },
  navSection: {
    marginBottom: 14,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  navItemText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  navItemTextActive: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  activePill: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
    backgroundColor: Colors.brand.emerald,
  },
  sandboxWidget: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 14,
  },
  sandboxWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sandboxHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 150,
  },
  sandboxName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: 'Menlo',
  },
  sandboxLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sandboxFileCount: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  sandboxActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sandboxActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sandboxActionBtnText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
  sessionCount: {
    fontSize: 9.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  sessionScroll: {
    flex: 1,
  },
  emptySessions: {
    fontSize: 11,
    color: Colors.text.tertiary,
    paddingHorizontal: 4,
    paddingVertical: 10,
    fontStyle: 'italic',
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  sessionCardActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  sessionTitle: {
    fontSize: 11.5,
    color: Colors.text.secondary,
    flex: 1,
    fontWeight: '500',
  },
  sessionTitleActive: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 3,
    opacity: 0.5,
  },
  footer: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  targetToggleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  targetChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  targetChoiceActive: {
    borderColor: 'rgba(59, 130, 246, 0.3)',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  targetChoiceText: {
    fontSize: 9.5,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
    fontWeight: '600',
  },
  targetChoiceTextActive: {
    color: Colors.brand.emerald,
  },
  targetChoiceTextActiveSky: {
    color: Colors.brand.sky,
  },
  terminalShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  terminalShortcutText: {
    fontSize: 10,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  clusterInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  clusterHostText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
    maxWidth: 170,
  },
});
