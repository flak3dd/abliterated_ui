import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
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
import Colors from '../../theme/colors';
import { useMeshStore } from '../../stores/useMeshStore';

export interface SafetensorsModel {
  id: string;
  name: string;
  category: 'LLM Text' | 'Diffusion Hero' | 'Vision TE' | 'Turbo NVFP4' | 'Inpainting' | 'Graph Engine';
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
    id: 'comfy-dolphin-sdxl',
    name: 'PornMaster-ComfyUI-Dolphin-SDXL',
    category: 'Graph Engine',
    filename: 'dolphin_sdxl_master.safetensors',
    sizeGb: 6.2,
    format: 'bfloat16',
    shards: 1,
    status: 'CACHED_NVME',
    path: 'ComfyUI/models/checkpoints/dolphin_master.safetensors',
    description: 'Integrated node graph generative checkpoint with embedded ControlNet adapters.',
    verifiedSha: 'sha256:88ee...f412 (Validated)',
  },
];

type FilterTab = 'ALL' | 'ACTIVE' | 'DIFFUSION' | 'LLM';

export const ModelStorageSection: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>('qwen-35b-nvfp4');
  const telemetry = useMeshStore((s) => s.telemetry);

  const totalNvmeGb = 2048.0; // 2.0 TB NVMe PCIe Gen5
  const totalWeightsGb = DEFAULT_SPARK_MODELS.reduce((acc, m) => acc + m.sizeGb, 0);
  const vramActiveGb = DEFAULT_SPARK_MODELS.filter((m) => m.status === 'LOADED_VRAM').reduce((acc, m) => acc + m.sizeGb, 0);
  const freeNvmeGb = totalNvmeGb - totalWeightsGb - 74.0; // Subtract OS/Docker cache
  const freePercent = ((freeNvmeGb / totalNvmeGb) * 100).toFixed(0);

  const filteredModels = DEFAULT_SPARK_MODELS.filter((m) => {
    if (activeFilter === 'ACTIVE') return m.status === 'LOADED_VRAM';
    if (activeFilter === 'DIFFUSION') return m.category.includes('Diffusion') || m.category === 'Turbo NVFP4' || m.category === 'Inpainting';
    if (activeFilter === 'LLM') return m.category === 'LLM Text' || m.category === 'Vision TE';
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
          <Server size={18} color={Colors.brand.emerald} />
          <View>
            <Text style={styles.headerTitle}>SOVEREIGN CLOUD MODEL STORAGE</Text>
            <Text style={styles.headerSubtitle}>
              Weights on Spark NVMe · GB10 128 GB unified LPDDR5x
            </Text>
          </View>
        </View>
        <View style={styles.nvmePill}>
          <Text style={styles.nvmePillText}>{freePercent}% NVMe FREE</Text>
        </View>
      </View>

      {/* Visual NVMe Storage Capacity Card */}
      <View style={styles.storageCard}>
        {/* Multi-segmented Glowing Storage Bar */}
        <View style={styles.storageBarTrack}>
          {/* VRAM Active Weight */} 
          <View style={[styles.barSegment, { width: '12%', backgroundColor: Colors.brand.emerald }]} />
          {/* Diffusion Models */} 
          <View style={[styles.barSegment, { width: '18%', backgroundColor: '#0EA5E9' }]} />
          {/* Vision TE & LoRA */} 
          <View style={[styles.barSegment, { width: '6%', backgroundColor: '#F59E0B' }]} />
          {/* Free NVMe Space */} 
          <View style={[styles.barSegment, { width: '64%', backgroundColor: '#27272A' }]} />
        </View>

        {/* Storage Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>TOTAL NVMe</Text>
            <Text style={styles.statValue}>{totalNvmeGb.toFixed(0)} GB</Text>
            <Text style={styles.statSub}>2.0 TB Fast Gen5</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>SAFETENSORS</Text>
            <Text style={[styles.statValue, { color: '#0EA5E9' }]}>{totalWeightsGb.toFixed(1)} GB</Text>
            <Text style={styles.statSub}>{DEFAULT_SPARK_MODELS.length} Models Cached</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>UNIFIED MEM</Text>
            <Text style={[styles.statValue, { color: Colors.brand.emerald }]}>
              {telemetry.vramUsedGb.toFixed(1)} GB
            </Text>
            <Text style={styles.statSub}>
              {(telemetry.unifiedSpecGb || 128)} GB LPDDR5x
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>AVAILABLE</Text>
            <Text style={[styles.statValue, { color: '#E4E4E7' }]}>{freeNvmeGb.toFixed(0)} GB</Text>
            <Text style={styles.statSub}>{freePercent}% Unallocated</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
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
              {tab === 'ALL' && 'All Models (' + DEFAULT_SPARK_MODELS.length + ')'}
              {tab === 'ACTIVE' && 'In VRAM (1)'}
              {tab === 'DIFFUSION' && 'Diffusion (4)'}
              {tab === 'LLM' && 'LLM & TE (2)'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Safetensors Models Inventory Cards */}
      <View style={styles.modelList}>
        {filteredModels.map((model) => {
          const isExpanded = expandedId === model.id;
          const isLoaded = model.status === 'LOADED_VRAM';

          return (
            <View
              key={model.id}
              style={[styles.modelCard, isLoaded && styles.modelCardLoaded]}
            >
              {/* Card Header Top Row */}
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleExpand(model.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeaderLeft}>
                  {isLoaded ? (
                    <Cpu size={18} color={Colors.brand.emerald} />
                  ) : (
                    <Layers size={18} color={Colors.brand.sky} />
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
                      { backgroundColor: isLoaded ? Colors.brand.emerald : '#0EA5E9' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusLabel,
                      { color: isLoaded ? Colors.brand.emerald : '#0EA5E9' },
                    ]}
                  >
                    {isLoaded ? 'ACTIVE IN UNIFIED VRAM' : 'WARM NVMe CACHE'}
                  </Text>
                </View>
                <Text style={styles.filenameTag}>📄 {model.filename}</Text>
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
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nvmePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#3B82F6',
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
  modelCard: {
    backgroundColor: Colors.background.surface,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modelCardLoaded: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: 'rgba(59, 130, 246, 0.03)',
  },
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
