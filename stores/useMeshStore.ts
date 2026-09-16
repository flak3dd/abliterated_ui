import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Endpoint, HardwareTelemetry, Microservice } from '../types';
import { resolveApiUrl } from '../services/apiConfig';
import { compactCatalog, resolveChatModel, routeFromHost } from '../services/modelResolve';
import {
  MeshMode,
  PersistedChatHosts,
  isCloudHost,
  isImageEndpoint,
  isStatusOnlyEndpoint,
  matchEndpoint,
  persistChatHosts,
  probeHeadersFor,
  restoreChatForMode,
} from '../services/meshRouting';
import { useModelSession } from './useModelSession';

export type { MeshMode };
export type TelemetrySource = 'live' | 'stale' | 'emulated' | 'unavailable';

const MESH_KEYS_STORAGE = '@abliterated_mesh_api_keys_v1';
const MESH_MODE_STORAGE = '@abliterated_mesh_mode_v1';
const IMAGE_HOST_STORAGE = '@abliterated_image_host_v1';
const CHAT_HOST_STORAGE = '@abliterated_chat_host_v1';

interface MeshState {
  meshMode: MeshMode;
  activeHost: string;
  activePort: number;
  activeImageHost: string;
  activeImagePort: number;
  lastChatHosts: PersistedChatHosts;
  candidates: Endpoint[];
  isProbing: boolean;
  lastProbeTime: number | null;
  telemetry: HardwareTelemetry;
  telemetrySource: TelemetrySource;
  microservices: Microservice[];
  simulationMode: boolean;
  featherlessApiKey: string;
  abliteratedApiKey: string;
  huggingfaceApiKey: string;
  liveDiskModels: { name: string; bytes: number; shards: number }[];
  liveImageModels: string[];

  probeAll: () => Promise<void>;
  setMeshMode: (mode: MeshMode) => Promise<void>;
  toggleMeshMode: () => Promise<void>;
  loadMeshMode: () => Promise<void>;
  setActiveHost: (host: string, port?: number) => void;
  selectEndpoint: (ep: Endpoint) => void;
  setApiKey: (provider: 'abliterated' | 'featherless' | 'huggingface', key: string) => Promise<void>;
  loadApiKeys: () => Promise<void>;
  toggleSimulationMode: (enabled?: boolean) => void;
  updateTelemetry: (partial: Partial<HardwareTelemetry>) => void;
  getActiveEndpoint: () => Endpoint | undefined;
  servingModel: string | null;
  imageLoadedModel: string | null;
}

const DEFAULT_ENDPOINTS: Endpoint[] = [
  {
    id: 'spark_vllm_lan',
    name: 'Spark vLLM',
    host: '192.168.4.103',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'direct_lan',
    group: 'local',
    chatRoute: true,
    probePath: '/v1/models',
    displayUrl: 'http://192.168.4.103:8000/v1/models',
    baseUrl: 'http://192.168.4.103:8000',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'spark_vllm_loop',
    name: 'Spark vLLM (loopback)',
    host: '127.0.0.1',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'localhost',
    group: 'local',
    chatRoute: true,
    probePath: '/v1/models',
    displayUrl: 'http://127.0.0.1:8000/v1/models',
    baseUrl: 'http://127.0.0.1:8000',
    defaultModel: 'qwen-abliterated',
  },
  {
    id: 'spark_ctrl',
    name: 'Spark controller',
    host: '127.0.0.1',
    port: 17325,
    latencyMs: -1,
    isOnline: false,
    type: 'localhost',
    group: 'local',
    chatRoute: false,
    probePath: '/api/status',
    displayUrl: 'http://127.0.0.1:17325',
  },
  {
    id: 'image_bridge',
    name: 'Image bridge',
    host: '192.168.4.103',
    port: 7860,
    latencyMs: -1,
    isOnline: false,
    type: 'direct_lan',
    group: 'local',
    chatRoute: false,
    probePath: '/health',
    displayUrl: 'http://192.168.4.103:7860',
    defaultModel: 'krea2-raw-fp8',
  },
  {
    id: 'featherless_mesh',
    name: 'Featherless',
    host: 'api.featherless.ai',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    group: 'external',
    chatRoute: true,
    probePath: '/v1/models',
    displayUrl: 'https://api.featherless.ai/v1/',
    baseUrl: 'https://api.featherless.ai/v1',
    provider: 'featherless',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  },
  {
    id: 'abliteration_cloud',
    name: 'Abliteration',
    host: 'api.abliteration.ai',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    group: 'external',
    chatRoute: true,
    probePath: '/v1/models',
    displayUrl: 'https://api.abliteration.ai/v1/',
    baseUrl: 'https://api.abliteration.ai/v1',
    provider: 'abliterated',
    defaultModel: 'abliterated-model',
  },
];

const GB10_UNIFIED_SPEC_GB = 128;
const GB10_CUDA_VISIBLE_GIB = 121.7;
const GB10_SOC_TDP_W = 140;
const GB10_CLOCK_MHZ = 2418;

const EMPTY_TELEMETRY: HardwareTelemetry = {
  gpuModel: 'Spark GPU',
  gpuTemp: 0,
  gpuTempMax: 85,
  vramUsedGb: 0,
  vramTotalGb: 0,
  unifiedSpecGb: undefined,
  memoryKind: undefined,
  powerDrawWatts: 0,
  powerLimitWatts: 0,
  gpuClockMhz: 0,
  memoryClockMhz: 0,
  tensorCoresActive: 0,
  busUsagePercent: 0,
  uptimeSeconds: 0,
};

const EMULATED_TELEMETRY: HardwareTelemetry = {
  ...EMPTY_TELEMETRY,
  gpuModel: 'NVIDIA GB10 · 128 GB unified LPDDR5x',
  gpuTemp: 44,
  vramUsedGb: 22.4,
  vramTotalGb: GB10_CUDA_VISIBLE_GIB,
  unifiedSpecGb: GB10_UNIFIED_SPEC_GB,
  memoryKind: 'unified-lpddr5x',
  powerDrawWatts: 48,
  powerLimitWatts: GB10_SOC_TDP_W,
  gpuClockMhz: GB10_CLOCK_MHZ,
  memoryClockMhz: 8533,
  tensorCoresActive: 48,
  busUsagePercent: 18,
  uptimeSeconds: 3600,
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
    id: 'spark_ctrl',
    name: 'Telemetry Controller',
    port: 17325,
    status: 'OFFLINE',
    model: 'DGX Supervisor Daemon',
    description: 'Blackwell thermals, NVLink fabric & power manager',
  },
];

async function fetchOpenAiModels(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 2500
): Promise<{ ok: boolean; ids: string[]; loaded: string[]; ms: number }> {
  const t0 = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    if (!res.ok) return { ok: false, ids: [], loaded: [], ms };
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const ids = rows.map((d: any) => String(d.id || '')).filter(Boolean);
    const loaded = Array.isArray(json?.loaded)
      ? json.loaded.map(String)
      : rows.filter((d: any) => d.loaded).map((d: any) => String(d.id));
    if (typeof json?.model === 'string' && json.model && !loaded.includes(json.model)) {
      loaded.unshift(json.model);
    }
    return { ok: true, ids, loaded, ms };
  } catch {
    return { ok: false, ids: [], loaded: [], ms: -1 };
  }
}

async function fetchImageHealthModel(url: string, timeoutMs = 1500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.model === 'string' ? json.model : null;
  } catch {
    return null;
  }
}

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

function telemetryFromControllerGpu(gpu: Record<string, any>): HardwareTelemetry {
  const name = String(gpu.name || '').trim() || 'NVIDIA GPU';
  const isUnified =
    gpu.memoryKind === 'unified-lpddr5x' ||
    /GB10|DGX Spark/i.test(name);

  const specGb = Number(gpu.unifiedSpecGb) || (isUnified ? GB10_UNIFIED_SPEC_GB : undefined);
  let totalGb = Number(gpu.unifiedTotalGb);
  if (!totalGb) {
    const smiTotalMb = Number(gpu.vramTotalMb) || 0;
    totalGb = smiTotalMb > 0 ? smiTotalMb / 1024 : 0;
  }
  let usedGb =
    gpu.unifiedUsedGb != null && gpu.unifiedUsedGb !== ''
      ? Number(gpu.unifiedUsedGb)
      : (Number(gpu.vramUsedMb) || 0) / 1024;
  if (!Number.isFinite(usedGb) || usedGb < 0) usedGb = 0;

  const liveClock = Number(gpu.clockMhz) || 0;
  const liveMemClock = Number(gpu.memClockMhz) || Number(gpu.memoryClockMhz) || 0;
  let powerLimit = Number(gpu.powerLimitW) || 0;
  if (!powerLimit && isUnified) powerLimit = GB10_SOC_TDP_W;

  return {
    gpuModel: isUnified && specGb ? `${name} · ${specGb} GB unified LPDDR5x` : name,
    gpuTemp: Math.round(Number(gpu.tempC) || 0),
    gpuTempMax: 85,
    vramUsedGb: Number(usedGb.toFixed(1)),
    vramTotalGb: Number(totalGb.toFixed(1)),
    unifiedSpecGb: specGb,
    memoryKind: isUnified ? 'unified-lpddr5x' : 'discrete-vram',
    powerDrawWatts: Math.round(Number(gpu.powerDrawW) || 0),
    powerLimitWatts: Math.round(powerLimit),
    busUsagePercent: Math.round(Number(gpu.gpuUtilPct) || 0),
    gpuClockMhz: liveClock,
    memoryClockMhz: liveMemClock,
    tensorCoresActive: isUnified ? 48 : 0,
    uptimeSeconds: 0,
  };
}

async function fetchRealControllerStatus(host: string): Promise<Record<string, any> | null> {
  const urls = [
    resolveApiUrl('127.0.0.1', 17325, '/api/status'),
    resolveApiUrl(host, 17325, '/api/status'),
  ];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        if (json && (json.gpu || json.ok)) return json;
      }
    } catch {}
  }
  return null;
}

/** HMR-safe alias: older probeAll closures still call this name. */
const fetchRealControllerGpu = fetchRealControllerStatus;
void fetchRealControllerGpu;

let probeInFlight: Promise<void> | null = null;

const isPublicWeb =
  typeof window !== 'undefined' &&
  Boolean(window.location?.hostname) &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1' &&
  !window.location.hostname.startsWith('192.168.');

const initialMode: MeshMode = isPublicWeb ? 'cloud' : 'spark';
const initialHost = initialMode === 'spark' ? '192.168.4.103' : 'api.featherless.ai';
const initialPort = initialMode === 'spark' ? 8000 : 443;

function applyChatSelection(host: string, port: number, mode: MeshMode, serving?: string | null) {
  const route = mode === 'spark' ? 'spark' : routeFromHost(host, 'cloud');
  useModelSession.getState().setRoute(route);
  const patch: Partial<MeshState> = {
    activeHost: host,
    activePort: port,
    meshMode: mode,
  };
  if (serving) patch.servingModel = serving;
  return patch;
}

export const useMeshStore = create<MeshState>((set, get) => ({
  meshMode: initialMode,
  activeHost: initialHost,
  activePort: initialPort,
  activeImageHost: '192.168.4.103',
  activeImagePort: 7860,
  lastChatHosts: { [initialMode]: { host: initialHost, port: initialPort } },
  candidates: DEFAULT_ENDPOINTS,
  isProbing: false,
  lastProbeTime: null,
  telemetry: EMPTY_TELEMETRY,
  telemetrySource: 'unavailable',
  microservices: INITIAL_MICROSERVICES,
  simulationMode: false,
  featherlessApiKey: '',
  abliteratedApiKey: '',
  huggingfaceApiKey: '',
  liveDiskModels: [],
  liveImageModels: [],

  servingModel: null,
  imageLoadedModel: null,

  getActiveEndpoint: () => {
    const { candidates, activeHost, activePort } = get();
    return matchEndpoint(candidates, activeHost, activePort) || candidates[0];
  },

  selectEndpoint: (ep: Endpoint) => {
    if (isStatusOnlyEndpoint(ep)) return;
    if (isImageEndpoint(ep)) {
      set({ activeImageHost: ep.host, activeImagePort: ep.port || 7860 });
      AsyncStorage.setItem(
        IMAGE_HOST_STORAGE,
        JSON.stringify({ host: ep.host, port: ep.port || 7860 })
      ).catch(() => {});
      return;
    }
    const mode: MeshMode = isCloudHost(ep.host) ? 'cloud' : 'spark';
    const lastChatHosts = persistChatHosts(get().lastChatHosts, mode, ep.host, ep.port);
    set({
      ...applyChatSelection(ep.host, ep.port, mode, ep.defaultModel || get().servingModel),
      lastChatHosts,
    });
    AsyncStorage.setItem(MESH_MODE_STORAGE, mode).catch(() => {});
    AsyncStorage.setItem(CHAT_HOST_STORAGE, JSON.stringify(lastChatHosts)).catch(() => {});
  },

  setMeshMode: async (mode: MeshMode) => {
    if (isPublicWeb && mode === 'spark') {
      mode = 'cloud';
    }
    const next = restoreChatForMode(mode, get().lastChatHosts);
    const lastChatHosts = persistChatHosts(get().lastChatHosts, mode, next.host, next.port);
    set({
      ...applyChatSelection(next.host, next.port, mode),
      lastChatHosts,
      telemetrySource:
        get().simulationMode ? 'emulated' : mode === 'spark' ? get().telemetrySource : 'unavailable',
    });
    try {
      await AsyncStorage.setItem(MESH_MODE_STORAGE, mode);
      await AsyncStorage.setItem(CHAT_HOST_STORAGE, JSON.stringify(lastChatHosts));
    } catch (e) {
      console.warn('[useMeshStore] Failed to save mesh mode:', e);
    }
    get().probeAll();
  },

  toggleMeshMode: async () => {
    const current = get().meshMode;
    await get().setMeshMode(current === 'spark' ? 'cloud' : 'spark');
  },

  loadMeshMode: async () => {
    try {
      const saved = await AsyncStorage.getItem(MESH_MODE_STORAGE);
      const chatRaw = await AsyncStorage.getItem(CHAT_HOST_STORAGE);
      let lastChatHosts: PersistedChatHosts = get().lastChatHosts;
      if (chatRaw) {
        try {
          lastChatHosts = { ...lastChatHosts, ...JSON.parse(chatRaw) };
        } catch {}
      }
      let mode: MeshMode =
        saved === 'spark' || saved === 'cloud' ? saved : get().meshMode;
      if (isPublicWeb) mode = 'cloud';
      const next = restoreChatForMode(mode, lastChatHosts);
      set({
        ...applyChatSelection(next.host, next.port, mode),
        lastChatHosts,
      });
      const imgRaw = await AsyncStorage.getItem(IMAGE_HOST_STORAGE);
      if (imgRaw) {
        const img = JSON.parse(imgRaw);
        if (img?.host) {
          set({
            activeImageHost: String(img.host),
            activeImagePort: Number(img.port) || 7860,
          });
        }
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
          huggingfaceApiKey: parsed.huggingfaceApiKey || '',
        });
      }
    } catch (e) {
      console.warn('[useMeshStore] Failed to load saved API keys:', e);
    }
  },

  setApiKey: async (provider: 'abliterated' | 'featherless' | 'huggingface', key: string) => {
    const trimmed = key.trim();
    if (provider === 'featherless') {
      set({ featherlessApiKey: trimmed });
    } else if (provider === 'abliterated') {
      set({ abliteratedApiKey: trimmed });
    } else {
      set({ huggingfaceApiKey: trimmed });
    }

    try {
      const current = {
        featherlessApiKey: provider === 'featherless' ? trimmed : get().featherlessApiKey,
        abliteratedApiKey: provider === 'abliterated' ? trimmed : get().abliteratedApiKey,
        huggingfaceApiKey: provider === 'huggingface' ? trimmed : get().huggingfaceApiKey,
      };
      await AsyncStorage.setItem(MESH_KEYS_STORAGE, JSON.stringify(current));
    } catch (e) {
      console.warn('[useMeshStore] Failed to save API keys:', e);
    }
  },

  probeAll: async () => {
    if (probeInFlight) return probeInFlight;
    probeInFlight = (async () => {
      const startedMode = get().meshMode;
      const startedHost = get().activeHost;
      const startedPort = get().activePort;
      set({ isProbing: true });
      try {
        const { candidates, featherlessApiKey, abliteratedApiKey, meshMode, simulationMode } = get();
        const keys = { featherlessApiKey, abliteratedApiKey };

        let updatedCandidates = await Promise.all(
          candidates.map(async (ep) => {
            const headers = probeHeadersFor(ep, keys);
            const path = ep.probePath || '/v1/models';
            const probeUrl = resolveApiUrl(ep.host, ep.port, path);
            const isModels = path.includes('/v1/models');
            const models = isModels
              ? await fetchOpenAiModels(probeUrl, headers, 4000)
              : { ok: false, ids: [] as string[], loaded: [] as string[], ms: -1 };
            const ping = isModels ? null : await checkUrl(probeUrl, headers, 4000);
            if (ep.type === 'public_cloud' && models.ids.length) {
              useModelSession.getState().setChatCatalog(routeFromHost(ep.host, 'cloud'), models.ids);
            }
            const ok = isModels ? models.ok : ping!.ok;
            const ms = isModels ? models.ms : ping!.ms;

            return {
              ...ep,
              latencyMs: ok ? ms : -1,
              isOnline: ok,
              defaultModel: isModels
                ? (() => {
                    const route = routeFromHost(ep.host, meshMode);
                    const ids = compactCatalog(models.ids, route);
                    if (ep.defaultModel && models.ids.includes(ep.defaultModel)) return ep.defaultModel;
                    return resolveChatModel(route, ids, ep.defaultModel).id || ep.defaultModel;
                  })()
                : ep.defaultModel,
            };
          })
        );

        const isSparkMode = meshMode === 'spark';
        const candidatePool = isSparkMode
          ? updatedCandidates.filter((e) => e.chatRoute && e.group === 'local')
          : updatedCandidates.filter((e) => e.chatRoute && e.group === 'external');

        const currentOnline = candidatePool.find(
          (e) => e.host === get().activeHost && e.port === get().activePort && e.isOnline
        );
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
            const fallback = restoreChatForMode(meshMode, get().lastChatHosts);
            nextHost = fallback.host;
            nextPort = fallback.port;
          }
        }

        let updatedMicroservices: Microservice[];
        let liveServing: string | null = get().servingModel;
        let liveImage: string | null = null;
        const imageHost = get().activeImageHost || '192.168.4.103';
        const imagePort = get().activeImagePort || 7860;

        if (!isSparkMode) {
          const route = routeFromHost(nextHost, 'cloud');
          useModelSession.getState().setRoute(route);
          liveServing = useModelSession.getState().resolvedChatId() || liveServing;
        }

        const [imgModels, imgHealth] = await Promise.all([
          fetchOpenAiModels(resolveApiUrl(imageHost, imagePort, '/v1/models'), undefined, 2000),
          fetchImageHealthModel(resolveApiUrl(imageHost, imagePort, '/health'), 1500),
        ]);
        liveImage = imgHealth || imgModels.loaded[0] || null;

        if (isSparkMode) {
          const [vllmModels, ctrlCheckLocal, ctrlCheckRemote] = await Promise.all([
            fetchOpenAiModels(resolveApiUrl(nextHost, 8000, '/v1/models'), undefined, 2000),
            checkUrl(resolveApiUrl('127.0.0.1', 17325, '/api/status'), undefined, 2000),
            checkUrl(resolveApiUrl(nextHost, 17325, '/api/status'), undefined, 2000),
          ]);

          liveServing =
            resolveChatModel('spark', vllmModels.ids, get().servingModel).id ||
            (vllmModels.ids.includes('qwen-abliterated') ? 'qwen-abliterated' : vllmModels.ids[0] || null);
          useModelSession.getState().setRoute('spark');
          useModelSession.getState().setChatCatalog('spark', vllmModels.ids);
          if (liveServing) {
            useModelSession.getState().setChatServing(liveServing, vllmModels.ok ? 'ready' : 'error');
          }

          updatedCandidates = updatedCandidates.map((ep) =>
            ep.port === 8000 && liveServing ? { ...ep, defaultModel: liveServing } : ep
          );

          const vllmCheck = { ok: vllmModels.ok, ms: vllmModels.ms };
          const imgCheck = { ok: imgModels.ok || Boolean(imgHealth), ms: imgModels.ms };

          updatedMicroservices = [
            {
              id: 'vllm_text',
              name: 'Text vLLM',
              port: 8000,
              status: vllmCheck.ok ? 'ONLINE' : 'OFFLINE',
              model: liveServing || 'offline',
              description: `Streaming vLLM • ${liveServing || 'no model'} • ${vllmCheck.ok ? vllmCheck.ms + 'ms' : 'offline'}`,
            },
            {
              id: 'krea_image',
              name: 'Image Bridge',
              port: 7860,
              status: imgCheck.ok ? 'ONLINE' : 'STANDBY',
              model: liveImage || 'idle',
              description: `Diffusers bridge • ${liveImage || 'no pipe loaded'} • ${imgCheck.ok ? imgCheck.ms + 'ms' : 'standby'}`,
            },
            {
              id: 'spark_ctrl',
              name: 'Telemetry Controller',
              port: 17325,
              status: ctrlCheckLocal.ok || ctrlCheckRemote.ok ? 'ONLINE' : 'STANDBY',
              model: 'DGX Supervisor Daemon',
              description:
                ctrlCheckLocal.ok || ctrlCheckRemote.ok
                  ? 'Live hardware telemetric daemon connected'
                  : 'Supervisor daemon idle on port :17325',
            },
          ];

          if (simulationMode) {
            set({ telemetry: EMULATED_TELEMETRY, telemetrySource: 'emulated' });
          } else {
            const ctrl = await fetchRealControllerStatus(nextHost);
            const gpu = ctrl?.gpu && !ctrl.gpu.error ? ctrl.gpu : null;
            const diskModels = Array.isArray(ctrl?.models) ? ctrl.models : [];
            const imageModels = Array.isArray(ctrl?.image?.models) ? ctrl.image.models : [];
            set({
              telemetry: gpu ? telemetryFromControllerGpu(gpu) : EMPTY_TELEMETRY,
              telemetrySource: gpu ? 'live' : 'unavailable',
              liveDiskModels: diskModels,
              liveImageModels: imageModels,
            });
          }
        } else {
          const abliteratedOnline = updatedCandidates.some(
            (c) => c.provider === 'abliterated' && c.isOnline
          );
          const featherlessOnline = updatedCandidates.some(
            (c) => c.provider === 'featherless' && c.isOnline
          );

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
              description: 'Global open-weight inference mesh at https://api.featherless.ai/v1',
            },
            {
              id: 'krea_image',
              name: 'Abliterated Krea Diffusion',
              port: 443,
              status: abliteratedOnline ? 'ONLINE' : 'STANDBY',
              model: liveImage || 'krea2-raw-fp8',
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

          if (simulationMode) {
            set({ telemetry: EMULATED_TELEMETRY, telemetrySource: 'emulated' });
          } else {
            set({
              telemetry: EMPTY_TELEMETRY,
              telemetrySource: 'unavailable',
              liveDiskModels: [],
              liveImageModels: [],
            });
          }
        }

        if (!isSparkMode) {
          const active = matchEndpoint(updatedCandidates, nextHost, nextPort);
          liveServing = active?.defaultModel || liveServing;
        }

        const modeUnchanged = get().meshMode === startedMode;
        const hostUnchanged =
          get().activeHost === startedHost && get().activePort === startedPort;
        const lastChatHosts = persistChatHosts(get().lastChatHosts, meshMode, nextHost, nextPort);
        const keepUserHost = modeUnchanged && !hostUnchanged;
        const active = keepUserHost
          ? matchEndpoint(updatedCandidates, get().activeHost, get().activePort)
          : matchEndpoint(updatedCandidates, nextHost, nextPort);
        set({
          candidates: updatedCandidates,
          ...(modeUnchanged && hostUnchanged
            ? {
                activeHost: nextHost,
                activePort: nextPort,
                lastChatHosts,
                servingModel: liveServing,
              }
            : keepUserHost
            ? {
                servingModel: active?.defaultModel || get().servingModel,
              }
            : {}),
          microservices: updatedMicroservices,
          imageLoadedModel: liveImage,
          lastProbeTime: Date.now(),
        });
        if (modeUnchanged && hostUnchanged) {
          AsyncStorage.setItem(CHAT_HOST_STORAGE, JSON.stringify(lastChatHosts)).catch(() => {});
        }
      } catch (error) {
        console.warn('probeAll failed', error);
      } finally {
        set({ isProbing: false });
        probeInFlight = null;
      }
      if (get().meshMode !== startedMode) {
        await get().probeAll();
      }
    })();
    return probeInFlight;
  },

  setActiveHost: (host: string, port = 8000) => {
    const ep = matchEndpoint(get().candidates, host, port);
    if (!ep) return;
    get().selectEndpoint(ep);
  },

  toggleSimulationMode: (enabled) => {
    const next = enabled !== undefined ? enabled : !get().simulationMode;
    if (next) {
      set({
        simulationMode: true,
        telemetry: EMULATED_TELEMETRY,
        telemetrySource: 'emulated',
      });
    } else {
      set({
        simulationMode: false,
        telemetrySource: get().meshMode === 'spark' ? 'stale' : 'unavailable',
      });
      get().probeAll();
    }
  },

  updateTelemetry: (partial) => {
    set((state) => ({
      telemetry: { ...state.telemetry, ...partial },
    }));
  },
}));
