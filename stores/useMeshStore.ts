import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Endpoint, HardwareTelemetry, Microservice } from '../types';
import { resolveApiUrl, buildApiHeaders } from '../services/apiConfig';

export type MeshMode = 'spark' | 'cloud';

const MESH_KEYS_STORAGE = '@abliterated_mesh_api_keys_v1';
const MESH_MODE_STORAGE = '@abliterated_mesh_mode_v1';

interface MeshState {
  meshMode: MeshMode;
  activeHost: string;
  activePort: number;
  candidates: Endpoint[];
  isProbing: boolean;
  lastProbeTime: number | null;
  telemetry: HardwareTelemetry;
  microservices: Microservice[];
  simulationMode: boolean;
  featherlessApiKey: string;
  abliteratedApiKey: string;

  // Actions
  probeAll: () => Promise<void>;
  setMeshMode: (mode: MeshMode) => Promise<void>;
  toggleMeshMode: () => Promise<void>;
  loadMeshMode: () => Promise<void>;
  setActiveHost: (host: string, port?: number) => void;
  setApiKey: (provider: 'abliterated' | 'featherless', key: string) => Promise<void>;
  loadApiKeys: () => Promise<void>;
  toggleSimulationMode: (enabled?: boolean) => void;
  updateTelemetry: (partial: Partial<HardwareTelemetry>) => void;
  getActiveEndpoint: () => Endpoint | undefined;
}

const DEFAULT_ENDPOINTS: Endpoint[] = [
  {
    id: 'lan_primary',
    name: 'Direct LAN (Spark GB10)',
    host: '192.168.4.103',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'direct_lan',
    baseUrl: 'http://192.168.4.103:8000',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'tailscale_mesh',
    name: 'Tailscale Mesh',
    host: '100.94.45.77',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'tailscale',
    baseUrl: 'http://100.94.45.77:8000',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'lan_secondary',
    name: 'Secondary LAN',
    host: '192.168.4.101',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'secondary_lan',
    baseUrl: 'http://192.168.4.101:8000',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'featherless_mesh',
    name: 'Featherless AI Mesh',
    host: 'api.featherless.ai',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    baseUrl: 'https://api.featherless.ai',
    provider: 'featherless',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  },
  {
    id: 'abliterated_ai_cloud',
    name: 'Abliterated Cloud AI',
    host: 'api.abliterated.ai',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    baseUrl: 'https://api.abliterated.ai',
    provider: 'abliterated',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'abliterated_cloud',
    name: 'Abliterated Cloud IO (Mirror)',
    host: 'api.abliterated.io',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    baseUrl: 'https://api.abliterated.io',
    provider: 'abliterated',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'localhost',
    name: 'Localhost Tunnel',
    host: '127.0.0.1',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'localhost',
    baseUrl: 'http://127.0.0.1:8000',
    defaultModel: 'qwen-abliterated',
  },
];

const GB10_UNIFIED_SPEC_GB = 128;
const GB10_CUDA_VISIBLE_GIB = 121.7;
const GB10_SOC_TDP_W = 140;
const GB10_CLOCK_MHZ = 2418;

const INITIAL_TELEMETRY: HardwareTelemetry = {
  gpuModel: 'NVIDIA GB10 · 128 GB unified LPDDR5x',
  gpuTemp: 44,
  gpuTempMax: 85,
  vramUsedGb: 0,
  vramTotalGb: GB10_CUDA_VISIBLE_GIB,
  unifiedSpecGb: GB10_UNIFIED_SPEC_GB,
  memoryKind: 'unified-lpddr5x',
  powerDrawWatts: 11,
  powerLimitWatts: GB10_SOC_TDP_W,
  gpuClockMhz: GB10_CLOCK_MHZ,
  memoryClockMhz: 8533,
  tensorCoresActive: 48,
  busUsagePercent: 0,
  uptimeSeconds: 0,
};

const INITIAL_MICROSERVICES: Microservice[] = [
  {
    id: 'vllm_text',
    name: 'Text vLLM',
    port: 8000,
    status: 'OFFLINE',
    model: 'qwen-abliterated (FP8)',
    description: 'Ultra-low latency FP8 streaming inference server on DGX Spark',
  },
  {
    id: 'krea_image',
    name: 'Krea 2 Image Bridge',
    port: 7860,
    status: 'OFFLINE',
    model: 'krea2-raw-fp8',
    description: 'High-fidelity latent diffusion & inpainting engine on DGX Spark',
  },
  {
    id: 'comfyui',
    name: 'ComfyUI Cluster',
    port: 8188,
    status: 'OFFLINE',
    model: 'Workflow Graph Engine',
    description: 'Multi-node generative pipeline and ControlNet adapter',
  },
  {
    id: 'spark_ctrl',
    name: 'Telemetry Controller',
    port: 17325,
    status: 'OFFLINE',
    model: 'DGX Supervisor Daemon',
    description: 'Blackwell thermals, NVLink fabric & power manager',
  },
];

async function checkUrl(url: string, headers?: Record<string, string>, timeoutMs = 2500): Promise<{ ok: boolean; status: number; ms: number }> {
  const t0 = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const isHostUp = res.status > 0 && res.status < 500;
    return { ok: isHostUp, status: res.status, ms: Math.max(1, Math.round(performance.now() - t0)) };
  } catch {
    return { ok: false, status: 0, ms: -1 };
  }
}

async function fetchRealVllmMetrics(host: string, port = 8000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const url = resolveApiUrl(host, port, '/metrics');
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();

    const getMetric = (prefix: string) => {
      const match = text.match(new RegExp(`^${prefix}\\S*\\s+([0-9.]+)`, 'm'));
      return match ? parseFloat(match[1]) : null;
    };

    return {
      gpuCacheUsage:
        getMetric('vllm:kv_cache_usage_perc') ??
        getMetric('vllm:gpu_cache_usage_factor') ??
        0,
      requestsRunning: getMetric('vllm:num_requests_running') ?? 0,
      requestsWaiting: getMetric('vllm:num_requests_waiting') ?? 0,
      processStartTime: getMetric('process_start_time_seconds') ?? null,
      residentMemoryBytes: getMetric('process_resident_memory_bytes') ?? 0,
      virtualMemoryBytes: getMetric('process_virtual_memory_bytes') ?? 0,
    };
  } catch {
    return null;
  }
}

function telemetryFromControllerGpu(
  gpu: Record<string, any>,
  prev: HardwareTelemetry
): HardwareTelemetry {
  const name = String(gpu.name || 'NVIDIA GB10');
  const isUnified =
    gpu.memoryKind === 'unified-lpddr5x' ||
    /GB10|DGX Spark/i.test(name) ||
    !gpu.vramTotalMb;

  const specGb = Number(gpu.unifiedSpecGb) || (isUnified ? GB10_UNIFIED_SPEC_GB : undefined);
  let totalGb = Number(gpu.unifiedTotalGb);
  if (!totalGb) {
    const smiTotalMb = Number(gpu.vramTotalMb) || 0;
    totalGb = smiTotalMb > 0 ? smiTotalMb / 1024 : isUnified ? GB10_CUDA_VISIBLE_GIB : prev.vramTotalGb;
  }
  let usedGb =
    gpu.unifiedUsedGb != null && gpu.unifiedUsedGb !== ''
      ? Number(gpu.unifiedUsedGb)
      : (Number(gpu.vramUsedMb) || 0) / 1024;
  if (!Number.isFinite(usedGb) || usedGb < 0) usedGb = 0;

  let powerLimit = Number(gpu.powerLimitW) || 0;
  if (!powerLimit && isUnified) powerLimit = GB10_SOC_TDP_W;

  return {
    ...prev,
    gpuModel: isUnified ? name.replace(/\s+$/, '') + ' · 128 GB unified LPDDR5x' : name,
    gpuTemp: Math.round(Number(gpu.tempC) || 0),
    vramUsedGb: Number(usedGb.toFixed(1)),
    vramTotalGb: Number(totalGb.toFixed(1)),
    unifiedSpecGb: specGb,
    memoryKind: isUnified ? 'unified-lpddr5x' : 'discrete-vram',
    powerDrawWatts: Math.round(Number(gpu.powerDrawW) || 0),
    powerLimitWatts: Math.round(powerLimit),
    busUsagePercent: Math.round(Number(gpu.gpuUtilPct) || 0),
    gpuClockMhz: isUnified ? GB10_CLOCK_MHZ : prev.gpuClockMhz,
    memoryClockMhz: isUnified ? 8533 : prev.memoryClockMhz,
    tensorCoresActive: isUnified ? 48 : prev.tensorCoresActive,
  };
}

async function fetchRealControllerGpu(host: string) {
  const urls = [
    `http://127.0.0.1:17325/api/status`,
    `http://${host}:17325/api/status`,
  ];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        if (json?.gpu && !json.gpu.error) {
          return json.gpu;
        }
      }
    } catch {}
  }
  return null;
}

const isPublicWeb =
  typeof window !== 'undefined' &&
  Boolean(window.location?.hostname) &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1' &&
  !window.location.hostname.startsWith('192.168.');

const initialMode: MeshMode = isPublicWeb ? 'cloud' : 'spark';
const initialHost = initialMode === 'spark' ? '192.168.4.103' : 'api.featherless.ai';
const initialPort = initialMode === 'spark' ? 8000 : 443;

export const useMeshStore = create<MeshState>((set, get) => ({
  meshMode: initialMode,
  activeHost: initialHost,
  activePort: initialPort,
  candidates: DEFAULT_ENDPOINTS,
  isProbing: false,
  lastProbeTime: null,
  telemetry: INITIAL_TELEMETRY,
  microservices: INITIAL_MICROSERVICES,
  simulationMode: false,
  featherlessApiKey: '',
  abliteratedApiKey: '',

  getActiveEndpoint: () => {
    const { candidates, activeHost } = get();
    return candidates.find((c) => c.host === activeHost) || candidates[0];
  },

  setMeshMode: async (mode: MeshMode) => {
    const isSpark = mode === 'spark';
    const nextHost = isSpark ? '192.168.4.103' : 'api.featherless.ai';
    const nextPort = isSpark ? 8000 : 443;
    set({
      meshMode: mode,
      activeHost: nextHost,
      activePort: nextPort,
    });
    try {
      await AsyncStorage.setItem(MESH_MODE_STORAGE, mode);
    } catch (e) {
      console.warn('[useMeshStore] Failed to save mesh mode:', e);
    }
    // Re-probe immediately
    get().probeAll();
  },

  toggleMeshMode: async () => {
    const current = get().meshMode;
    await get().setMeshMode(current === 'spark' ? 'cloud' : 'spark');
  },

  loadMeshMode: async () => {
    try {
      const saved = await AsyncStorage.getItem(MESH_MODE_STORAGE);
      if (saved === 'spark' || saved === 'cloud') {
        const isSpark = saved === 'spark';
        const nextHost = isSpark ? '192.168.4.103' : 'api.featherless.ai';
        const nextPort = isSpark ? 8000 : 443;
        set({
          meshMode: saved,
          activeHost: nextHost,
          activePort: nextPort,
        });
      }
    } catch (e) {
      console.warn('[useMeshStore] Failed to load saved mesh mode:', e);
    }
  },

  loadApiKeys: async () => {
    try {
      const raw = await AsyncStorage.getItem(MESH_KEYS_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          featherlessApiKey: parsed.featherlessApiKey || '',
          abliteratedApiKey: parsed.abliteratedApiKey || '',
        });
      }
    } catch (e) {
      console.warn('[useMeshStore] Failed to load saved API keys:', e);
    }
  },

  setApiKey: async (provider: 'abliterated' | 'featherless', key: string) => {
    const trimmed = key.trim();
    if (provider === 'featherless') {
      set({ featherlessApiKey: trimmed });
    } else {
      set({ abliteratedApiKey: trimmed });
    }

    try {
      const current = {
        featherlessApiKey: provider === 'featherless' ? trimmed : get().featherlessApiKey,
        abliteratedApiKey: provider === 'abliterated' ? trimmed : get().abliteratedApiKey,
      };
      await AsyncStorage.setItem(MESH_KEYS_STORAGE, JSON.stringify(current));
    } catch (e) {
      console.warn('[useMeshStore] Failed to save API keys:', e);
    }
  },

  probeAll: async () => {
    set({ isProbing: true });

    const { candidates, featherlessApiKey, abliteratedApiKey, meshMode } = get();

    // 1. Probe all network routes concurrently for real roundtrip ping
    const updatedCandidates = await Promise.all(
      candidates.map(async (ep) => {
        const apiKey = ep.provider === 'featherless' ? featherlessApiKey : abliteratedApiKey;
        const headers = buildApiHeaders(apiKey);
        const probeUrl = resolveApiUrl(ep.host, ep.port, '/v1/models');
        const probe = await checkUrl(probeUrl, headers, 2500);

        return {
          ...ep,
          latencyMs: probe.ok ? probe.ms : -1,
          isOnline: probe.ok,
          apiKey,
        };
      })
    );

    // Auto-lock fastest online endpoint strictly within current meshMode
    const isSparkMode = meshMode === 'spark';
    const candidatePool = isSparkMode
      ? updatedCandidates.filter((e) => e.type !== 'public_cloud')
      : updatedCandidates.filter((e) => e.type === 'public_cloud');

    const currentOnline = candidatePool.find((e) => e.host === get().activeHost && e.isOnline);
    let nextHost = get().activeHost;
    let nextPort = get().activePort;

    if (!currentOnline) {
      const best = candidatePool
        .filter((e) => e.isOnline && e.latencyMs > 0)
        .sort((a, b) => a.latencyMs - b.latencyMs)[0];
      if (best) {
        nextHost = best.host;
        nextPort = best.port;
      } else {
        nextHost = isSparkMode ? '192.168.4.103' : 'api.featherless.ai';
        nextPort = isSparkMode ? 8000 : 443;
      }
    }

    // 2. Real Microservice Cluster Health Checks
    let updatedMicroservices: Microservice[];

    if (isSparkMode) {
      const [vllmCheck, imgCheck, comfyCheckRemote, comfyCheckLocal, ctrlCheckLocal, ctrlCheckRemote] =
        await Promise.all([
          checkUrl(resolveApiUrl(nextHost, 8000, '/v1/models'), undefined, 1500),
          checkUrl(resolveApiUrl(nextHost, 7860, '/health'), undefined, 1500),
          checkUrl(resolveApiUrl(nextHost, 8188, '/system_stats'), undefined, 1500),
          checkUrl('http://127.0.0.1:8188/system_stats', undefined, 800),
          checkUrl('http://127.0.0.1:17325/api/endpoints', undefined, 800),
          checkUrl(resolveApiUrl(nextHost, 17325, '/api/endpoints'), undefined, 1500),
        ]);

      updatedMicroservices = [
        {
          id: 'vllm_text',
          name: 'Text vLLM',
          port: 8000,
          status: vllmCheck.ok ? 'ONLINE' : 'OFFLINE',
          model: 'qwen-abliterated (FP8)',
          description: `Streaming vLLM inference server • ${vllmCheck.ok ? vllmCheck.ms + 'ms' : 'offline'}`,
        },
        {
          id: 'krea_image',
          name: 'Krea 2 Image Bridge',
          port: 7860,
          status: imgCheck.ok ? 'ONLINE' : 'STANDBY',
          model: 'krea2-raw-fp8',
          description: `Latent diffusion & inpainting bridge • ${imgCheck.ok ? imgCheck.ms + 'ms' : 'standby'}`,
        },
        {
          id: 'comfyui',
          name: 'ComfyUI Cluster',
          port: 8188,
          status: comfyCheckRemote.ok || comfyCheckLocal.ok ? 'ONLINE' : 'STANDBY',
          model: 'Workflow Graph Engine',
          description: comfyCheckRemote.ok
            ? `NVIDIA GPU Graph Engine active (${comfyCheckRemote.ms}ms)`
            : comfyCheckLocal.ok
            ? `Local Apple MPS Graph Engine active (${comfyCheckLocal.ms}ms)`
            : 'ComfyUI daemon idle / standby',
        },
        {
          id: 'spark_ctrl',
          name: 'Telemetry Controller',
          port: 17325,
          status: ctrlCheckLocal.ok || ctrlCheckRemote.ok ? 'ONLINE' : 'STANDBY',
          model: 'DGX Supervisor Daemon',
          description: ctrlCheckLocal.ok || ctrlCheckRemote.ok
            ? 'Live hardware telemetric daemon connected'
            : 'Supervisor daemon idle on port :17325',
        },
      ];

      // 3. Query Real Hardware & vLLM Prometheus Metrics
      const [controllerGpu, vllmMetrics] = await Promise.all([
        fetchRealControllerGpu(nextHost),
        fetchRealVllmMetrics(nextHost, nextPort),
      ]);

      let realTelemetry = { ...get().telemetry };

      if (controllerGpu) {
        realTelemetry = telemetryFromControllerGpu(controllerGpu, realTelemetry);
      } else if (vllmMetrics) {
        const nowSec = Date.now() / 1000;
        const uptimeSec = vllmMetrics.processStartTime
          ? Math.round(nowSec - vllmMetrics.processStartTime)
          : 0;
        realTelemetry = {
          ...realTelemetry,
          gpuModel: 'NVIDIA GB10 · 128 GB unified LPDDR5x',
          gpuTemp: vllmMetrics.requestsRunning > 0 ? 54 : realTelemetry.gpuTemp,
          vramTotalGb: GB10_CUDA_VISIBLE_GIB,
          unifiedSpecGb: GB10_UNIFIED_SPEC_GB,
          memoryKind: 'unified-lpddr5x',
          powerLimitWatts: GB10_SOC_TDP_W,
          busUsagePercent: Math.min(100, Math.round((vllmMetrics.gpuCacheUsage || 0) * 100)),
          uptimeSeconds: uptimeSec,
          gpuClockMhz: GB10_CLOCK_MHZ,
          tensorCoresActive: 48,
        };
      }

      set({ telemetry: realTelemetry });
    } else {
      // Cloud endpoints active
      const abliteratedOnline = updatedCandidates.some((c) => c.provider === 'abliterated' && c.isOnline);
      const featherlessOnline = updatedCandidates.some((c) => c.provider === 'featherless' && c.isOnline);

      updatedMicroservices = [
        {
          id: 'vllm_text',
          name: 'Abliterated Sovereign LLM',
          port: 443,
          status: abliteratedOnline ? 'ONLINE' : 'STANDBY',
          model: 'qwen-abliterated (FP8 / NVFP4)',
          description: `Sovereign inference cluster at ${nextHost}`,
        },
        {
          id: 'featherless_mesh',
          name: 'Featherless AI Router',
          port: 443,
          status: featherlessOnline ? 'ONLINE' : 'STANDBY',
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          description: 'Global open-weight inference mesh at https://api.featherless.ai',
        },
        {
          id: 'krea_image',
          name: 'Abliterated Krea Diffusion',
          port: 443,
          status: abliteratedOnline ? 'ONLINE' : 'STANDBY',
          model: 'krea2-raw-fp8',
          description: 'High-fidelity generative latent diffusion engine',
        },
        {
          id: 'swarm_agent',
          name: 'Multi-Agent Swarm Orchestrator',
          port: 443,
          status: 'ONLINE',
          model: 'Matrix Swarm Orchestrator v2',
          description: 'Autonomous multi-worker decomposition and test synthesizer',
        },
      ];
    }

    set({
      candidates: updatedCandidates,
      activeHost: nextHost,
      activePort: nextPort,
      microservices: updatedMicroservices,
      isProbing: false,
      lastProbeTime: Date.now(),
    });
  },

  setActiveHost: (host: string, port = 8000) => {
    const isCloud =
      host.includes('featherless') ||
      host.includes('abliterated.ai') ||
      host.includes('abliterated.io');
    const inferredMode: MeshMode = isCloud ? 'cloud' : 'spark';
    set({ activeHost: host, activePort: port, meshMode: inferredMode });
    AsyncStorage.setItem(MESH_MODE_STORAGE, inferredMode).catch(() => {});
  },

  toggleSimulationMode: (enabled) => {
    set((state) => ({
      simulationMode: enabled !== undefined ? enabled : !state.simulationMode,
    }));
  },

  updateTelemetry: (partial) => {
    set((state) => ({
      telemetry: { ...state.telemetry, ...partial },
    }));
  },
}));
