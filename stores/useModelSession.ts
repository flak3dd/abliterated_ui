import { create } from 'zustand';
import { compactCatalog, resolveChatModel, routeFromHost, type ModelRoute } from '../services/modelResolve';

export type ModelLaneState = 'idle' | 'probing' | 'warming' | 'ready' | 'busy' | 'error' | 'unavailable';

export interface LaneStatus {
  selectedId: string;
  servingId: string | null;
  state: ModelLaneState;
  reason: string | null;
}

interface ModelSessionState {
  route: ModelRoute;
  chat: LaneStatus;
  image: LaneStatus;
  catalogs: Record<ModelRoute, string[]>;
  setRoute: (route: ModelRoute) => void;
  setChatCatalog: (route: ModelRoute, ids: string[]) => void;
  setChatSelected: (id: string) => void;
  setChatServing: (id: string | null, state?: ModelLaneState, reason?: string | null) => void;
  setImageSelected: (id: string, unavailableReason?: string | null) => void;
  setImageServing: (id: string | null, state?: ModelLaneState, reason?: string | null) => void;
  setImageBusy: (busy: boolean) => void;
  resolvedChatId: () => string;
}

const emptyLane = (id: string): LaneStatus => ({
  selectedId: id,
  servingId: null,
  state: 'idle',
  reason: null,
});

export const useModelSession = create<ModelSessionState>((set, get) => ({
  route: 'spark',
  chat: emptyLane('qwen-abliterated'),
  image: emptyLane('krea2-raw-fp8'),
  catalogs: { spark: [], featherless: [], abliteration: [] },

  setRoute: (route) => {
    const chatId = resolveChatModel(route, get().catalogs[route], get().chat.selectedId).id;
    set({
      route,
      chat: {
        ...get().chat,
        selectedId: chatId || get().chat.selectedId,
        reason: chatId ? get().chat.reason : 'pick a cloud model',
      },
    });
  },

  setChatCatalog: (route, ids) => {
    const compact = compactCatalog(ids, route);
    const catalogs = { ...get().catalogs, [route]: compact };
    const resolved = resolveChatModel(route, compact, get().chat.selectedId);
    set({
      catalogs,
      ...(get().route === route
        ? {
            chat: {
              ...get().chat,
              selectedId: resolved.id || get().chat.selectedId,
              servingId: resolved.id || get().chat.servingId,
              state: resolved.id ? 'ready' : 'unavailable',
              reason: resolved.reason,
            },
          }
        : {}),
    });
  },

  setChatSelected: (id) => {
    const resolved = resolveChatModel(get().route, get().catalogs[get().route], id);
    set({
      chat: {
        selectedId: resolved.id || id,
        servingId: resolved.id || null,
        state: resolved.id ? 'ready' : 'unavailable',
        reason: resolved.reason,
      },
    });
  },

  setChatServing: (id, state = 'ready', reason = null) => {
    set({
      chat: {
        ...get().chat,
        servingId: id,
        state,
        reason,
      },
    });
  },

  setImageSelected: (id, unavailableReason = null) => {
    set({
      image: {
        selectedId: id,
        servingId: get().image.servingId,
        state: unavailableReason ? 'unavailable' : 'idle',
        reason: unavailableReason,
      },
    });
  },

  setImageServing: (id, state = 'ready', reason = null) => {
    set({
      image: {
        ...get().image,
        servingId: id,
        selectedId: id || get().image.selectedId,
        state,
        reason,
      },
    });
  },

  setImageBusy: (busy) => {
    const img = get().image;
    if (img.state === 'unavailable') return;
    set({
      image: { ...img, state: busy ? 'busy' : img.servingId ? 'ready' : 'idle' },
    });
  },

  resolvedChatId: () => {
    const { route, catalogs, chat } = get();
    return resolveChatModel(route, catalogs[route], chat.selectedId).id;
  },
}));
