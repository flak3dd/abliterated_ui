import { create } from 'zustand';

export type ImageDebugLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ImageDebugEvent {
  ts: string;
  t: number;
  source: 'studio' | 'id-studio' | 'krea' | 'bridge' | 'progress' | 'ui' | 'layoutlm';
  level: ImageDebugLevel;
  event: string;
  message: string;
  model?: string;
  host?: string;
  elapsedMs?: number;
  httpStatus?: number;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 250;
const SINK = 'http://127.0.0.1:17330/api/debug/image-gen';

/** Agent monitor: `tail -f logs/image-gen-debug.jsonl` or GET http://127.0.0.1:17330/api/debug/image-gen */
export const IMAGE_DEBUG_LOG_PATH = 'logs/image-gen-debug.jsonl';
export const IMAGE_DEBUG_HTTP = SINK;

interface ImageDebugState {
  events: ImageDebugEvent[];
  lastError: string | null;
  push: (partial: Omit<ImageDebugEvent, 'ts' | 't'> & { ts?: string; t?: number }) => ImageDebugEvent;
  clear: () => void;
}

function clip(value: unknown, max = 180): string | undefined {
  if (value == null) return undefined;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export const useImageDebugStore = create<ImageDebugState>((set, get) => ({
  events: [],
  lastError: null,
  push: (partial) => {
    const evt: ImageDebugEvent = {
      ts: partial.ts || new Date().toISOString(),
      t: partial.t || Date.now(),
      source: partial.source,
      level: partial.level,
      event: partial.event,
      message: clip(partial.message, 400) || partial.event,
      model: partial.model,
      host: partial.host,
      elapsedMs: partial.elapsedMs,
      httpStatus: partial.httpStatus,
      detail: partial.detail,
    };
    const next = [...get().events, evt].slice(-MAX_EVENTS);
    set({ events: next, lastError: evt.level === 'error' ? evt.message : get().lastError });
    if (typeof fetch === 'function') {
      fetch(SINK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt),
      }).catch(() => {});
    }
    return evt;
  },
  clear: () => set({ events: [], lastError: null }),
}));

export function imageDebug(
  event: string,
  message: string,
  extra?: Partial<Omit<ImageDebugEvent, 'ts' | 't' | 'event' | 'message'>>
): ImageDebugEvent {
  return useImageDebugStore.getState().push({
    source: extra?.source || 'krea',
    level: extra?.level || 'info',
    event,
    message,
    ...extra,
  });
}
