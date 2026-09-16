import { create } from 'zustand';
import { useMeshStore } from './useMeshStore';

export type DiagStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export type DiagItem = {
  id: string;
  label: string;
  status: DiagStatus;
  detail?: string;
  latencyMs?: number;
};

type State = {
  items: DiagItem[];
  lastCheckedAt: number | null;
  checking: boolean;
  banner: string | null;
  refresh: () => Promise<void>;
  clearBanner: () => void;
};

const RUNNER = 'http://127.0.0.1:17330';

async function probe(url: string, ms = 2500): Promise<{ ok: boolean; ms: number; status?: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return { ok: res.ok, ms: Date.now() - t0, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

export const useDiagnosticsStore = create<State>((set, get) => ({
  items: [],
  lastCheckedAt: null,
  checking: false,
  banner: null,

  clearBanner: () => set({ banner: null }),

  refresh: async () => {
    if (get().checking) return;
    set({ checking: true });
    const mesh = useMeshStore.getState();
    const host = mesh.activeHost;
    const port = mesh.activePort;
    const meshMode = mesh.meshMode;

    const runner = await probe(`${RUNNER}/health`);
    const sparkUrl =
      meshMode === 'spark'
        ? `http://${host}:${port}/v1/models`
        : `https://${host}/v1/models`;
    const meshProbe = await probe(sparkUrl, 4000);

    const items: DiagItem[] = [
      {
        id: 'runner',
        label: 'Sandbox :17330',
        status: runner.ok ? 'ok' : 'down',
        detail: runner.ok ? `up ${runner.ms}ms` : 'offline — npm run sandbox:watch',
        latencyMs: runner.ms,
      },
      {
        id: 'mesh',
        label: meshMode === 'spark' ? `Spark ${host}:${port}` : `Cloud ${host}`,
        status: meshProbe.ok ? 'ok' : 'down',
        detail: meshProbe.ok ? `${meshProbe.ms}ms` : 'unreachable',
        latencyMs: meshProbe.ms,
      },
      {
        id: 'rag',
        label: 'RAG index',
        status: 'unknown',
        detail: 'see Knowledge panel',
      },
    ];

    const down = items.filter((i) => i.status === 'down');
    const banner =
      down.length > 0
        ? down.map((d) => `${d.label}: ${d.detail || 'down'}`).join(' · ')
        : null;

    set({
      items,
      lastCheckedAt: Date.now(),
      checking: false,
      banner,
    });
  },
}));
