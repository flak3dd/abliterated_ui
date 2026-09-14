import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { AspectRatioType } from '../../types';

interface AspectRatioPickerProps {
  selected: AspectRatioType;
  onSelect: (ratio: AspectRatioType) => void;
  disabled?: boolean;
}

interface RatioItem {
  type: AspectRatioType;
  label: string;
  name: string;
  res: string;
  boxWidth: number;
  boxHeight: number;
}

const RATIOS: RatioItem[] = [
  { type: '1:1', label: '1:1', name: 'Square', res: '1024×1024', boxWidth: 16, boxHeight: 16 },
  { type: '16:9', label: '16:9', name: 'Cinema', res: '1280×720', boxWidth: 20, boxHeight: 11 },
  { type: '9:16', label: '9:16', name: 'Story', res: '720×1280', boxWidth: 11, boxHeight: 20 },
  { type: '4:5', label: '4:5', name: 'Portrait', res: '896×1120', boxWidth: 13, boxHeight: 16 },
  { type: '21:9', label: '21:9', name: 'Ultra', res: '1344×576', boxWidth: 22, boxHeight: 9 },
];

export const AspectRatioPicker: React.FC<AspectRatioPickerProps> = ({
  selected,
  onSelect,
  disabled = false,
}) => {
  const handleSelect = (ratio: AspectRatioType) => {
    if (disabled) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onSelect(ratio);
  };

  return (
    <View style={styles.container}>
      {RATIOS.map((item) => {
        const isActive = selected === item.type;
        return (
          <TouchableOpacity
            key={item.type}
            style={[styles.card, isActive && styles.cardActive]}
            onPress={() => handleSelect(item.type)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            {/* Visual aspect ratio silhouette box */}
            <View style={styles.boxWrapper}>
              <View
                style={[
                  styles.aspectBox,
                  { width: item.boxWidth, height: item.boxHeight },
                  isActive && styles.aspectBoxActive,
                ]}
              />
            </View>

            <Text style={[styles.ratioLabel, isActive && styles.ratioLabelActive]}>
              {item.label}
            </Text>

            <Text style={[styles.ratioName, isActive && styles.ratioNameActive]}>
              {item.name}
            </Text>

            <Text style={styles.resTag} numberOfLines={1}>
              {item.res}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#0c0d12',
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(18, 18, 22, 0.6)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  boxWrapper: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  aspectBox: {
    borderWidth: 1.5,
    borderColor: '#52525B',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  aspectBoxActive: {
    borderColor: Colors.brand.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  ratioLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1AA',
    fontFamily: 'Menlo',
  },
  ratioLabelActive: {
    color: Colors.brand.emerald,
  },
  ratioName: {
    fontSize: 9.5,
    color: '#71717A',
    fontWeight: '500',
    marginTop: 1,
  },
  ratioNameActive: {
    color: '#E4E4E7',
  },
  resTag: {
    fontSize: 8,
    color: '#52525B',
    marginTop: 2,
    fontFamily: 'Menlo',
  },
});
