import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RagCitation, SessionEnvironment } from '../types';
import {
  RagChunk,
  RagDocument,
  RagHit,
  RagSourceKind,
  buildChunks,
  formatRagContext,
  hashContent,
  hitsToCitations,
  retrieveChunks,
  upsertDocument,
} from '../services/ragService';
import { KNOWLEDGE_DATASET, KNOWLEDGE_DATASET_VERSION } from '../services/ragDataset';

const STORAGE_KEY = '@spark_rag_index_v1';
const LEGACY_SEED_IDS = new Set(['seed_spark_cluster_2026']);

interface RagState {
  enabled: boolean;
  ready: boolean;
  documents: RagDocument[];
  chunks: RagChunk[];
  lastIndexedAt: number | null;
  lastQueryHits: RagHit[];
  datasetVersion: string;
  sandboxFingerprints: Record<string, string>;

  loadFromStorage: () => Promise<void>;
  persist: () => Promise<void>;
  reloadSeedDataset: () => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  ingestText: (opts: {
    title: string;
    content: string;
    source?: RagSourceKind;
    path?: string;
    id?: string;
    envId?: string;
  }) => void;
  ingestEnvironment: (env: SessionEnvironment | null) => void;
  removeDocument: (id: string) => void;
  clearUploads: () => void;
  reindex: () => void;
  retrieve: (query: string, k?: number) => RagHit[];
  contextForQuery: (query: string, k?: number) => {
    context: string;
    citations: RagCitation[];
    hits: RagHit[];
  };
}

function seedDocuments(): RagDocument[] {
  return KNOWLEDGE_DATASET.map((record) => ({
    id: record.id,
    title: record.title,
    path: record.path,
    content: record.content,
    source: 'seed' as const,
    updatedAt: Date.now(),
    contentHash: hashContent(record.content),
  }));
}

function envFingerprint(env: SessionEnvironment): string {
  return Object.values(env.files || {})
    .filter((file) => {
      if (!file?.content || !file.path || file.content.length < 8) return false;
      if (file.content.startsWith('data:')) return false;
      if (/^image\//i.test(file.language || '')) return false;
      if (/\.(png|jpe?g|gif|webp|svg|ico|bin|woff2?|ttf)$/i.test(file.path)) return false;
      return true;
    })
    .map((file) => file.path + ':' + hashContent(file.content))
    .sort()
    .join('|');
}

function mergeSeeds(documents: RagDocument[]): RagDocument[] {
  const seeds = seedDocuments();
  const seedIds = new Set(seeds.map((s) => s.id));
  const byId = new Map<string, RagDocument>();
  for (const doc of documents) {
    if (doc.source === 'seed' && (LEGACY_SEED_IDS.has(doc.id) || !seedIds.has(doc.id))) {
      continue;
    }
    byId.set(doc.id, doc);
  }
  for (const seed of seeds) {
    const existing = byId.get(seed.id);
    if (!existing || existing.contentHash !== seed.contentHash) {
      byId.set(seed.id, seed);
    }
  }
  return [...byId.values()];
}

function rebuild(
  documents: RagDocument[]
): Pick<RagState, 'documents' | 'chunks' | 'lastIndexedAt' | 'datasetVersion'> {
  const merged = mergeSeeds(documents);
  return {
    documents: merged,
    chunks: buildChunks(merged),
    lastIndexedAt: Date.now(),
    datasetVersion: KNOWLEDGE_DATASET_VERSION,
  };
}

export const useRagStore = create<RagState>((set, get) => ({
  enabled: true,
  ready: false,
  documents: [],
  chunks: [],
  lastIndexedAt: null,
  lastQueryHits: [],
  datasetVersion: KNOWLEDGE_DATASET_VERSION,
  sandboxFingerprints: {},

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          enabled?: boolean;
          documents?: RagDocument[];
        };
        const docs = Array.isArray(parsed.documents) ? parsed.documents : [];
        set({
          enabled: parsed.enabled !== false,
          ready: true,
          ...rebuild(docs),
        });
        void get().persist();
        return;
      }
    } catch (e) {
      console.warn('[rag] Failed to load index:', e);
    }
    set({
      enabled: true,
      ready: true,
      ...rebuild([]),
    });
    void get().persist();
  },

  reloadSeedDataset: () => {
    const kept = get().documents.filter((d) => d.source !== 'seed');
    set({ ...rebuild(kept) });
    void get().persist();
  },

  persist: async () => {
    const { enabled, documents } = get();
    const slim = documents.map(({ id, title, path, content, source, envId, updatedAt, contentHash }) => ({
      id,
      title,
      path,
      content,
      source,
      envId,
      updatedAt,
      contentHash,
    }));
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled, documents: slim })
      );
    } catch (e) {
      console.warn('[rag] Failed to persist index:', e);
    }
  },

  setEnabled: (enabled) => {
    set({ enabled });
    void get().persist();
  },

  toggleEnabled: () => {
    set((s) => ({ enabled: !s.enabled }));
    void get().persist();
  },

  ingestText: ({ title, content, source = 'paste', path, id, envId }) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    const docId = id || source + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const next = upsertDocument(get().documents, {
      id: docId,
      title: title.trim() || path || 'Untitled note',
      path,
      content: trimmed,
      source,
      envId,
      updatedAt: Date.now(),
    });
    set({ ...rebuild(next) });
    void get().persist();
  },

  ingestEnvironment: (env) => {
    if (!env) return;
    const fp = envFingerprint(env);
    if (get().sandboxFingerprints[env.id] === fp) return;

    let docs = get().documents.filter(
      (d) => !(d.source === 'sandbox' && d.envId === env.id)
    );
    const files = Object.values(env.files || {});
    for (const file of files) {
      if (!file?.content || !file.path) continue;
      if (file.content.length < 8) continue;
      if (file.content.startsWith('data:')) continue;
      if (/^image\//i.test(file.language || '')) continue;
      if (/\.(png|jpe?g|gif|webp|svg|ico|bin|woff2?|ttf)$/i.test(file.path)) continue;
      docs = upsertDocument(docs, {
        id: 'sandbox:' + env.id + ':' + file.path,
        title: file.path,
        path: file.path,
        content: file.content,
        source: 'sandbox',
        envId: env.id,
        updatedAt: file.updatedAt || Date.now(),
      });
    }
    set({
      ...rebuild(docs),
      sandboxFingerprints: { ...get().sandboxFingerprints, [env.id]: fp },
    });
    void get().persist();
  },

  removeDocument: (id) => {
    const target = get().documents.find((d) => d.id === id);
    if (!target || target.source === 'seed') return;
    const fingerprints = { ...get().sandboxFingerprints };
    if (target.envId) delete fingerprints[target.envId];
    set({
      ...rebuild(get().documents.filter((d) => d.id !== id)),
      sandboxFingerprints: fingerprints,
    });
    void get().persist();
  },

  clearUploads: () => {
    set({
      ...rebuild(get().documents.filter((d) => d.source === 'seed' || d.source === 'sandbox')),
    });
    void get().persist();
  },

  reindex: () => {
    set({ ...rebuild(get().documents) });
    void get().persist();
  },

  retrieve: (query, k = 6) => {
    const hits = retrieveChunks(get().chunks, query, k);
    set({ lastQueryHits: hits });
    return hits;
  },

  contextForQuery: (query, k = 6) => {
    const hits = get().retrieve(query, k);
    return {
      context: formatRagContext(hits),
      citations: hitsToCitations(hits),
      hits,
    };
  },
}));
