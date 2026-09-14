import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Menu, Zap, Terminal, PanelLeft, FlaskConical, Cpu, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { PingIndicator } from '../telemetry/PingIndicator';
import { useChatStore } from '../../stores/useChatStore';
import { useMeshStore } from '../../stores/useMeshStore';

interface HeaderBarProps {
  onOpenDrawer?: () => void;
  onOpenMatrix?: () => void;
  onToggleSidebar?: () => void;
  onToggleSandboxPanel?: () => void;
  isSandboxPanelOpen?: boolean;
  isSidebarOpen?: boolean;
  isDesktop?: boolean;
  title?: string;
  subtitle?: string;
  modelTag?: string;
  modelSub?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onOpenDrawer,
  onOpenMatrix,
  onToggleSidebar,
  onToggleSandboxPanel,
  isSandboxPanelOpen = false,
  isSidebarOpen = true,
  isDesktop = false,
  title = 'Abliterated AI',
  subtitle,
  modelTag,
  modelSub = 'Sovereign Cloud',
}) => {
  const { antiHallucination, toggleAntiHallucination } = useChatStore();
  const { activeHost } = useMeshStore();

  const isFeatherless = activeHost.includes('featherless');
  const effectiveSubtitle = subtitle || (isFeatherless ? 'Featherless' : 'Cloud');
  const effectiveModelTag = modelTag || (isFeatherless ? 'Llama-3.1-8B (Mesh)' : 'qwen-abliterated (NVFP4)');

  const handleMenuPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (isDesktop && onToggleSidebar) {
      onToggleSidebar();
    } else {
      onOpenDrawer?.();
    }
  };

  const handleMatrixPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    onOpenMatrix?.();
  };

  const handleSandboxToggle = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onToggleSandboxPanel?.();
  };

  return (
    <View style={styles.container}>
      {/* Left: Menu / Sidebar Trigger */}
      <View style={styles.leftContainer}>
        <TouchableOpacity
          style={[styles.iconButton, isDesktop && isSidebarOpen && styles.iconButtonActive]}
          onPress={handleMenuPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          {isDesktop ? (
            <PanelLeft size={17} color={isSidebarOpen ? Colors.brand.emerald : Colors.text.secondary} />
          ) : (
            <Menu size={18} color={Colors.text.primary} />
          )}
        </TouchableOpacity>

        {/* Center: Clean Title & Compact Badge */}
        <View style={styles.centerContainer}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.hardwareBadge}
            onPress={handleMatrixPress}
            activeOpacity={0.7}
          >
            <Zap size={9} color={Colors.brand.emerald} />
            <Text style={styles.badgeText}>{effectiveSubtitle}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Desktop Center: Model pill + Anti-Hallucination Pill */}
      {isDesktop && (
        <View style={styles.centerPillGroup}>
          <View style={styles.modelPill}>
            <Cpu size={11} color={Colors.brand.emerald} />
            <Text style={styles.modelPillText}>{effectiveModelTag}</Text>
            <Text style={styles.modelPillDivider}>•</Text>
            <Text style={styles.modelPillSub}>{modelSub}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.antiHallucinationHeaderPill,
              antiHallucination && styles.antiHallucinationHeaderPillActive,
            ]}
            onPress={() => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                styles.antiHallucinationHeaderText,
                antiHallucination && styles.antiHallucinationHeaderTextActive,
              ]}
            >
              {antiHallucination ? 'Anti-Hallucination: STRICT' : 'Anti-Hallucination: OFF'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Right: Matrix Trigger, Sandbox Panel Toggle & Latency Pill */}
      <View style={styles.rightContainer}>
        {/* Desktop Split Sandbox Toggle */}
        {isDesktop && onToggleSandboxPanel && (
          <TouchableOpacity
            style={[styles.sandboxToggleBtn, isSandboxPanelOpen && styles.sandboxToggleBtnActive]}
            onPress={handleSandboxToggle}
            activeOpacity={0.7}
          >
            <FlaskConical size={12} color={isSandboxPanelOpen ? '#09090B' : Colors.brand.emerald} />
            <Text style={[styles.sandboxToggleText, isSandboxPanelOpen && styles.sandboxToggleTextActive]}>
              Sandbox Console
            </Text>
          </TouchableOpacity>
        )}

        {onOpenMatrix && (
          <TouchableOpacity
            style={styles.matrixBtn}
            onPress={handleMatrixPress}
            activeOpacity={0.7}
          >
            <Terminal size={11} color={Colors.brand.sky} />
            <Text style={styles.matrixBtnText}>BLINGbling</Text>
          </TouchableOpacity>
        )}

        <PingIndicator />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: '#08080B',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  centerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Colors.text.primary,
  },
  hardwareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: Colors.brand.emeraldDim,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brand.emerald,
    letterSpacing: -0.1,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  modelPillText: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  modelPillDivider: {
    fontSize: 10,
    color: Colors.text.tertiary,
  },
  modelPillSub: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontFamily: 'Menlo',
  },
  centerPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  antiHallucinationHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  antiHallucinationHeaderPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  antiHallucinationHeaderText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: '#71717A',
  },
  antiHallucinationHeaderTextActive: {
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sandboxToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  sandboxToggleBtnActive: {
    backgroundColor: Colors.brand.emerald,
    borderColor: Colors.brand.emerald,
  },
  sandboxToggleText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  sandboxToggleTextActive: {
    color: '#09090B',
  },
  matrixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  matrixBtnText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: Colors.brand.sky,
  },
});
