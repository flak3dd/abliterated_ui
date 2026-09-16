import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronDown, Cpu, RefreshCw, Search, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useModelSession } from '../../stores/useModelSession';
import { useStudioStore } from '../../stores/useStudioStore';
import { useMeshStore } from '../../stores/useMeshStore';
import { useModelEnablement } from '../../stores/useModelEnablement';
import {
  filterModels,
  imageModelIdsMatch,
  isModelEnabled,
  mergeImageCatalog,
  modelMeta,
  rankModels,
  SPARK_IMAGE_MODELS,
  type ImageModelOption,
  type ModelLane,
} from '../../services/modelCatalog';

export type ModelSelectorVariant = 'trigger' | 'panel';

interface ModelSelectorProps {
  lane: ModelLane;
  variant?: ModelSelectorVariant;
  catalog?: ImageModelOption[];
  disabled?: boolean;
}

function haptic() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  lane,
  variant = 'panel',
  catalog,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const route = useModelSession((s) => s.route);
  const chatLane = useModelSession((s) => s.chat);
  const catalogs = useModelSession((s) => s.catalogs);
  const setChatSelected = useModelSession((s) => s.setChatSelected);
  const probeAll = useMeshStore((s) => s.probeAll);

  const selectedModel = useStudioStore((s) => s.selectedModel);
  const setSelectedModel = useStudioStore((s) => s.setSelectedModel);
  const modelAvailability = useStudioStore((s) => s.modelAvailability);
  const warmingModelId = useStudioStore((s) => s.warmingModelId);
  const loadedModelId = useStudioStore((s) => s.loadedModelId);
  const refreshImageModels = useStudioStore((s) => s.refreshImageModels);
  const isGenerating = useStudioStore((s) => s.isGenerating);
  const enabledMap = useModelEnablement((s) => s.enabled);

  const selectedId = lane === 'chat' ? chatLane.selectedId : selectedModel;
  const servingId = lane === 'chat' ? chatLane.servingId : loadedModelId;
  const laneDisabled = disabled || (lane === 'image' && isGenerating);

  const rows = useMemo(() => {
    if (lane === 'chat') {
      const ids = catalogs[route] || [];
      const items = ids
        .filter((id) => isModelEnabled(enabledMap, id))
        .map((id) => {
          const meta = modelMeta(id, 'chat');
          return {
            ...meta,
            selected: id === selectedId,
            loaded: id === servingId,
            available: true,
            warming: chatLane.state === 'warming' && id === selectedId,
          };
        });
      return rankModels(filterModels(items, query));
    }
    const base = catalog || SPARK_IMAGE_MODELS;
    const liveIds = Object.keys(modelAvailability || {});
    const merged = mergeImageCatalog(base, liveIds).filter((item) => {
      if (!isModelEnabled(enabledMap, item.id)) return false;
      const avail = modelAvailability?.[item.id];
      if (avail && avail.available === false) return false;
      return true;
    });
    const items = merged.map((item) => {
      const avail = modelAvailability?.[item.id];
      const aliasAvail = Object.entries(modelAvailability || {}).find(([id, row]) =>
        row?.loaded && imageModelIdsMatch(id, item.id)
      )?.[1];
      const meta = modelMeta(item.id, 'image');
      return {
        id: item.id,
        name: item.name || meta.name,
        badge: item.badge || meta.badge,
        desc: item.desc || meta.desc,
        lane: 'image' as const,
        selected: imageModelIdsMatch(item.id, selectedId),
        loaded:
          Boolean(avail?.loaded) ||
          Boolean(aliasAvail?.loaded) ||
          imageModelIdsMatch(item.id, loadedModelId || ''),
        available: avail ? avail.available : true,
        warming: imageModelIdsMatch(item.id, warmingModelId || ''),
      };
    });
    return rankModels(filterModels(items, query));
  }, [
    lane,
    catalog,
    catalogs,
    route,
    selectedId,
    servingId,
    query,
    modelAvailability,
    warmingModelId,
    loadedModelId,
    chatLane.state,
    enabledMap,
  ]);

  useEffect(() => {
    if (lane === 'image') void refreshImageModels();
  }, [lane, refreshImageModels]);

  const select = (id: string, available: boolean) => {
    if (laneDisabled || !available) return;
    haptic();
    if (lane === 'chat') setChatSelected(id);
    else setSelectedModel(id);
    setOpen(false);
    setQuery('');
  };

  const refresh = () => {
    haptic();
    if (lane === 'chat') void probeAll();
    else void refreshImageModels();
  };

  const list = (
    <View style={styles.sheet}>
      <View style={styles.searchRow}>
        <Search size={13} color={Colors.text.tertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={lane === 'chat' ? 'Filter chat models' : 'Filter image models'}
          placeholderTextColor={Colors.text.tertiary}
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={() => {
            const first = rows.find((r) => r.available);
            if (first) select(first.id, true);
          }}
        />
        <TouchableOpacity onPress={refresh} style={styles.iconBtn} accessibilityLabel="Refresh models">
          <RefreshCw size={13} color={Colors.brand.sky} />
        </TouchableOpacity>
        {variant === 'trigger' && (
          <TouchableOpacity onPress={() => setOpen(false)} style={styles.iconBtn}>
            <X size={14} color={Colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.metaLine}>
        {lane === 'chat' ? route : 'spark :7860'} · {rows.length} shown
        {servingId ? ` · live ${servingId.replace(/^.*\//, '')}` : ''}
      </Text>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {rows.map((item) => {
          const status = !item.available
            ? 'NO WEIGHTS'
            : item.warming
            ? 'WARMING'
            : item.loaded
            ? 'READY'
            : item.selected
            ? 'SELECTED'
            : item.badge;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.row,
                item.selected && styles.rowSelected,
                !item.available && styles.rowMissing,
              ]}
              onPress={() => select(item.id, item.available)}
              disabled={laneDisabled || !item.available}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.dot,
                  item.loaded && styles.dotReady,
                  item.warming && styles.dotWarm,
                  !item.available && styles.dotOff,
                  item.selected && item.available && !item.loaded && styles.dotSel,
                ]}
              />
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowName, item.selected && styles.rowNameOn]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowBadge, item.loaded && styles.rowBadgeOn]}>{status}</Text>
                </View>
                <Text style={styles.rowDesc} numberOfLines={1}>
                  {item.id}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {rows.length === 0 && (
          <Text style={styles.empty}>No models match “{query}”.</Text>
        )}
      </ScrollView>
    </View>
  );

  if (variant === 'panel') {
    return <View style={styles.panelWrap}>{list}</View>;
  }

  const short = (selectedId || 'pick model').replace(/^.*\//, '');
  const state = lane === 'chat' ? chatLane.state : loadedModelId === selectedId ? 'ready' : 'idle';

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => {
          if (laneDisabled) return;
          haptic();
          setOpen(true);
        }}
        disabled={laneDisabled}
        activeOpacity={0.8}
      >
        <Cpu size={11} color={Colors.brand.emerald} />
        <Text style={styles.triggerText} numberOfLines={1}>
          {short}
        </Text>
        <Text style={styles.triggerState}>{state}</Text>
        <ChevronDown size={11} color={Colors.text.tertiary} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.pop}>{list}</View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  panelWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border.default,
    backgroundColor: Colors.background.surface,
    overflow: 'hidden',
    maxHeight: 360,
  },
  sheet: {
    width: '100%',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'Menlo, ui-monospace, monospace' : 'Menlo',
    paddingVertical: 4,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLine: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  list: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  rowSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  rowMissing: {
    opacity: 0.45,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.text.tertiary,
  },
  dotReady: { backgroundColor: '#34D399' },
  dotWarm: { backgroundColor: Colors.brand.amber },
  dotOff: { backgroundColor: Colors.brand.rose },
  dotSel: { backgroundColor: Colors.brand.sky },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  rowNameOn: { color: Colors.text.primary },
  rowBadge: {
    fontSize: 9,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: Colors.text.tertiary,
  },
  rowBadgeOn: { color: '#6EE7B7' },
  rowDesc: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
  empty: {
    padding: 16,
    color: Colors.text.tertiary,
    fontSize: 12,
    textAlign: 'center',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  triggerText: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '600',
    color: Colors.text.secondary,
    maxWidth: 120,
  },
  triggerState: {
    fontSize: 9,
    fontFamily: 'Menlo',
    color: Colors.text.tertiary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  pop: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border.active,
    backgroundColor: Colors.background.surfaceElevated,
    overflow: 'hidden',
  },
});
