import { create } from 'zustand';
import { LibraryImage } from '../types';
import { imageLibrary, LibraryIngestInput } from '../services/imageLibrary';

interface ImageLibraryState {
  items: LibraryImage[];
  loaded: boolean;
  loadFromStorage: () => Promise<void>;
  ingest: (input: LibraryIngestInput) => Promise<LibraryImage | null>;
  toggleFavorite: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useImageLibraryStore = create<ImageLibraryState>((set, get) => ({
  items: [],
  loaded: false,

  loadFromStorage: async () => {
    const items = await imageLibrary.loadAll();
    set({ items, loaded: true });
  },

  ingest: async (input) => {
    const saved = await imageLibrary.ingest(input);
    if (!saved) return null;
    set((state) => ({
      items: [saved, ...state.items.filter((item) => item.id !== saved.id)],
    }));
    return saved;
  },

  toggleFavorite: async (id) => {
    const current = get().items.find((item) => item.id === id);
    if (!current) return;
    const favorite = !current.favorite;
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, favorite } : item)),
    }));
    await imageLibrary.toggleFavorite(id, favorite);
  },

  remove: async (id) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
    await imageLibrary.remove(id);
  },

  clear: async () => {
    set({ items: [] });
    await imageLibrary.clear();
  },
}));
