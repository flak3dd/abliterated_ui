import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Endpoint, HardwareTelemetry, Microservice } from '../types';
import { resolveApiUrl, buildApiHeaders } from '../services/apiConfig';

const MESH_KEYS_STORAGE = '@abliterated_mesh_api_keys_v1';

interface MeshState {
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
  setActiveHost: (host: string, port?: number) => void;
  setApiKey: (provider: 'abliterated' | 'featherless', key: string) => Promise<void>;
  loadApiKeys: () => Promise<void>;
  toggleSimulationMode: (enabled?: boolean) => void;
  updateTelemetry: (partial: Partial<HardwareTelemetry>) => void;
  getActiveEndpoint: () => Endpoint | undefined;
}

const DEFAULT_ENDPOINTS: Endpoint[] = [
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
    id: 'featherless_mesh',
    name: 'Featherless AI Mesh',
    host: 'api.featherless.io',
    port: 443,
    latencyMs: -1,
    isOnline: false,
    type: 'public_cloud',
    baseUrl: 'https://api.featherless.io',
    provider: 'featherless',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  },
  {
    id: 'custom_gateway',
    name: 'Custom Cloud / Localhost',
    host: '127.0.0.1',
    port: 8000,
    latencyMs: -1,
    isOnline: false,
    type: 'custom',
    baseUrl: 'http://127.0.0.1:8000',
    provider: 'custom',
    defaultModel: 'qwen-abliterated',
  },
];

const INITIAL_TELEMETRY: HardwareTelemetry = {
  gpuModel: 'Abliterated Sovereign Cluster • 8x H100 SXM5 / NVFP4',
  gpuTemp: 38,
  gpuTempMax: 82,
  vramUsedGb: 68.4,
  vramTotalGb: 80.0,
  powerDrawWatts: 385,
  powerLimitWatts: 700,
  gpuClockMhz: 2610,
  memoryClockMhz: 3350,
  tensorCoresActive: 528,
  busUsagePercent: 42,
  uptimeSeconds: 86400 * 14,
};

const INITIAL_MICROSERVICES: Microservice[] = [
  {
    id: 'vllm_text',
    name: 'Abliterated Sovereign LLM',
    port: 443,
    status: 'ONLINE',
    model: 'qwen-abliterated (FP8 / NVFP4)',
    description: 'High-throughput sovereign inference cluster at https://api.abliterated.ai',
  },
  {
    id: 'featherless_mesh',
    name: 'Featherless AI Router',
    port: 443,
    status: 'ONLINE',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    description: 'Global open-weight inference mesh at https://api.featherless.io',
  },
  {
    id: 'krea_image',
    name: 'Abliterated Krea Diffusion',
    port: 443,
    status: 'ONLINE',
    model: 'krea2-raw-fp8',
    description: 'High-fidelity generative latent diffusion & inpainting engine',
  },
  {
    id: 'swarm_agent',
    name: 'Multi-Agent Swarm Orchestrator',
    port: 443,
    status: 'ONLINE',
    model: 'Matrix Swarm Orchestrator v2',
    description: 'Autonomous multi-worker decomposition and test-driven code synthesizer',
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
    // 200, 401 (requires key but host is alive), or 404 still indicates host is reachable
    const isHostUp = res.status > 0 && res.status < 500;
    return { ok: isHostUp, status: res.status, ms: Math.max(1, Math.round(performance.now() - t0)) };
  } catch {
    return { ok: false, status: 0, ms: -1 };
  }
}

export const useMeshStore = create<MeshState>((set, get) => ({
  activeHost: 'api.abliterated.ai',
  activePort: 443,
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

    const { candidates, featherlessApiKey, abliteratedApiKey } = get();

    // Probe all cloud & custom endpoints concurrently
    const updatedCandidates = await Promise.all(
      candidates.map(async (ep) => {
        const apiKey = ep.provider === 'featherless' ? featherlessApiKey : abliteratedApiKey;
        const headers = buildApiHeaders(apiKey);
        const probeUrl = resolveApiUrl(ep.host, ep.port, '/v1/models');
        const probe = await checkUrl(probeUrl, headers, 3000);

        return {
          ...ep,
          latencyMs: probe.ok ? probe.ms : -1,
          isOnline: probe.ok,
          apiKey,
        };
      })
    );

    // Keep current active host if online, otherwise select first online candidate
    const currentOnline = updatedCandidates.find((e) => e.host === get().activeHost && e.isOnline);
    let nextHost = get().activeHost;
    let nextPort = get().activePort;

    if (!currentOnline) {
      const best = updatedCandidates.find((e) => e.isOnline && e.latencyMs > 0);
      if (best) {
        nextHost = best.host;
        nextPort = best.port;
      }
    }

    const abliteratedOnline = updatedCandidates.some((c) => c.provider === 'abliterated' && c.isOnline);
    const featherlessOnline = updatedCandidates.some((c) => c.provider === 'featherless' && c.isOnline);

    const updatedMicroservices = get().microservices.map((svc) => {
      if (svc.id === 'vllm_text' || svc.id === 'krea_image') {
        return {
          ...svc,
          status: (abliteratedOnline ? 'ONLINE' : 'STANDBY') as 'ONLINE' | 'STANDBY',
        };
      }
      if (svc.id === 'featherless_mesh') {
        return {
          ...svc,
          status: (featherlessOnline ? 'ONLINE' : 'STANDBY') as 'ONLINE' | 'STANDBY',
        };
      }
      return svc;
    });

    set({
      candidates: updatedCandidates,
      activeHost: nextHost,
      activePort: nextPort,
      microservices: updatedMicroservices,
      isProbing: false,
      lastProbeTime: Date.now(),
    });
  },

  setActiveHost: (host: string, port = 443) => {
    set({ activeHost: host, activePort: port });
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
