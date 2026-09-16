import { Endpoint } from '../types';

export interface CloudProviderConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  baseUrl: string;
  provider: 'abliterated' | 'featherless' | 'custom';
  defaultModel: string;
  availableModels: string[];
  description: string;
  docsUrl: string;
}

export const CLOUD_PROVIDERS: Record<string, CloudProviderConfig> = {
  abliteration: {
    id: 'abliteration_cloud',
    name: 'Abliteration Cloud',
    host: 'api.abliteration.ai',
    port: 443,
    baseUrl: 'https://api.abliteration.ai/v1',
    provider: 'abliterated',
    defaultModel: 'abliterated-model',
    availableModels: [
      'abliterated-model',
      'abliterated-model-large',
      'abliterated-model-large-v2',
    ],
    description: 'Sovereign cloud inference at api.abliteration.ai',
    docsUrl: 'https://abliteration.ai',
  },
  featherless: {
    id: 'featherless_cloud',
    name: 'Featherless AI',
    host: 'api.featherless.ai',
    port: 443,
    baseUrl: 'https://api.featherless.ai/v1',
    provider: 'featherless',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    availableModels: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct',
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
      'cognitivecomputations/dolphin-2.9.2-qwen2-72b',
      'mistralai/Mistral-7B-Instruct-v0.3',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    description: 'Serverless open-weight and uncensored model inference mesh',
    docsUrl: 'https://featherless.ai',
  },
};

function pageProtocol(): 'http:' | 'https:' | null {
  if (typeof window === 'undefined' || !window.location?.protocol) return null;
  if (window.location.protocol === 'https:') return 'https:';
  if (window.location.protocol === 'http:') return 'http:';
  return null;
}

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/**
 * Resolves a full request URL given a host, port, or base URL.
 * Same-origin / loopback hosts inherit the page protocol so an HTTPS
 * Expo web session does not trip mixed-content blocks.
 */
export function cloudProviderFromHost(hostOrUrl: string): 'featherless' | 'abliteration' | null {
  const h = (hostOrUrl || '').toLowerCase();
  if (h.includes('featherless')) return 'featherless';
  if (h.includes('abliteration') || h.includes('abliterated.ai') || h.includes('abliterated.io')) {
    return 'abliteration';
  }
  return null;
}

function pageLocation(): { protocol: string; hostname: string; origin: string } | null {
  if (typeof window === 'undefined' || !window.location?.protocol) return null;
  return {
    protocol: window.location.protocol,
    hostname: window.location.hostname || '',
    origin: window.location.origin || '',
  };
}

function cloudPath(path = ''): string {
  const clean = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  if (!clean) return '/v1';
  return clean.startsWith('/v1') ? clean : '/v1' + clean;
}

/**
 * Same-origin Vercel `/api/cloud` on the public HTTPS app.
 * Local Expo web cannot inject `.env` keys and Abliteration CORS
 * rejects localhost, so DEV uses the cloud-key-proxy on :17332.
 */
export function cloudProxyUrlForPage(
  page: { protocol?: string; hostname?: string; origin?: string } | null,
  hostOrUrl: string,
  path = ''
): string | null {
  const provider = cloudProviderFromHost(hostOrUrl);
  if (!provider) return null;
  const withV1 = cloudPath(path);
  const protocol = page?.protocol || '';
  const hostname = page?.hostname || '';
  const origin = page?.origin || '';

  if (protocol === 'https:' && origin && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.')) {
    return `${origin}/api/cloud/${provider}${withV1}`;
  }

  if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return `http://127.0.0.1:17332/${provider}${withV1}`;
  }

  if (protocol === 'http:' && (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.endsWith('.local'))) {
    return `http://${hostname}:17332/${provider}${withV1}`;
  }

  return null;
}

export function resolveCloudProxyUrl(hostOrUrl: string, path = ''): string | null {
  return cloudProxyUrlForPage(pageLocation(), hostOrUrl, path);
}

export function resolveApiUrl(hostOrUrl: string, port = 8000, path = ''): string {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

  const proxied = resolveCloudProxyUrl(hostOrUrl, cleanPath);
  if (proxied) return proxied;

  // Already a full qualified HTTP/HTTPS URL
  if (hostOrUrl.startsWith('http://') || hostOrUrl.startsWith('https://')) {
    const base = hostOrUrl.replace(/\/+$/, '');
    return `${base}${cleanPath}`;
  }

  // Known cloud domains always use HTTPS on standard port
  if (
    hostOrUrl.includes('abliterated.io') ||
    hostOrUrl.includes('abliteration.ai') ||
    hostOrUrl.includes('abliterated.ai') ||
    hostOrUrl.includes('featherless.ai') ||
    hostOrUrl.includes('featherless.io') ||
    port === 443
  ) {
    return `https://${hostOrUrl}${cleanPath}`;
  }

  const portSuffix = port && port !== 80 && port !== 443 ? `:${port}` : '';
  let protocol: 'http:' | 'https:' = 'http:';
  const page = pageProtocol();
  if (page === 'https:') {
    const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
    if (hostOrUrl === pageHost || (isLoopback(hostOrUrl) && isLoopback(pageHost))) {
      protocol = 'https:';
    }
  }

  return `${protocol}//${hostOrUrl}${portSuffix}${cleanPath}`;
}

export function resolveWsUrl(hostOrUrl: string, port = 8000, path = ''): string {
  return resolveApiUrl(hostOrUrl, port, path).replace(/^http/, 'ws');
}

export async function fetchJsonWithTimeout(
  url: string,
  timeoutMs = 900
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    let data: any = null;
    if (res.ok) {
      data = await res.json().catch(() => null);
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds request headers including optional Bearer token
 */
export function buildApiHeaders(apiKey?: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extraHeaders,
  };

  if (apiKey && apiKey.trim().length > 0) {
    const trimmed = apiKey.trim();
    headers['Authorization'] = `Bearer ${trimmed}`;
    headers['x-api-key'] = trimmed;
  }

  return headers;
}
