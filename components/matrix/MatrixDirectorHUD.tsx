import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import {
  X,
  Volume2,
  VolumeX,
  Tv,
  Zap,
  Play,
  SkipForward,
  SkipBack,
  RotateCcw,
  Sliders,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useMatrixStore } from '../../stores/useMatrixStore';
import { useMeshStore } from '../../stores/useMeshStore';
import {
  MatrixPhase,
  MatrixSpectrum,
  MATRIX_PALETTES,
} from '../../services/matrix/MatrixTypes';

interface MatrixDirectorHUDProps {
  onClose: () => void;
}

const PHASES: { id: MatrixPhase; label: string }[] = [
  { id: 'PHASE_3_CIPHER', label: 'Cipher' },
  { id: 'PHASE_4_RAIN', label: 'Rain' },
  { id: 'PHASE_5_FREEZE', label: 'Freeze' },
  { id: 'PHASE_7_AMBIENT', label: 'Ambient' },
];

const SPECTRUMS: MatrixSpectrum[] = ['rainbow', 'blue', 'green', 'amber', 'rose', 'violet'];

export const MatrixDirectorHUD: React.FC<MatrixDirectorHUDProps> = ({ onClose }) => {
  const {
    phase,
    spectrum,
    speedMultiplier,
    audioEnabled,
    crtShader,
    setPhase,
    setSpectrum,
    setSpeedMultiplier,
    toggleAudio,
    toggleCRT,
    nextPhase,
    prevPhase,
    resetSequence,
  } = useMatrixStore();

  const telemetry = useMeshStore((s) => s.telemetry);

  const handleSelectPhase = (p: MatrixPhase) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setPhase(p);
  };

  const handleSelectSpectrum = (s: MatrixSpectrum) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSpectrum(s);
  };

  const curPal = MATRIX_PALETTES[spectrum];

  return (
    <View style={styles.hudOverlay} pointerEvents="box-none">
      {/* Top Header Controls */}
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <View style={[styles.pulseDot, { backgroundColor: curPal.t1 }]} />
          <Text style={[styles.title, { color: curPal.head }]}>
            MATRIX ENGINE v5.0
          </Text>
          <View style={styles.phaseBadge}>
            <Text style={[styles.phaseBadgeText, { color: curPal.t1 }]}>
              {phase.replace('PHASE_', '').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Telemetry pill */}
        <View style={styles.telemetryPill}>
          <Zap size={11} color={curPal.t1} />
          <Text style={styles.telemetryText}>
            GB10: {telemetry?.gpuTemp || 41}°C • {telemetry?.vramUsedGb || 24.8}GB
          </Text>
        </View>

        {/* Action icons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.iconBtn, audioEnabled && styles.iconBtnActive]}
            onPress={toggleAudio}
            activeOpacity={0.7}
          >
            {audioEnabled ? (
              <Volume2 size={14} color={curPal.t1} />
            ) : (
              <VolumeX size={14} color={Colors.text.tertiary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, crtShader && styles.iconBtnActive]}
            onPress={toggleCRT}
            activeOpacity={0.7}
          >
            <Tv size={14} color={crtShader ? curPal.t1 : Colors.text.tertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <X size={16} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Timeline & Palette Director Bar */}
      <View style={styles.bottomBar}>
        {/* Phase scrubber row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.phaseScroll}
        >
          <TouchableOpacity
            style={styles.navBtn}
            onPress={prevPhase}
            activeOpacity={0.7}
          >
            <SkipBack size={12} color={Colors.text.secondary} />
          </TouchableOpacity>

          {PHASES.map((p) => {
            const isActive = p.id === phase;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.phasePill,
                  isActive && {
                    backgroundColor: curPal.t1,
                    borderColor: curPal.head,
                  },
                ]}
                onPress={() => handleSelectPhase(p.id)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.phasePillText,
                    isActive && { color: '#000', fontWeight: '700' },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.navBtn}
            onPress={nextPhase}
            activeOpacity={0.7}
          >
            <SkipForward size={12} color={Colors.text.secondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navBtn}
            onPress={resetSequence}
            activeOpacity={0.7}
          >
            <RotateCcw size={12} color={Colors.text.secondary} />
          </TouchableOpacity>
        </ScrollView>

        {/* Spectrum & Speed sub-bar */}
        <View style={styles.subBar}>
          <View style={styles.spectrumRow}>
            {SPECTRUMS.map((spec) => {
              const pal = MATRIX_PALETTES[spec];
              const isSelected = spec === spectrum;
              return (
                <TouchableOpacity
                  key={spec}
                  style={[
                    styles.colorDot,
                    spec === 'rainbow'
                      ? ({
                          backgroundImage:
                            'linear-gradient(135deg, #ff004d, #ffb000, #39ff14, #00e5ff, #a855f7)',
                          backgroundColor: pal.t1,
                        } as any)
                      : { backgroundColor: pal.t1 },
                    isSelected && styles.colorDotActive,
                  ]}
                  onPress={() => handleSelectSpectrum(spec)}
                  activeOpacity={0.8}
                />
              );
            })}
          </View>

          <View style={styles.speedRow}>
            {[0.5, 1.0, 2.0].map((spd) => (
              <TouchableOpacity
                key={spd}
                style={[
                  styles.speedPill,
                  speedMultiplier === spd && {
                    backgroundColor: curPal.t1,
                  },
                ]}
                onPress={() => setSpeedMultiplier(spd)}
              >
                <Text
                  style={[
                    styles.speedText,
                    speedMultiplier === spd && { color: '#000', fontWeight: '700' },
                  ]}
                >
                  {spd}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(8, 11, 18, 0.85)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Menlo',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  phaseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  phaseBadgeText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    fontWeight: '600',
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  telemetryText: {
    fontSize: 10,
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginLeft: 4,
  },
  bottomBar: {
    backgroundColor: 'rgba(8, 11, 18, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  phaseScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  navBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  phasePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  phasePillText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.text.secondary,
  },
  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  spectrumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: '#FFF',
    transform: [{ scale: 1.25 }],
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speedPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  speedText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
});
