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
    name: 'PornMaster Klein Turbo',
    badge: '4-STEP',
    desc: 'PornMaster v4 Turbo FP8 — Diffusers, not Comfy',
  },
  {
    id: 'flux2-klein-9b-base',
    name: 'PornMaster Klein Base',
    badge: '28-STEP',
    desc: 'PornMaster v4 Base FP8 from Comfy checkpoints',
  },
  {
    id: 'seedvr2-7b-fp8',
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
];

export const SPARK_ID_MODELS: ImageModelOption[] = [
  {
    id: 'ddb-edit',
    name: 'DDB Edit',
    badge: 'ECCV 2026',
    desc: 'xing0916/DDB_Edit · Lumina-DiMOO VQ · hybrid absorption',
  },
  {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen ID Edit',
    badge: 'FALLBACK',
    desc: 'Qwen-Image-Edit-2511 if DDB is unavailable',
  },
];

export type ModelAvailability = {
  available: boolean;
  loaded: boolean;
};

interface ModelPickerProps {
  selected: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  isGrid?: boolean;
  availability?: Record<string, ModelAvailability>;
  warmingId?: string | null;
  loadedId?: string | null;
  catalog?: ImageModelOption[];
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  selected,
  onSelect,
  disabled = false,
  isGrid = false,
  availability,
  warmingId,
  loadedId,
  catalog = SPARK_IMAGE_MODELS,
}) => {
  const content = (
    <View style={[styles.container, isGrid && styles.gridContainer]}>
      {catalog.map((item) => {
        const isSelected = item.id === selected;
        const avail = availability?.[item.id];
        const missing = avail ? !avail.available : false;
        const isWarming = warmingId === item.id;
        const isLoaded = loadedId === item.id || avail?.loaded;
        const badge = missing
          ? 'NO WEIGHTS'
          : isWarming
          ? 'LOADING'
          : isLoaded
          ? 'LOADED'
          : item.badge;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.pill,
              isGrid && styles.gridCard,
              isSelected && styles.pillActive,
              missing && styles.pillMissing,
            ]}
            onPress={() => onSelect(item.id)}
            disabled={disabled || missing}
            activeOpacity={0.75}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.nameText, isSelected && styles.nameTextActive, missing && styles.nameMissing]}>
                {item.name}
              </Text>
              <View style={[
                styles.badge,
                isSelected && styles.badgeActive,
                isLoaded && !missing && styles.badgeLoaded,
                isWarming && styles.badgeWarm,
              ]}>
                <Text style={[
                  styles.badgeText,
                  isSelected && styles.badgeTextActive,
                  isLoaded && !isSelected && styles.badgeTextLoaded,
                ]}>
                  {badge}
                </Text>
              </View>
            </View>
            <Text style={[styles.descText, isSelected && styles.descTextActive]} numberOfLines={isGrid ? 2 : 1}>
              {isWarming ? 'Warming weights on GB10…' : item.desc}
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
  pillMissing: {
    opacity: 0.45,
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
  badgeLoaded: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  badgeWarm: {
    backgroundColor: 'rgba(245, 158, 11, 0.35)',
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
  badgeTextLoaded: {
    color: '#6EE7B7',
  },
  nameMissing: {
    color: '#71717A',
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
