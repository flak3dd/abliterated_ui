import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isModelEnabled, toggleIdsFor } from '../services/modelCatalog';
import { useModelSession } from './useModelSession';
import { useStudioStore } from './useStudioStore';

const STORAGE_KEY = '@abliterated_model_enable_v1';

interface ModelEnablementState {
  enabled: Record<string, boolean>;
  hydrated: boolean;
  isEnabled: (id: string) => boolean;
  setEnabled: (id: string, on: boolean) => Promise<void>;
  loadEnabled: () => Promise<void>;
}

function persist(enabled: Record<string, boolean>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)).catch(() => {});
}

function reselectIfNeeded(id: string, on: boolean) {
  if (on) return;
  const aliases = new Set(toggleIdsFor(id));
  const session = useModelSession.getState();
  if (aliases.has(session.chat.selectedId)) {
    const next = (session.catalogs[session.route] || []).find(
      (mid) => !aliases.has(mid) && isModelEnabled(useModelEnablement.getState().enabled, mid)
    );
    if (next) session.setChatSelected(next);
  }
  const studio = useStudioStore.getState();
  if (aliases.has(studio.selectedModel)) {
    const avail = studio.modelAvailability;
    const next = Object.keys(avail).find(
      (mid) => avail[mid]?.available && !aliases.has(mid) && isModelEnabled(useModelEnablement.getState().enabled, mid)
    );
    if (next) studio.setSelectedModel(next);
  }
}

export const useModelEnablement = create<ModelEnablementState>((set, get) => ({
  enabled: {},
  hydrated: false,

  isEnabled: (id) => isModelEnabled(get().enabled, id),

  setEnabled: async (id, on) => {
    const next = { ...get().enabled };
    for (const k of toggleIdsFor(id)) next[k] = on;
    set({ enabled: next });
    persist(next);
    try {
      reselectIfNeeded(id, on);
    } catch {}
  },

  loadEnabled: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          set({ enabled: parsed, hydrated: true });
          return;
        }
      }
    } catch {}
    set({ hydrated: true });
  },
}));
