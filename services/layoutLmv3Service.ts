import { resolveApiUrl } from './apiConfig';
import { imageDebug } from './imageDebugFeed';

/** Document-layout service on Spark (not the Diffusers image bridge). */
export const LAYOUTLM_PORT = 7870;
export const LAYOUTLM_MODEL_ID = 'layoutlmv3-base';
export const LAYOUTLM_HF_ID = 'microsoft/layoutlmv3-base';

export type LayoutAnalyzeResult = {
  ok: boolean;
  available: boolean;
  model: string;
  score?: number;
  regions?: number;
  notes?: string;
  skipped?: boolean;
  error?: string;
};

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; data?: any; text?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: init?.signal || controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const text = await res.text().catch(() => '');
    let data: any = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        /* plain text */
      }
    }
    return { ok: res.ok, status: res.status, data, text };
  } catch (e: any) {
    return { ok: false, status: 0, text: e?.message || 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

export async function pingLayoutLm(
  host: string,
  port = LAYOUTLM_PORT,
  timeoutMs = 2500
): Promise<boolean> {
  const url = resolveApiUrl(host, port, '/health');
  const res = await fetchJson(url, undefined, timeoutMs);
  return res.ok;
}

export async function loadLayoutLm(
  host: string,
  port = LAYOUTLM_PORT,
  model: string = LAYOUTLM_MODEL_ID,
  signal?: AbortSignal
): Promise<{ model: string; skipped?: boolean }> {
  imageDebug('layoutlm_load_start', 'POST /v1/models/load', {
    source: 'layoutlm',
    host,
    model,
  });
  if (!(await pingLayoutLm(host, port))) {
    imageDebug('layoutlm_load_skip', 'health down — skip load', {
      source: 'layoutlm',
      level: 'warn',
      host,
      model,
    });
    return { model, skipped: true };
  }
  const url = resolveApiUrl(host, port, '/v1/models/load');
  const t0 = Date.now();
  const res = await fetchJson(
    url,
    {
      method: 'POST',
      body: JSON.stringify({ model }),
      signal,
    },
    180000
  );
  if (!res.ok) {
    imageDebug('layoutlm_load_fail', res.text || 'HTTP ' + res.status, {
      source: 'layoutlm',
      level: 'error',
      host,
      model,
      httpStatus: res.status,
      elapsedMs: Date.now() - t0,
    });
    throw new Error(res.text || `layoutlm load ${res.status}`);
  }
  const loaded = String(res.data?.model || model);
  imageDebug('layoutlm_load_ok', loaded, {
    source: 'layoutlm',
    host,
    model: loaded,
    elapsedMs: Date.now() - t0,
  });
  return { model: loaded };
}

/**
 * Soft-fail layout / OCR-region analysis for ID studio gates.
 * If :7870 is down, returns available:false skipped:true so the UI keeps working.
 */
export async function analyzeLayout(
  host: string,
  opts: {
    imageDataUrl?: string | null;
    workflow?: string;
    port?: number;
    timeoutMs?: number;
  }
): Promise<LayoutAnalyzeResult> {
  const port = opts.port ?? LAYOUTLM_PORT;
  const model = LAYOUTLM_MODEL_ID;
  if (!opts.imageDataUrl) {
    return {
      ok: false,
      available: false,
      model,
      skipped: true,
      notes: 'no image',
    };
  }
  if (!(await pingLayoutLm(host, port))) {
    return {
      ok: false,
      available: false,
      model,
      skipped: true,
      notes: 'layoutlm: skipped (service unreachable)',
    };
  }
  const url = resolveApiUrl(host, port, '/v1/layout/analyze');
  const t0 = Date.now();
  const res = await fetchJson(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        image: opts.imageDataUrl,
        workflow: opts.workflow,
      }),
    },
    opts.timeoutMs ?? 12000
  );
  if (!res.ok) {
    imageDebug('layoutlm_analyze_fail', res.text || 'HTTP ' + res.status, {
      source: 'layoutlm',
      level: 'warn',
      host,
      model,
      httpStatus: res.status,
      elapsedMs: Date.now() - t0,
    });
    return {
      ok: false,
      available: true,
      model,
      skipped: true,
      error: res.text || 'HTTP ' + res.status,
      notes: 'layoutlm: analyze failed',
    };
  }
  const score = Number(res.data?.score);
  const regions = Number(res.data?.regions);
  const ok = Boolean(res.data?.ok ?? (Number.isFinite(score) ? score >= 0.55 : false));
  imageDebug('layoutlm_analyze_ok', ok ? 'pass' : 'fail', {
    source: 'layoutlm',
    host,
    model,
    elapsedMs: Date.now() - t0,
    detail: { score, regions },
  });
  return {
    ok,
    available: true,
    model: String(res.data?.model || model),
    score: Number.isFinite(score) ? score : undefined,
    regions: Number.isFinite(regions) ? regions : undefined,
    notes: typeof res.data?.notes === 'string' ? res.data.notes : undefined,
  };
}
