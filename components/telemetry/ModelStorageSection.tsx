import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {
  Server,
  Layers,
  Cpu,
  FileCode,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FolderGit2,
  Package,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { useMeshStore } from '../../stores/useMeshStore';
import { useModelEnablement } from '../../stores/useModelEnablement';
import { isModelEnabled } from '../../services/modelCatalog';

export interface SafetensorsModel {
  id: string;
  name: string;
  category: 'LLM Text' | 'Diffusion Hero' | 'Vision TE' | 'Turbo NVFP4' | 'Inpainting' | 'Graph Engine' | 'Document AI';
  filename: string;
  sizeGb: number;
  format: 'NVFP4' | 'FP8' | 'bfloat16';
  shards: number;
  status: 'LOADED_VRAM' | 'CACHED_NVME';
  path: string;
  description: string;
  verifiedSha: string;
}

const DEFAULT_SPARK_MODELS: SafetensorsModel[] = [
  {
    id: 'qwen-35b-nvfp4',
    name: 'Qwen3.6-35B-A3B-abliterated-NVFP4-MTP',
    category: 'LLM Text',
    filename: 'model-00001-of-00001.safetensors',
    sizeGb: 22.0,
    format: 'NVFP4',
    shards: 1,
    status: 'LOADED_VRAM',
    path: 'spark/models/Qwen3.6-35B-A3B-abliterated-NVFP4-MTP',
    description: 'Ultra-low latency 35B dense reasoning engine with MTP heads in 128 GB unified LPDDR5x.',
    verifiedSha: 'sha256:e83f...c49a (Validated)',
  },
  {
    id: 'krea-2-raw-fp8',
    name: 'Krea-2-Raw-FP8 (Hero Diffusion)',
    category: 'Diffusion Hero',
    filename: 'diffusion_pytorch_model.safetensors',
    sizeGb: 11.8,
    format: 'FP8',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/Krea-2-Raw',
    description: 'Photorealistic latent diffusion model weights conditioned on Huihui-VL text encoder.',
    verifiedSha: 'sha256:7b12...a04f (Validated)',
  },
  {
    id: 'huihui-vl-te-fp8',
    name: 'Huihui-Qwen3-VL-4B-Instruct-FP8',
    category: 'Vision TE',
    filename: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
    sizeGb: 4.3,
    format: 'FP8',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/Huihui-Qwen3-VL',
    description: 'Uncensored multimodal vision-language text encoder for diffusion prompt reasoning.',
    verifiedSha: 'sha256:4d91...ee88 (Validated)',
  },
  {
    id: 'flux2-klein-9b',
    name: 'FLUX.2-Klein-9B-FP8',
    category: 'Diffusion Hero',
    filename: 'flux2_klein_9b_fp8.safetensors',
    sizeGb: 9.4,
    format: 'FP8',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/flux2-klein-9b',
    description: 'High-adherence 9B DiT diffusion transformer weights with deep spatial composition.',
    verifiedSha: 'sha256:1f23...33bc (Validated)',
  },
  {
    id: 'z-image-turbo-nvfp4',
    name: 'Z-Image-Turbo-NSFW-NVFP4',
    category: 'Turbo NVFP4',
    filename: 'z_image_turbo_nvfp4.safetensors',
    sizeGb: 6.8,
    format: 'NVFP4',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/z-image-turbo',
    description: '4-step ultra-fast low-latency generative diffusion weights with instant turnaround.',
    verifiedSha: 'sha256:c099...912e (Validated)',
  },
  {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen-Image-Edit-2511-FP8',
    category: 'Inpainting',
    filename: 'qwen_image_edit_2511_fp8.safetensors',
    sizeGb: 8.6,
    format: 'FP8',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/qwen-edit-2511',
    description: 'Dual-reference identity lock & masked inpainting weights for targeted editing.',
    verifiedSha: 'sha256:fa20...8811 (Validated)',
  },
  {
    id: 'ddb-edit',
    name: 'DDB_Edit (xing0916)',
    category: 'Inpainting',
    filename: 'model-00001-of-00004.safetensors',
    sizeGb: 16.2,
    format: 'bfloat16',
    shards: 4,
    status: 'CACHED_NVME',
    path: 'xing0916/DDB_Edit + Alpha-VLLM/Lumina-DiMOO',
    description: 'Discrete Diffusion Bridges instruction editor with Lumina-DiMOO VQ-VAE.',
    verifiedSha: 'HF shards · ECCV 2026',
  },
  {
    id: 'layoutlmv3-base',
    name: 'LayoutLMv3-Base (microsoft)',
    category: 'Document AI',
    filename: 'model.safetensors',
    sizeGb: 0.5,
    format: 'bfloat16',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'spark-image/models/layoutlmv3-base',
    description: 'Document layout + OCR zone encoder (HF microsoft/layoutlmv3-base) served on :7870.',
    verifiedSha: 'HF microsoft/layoutlmv3-base',
  },
];

type FilterTab = 'ALL' | 'ACTIVE' | 'DIFFUSION' | 'LLM';

function slugId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function matchMeta(idOrName: string): SafetensorsModel | undefined {
  const key = idOrName.toLowerCase();
  return DEFAULT_SPARK_MODELS.find(
    (m) =>
      m.id.toLowerCase() === key ||
      m.name.toLowerCase() === key ||
      key.includes(m.id.toLowerCase()) ||
      m.path.toLowerCase().includes(key) ||
      m.name.toLowerCase().includes(key)
  );
}

function liveStatusFor(
  id: string,
  servingModel: string | null,
  imageLoaded: string | null
): 'LOADED_VRAM' | 'CACHED_NVME' {
  const llm = (servingModel || '').toLowerCase();
  const img = (imageLoaded || '').toLowerCase();
  if (/qwen/i.test(id) && /qwen/i.test(llm)) return 'LOADED_VRAM';
  if (img && (id.toLowerCase() === img || img.includes(id.toLowerCase()) || id.toLowerCase().includes(img))) {
    return 'LOADED_VRAM';
  }
  if (/krea/i.test(id) && /krea/i.test(img)) return 'LOADED_VRAM';
  if (/ddb/i.test(id) && /ddb/i.test(img)) return 'LOADED_VRAM';
  return 'CACHED_NVME';
}

function modelsFromLive(
  disk: { name: string; bytes: number; shards: number }[],
  imageIds: string[],
  servingModel: string | null,
  imageLoaded: string | null
): SafetensorsModel[] {
  const rows: SafetensorsModel[] = [];
  const seen = new Set<string>();

  for (const m of disk) {
    const meta = matchMeta(m.name);
    const id = meta?.id || slugId(m.name);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      name: m.name,
      category: meta?.category || 'LLM Text',
      filename: meta?.filename || 'model.safetensors',
      sizeGb: Number(((m.bytes || 0) / 1e9).toFixed(1)),
      format: meta?.format || 'NVFP4',
      shards: m.shards || 1,
      status: liveStatusFor(id, servingModel, imageLoaded),
      path: meta?.path || `spark/models/${m.name}`,
      description: meta?.description || 'On-disk Spark weights from controller /api/status',
      verifiedSha: `${((m.bytes || 0) / 1e9).toFixed(2)} GB live`,
    });
  }

  for (const imageId of imageIds) {
    const meta = matchMeta(imageId);
    const id = meta?.id || imageId;
    if (seen.has(id) || seen.has(imageId)) continue;
    seen.add(id);
    rows.push({
      id,
      name: meta?.name || imageId,
      category: meta?.category || 'Diffusion Hero',
      filename: meta?.filename || `${imageId}.safetensors`,
      sizeGb: meta?.sizeGb || 0,
      format: meta?.format || 'FP8',
      shards: meta?.shards || 1,
      status: liveStatusFor(id, servingModel, imageLoaded),
      path: meta?.path || `spark-image/models/${imageId}`,
      description: meta?.description || 'Live image-bridge model id from controller',
      verifiedSha: 'live :7860 catalog',
    });
  }

  return rows;
}

export const ModelStorageSection: React.FC<{ desktop?: boolean }> = ({ desktop = false }) => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>('qwen-35b-nvfp4');
  const telemetry = useMeshStore((s) => s.telemetry);
  const telemetrySource = useMeshStore((s) => s.telemetrySource);
  const servingModel = useMeshStore((s) => s.servingModel);
  const imageLoadedModel = useMeshStore((s) => s.imageLoadedModel);
  const liveDiskModels = useMeshStore((s) => s.liveDiskModels);
  const liveImageModels = useMeshStore((s) => s.liveImageModels);
  const enabledMap = useModelEnablement((s) => s.enabled);
  const setEnabled = useModelEnablement((s) => s.setEnabled);
  const live = telemetrySource === 'live';

  const models = live
    ? modelsFromLive(liveDiskModels || [], liveImageModels || [], servingModel, imageLoadedModel)
    : [];

  const totalWeightsGb = models.reduce((acc, m) => acc + m.sizeGb, 0);
  const vramActiveGb = models.filter((m) => m.status === 'LOADED_VRAM').reduce((acc, m) => acc + m.sizeGb, 0);

  const filteredModels = models.filter((m) => {
    if (activeFilter === 'ACTIVE') return m.status === 'LOADED_VRAM';
    if (activeFilter === 'DIFFUSION') return m.category.includes('Diffusion') || m.category === 'Turbo NVFP4' || m.category === 'Inpainting';
    if (activeFilter === 'LLM') return m.category === 'LLM Text' || m.category === 'Vision TE' || m.category === 'Document AI';
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <View style={styles.container}>
      {/* Section Header with Hardware Specs */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Server size={18} color={live ? Colors.brand.green : Colors.text.tertiary} />
          <View>
            <Text style={styles.headerTitle}>SPARK MODEL STORAGE</Text>
            <Text style={styles.headerSubtitle}>
              {live
                ? `Live controller inventory · ${models.length} models`
                : 'Waiting for live controller :17325'}
            </Text>
          </View>
        </View>
        <View style={[styles.nvmePill, !live && styles.nvmePillDown]}>
          <Text style={[styles.nvmePillText, !live && styles.nvmePillTextDown]}>
            {live ? 'LIVE' : 'DOWN'}
          </Text>
        </View>
      </View>

      <View style={styles.storageCard}>
        <View style={styles.storageBarTrack}>
          <View
            style={[
              styles.barSegment,
              {
                width: totalWeightsGb > 0 ? `${Math.min(100, Math.round((vramActiveGb / Math.max(totalWeightsGb, 0.1)) * 100))}%` : '0%',
                backgroundColor: Colors.brand.green,
              },
            ]}
          />
          <View
            style={[
              styles.barSegment,
              { flex: 1, backgroundColor: '#27272A' },
            ]}
          />
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>LIVE WEIGHTS</Text>
            <Text style={styles.statValue}>{live ? totalWeightsGb.toFixed(1) : '—'} GB</Text>
            <Text style={styles.statSub}>{live ? `${models.length} from controller` : 'No inventory'}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>IN MEMORY</Text>
            <Text style={[styles.statValue, { color: Colors.brand.green }]}>
              {live ? vramActiveGb.toFixed(1) : '—'} GB
            </Text>
            <Text style={styles.statSub}>
              {live
                ? `${models.filter((m) => m.status === 'LOADED_VRAM').length} loaded`
                : '—'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>UNIFIED MEM</Text>
            <Text style={[styles.statValue, { color: Colors.brand.emerald }]}>
              {live ? telemetry.vramUsedGb.toFixed(1) : '—'} GB
            </Text>
            <Text style={styles.statSub}>
              {live && telemetry.unifiedSpecGb
                ? `${telemetry.unifiedSpecGb} GB LPDDR5x spec`
                : 'Live /proc/meminfo'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>CUDA VISIBLE</Text>
            <Text style={[styles.statValue, { color: '#E4E4E7' }]}>
              {live && telemetry.vramTotalGb ? telemetry.vramTotalGb.toFixed(1) : '—'} GB
            </Text>
            <Text style={styles.statSub}>{live ? 'MemTotal' : '—'}</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterRow, desktop && styles.filterRowWrap]}>
        {(['ALL', 'ACTIVE', 'DIFFUSION', 'LLM'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterChip, activeFilter === tab && styles.filterChipActive]}
            onPress={() => setActiveFilter(tab)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === tab && styles.filterChipTextActive,
              ]}
            >
              {tab === 'ALL' && 'All Models (' + models.length + ')'}
              {tab === 'ACTIVE' && 'In VRAM (' + models.filter((m) => m.status === 'LOADED_VRAM').length + ')'}
              {tab === 'DIFFUSION' &&
                'Diffusion (' +
                  models.filter(
                    (m) =>
                      m.category.includes('Diffusion') ||
                      m.category === 'Turbo NVFP4' ||
                      m.category === 'Inpainting'
                  ).length +
                  ')'}
              {tab === 'LLM' &&
                'LLM & TE (' +
                  models.filter(
                    (m) =>
                      m.category === 'LLM Text' ||
                      m.category === 'Vision TE' ||
                      m.category === 'Document AI'
                  ).length +
                  ')'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Safetensors Models Inventory Cards */}
      <View style={[styles.modelList, desktop && styles.modelListDesk]}>
        {!live || filteredModels.length === 0 ? (
          <Text style={styles.headerSubtitle}>
            {live ? 'Controller returned no on-disk or image models.' : 'Probe Spark controller to load the live inventory.'}
          </Text>
        ) : null}
        {filteredModels.map((model) => {
          const isExpanded = expandedId === model.id;
          const isLoaded = model.status === 'LOADED_VRAM';
          const on = isModelEnabled(enabledMap, model.id);

          return (
            <View
              key={model.id}
              style={[
                styles.modelCard,
                desktop && styles.modelCardDesk,
                isLoaded && styles.modelCardLoaded,
                !on && styles.modelCardOff,
              ]}
            >
              {/* Card Header Top Row */}
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleExpand(model.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeaderLeft}>
                  {isLoaded ? (
                    <Cpu size={18} color={Colors.brand.green} />
                  ) : (
                    <Layers size={18} color={Colors.text.tertiary} />
                  )}
                  <View style={styles.titleWrap}>
                    <View style={styles.badgeRow}>
                      <Text style={styles.categoryBadge}>{model.category.toUpperCase()}</Text>
                      <View
                        style={[
                          styles.formatPill,
                          model.format === 'NVFP4' ? styles.formatNvfp4 : styles.formatFp8,
                        ]}
                      >
                        <Text style={styles.formatPillText}>{model.format}</Text>
                      </View>
                    </View>
                    <Text style={styles.modelName} numberOfLines={1}>
                      {model.name}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardHeaderRight}>
                  <View style={styles.sizeWrap}>
                    <Text style={styles.modelSize}>{model.sizeGb.toFixed(1)} GB</Text>
                    <Text style={styles.modelShards}>{model.shards} Shard</Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={16} color={Colors.text.tertiary} />
                  ) : (
                    <ChevronDown size={16} color={Colors.text.tertiary} />
                  )}
                </View>
              </TouchableOpacity>

              {/* Status Bar */} 
              <View style={styles.statusBar}>
                <View style={styles.statusIndicatorRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: !on
                          ? Colors.brand.rose
                          : isLoaded
                          ? Colors.brand.green
                          : Colors.text.tertiary,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusLabel,
                      {
                        color: !on
                          ? Colors.brand.rose
                          : isLoaded
                          ? Colors.brand.green
                          : Colors.text.tertiary,
                      },
                    ]}
                  >
                    {!on ? 'DISABLED' : isLoaded ? 'ACTIVE IN UNIFIED VRAM' : 'WARM NVMe CACHE'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.enablePill,
                    on ? (isLoaded ? styles.enablePillReady : styles.enablePillOn) : styles.enablePillOff,
                  ]}
                  onPress={() => {
                    try {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    void setEnabled(model.id, !on);
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel={(on ? 'Disable ' : 'Enable ') + model.name}
                >
                  <Text
                    style={[
                      styles.enablePillText,
                      on
                        ? isLoaded
                          ? styles.enablePillTextReady
                          : styles.enablePillTextOn
                        : styles.enablePillTextOff,
                    ]}
                  >
                    {on ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Expanded Inspection Panel */}
              {isExpanded && (
                <View style={styles.expandedPanel}>
                  <Text style={styles.modelDescription}>{model.description}</Text>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>NVMe Location:</Text>
                    <Text style={styles.detailValue}>~/{model.path}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Safetensors Integrity:</Text>
                    <View style={styles.integrityRow}>
                      <CheckCircle2 size={13} color={Colors.brand.emerald} />
                      <Text style={[styles.detailValue, { color: Colors.brand.emerald }]}>
                        {model.verifiedSha}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Architecture:</Text>
                    <Text style={styles.detailValue}>
                      {model.format} Tensor Cores • Zero Memory Fragmentation
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  nvmePill: {
    backgroundColor: Colors.brand.greenDim,
    borderWidth: 1,
    borderColor: Colors.brand.greenGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nvmePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.brand.green,
  },
  nvmePillDown: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  nvmePillTextDown: {
    color: Colors.brand.rose,
  },
  storageCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  storageBarTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#18181B',
  },
  barSegment: {
    height: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.text.tertiary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statSub: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterRowWrap: {
    flexWrap: 'wrap',
  },
  filterChip: {
    backgroundColor: Colors.background.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  modelList: {
    gap: 10,
  },
  modelListDesk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modelCardDesk: {
    width: '48.8%',
    flexGrow: 1,
  },
  modelCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modelCardLoaded: {
    borderColor: Colors.brand.greenGlow,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  modelCardOff: {
    opacity: 0.55,
    borderColor: 'rgba(244, 63, 94, 0.35)',
  },
  enablePill: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  enablePillOn: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  enablePillReady: {
    backgroundColor: Colors.brand.greenDim,
    borderColor: Colors.brand.greenGlow,
  },
  enablePillOff: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  enablePillText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '800',
  },
  enablePillTextOn: { color: Colors.brand.emerald },
  enablePillTextReady: { color: Colors.brand.green },
  enablePillTextOff: { color: Colors.brand.rose },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  titleWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  categoryBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: 0.5,
  },
  formatPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  formatNvfp4: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  formatFp8: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  formatPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#E4E4E7',
  },
  modelName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sizeWrap: {
    alignItems: 'flex-end',
  },
  modelSize: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modelShards: {
    fontSize: 10,
    color: Colors.text.tertiary,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.background.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  filenameTag: {
    fontSize: 10.5,
    color: Colors.text.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  expandedPanel: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    backgroundColor: 'rgba(24, 24, 27, 0.4)',
    gap: 8,
  },
  modelDescription: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
  detailValue: {
    fontSize: 11,
    color: Colors.text.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  integrityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
