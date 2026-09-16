export type ModelRoute = 'spark' | 'featherless' | 'abliteration';

export const SPARK_CHAT_IDS = new Set(['qwen-abliterated', 'gpt-oss-120b-abliterated']);

export const IMAGE_UNLOADABLE: Record<string, string> = {};

const ABLITERATION_PREFER = [
  'abliterated-model',
  'abliterated-model-large',
  'abliterated-model-large-v2',
];

export function routeFromHost(host: string, meshMode?: string): ModelRoute {
  const h = (host || '').toLowerCase();
  if (h.includes('featherless')) return 'featherless';
  if (
    h.includes('abliteration') ||
    h.includes('abliterated.ai') ||
    h.includes('abliterated.io')
  ) {
    return 'abliteration';
  }
  if (meshMode === 'spark') return 'spark';
  if (
    h.startsWith('192.168.') ||
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h.startsWith('100.')
  ) {
    return 'spark';
  }
  if (meshMode === 'cloud') return 'abliteration';
  return 'spark';
}

export function compactCatalog(ids: string[], route: ModelRoute): string[] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length <= 80) return unique;
  const prefer =
    route === 'abliteration'
      ? ABLITERATION_PREFER
      : route === 'spark'
      ? ['qwen-abliterated', 'gpt-oss-120b-abliterated']
      : [];
  const head = prefer.filter((p) => unique.includes(p));
  const rest = unique.filter((id) => !head.includes(id)).slice(0, 40);
  return [...head, ...rest];
}

export function resolveChatModel(
  route: ModelRoute,
  catalog: string[],
  selected?: string | null
): { id: string; reason: string } {
  const list = catalog.filter(Boolean);

  if (route === 'spark') {
    if (selected && list.includes(selected)) return { id: selected, reason: 'selected' };
    if (list.includes('qwen-abliterated')) return { id: 'qwen-abliterated', reason: 'spark-default' };
    if (list[0]) return { id: list[0], reason: 'spark-first-listed' };
    return { id: 'qwen-abliterated', reason: 'spark-fallback' };
  }

  if (selected && list.includes(selected)) {
    if (route === 'featherless' && SPARK_CHAT_IDS.has(selected) && !list.includes(selected)) {
      /* unreachable */
    }
    if (route === 'featherless' && SPARK_CHAT_IDS.has(selected)) {
      const alt = list.find((id) => !SPARK_CHAT_IDS.has(id));
      if (alt) return { id: alt, reason: 'rejected-spark-id-on-featherless' };
    }
    return { id: selected, reason: 'selected' };
  }

  if (route === 'abliteration') {
    for (const p of ABLITERATION_PREFER) {
      if (list.includes(p)) return { id: p, reason: 'abliteration-prefer' };
    }
  }

  const cloud = list.find((id) => !SPARK_CHAT_IDS.has(id));
  if (cloud) return { id: cloud, reason: 'cloud-non-spark' };
  if (list[0]) return { id: list[0], reason: 'cloud-listed' };
  return { id: '', reason: 'pick-a-cloud-model' };
}

export function imageLoadable(
  id: string,
  availability?: { available: boolean; loaded?: boolean }
): { ok: boolean; reason: string | null } {
  if (IMAGE_UNLOADABLE[id]) return { ok: false, reason: IMAGE_UNLOADABLE[id] };
  if (availability && availability.available === false) {
    return { ok: false, reason: 'weights not on this bridge' };
  }
  return { ok: true, reason: null };
}
