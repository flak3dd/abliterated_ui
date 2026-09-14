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
  abliterated: {
    id: 'abliterated_cloud',
    name: 'Abliterated Cloud AI',
    host: 'api.abliterated.ai',
    port: 443,
    baseUrl: 'https://api.abliterated.ai',
    provider: 'abliterated',
    defaultModel: 'qwen-abliterated',
    availableModels: [
      'qwen-abliterated',
      'gpt-oss-120b-abliterated',
      'krea2-raw-fp8',
    ],
    description: 'Primary sovereign cloud inference cluster with NVFP4 hardware acceleration at api.abliterated.ai',
    docsUrl: 'https://abliterated.app/docs',
  },
  abliterated_io: {
    id: 'abliterated_io_mirror',
    name: 'Abliterated Cloud IO (Mirror)',
    host: 'api.abliterated.io',
    port: 443,
    baseUrl: 'https://api.abliterated.io',
    provider: 'abliterated',
    defaultModel: 'qwen-abliterated',
    availableModels: [
      'qwen-abliterated',
      'gpt-oss-120b-abliterated',
      'krea2-raw-fp8',
    ],
    description: 'Sovereign cloud cluster mirror at api.abliterated.io',
    docsUrl: 'https://abliterated.app/docs',
  },
  featherless: {
    id: 'featherless_cloud',
    name: 'Featherless AI',
    host: 'api.featherless.ai',
    port: 443,
    baseUrl: 'https://api.featherless.ai',
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
export function resolveApiUrl(hostOrUrl: string, port = 8000, path = ''): string {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

  // Already a full qualified HTTP/HTTPS URL
  if (hostOrUrl.startsWith('http://') || hostOrUrl.startsWith('https://')) {
    const base = hostOrUrl.replace(/\/+$/, '');
    return `${base}${cleanPath}`;
  }

  // Known cloud domains always use HTTPS on standard port
  if (
    hostOrUrl.includes('abliterated.ai') ||
    hostOrUrl.includes('abliterated.io') ||
    hostOrUrl.includes('featherless.io') ||
    hostOrUrl.includes('featherless.ai') ||
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
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}
