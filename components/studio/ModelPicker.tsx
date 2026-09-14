import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ScrollView, View } from 'react-native';
import Colors from '../../theme/colors';

export interface ImageModelOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
}

export const SPARK_IMAGE_MODELS: ImageModelOption[] = [
  {
    id: 'krea2-raw-fp8',
    name: 'Krea 2 RAW',
    badge: 'FP8 HERO',
    desc: 'Ultra-photorealistic raw studio diffusion',
  },
  {
    id: 'flux2-klein-9b',
    name: 'FLUX.2 Klein 9B',
    badge: '9B FP8',
    desc: 'Superior prompt adherence & compositional depth',
  },
  {
    id: 'seedvr2-7b',
    name: 'SeedVR2 7B',
    badge: 'UPSCALE',
    desc: 'Video restoration & high-res upscale diffusion',
  },
  {
    id: 'z-image-turbo-nsfw-nvfp4',
    name: 'Turbo NVFP4',
    badge: 'FAST 4-STEP',
    desc: 'Ultra-fast low-latency generative diffusion',
  },
  {
    id: 'qwen-image-2512-fp8',
    name: 'Qwen Omni 2512',
    badge: 'OMNI FP8',
    desc: 'Multimodal generative image reasoning',
  },
  {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen Inpaint Edit',
    badge: 'INPAINT',
    desc: 'Targeted mask replacement & editing',
  },
  {
    id: 'comfy-dolphin',
    name: 'ComfyUI Dolphin',
    badge: 'GRAPH PIPELINE',
    desc: 'Direct node graph generative bridge',
  },
  {
    id: 'ddb-edit',
    name: 'DDB Inpaint',
    badge: 'DDB EDIT',
    desc: 'Specialized structural inpainting',
  },
];

interface ModelPickerProps {
  selected: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  isGrid?: boolean;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  selected,
  onSelect,
  disabled = false,
  isGrid = false,
}) => {
  const content = (
    <View style={[styles.container, isGrid && styles.gridContainer]}>
      {SPARK_IMAGE_MODELS.map((item) => {
        const isSelected = item.id === selected;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.pill,
              isGrid && styles.gridCard,
              isSelected && styles.pillActive,
            ]}
            onPress={() => onSelect(item.id)}
            disabled={disabled}
            activeOpacity={0.75}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.nameText, isSelected && styles.nameTextActive]}>
                {item.name}
              </Text>
              <View style={[styles.badge, isSelected && styles.badgeActive]}>
                <Text style={[styles.badgeText, isSelected && styles.badgeTextActive]}>
                  {item.badge}
                </Text>
              </View>
            </View>
            <Text style={[styles.descText, isSelected && styles.descTextActive]} numberOfLines={isGrid ? 2 : 1}>
              {item.desc}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (isGrid) {
    return content;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
    >
      {content}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  scrollContainer: {
    paddingVertical: 4,
  },
  gridContainer: {
    flexDirection: 'column',
    gap: 6,
    width: '100%',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0c0d12',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    minWidth: 140,
    maxWidth: 200,
  },
  gridCard: {
    minWidth: '100%',
    maxWidth: '100%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  pillActive: {
    borderColor: Colors.brand.emerald,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 3,
  },
  nameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#D4D4D8',
    letterSpacing: -0.2,
  },
  nameTextActive: {
    color: '#FFFFFF',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgeActive: {
    backgroundColor: Colors.brand.emerald,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: '#71717A',
  },
  badgeTextActive: {
    color: '#09090B',
  },
  descText: {
    fontSize: 10.5,
    color: '#71717A',
    lineHeight: 14,
  },
  descTextActive: {
    color: '#A1A1AA',
  },
});
