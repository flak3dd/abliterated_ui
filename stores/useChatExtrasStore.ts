import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PINS_KEY = '@abliterated_pinned_files_v1';

type State = {
  /** sessionId -> pinned relative paths */
  pinnedBySession: Record<string, string[]>;
  searchQuery: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  togglePin: (sessionId: string, path: string) => void;
  getPins: (sessionId: string) => string[];
  estimateTokens: (text: string) => number;
};

function persist(pins: Record<string, string[]>) {
  AsyncStorage.setItem(PINS_KEY, JSON.stringify(pins)).catch(() => {});
}

export const useChatExtrasStore = create<State>((set, get) => ({
  pinnedBySession: {},
  searchQuery: '',
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(PINS_KEY);
      if (raw) set({ pinnedBySession: JSON.parse(raw), hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  togglePin: (sessionId, path) => {
    const cur = get().pinnedBySession[sessionId] || [];
    const next = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path].slice(0, 24);
    const pinnedBySession = { ...get().pinnedBySession, [sessionId]: next };
    set({ pinnedBySession });
    persist(pinnedBySession);
  },

  getPins: (sessionId) => get().pinnedBySession[sessionId] || [],

  /** Rough chars/4 estimator for UI meter only */
  estimateTokens: (text) => Math.ceil(String(text || '').length / 4),
}));
