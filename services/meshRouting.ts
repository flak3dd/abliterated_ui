import { Endpoint } from '../types';

export type MeshMode = 'spark' | 'cloud';

export type PersistedChatHosts = {
  spark?: { host: string; port: number };
  cloud?: { host: string; port: number };
};

export const SPARK_DEFAULT = { host: '192.168.4.103', port: 8000 };
export const CLOUD_DEFAULT = { host: 'api.featherless.ai', port: 443 };

export function isAbliterationHost(host: string): boolean {
  const h = (host || '').toLowerCase();
  return (
    h.includes('abliteration') ||
    h.includes('abliterated.ai') ||
    h.includes('abliterated.io')
  );
}

export function isFeatherlessHost(host: string): boolean {
  return (host || '').toLowerCase().includes('featherless');
}

export function isCloudHost(host: string): boolean {
  return isFeatherlessHost(host) || isAbliterationHost(host);
}

export function isImageEndpoint(ep: Pick<Endpoint, 'id' | 'port' | 'chatRoute'>): boolean {
  return ep.port === 7860 || ep.id === 'image_bridge';
}

export function isStatusOnlyEndpoint(ep: Pick<Endpoint, 'id' | 'port' | 'chatRoute'>): boolean {
  if (isImageEndpoint(ep)) return false;
  return ep.port === 17325 || ep.chatRoute === false;
}

export function matchEndpoint(
  candidates: Endpoint[],
  host: string,
  port?: number
): Endpoint | undefined {
  if (port != null) {
    const exact = candidates.find((c) => c.host === host && c.port === port);
    if (exact) return exact;
  }
  const chat = candidates.find((c) => c.host === host && c.chatRoute !== false && !isImageEndpoint(c));
  if (chat) return chat;
  return candidates.find((c) => c.host === host && !isImageEndpoint(c));
}

export function probeHeadersFor(
  ep: Pick<Endpoint, 'provider'>,
  keys: { featherlessApiKey?: string; abliteratedApiKey?: string }
): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key =
    ep.provider === 'featherless'
      ? keys.featherlessApiKey
      : ep.provider === 'abliterated'
      ? keys.abliteratedApiKey
      : '';
  const trimmed = (key || '').trim();
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`;
    headers['x-api-key'] = trimmed;
  }
  return headers;
}

export function defaultChatForMode(mode: MeshMode): { host: string; port: number } {
  return mode === 'spark' ? { ...SPARK_DEFAULT } : { ...CLOUD_DEFAULT };
}

export function restoreChatForMode(
  mode: MeshMode,
  persisted?: PersistedChatHosts | null
): { host: string; port: number } {
  const saved = persisted?.[mode];
  if (saved?.host && Number(saved.port) > 0) {
    return { host: String(saved.host), port: Number(saved.port) };
  }
  return defaultChatForMode(mode);
}

export function persistChatHosts(
  prev: PersistedChatHosts | null | undefined,
  mode: MeshMode,
  host: string,
  port: number
): PersistedChatHosts {
  return {
    spark: prev?.spark,
    cloud: prev?.cloud,
    [mode]: { host, port },
  };
}
