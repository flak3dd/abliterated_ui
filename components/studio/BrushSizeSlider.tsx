import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';

interface BrushSizeSliderProps {
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
}

const BRUSH_PRESETS = [14, 24, 36, 52];

export const BrushSizeSlider: React.FC<BrushSizeSliderProps> = ({
  brushSize,
  onBrushSizeChange,
}) => {
  const handleSelect = (size: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onBrushSizeChange(size);
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftLabel}>
        <Text style={styles.label}>Brush Radius</Text>
        <Text style={styles.sizeIndicator}>{brushSize}px</Text>
      </View>

      <View style={styles.presetsRow}>
        {BRUSH_PRESETS.map((size) => {
          const isSelected = brushSize === size;
          return (
            <TouchableOpacity
              key={size}
              style={[styles.presetButton, isSelected && styles.presetButtonActive]}
              onPress={() => handleSelect(size)}
              activeOpacity={0.7}
            >
              {/* Visual circle showing brush stroke proportion */}
              <View
                style={[
                  styles.brushDot,
                  {
                    width: Math.min(22, Math.max(6, size / 2.2)),
                    height: Math.min(22, Math.max(6, size / 2.2)),
                    borderRadius: 999,
                    backgroundColor: isSelected ? Colors.brand.rose : Colors.text.tertiary,
                  },
                ]}
              />
              <Text
                style={[
                  styles.presetText,
                  isSelected && styles.presetTextActive,
                ]}
              >
                {size}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  leftLabel: {
    flexDirection: 'column',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  sizeIndicator: {
    fontSize: 11,
    color: Colors.brand.rose,
    fontFamily: 'Menlo',
    fontWeight: '700',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  presetButtonActive: {
    borderColor: 'rgba(244, 63, 94, 0.4)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  brushDot: {
    alignSelf: 'center',
  },
  presetText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text.secondary,
    fontFamily: 'Menlo',
  },
  presetTextActive: {
    color: Colors.brand.rose,
  },
});
