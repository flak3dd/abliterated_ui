import AsyncStorage from '@react-native-async-storage/async-storage';
import { LibraryImage, ImageLibrarySource, AspectRatioType } from '../types';
import { makeHistoryThumbnail } from './kreaService';

const DB_NAME = 'abliterated-image-library';
const STORE = 'items';
const META_KEY = 'abliterated/image-library/v1';
const MAX_ITEMS = 250;
const LIBRARY_THUMB_EDGE = 360;

export interface LibraryIngestInput {
  id: string;
  uri: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatioType;
  model: string;
  timestamp: number;
  source: ImageLibrarySource;
  seed?: number | null;
  steps?: number;
  guidanceScale?: number;
  hasMask?: boolean;
  workflow?: string;
}

interface StoredRecord {
  id: string;
  thumbUri: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatioType;
  model: string;
  timestamp: number;
  source: ImageLibrarySource;
  favorite: boolean;
  seed?: number | null;
  steps?: number;
  guidanceScale?: number;
  hasMask?: boolean;
  workflow?: string;
  blob?: Blob;
  uri?: string;
}

const objectUrls = new Map<string, string>();

function canUseIdb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function revokeUrl(id: string) {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
}

function uriFromRecord(rec: StoredRecord): string {
  if (rec.blob && typeof URL !== 'undefined' && URL.createObjectURL) {
    const existing = objectUrls.get(rec.id);
    if (existing) return existing;
    const url = URL.createObjectURL(rec.blob);
    objectUrls.set(rec.id, url);
    return url;
  }
  return rec.uri || rec.thumbUri;
}

function toLibraryImage(rec: StoredRecord): LibraryImage {
  return {
    id: rec.id,
    uri: uriFromRecord(rec),
    thumbUri: rec.thumbUri || uriFromRecord(rec),
    prompt: rec.prompt,
    negativePrompt: rec.negativePrompt,
    aspectRatio: rec.aspectRatio,
    model: rec.model,
    timestamp: rec.timestamp,
    source: rec.source,
    favorite: Boolean(rec.favorite),
    seed: rec.seed,
    steps: rec.steps,
    guidanceScale: rec.guidanceScale,
    hasMask: rec.hasMask,
    workflow: rec.workflow,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dataUrlToBlob(uri: string): Promise<Blob | null> {
  if (!uri) return null;
  try {
    const res = await fetch(uri);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

async function loadFromIdb(): Promise<LibraryImage[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const rows = (await idbReq(store.getAll())) as StoredRecord[];
  db.close();
  return (rows || [])
    .map(toLibraryImage)
    .sort((a, b) => b.timestamp - a.timestamp);
}

async function putIdb(rec: StoredRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).put(rec));
  db.close();
}

async function deleteIdb(id: string): Promise<void> {
  revokeUrl(id);
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).delete(id));
  db.close();
}

async function clearIdb(): Promise<void> {
  for (const id of Array.from(objectUrls.keys())) revokeUrl(id);
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbReq(tx.objectStore(STORE).clear());
  db.close();
}

async function loadFromAsync(): Promise<LibraryImage[]> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return [];
  const rows = JSON.parse(raw) as StoredRecord[];
  return (rows || [])
    .map(toLibraryImage)
    .sort((a, b) => b.timestamp - a.timestamp);
}

async function saveAsync(items: LibraryImage[]): Promise<void> {
  const compact = items.slice(0, 40).map((item) => ({
    ...item,
    uri: item.uri?.startsWith('data:') && item.uri.length > 180000 ? undefined : item.uri,
    blob: undefined,
  }));
  await AsyncStorage.setItem(META_KEY, JSON.stringify(compact));
}

export const imageLibrary = {
  async loadAll(): Promise<LibraryImage[]> {
    try {
      if (canUseIdb()) return await loadFromIdb();
    } catch (e) {
      console.warn('[imageLibrary] IndexedDB load failed', e);
    }
    try {
      return await loadFromAsync();
    } catch (e) {
      console.warn('[imageLibrary] AsyncStorage load failed', e);
      return [];
    }
  },

  async ingest(input: LibraryIngestInput): Promise<LibraryImage | null> {
    if (!input.uri || input.uri.length < 32) return null;
    const thumbUri =
      (await makeHistoryThumbnail(input.uri, LIBRARY_THUMB_EDGE)) || input.uri;
    const rec: StoredRecord = {
      id: input.id,
      thumbUri,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio,
      model: input.model,
      timestamp: input.timestamp,
      source: input.source,
      favorite: false,
      seed: input.seed,
      steps: input.steps,
      guidanceScale: input.guidanceScale,
      hasMask: input.hasMask,
      workflow: input.workflow,
    };

    try {
      if (canUseIdb()) {
        const blob = await dataUrlToBlob(input.uri);
        if (blob) rec.blob = blob;
        else rec.uri = input.uri;
        await putIdb(rec);
        await evictIfNeeded();
        return toLibraryImage(rec);
      }
    } catch (e) {
      console.warn('[imageLibrary] IndexedDB ingest failed', e);
    }

    rec.uri = input.uri;
    const existing = await loadFromAsync();
    const next = [toLibraryImage(rec), ...existing.filter((x) => x.id !== rec.id)].slice(0, 40);
    await saveAsync(next);
    return next[0];
  },

  async toggleFavorite(id: string, favorite: boolean): Promise<void> {
    try {
      if (canUseIdb()) {
        const db = await openDb();
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const rec = (await idbReq(store.get(id))) as StoredRecord | undefined;
        if (rec) {
          rec.favorite = favorite;
          await idbReq(store.put(rec));
        }
        db.close();
        return;
      }
    } catch (e) {
      console.warn('[imageLibrary] favorite idb failed', e);
    }
    const items = await loadFromAsync();
    await saveAsync(items.map((item) => (item.id === id ? { ...item, favorite } : item)));
  },

  async remove(id: string): Promise<void> {
    try {
      if (canUseIdb()) {
        await deleteIdb(id);
        return;
      }
    } catch (e) {
      console.warn('[imageLibrary] delete idb failed', e);
    }
    const items = await loadFromAsync();
    await saveAsync(items.filter((item) => item.id !== id));
  },

  async clear(): Promise<void> {
    try {
      if (canUseIdb()) {
        await clearIdb();
        return;
      }
    } catch (e) {
      console.warn('[imageLibrary] clear idb failed', e);
    }
    await AsyncStorage.removeItem(META_KEY);
  },
};

async function evictIfNeeded() {
  const items = await loadFromIdb();
  if (items.length <= MAX_ITEMS) return;
  const extras = items
    .filter((item) => !item.favorite)
    .slice(MAX_ITEMS - items.filter((i) => i.favorite).length);
  const overflow = items.length - MAX_ITEMS;
  const toDrop = extras.slice(-Math.max(0, overflow));
  for (const item of toDrop) {
    await deleteIdb(item.id);
  }
}
