import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Menu, PanelLeft, FlaskConical } from 'lucide-react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { ModelSelector } from '../models/ModelSelector';
import { PingIndicator } from '../telemetry/PingIndicator';
import { useMatrixStore } from '../../stores/useMatrixStore';
import { MATRIX_PALETTES } from '../../services/matrix/MatrixTypes';

const SpectrumSkull: React.FC<{ color: string; size?: number }> = ({
  color,
  size = 16,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Ellipse cx="12" cy="11" rx="7.35" ry="7.85" stroke={color} strokeWidth="1.7" />
    <Circle cx="9" cy="10.35" r="1.4" fill={color} />
    <Circle cx="15" cy="10.35" r="1.4" fill={color} />
    <Path d="M12 11.7L10.55 14.35h2.9z" fill={color} />
  </Svg>
);

interface HeaderBarProps {
  onOpenDrawer?: () => void;
  onToggleSidebar?: () => void;
  onToggleSandboxPanel?: () => void;
  isSandboxPanelOpen?: boolean;
  isSidebarOpen?: boolean;
  isDesktop?: boolean;
  title?: string;
  subtitle?: string;
  modelTag?: string;
  modelSub?: string;
  spectrumCycle?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  onOpenDrawer,
  onToggleSidebar,
  onToggleSandboxPanel,
  isSandboxPanelOpen = false,
  isSidebarOpen = true,
  isDesktop = false,
  title = 'Abliterated AI',
  subtitle,
  modelTag,
  modelSub,
  spectrumCycle = false,
}) => {
  const spectrum = useMatrixStore((s) => s.spectrum);
  const cycleSpectrum = useMatrixStore((s) => s.cycleSpectrum);
  const pal = MATRIX_PALETTES[spectrum];

  const isImageSurface =
    (title || '').includes('Studio') || (title || '').includes('ID');

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

  const handleSandboxToggle = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onToggleSandboxPanel?.();
  };

  const handleSpectrumCycle = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    cycleSpectrum();
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

        <View style={styles.centerContainer}>
          {spectrumCycle ? (
            <TouchableOpacity
              style={styles.spectrumCycleBtn}
              onPress={handleSpectrumCycle}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Skull color ${pal.label}. Tap to cycle.`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <SpectrumSkull color={pal.t1} size={16} />
              <View
                style={[
                  styles.spectrumSwatch,
                  spectrum === 'rainbow'
                    ? ({
                        backgroundImage:
                          'linear-gradient(135deg, #ff004d, #ffb000, #39ff14, #00e5ff, #a855f7)',
                        backgroundColor: pal.t1,
                      } as any)
                    : { backgroundColor: pal.t1 },
                ]}
              />
              <Text style={[styles.spectrumCycleText, { color: pal.t1 }]}>
                {spectrum.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.title}>{title}</Text>
          )}
        </View>
      </View>

      {isDesktop && (
        <View style={styles.centerPillGroup}>
          <ModelSelector lane={isImageSurface ? 'image' : 'chat'} variant="trigger" />
        </View>
      )}

      {/* Right: Matrix Trigger, Sandbox Panel Toggle & Latency Pill */}
      <View style={styles.rightContainer}>
        {!isDesktop && <PingIndicator />}
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
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
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
  spectrumCycleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', overflow: 'visible' } as any) : null),
  },
  spectrumSwatch: {
    width: 7,
    height: 7,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  spectrumCycleText: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  modeSwitchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 7,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 6,
  },
  modeSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  modeSwitchBtnSparkActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  modeSwitchBtnCloudActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  modeSwitchText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: '#71717A',
  },
  modeSwitchTextSparkActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  modeSwitchTextCloudActive: {
    color: '#38BDF8',
    fontWeight: '700',
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
