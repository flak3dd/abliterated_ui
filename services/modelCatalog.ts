export type ModelLane = 'chat' | 'image';

export interface ImageModelOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
}

export type ModelAvailability = {
  available: boolean;
  loaded: boolean;
};

export interface ModelMeta {
  id: string;
  name: string;
  badge: string;
  desc: string;
  lane: ModelLane;
}

export const IMAGE_MODEL_META: Record<string, Omit<ModelMeta, 'lane'>> = {
  'krea2-raw-fp8': {
    id: 'krea2-raw-fp8',
    name: 'Krea 2 RAW',
    badge: 'FP8 HERO',
    desc: 'Photoreal latent diffusion · default studio',
  },
  'flux2-klein-9b': {
    id: 'flux2-klein-9b',
    name: 'Klein Turbo',
    badge: '4-STEP',
    desc: 'Fast FP8 Klein turbo',
  },
  'flux2-klein-9b-base': {
    id: 'flux2-klein-9b-base',
    name: 'Klein Base',
    badge: '28-STEP',
    desc: 'Higher-step Klein base',
  },
  'z-image-turbo-nsfw-nvfp4': {
    id: 'z-image-turbo-nsfw-nvfp4',
    name: 'Z-Image Turbo',
    badge: 'NVFP4',
    desc: 'Low-latency 4-step draft',
  },
  'qwen-image-2512-fp8': {
    id: 'qwen-image-2512-fp8',
    name: 'Qwen Image',
    badge: 'OMNI',
    desc: 'Qwen-Image 2512 FP8',
  },
  'qwen-edit-2511-fp8': {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen Edit',
    badge: 'EDIT',
    desc: 'Instruction image edit',
  },
  'ddb-edit': {
    id: 'ddb-edit',
    name: 'DDB Edit',
    badge: 'ID',
    desc: 'xing0916/DDB_Edit · Lumina VQ',
  },
  'xing0916/DDB_Edit': {
    id: 'xing0916/DDB_Edit',
    name: 'DDB Edit',
    badge: 'ID',
    desc: 'xing0916/DDB_Edit · Lumina VQ',
  },
  'seedvr2-7b-fp8': {
    id: 'seedvr2-7b-fp8',
    name: 'SeedVR2 7B',
    badge: 'UPSCALE',
    desc: 'Restore / upscale',
  },
  'layoutlmv3-base': {
    id: 'layoutlmv3-base',
    name: 'LayoutLMv3',
    badge: 'DOC',
    desc: 'microsoft/layoutlmv3-base · document layout / OCR zones',
  },
  'microsoft/layoutlmv3-base': {
    id: 'microsoft/layoutlmv3-base',
    name: 'LayoutLMv3',
    badge: 'DOC',
    desc: 'microsoft/layoutlmv3-base · document layout / OCR zones',
  },
};

export const CHAT_MODEL_META: Record<string, Omit<ModelMeta, 'lane'>> = {
  'qwen-abliterated': {
    id: 'qwen-abliterated',
    name: 'Qwen Abliterated',
    badge: 'SPARK',
    desc: 'Qwen 3.6 35B-A3B NVFP4 · :8000',
  },
  'gpt-oss-120b-abliterated': {
    id: 'gpt-oss-120b-abliterated',
    name: 'GPT-OSS 120B',
    badge: '120B',
    desc: 'MXFP4 Spark recipe',
  },
  'abliterated-model': {
    id: 'abliterated-model',
    name: 'Abliterated Model',
    badge: 'CLOUD',
    desc: 'api.abliteration.ai · 262k context',
  },
  'abliterated-model-large': {
    id: 'abliterated-model-large',
    name: 'Abliterated Large',
    badge: 'CLOUD',
    desc: 'api.abliteration.ai · 1M context',
  },
  'abliterated-model-large-v2': {
    id: 'abliterated-model-large-v2',
    name: 'Abliterated Large v2',
    badge: 'CLOUD',
    desc: 'api.abliteration.ai · large v2',
  },
};

export function prettyModelName(id: string): string {
  const hit = IMAGE_MODEL_META[id] || CHAT_MODEL_META[id];
  if (hit) return hit.name;
  const leaf = (id || '').replace(/^.*\//, '').replace(/[-_]+/g, ' ').trim();
  return leaf || 'unknown';
}

export function modelMeta(id: string, lane: ModelLane): ModelMeta {
  const hit = lane === 'image' ? IMAGE_MODEL_META[id] : CHAT_MODEL_META[id];
  if (hit) return { ...hit, lane };
  return {
    id,
    name: prettyModelName(id),
    badge: lane === 'image' ? 'LIVE' : 'CATALOG',
    desc: id,
    lane,
  };
}

export const SPARK_IMAGE_MODELS: ImageModelOption[] = [
  {
    id: 'krea2-raw-fp8',
    name: 'Krea 2 RAW',
    badge: 'FP8 HERO',
    desc: 'Ultra-photorealistic raw studio diffusion',
  },
  {
    id: 'flux2-klein-9b',
    name: 'Klein Turbo',
    badge: '4-STEP',
    desc: 'PornMaster v4 Turbo FP8 — Diffusers',
  },
  {
    id: 'flux2-klein-9b-base',
    name: 'Klein Base',
    badge: '28-STEP',
    desc: 'PornMaster v4 Base FP8',
  },
  {
    id: 'seedvr2-7b-fp8',
    name: 'SeedVR2 7B',
    badge: 'UPSCALE',
    desc: 'Video restoration & high-res upscale diffusion',
  },
  {
    id: 'z-image-turbo-nsfw-nvfp4',
    name: 'Z-Image Turbo',
    badge: 'NVFP4',
    desc: 'Ultra-fast low-latency generative diffusion',
  },
  {
    id: 'qwen-image-2512-fp8',
    name: 'Qwen Image',
    badge: 'OMNI',
    desc: 'Multimodal generative image reasoning',
  },
  {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen Edit',
    badge: 'EDIT',
    desc: 'Instruction image edit',
  },
  {
    id: 'ddb-edit',
    name: 'DDB Edit',
    badge: 'ID',
    desc: 'xing0916/DDB_Edit · Lumina-DiMOO VQ',
  },
];

export const SPARK_ID_MODELS: ImageModelOption[] = [
  {
    id: 'ddb-edit',
    name: 'DDB Edit',
    badge: 'ID',
    desc: 'xing0916/DDB_Edit · Lumina-DiMOO VQ',
  },
  {
    id: 'qwen-edit-2511-fp8',
    name: 'Qwen ID Edit',
    badge: 'EDIT',
    desc: 'Qwen-Image-Edit-2511 instruction editor',
  },
  {
    id: 'krea2-raw-fp8',
    name: 'Krea 2 RAW',
    badge: 'STUDIO',
    desc: 'Photoreal restore fallback',
  },
];

/** Document-layout models (LayoutLMv3) — not Diffusers generators. */
export const SPARK_LAYOUT_MODELS: ImageModelOption[] = [
  {
    id: 'layoutlmv3-base',
    name: 'LayoutLMv3',
    badge: 'DOC',
    desc: 'microsoft/layoutlmv3-base on Spark :7870',
  },
];

/** Prefer the short studio id when aliases share a card (ddb-edit vs xing0916/DDB_Edit). */
export function canonicalImageModelId(id: string): string {
  const aliases = MODEL_ENABLE_ALIASES[id] || [id];
  return aliases.find((a) => !a.includes('/')) || aliases[0] || id;
}

export function imageModelIdsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return toggleIdsFor(a).includes(b);
}

export function isImagePipeLoaded(
  selected: string,
  loadedId: string | null | undefined,
  availability?: Record<string, { loaded?: boolean } | undefined>
): boolean {
  if (!selected) return false;
  if (availability?.[selected]?.loaded) return true;
  if (loadedId && imageModelIdsMatch(selected, loadedId)) return true;
  if (availability) {
    for (const [id, row] of Object.entries(availability)) {
      if (row?.loaded && imageModelIdsMatch(id, selected)) return true;
    }
  }
  return false;
}

export function mergeImageCatalog(
  staticList: ImageModelOption[],
  liveIds?: string[]
): ImageModelOption[] {
  const byId = new Map<string, ImageModelOption>();
  for (const item of staticList) byId.set(item.id, item);
  for (const id of liveIds || []) {
    if (!id || byId.has(id)) continue;
    const meta = modelMeta(id, 'image');
    byId.set(id, { id, name: meta.name, badge: meta.badge, desc: meta.desc });
  }
  const list = [...byId.values()];
  return list.filter((item, _i, all) => {
    const canon = canonicalImageModelId(item.id);
    if (item.id !== canon && all.some((x) => x.id === canon)) return false;
    return true;
  });
}

export function filterModels<T extends { id: string; name?: string; badge?: string; desc?: string }>(
  items: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = [item.id, item.name, item.badge, item.desc].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export type ModelRankInput = {
  id: string;
  selected?: boolean;
  loaded?: boolean;
  available?: boolean;
};

/** Inventory card id → selector / bridge ids that the toggle controls. */
export const MODEL_ENABLE_ALIASES: Record<string, string[]> = {
  'qwen-35b-nvfp4': ['qwen-abliterated'],
  'qwen-abliterated': ['qwen-abliterated', 'qwen-35b-nvfp4'],
  'krea-2-raw-fp8': ['krea2-raw-fp8'],
  'krea2-raw-fp8': ['krea2-raw-fp8', 'krea-2-raw-fp8'],
  'flux2-klein-9b': ['flux2-klein-9b'],
  'z-image-turbo-nvfp4': ['z-image-turbo-nsfw-nvfp4'],
  'z-image-turbo-nsfw-nvfp4': ['z-image-turbo-nsfw-nvfp4', 'z-image-turbo-nvfp4'],
  'qwen-edit-2511-fp8': ['qwen-edit-2511-fp8'],
  'ddb-edit': ['ddb-edit', 'xing0916/DDB_Edit'],
  'xing0916/DDB_Edit': ['ddb-edit', 'xing0916/DDB_Edit'],
  'huihui-vl-te-fp8': ['huihui-vl-te-fp8'],
  'qwen-image-2512-fp8': ['qwen-image-2512-fp8'],
  'layoutlmv3-base': ['layoutlmv3-base', 'microsoft/layoutlmv3-base'],
  'microsoft/layoutlmv3-base': ['layoutlmv3-base', 'microsoft/layoutlmv3-base'],
};

export function toggleIdsFor(id: string): string[] {
  return Array.from(new Set([id, ...(MODEL_ENABLE_ALIASES[id] || [])]));
}

export function isModelEnabled(enabledMap: Record<string, boolean>, id: string): boolean {
  return toggleIdsFor(id).every((k) => enabledMap[k] !== false);
}

export function rankModels<T extends ModelRankInput>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const score = (m: ModelRankInput) =>
      (m.selected ? 8 : 0) + (m.loaded ? 4 : 0) + (m.available !== false ? 2 : 0);
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}
