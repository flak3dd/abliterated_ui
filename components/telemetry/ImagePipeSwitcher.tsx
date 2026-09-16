import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useStudioStore } from '../../stores/useStudioStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { mergeImageCatalog, SPARK_ID_MODELS, SPARK_IMAGE_MODELS, isModelEnabled } from '../../services/modelCatalog';
import { useModelEnablement } from '../../stores/useModelEnablement';

function isDdbId(id: string) {
  return /ddb/i.test(id);
}

export const ImagePipeSwitcher: React.FC = () => {
  const refreshImageModels = useStudioStore((s) => s.refreshImageModels);
  const activateImageModel = useStudioStore((s) => s.activateImageModel);
  const availability = useStudioStore((s) => s.modelAvailability);
  const loadedModelId = useStudioStore((s) => s.loadedModelId);
  const warmingModelId = useStudioStore((s) => s.warmingModelId);
  const selectedModel = useStudioStore((s) => s.selectedModel);
  const switchError = useStudioStore((s) => s.modelSwitchError);
  const imageLoadedModel = useMeshStore((s) => s.imageLoadedModel);
  const enabledMap = useModelEnablement((s) => s.enabled);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void refreshImageModels();
  }, [refreshImageModels]);

  const liveIds = Object.keys(availability || {});
  const catalog = mergeImageCatalog([...SPARK_IMAGE_MODELS, ...SPARK_ID_MODELS], liveIds).filter(
    (item) => {
      if (!isModelEnabled(enabledMap, item.id)) return false;
      const avail = availability[item.id];
      if (avail && avail.available === false) return false;
      return true;
    }
  );

  const loaded = (loadedModelId || imageLoadedModel || '').toLowerCase();
  const warming = busyId || warmingModelId;

  const handleSelect = async (id: string) => {
    if (busyId) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    setBusyId(id);
    try {
      await activateImageModel(id);
    } catch {
      /* status is on the store */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ImageIcon size={16} color={Colors.brand.sky} />
        <Text style={styles.title}>IMAGE PIPE</Text>
        <Text style={styles.loadedHint} numberOfLines={1}>
          {warming ? 'LOADING ' + warming : loaded || 'none loaded'}
        </Text>
      </View>
      <Text style={styles.note}>
        Swap the :7860 Diffusers pipe. DDB Edit, Krea, Qwen-Edit, and Klein are interchangeable.
      </Text>
      <View style={styles.grid}>
        {catalog.map((item) => {
          const avail = availability[item.id];
          const isLoaded =
            Boolean(avail?.loaded) ||
            item.id.toLowerCase() === loaded ||
            (isDdbId(item.id) && /ddb/i.test(loaded));
          const isWarm = warming === item.id;
          const isSelected = item.id === selectedModel || (isDdbId(item.id) && isDdbId(selectedModel));
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.chip,
                isSelected && styles.chipSelected,
                isLoaded && styles.chipLoaded,
              ]}
              onPress={() => handleSelect(item.id)}
              disabled={Boolean(busyId)}
              activeOpacity={0.75}
            >
              {isWarm ? (
                <ActivityIndicator size="small" color={Colors.brand.sky} />
              ) : (
                <View style={[styles.dot, { backgroundColor: isLoaded ? Colors.brand.green : Colors.text.tertiary }]} />
              )}
              <View style={styles.chipMeta}>
                <Text style={styles.chipName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.chipBadge, isLoaded && styles.chipBadgeLoaded]} numberOfLines={1}>
                  {isLoaded ? 'LOADED' : item.badge}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {switchError ? <Text style={styles.err}>{switchError}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brand.sky,
    letterSpacing: 0.6,
  },
  loadedHint: {
    flex: 1,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
  note: { fontSize: 12, color: Colors.text.tertiary, lineHeight: 16, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipSelected: { borderColor: Colors.brand.sky },
  chipLoaded: {
    borderColor: Colors.brand.green,
    backgroundColor: Colors.brand.greenDim,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipMeta: { flex: 1, minWidth: 0 },
  chipName: { fontSize: 13, fontWeight: '700', color: Colors.text.primary },
  chipBadge: { fontSize: 10, fontFamily: 'Menlo', color: Colors.text.tertiary, marginTop: 1 },
  chipBadgeLoaded: { color: Colors.brand.green },
  err: { marginTop: 10, fontSize: 12, color: Colors.brand.rose },
});
