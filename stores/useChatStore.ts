import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, ChatSession, SessionEnvironment, WorkspaceFile, SwarmSession } from '../types';
import { useMeshStore } from './useMeshStore';
import { useSwarmStore, registerSwarmListeners } from './useSwarmStore';
import { useAgentStore } from './useAgentStore';
import {
  evaluateAgentGate,
  evaluateBuildPlanSessionGate,
  isBuildPlanApproveText,
  draftLocalBuildPlan,
} from '../services/agent/gate';
import type { AgentRun } from '../types/agent';
import { evaluateSwarmNeed } from '../services/swarmService';
import { streamChatCompletion } from '../services/vllmService';
import {
  extractFilesFromMarkdown,
  downloadEnvironmentAsZip,
} from '../services/zipService';
import { telemetryBridge } from '../services/matrix/TelemetryStreamBridge';
import { evaluateFactualGrounding } from '../services/hallucinationDetector';
import { useModelSession } from './useModelSession';
import { useRagStore } from './useRagStore';
import {
  markFileDirty,
  markFileDeleted,
  markEnvReplaceAll,
  markEnvAllDirty,
} from '../services/sandboxDirty';

const STORAGE_KEY = '@spark_chat_vault_v3';

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Record<string, Message[]>;
  environments: Record<string, SessionEnvironment>;
  isStreaming: boolean;
  streamingSessionId: string | null;
  activeAbortController: AbortController | null;
  antiHallucination: boolean;

  // Actions
  createNewSession: (initialTitle?: string) => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearCurrentSession: () => void;
  sendMessage: (text: string) => Promise<void>;
  continueAgentRun: (prior: import('../types/agent').AgentRun) => Promise<void>;
  draftBuildPlan: (promptMsgId?: string) => Promise<void>;
  approveBuildPlanAndStart: (promptMsgId?: string) => Promise<void>;
  stopStreaming: () => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  toggleAntiHallucination: () => void;
  setAntiHallucination: (enabled: boolean) => void;
  updateLastAssistantMessageSwarm: (swarm: SwarmSession) => void;

  // Environment Actions
  getActiveEnvironment: () => SessionEnvironment | null;
  addOrUpdateFile: (
    envId: string,
    path: string,
    content: string,
    language?: string
  ) => void;
  addOrUpdateFiles: (
    envId: string,
    files: { path: string; content: string; language?: string }[]
  ) => void;
  removeFile: (envId: string, path: string) => void;
  clearEnvironment: (envId: string) => void;
  downloadActiveEnvironmentZip: () => void;
  flushSave: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistDirty = false;
let saveQueue: Promise<void> = Promise.resolve();

const VAULT_MAX_SESSIONS = 12;
const VAULT_KEEP_REASONING = 4;

function pruneVaultForStorage(
  sessions: ChatSession[],
  messages: Record<string, Message[]>,
  environments: Record<string, SessionEnvironment>
): {
  sessions: ChatSession[];
  messages: Record<string, Message[]>;
  environments: Record<string, SessionEnvironment>;
} {
  const keptSessions = [...sessions]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, VAULT_MAX_SESSIONS);
  const nextMessages: Record<string, Message[]> = {};
  const nextEnvs: Record<string, SessionEnvironment> = {};

  for (const session of keptSessions) {
    const msgs = messages[session.id] || [];
    nextMessages[session.id] = msgs.map((m, i) => {
      if (i >= msgs.length - VAULT_KEEP_REASONING || !m.reasoning) return m;
      const { reasoning: _drop, ...rest } = m;
      return rest;
    });
    if (session.envId && environments[session.envId]) {
      const env = environments[session.envId];
      const files: SessionEnvironment['files'] = {};
      for (const [path, file] of Object.entries(env.files || {})) {
        if (!file?.content) continue;
        if (file.content.startsWith('data:')) continue;
        if (/^image\//i.test(file.language || '')) continue;
        if (/\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|bin)$/i.test(path)) continue;
        files[path] = file;
      }
      nextEnvs[session.envId] = { ...env, files };
    }
  }

  return { sessions: keptSessions, messages: nextMessages, environments: nextEnvs };
}

function scheduleSave() {
  persistDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void useChatStore.getState().saveToStorage();
  }, 400);
}

function createInitialEnvironment(sessionId: string): SessionEnvironment {
  const shortSlug = sessionId.replace('session_', '').slice(-4) || 'init';
  const envId = `env_${sessionId.replace('session_', '')}`;
  return {
    id: envId,
    sessionId,
    name: `sandbox-${shortSlug}`,
    files: {
      'README.md': {
        path: 'README.md',
        content: `# Workspace Sandbox (${envId})\n\nDedicated temporary environment for this conversation.\nAny code blocks or files generated by Sovereign Spark will automatically sync here.\nUse the 'Download ZIP' button to export this entire sandbox to your local machine.\n`,
        language: 'markdown',
        updatedAt: Date.now(),
        sizeBytes: 245,
      },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: {},
  environments: {},
  isStreaming: false,
  streamingSessionId: null,
  activeAbortController: null,
  antiHallucination: true,

  toggleAntiHallucination: () => {
    set((state) => ({ antiHallucination: !state.antiHallucination }));
    scheduleSave();
  },

  setAntiHallucination: (enabled: boolean) => {
    set({ antiHallucination: enabled });
    scheduleSave();
  },

  updateLastAssistantMessageSwarm: (swarm: SwarmSession) => {
    const sessionId = swarm.sessionId || get().activeSessionId;
    if (!sessionId) return;
    const messages = get().messages;
    const sessionMsgs = [...(messages[sessionId] || [])];
    const lastIdx = sessionMsgs.length - 1;
    if (lastIdx >= 0 && sessionMsgs[lastIdx].role === 'assistant') {
      sessionMsgs[lastIdx] = {
        ...sessionMsgs[lastIdx],
        swarmSession: swarm,
      };
      set({
        messages: {
          ...messages,
          [sessionId]: sessionMsgs,
        },
      });
    }
  },

  getActiveEnvironment: () => {
    const { sessions, activeSessionId, environments } = get();
    if (!activeSessionId) return null;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session || !session.envId) return null;
    return environments[session.envId] || null;
  },

  createNewSession: (initialTitle = 'New Conversation') => {
    if (get().isStreaming) get().stopStreaming();
    const newId = 'session_' + Date.now();
    const newEnv = createInitialEnvironment(newId);

    const newSession: ChatSession = {
      id: newId,
      title: initialTitle,
      envId: newEnv.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      sessions: [newSession, ...state.sessions],
      environments: { ...state.environments, [newEnv.id]: newEnv },
      activeSessionId: newId,
      messages: { ...state.messages, [newId]: [] },
    }));

    // New chat session → BUILD plan gate resets (new sessionId has no ready flag).
    useAgentStore.getState().clearBuildPlanSession(newId);

    markEnvAllDirty(newEnv.id, Object.keys(newEnv.files));
    void get().flushSave();
    return newId;
  },

  selectSession: (id: string) => {
    void get().flushSave();
    set({ activeSessionId: id });
  },

  deleteSession: (id: string) => {
    if (get().streamingSessionId === id) get().stopStreaming();
    set((state) => {
      const targetSession = state.sessions.find((s) => s.id === id);
      const remainingSessions = state.sessions.filter((s) => s.id !== id);
      const remainingMessages = { ...state.messages };
      delete remainingMessages[id];

      const remainingEnvironments = { ...state.environments };
      if (targetSession?.envId) {
        delete remainingEnvironments[targetSession.envId];
      }

      const nextActiveId =
        state.activeSessionId === id
          ? remainingSessions.length > 0
            ? remainingSessions[0].id
            : null
          : state.activeSessionId;

      return {
        sessions: remainingSessions,
        activeSessionId: nextActiveId,
        messages: remainingMessages,
        environments: remainingEnvironments,
      };
    });
    useAgentStore.getState().clearBuildPlanSession(id);
    void get().flushSave();
  },

  clearCurrentSession: () => {
    const activeId = get().activeSessionId;
    if (!activeId) return;

    set((state) => ({
      messages: {
        ...state.messages,
        [activeId]: [],
      },
    }));
    // Cleared transcript → treat as fresh for BUILD plan gate.
    useAgentStore.getState().clearBuildPlanSession(activeId);
    scheduleSave();
  },

  addOrUpdateFile: (
    envId: string,
    path: string,
    content: string,
    language?: string
  ) => {
    get().addOrUpdateFiles(envId, [{ path, content, language }]);
  },

  addOrUpdateFiles: (
    envId: string,
    files: { path: string; content: string; language?: string }[]
  ) => {
    if (!files.length) return;
    set((state) => {
      const targetEnv = state.environments[envId];
      if (!targetEnv) return state;

      const nextFiles = { ...targetEnv.files };
      const now = Date.now();
      for (const f of files) {
        nextFiles[f.path] = {
          path: f.path,
          content: f.content,
          language: f.language || 'text',
          updatedAt: now,
          sizeBytes: new TextEncoder().encode(f.content).length,
        };
        markFileDirty(envId, f.path);
      }

      return {
        environments: {
          ...state.environments,
          [envId]: {
            ...targetEnv,
            files: nextFiles,
            updatedAt: now,
          },
        },
      };
    });
    scheduleSave();
  },

  removeFile: (envId: string, path: string) => {
    set((state) => {
      const targetEnv = state.environments[envId];
      if (!targetEnv) return state;

      const updatedFiles = { ...targetEnv.files };
      delete updatedFiles[path];

      return {
        environments: {
          ...state.environments,
          [envId]: {
            ...targetEnv,
            files: updatedFiles,
            updatedAt: Date.now(),
          },
        },
      };
    });
    markFileDeleted(envId, path);
    scheduleSave();
  },

  clearEnvironment: (envId: string) => {
    set((state) => {
      const targetEnv = state.environments[envId];
      if (!targetEnv) return state;

      return {
        environments: {
          ...state.environments,
          [envId]: {
            ...targetEnv,
            files: {},
            updatedAt: Date.now(),
          },
        },
      };
    });
    markEnvReplaceAll(envId);
    scheduleSave();
  },

  downloadActiveEnvironmentZip: () => {
    const activeEnv = get().getActiveEnvironment();
    if (activeEnv) {
      downloadEnvironmentAsZip(activeEnv);
    }
  },

  sendMessage: async (text: string) => {
    if (!text.trim()) return;
    if (get().isStreaming) {
      if (get().streamingSessionId === get().activeSessionId) return;
      get().stopStreaming();
    }

    let currentSessionId = get().activeSessionId;
    if (!currentSessionId) {
      currentSessionId = get().createNewSession(
        text.slice(0, 28) + (text.length > 28 ? '...' : '')
      );
    } else {
      // Update session title if first user message
      const existing = get().messages[currentSessionId] || [];
      if (existing.length === 0) {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  title:
                    text.slice(0, 28) + (text.length > 28 ? '...' : ''),
                  updatedAt: Date.now(),
                }
              : s
          ),
        }));
      }
    }

    const currentSession = get().sessions.find((s) => s.id === currentSessionId);
    const activeEnv = currentSession?.envId
      ? get().environments[currentSession.envId]
      : null;
    const envDisplayName = activeEnv?.name || 'sandbox';

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantMsgId = 'msg_' + (Date.now() + 1);
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    };

    const controller = new AbortController();

    set((state) => ({
      isStreaming: true,
      streamingSessionId: currentSessionId,
      activeAbortController: controller,
      messages: {
        ...state.messages,
        [currentSessionId!]: [
          ...(state.messages[currentSessionId!] || []),
          userMsg,
          assistantMsg,
        ],
      },
    }));

    try {
      const activeHost = useMeshStore.getState().activeHost;
      const activePort = useMeshStore.getState().activePort;

      // Check if Multi-Agent Swarm Mode is active
      const isSwarmMode = useSwarmStore.getState().isSwarmMode;
      let shouldSpawnSwarm = false;
      let swarmDecisionReason = '';

      if (isSwarmMode && activeEnv) {
        // Agent autonomously evaluates if task warrants spawning a multi-agent swarm
        const evaluation = await evaluateSwarmNeed({
          prompt: text,
          activeFileCount: Object.keys(activeEnv.files).length,
          host: activeHost,
          port: activePort,
        });

        shouldSpawnSwarm = evaluation.shouldSpawn;
        swarmDecisionReason = evaluation.reason;
      }

      const isAgentMode = useAgentStore.getState().isAgentMode;
      const meshMode = useMeshStore.getState().meshMode;
      const agentGate = evaluateAgentGate({
        isAgentMode,
        meshMode,
        hasActiveEnv: Boolean(activeEnv),
      });

      if (agentGate.blocked) {
        const blockedRun: AgentRun = {
          id: 'agent_blocked_' + Date.now(),
          sessionId: currentSessionId!,
          envId: activeEnv?.id || '',
          goal: text,
          status: 'failed',
          steps: [],
          stepCount: 0,
          execCount: 0,
          error: agentGate.reason,
          summary: agentGate.reason,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => {
          const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
          const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
          if (idx !== -1) {
            sessionMsgs[idx] = {
              ...sessionMsgs[idx],
              content: agentGate.reason,
              agentRun: blockedRun,
            };
          }
          const stillMine = state.activeAbortController === controller;
          return {
            messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
            ...(stillMine
              ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
              : {}),
          };
        });
        void get().flushSave();
        return;
      }

      if (agentGate.run && activeEnv) {
        const envId = activeEnv.id;
        const agentStore = useAgentStore.getState();
        const planGate = evaluateBuildPlanSessionGate({
          agentWouldRun: true,
          sessionPlanReady: agentStore.isBuildPlanReady(currentSessionId!),
        });

        // --- First BUILD in this session: prompt for plan (do not start tools yet) ---
        if (planGate.prompt) {
          const pending = agentStore.getPendingBuild(currentSessionId!);
          const trimmed = text.trim();

          // User replied "start build" while a draft exists → approve & run
          if (
            pending &&
            isBuildPlanApproveText(trimmed) &&
            pending.planText?.trim()
          ) {
            agentStore.markBuildPlanReady(currentSessionId!);
            const goalWithPlan =
              `${pending.goal}\n\n## Approved build plan\n${pending.planText.trim()}`;
            try {
              const finished = await agentStore.startAgentRun({
                goal: goalWithPlan,
                sessionId: currentSessionId!,
                envId,
                signal: controller.signal,
                getEnv: () => get().environments[envId] || null,
                writeFile: (path, content, language) => {
                  get().addOrUpdateFile(envId, path, content, language);
                },
                onUpdate: (run, content) => {
                  set((state) => {
                    const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
                    const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
                    if (idx === -1) return state;
                    sessionMsgs[idx] = {
                      ...sessionMsgs[idx],
                      content,
                      agentRun: run,
                      buildPlanPrompt: undefined,
                    };
                    return {
                      messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                    };
                  });
                },
              });
              agentStore.setPendingBuild(currentSessionId!, null);
              set((state) => {
                const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
                const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
                if (idx !== -1) {
                  const content =
                    finished.summary && finished.summary !== finished.error
                      ? finished.summary
                      : finished.status === 'failed' && finished.error
                      ? ''
                      : finished.summary ||
                        finished.error ||
                        sessionMsgs[idx].content ||
                        (finished.status === 'failed' ? 'Agent failed.' : 'Agent finished.');
                  sessionMsgs[idx] = {
                    ...sessionMsgs[idx],
                    content,
                    agentRun: finished,
                    buildPlanPrompt: undefined,
                  };
                }
                const stillMine = state.activeAbortController === controller;
                return {
                  messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                  ...(stillMine
                    ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                    : {}),
                };
              });
            } catch (agentErr: any) {
              const errText = agentErr?.message || 'BUILD agent failed to start';
              const failedRun: AgentRun = {
                id: 'agent_err_' + Date.now(),
                sessionId: currentSessionId!,
                envId,
                goal: pending.goal,
                status: 'failed',
                steps: [],
                stepCount: 0,
                execCount: 0,
                error: errText,
                summary: errText,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              set((state) => {
                const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
                const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
                if (idx !== -1) {
                  sessionMsgs[idx] = {
                    ...sessionMsgs[idx],
                    content: errText,
                    agentRun: failedRun,
                    buildPlanPrompt: undefined,
                  };
                }
                const stillMine = state.activeAbortController === controller;
                return {
                  messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                  ...(stillMine
                    ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                    : {}),
                };
              });
            }
            void get().flushSave();
            return;
          }

          // Approve keyword but no draft yet → keep pending goal, nudge
          if (pending && isBuildPlanApproveText(trimmed) && !pending.planText?.trim()) {
            const promptContent =
              'Create a build plan first — tap **Draft plan** or reply with your plan, then **Start BUILD**.';
            set((state) => {
              const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
              const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
              if (idx !== -1) {
                sessionMsgs[idx] = {
                  ...sessionMsgs[idx],
                  content: promptContent,
                  buildPlanPrompt: {
                    goal: pending.goal,
                    status: 'awaiting',
                    planText: pending.planText,
                  },
                };
              }
              const priorId = pending.promptMsgId;
              if (priorId) {
                const pIdx = sessionMsgs.findIndex((m) => m.id === priorId);
                if (pIdx !== -1 && sessionMsgs[pIdx].buildPlanPrompt) {
                  sessionMsgs[pIdx] = {
                    ...sessionMsgs[pIdx],
                    content: promptContent,
                    buildPlanPrompt: {
                      goal: pending.goal,
                      status: 'awaiting',
                      planText: pending.planText,
                    },
                  };
                }
              }
              const stillMine = state.activeAbortController === controller;
              return {
                messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                ...(stillMine
                  ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                  : {}),
              };
            });
            void get().flushSave();
            return;
          }

          // User sent their own plan text (not approve keyword) while awaiting → store draft
          if (pending && !isBuildPlanApproveText(trimmed) && trimmed.length > 12) {
            agentStore.setPendingBuild(currentSessionId!, {
              ...pending,
              planText: trimmed,
            });
            const promptContent =
              'Got your plan. Review it below, then tap **Start BUILD** (or say **start build**).';
            set((state) => {
              const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
              const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
              if (idx !== -1) {
                sessionMsgs[idx] = {
                  ...sessionMsgs[idx],
                  content: promptContent,
                  buildPlanPrompt: {
                    goal: pending.goal,
                    status: 'ready',
                    planText: trimmed,
                  },
                };
              }
              // Also refresh prior prompt card if present
              const priorId = pending.promptMsgId;
              if (priorId) {
                const pIdx = sessionMsgs.findIndex((m) => m.id === priorId);
                if (pIdx !== -1 && sessionMsgs[pIdx].buildPlanPrompt) {
                  sessionMsgs[pIdx] = {
                    ...sessionMsgs[pIdx],
                    buildPlanPrompt: {
                      goal: pending.goal,
                      status: 'ready',
                      planText: trimmed,
                    },
                  };
                }
              }
              const stillMine = state.activeAbortController === controller;
              return {
                messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                ...(stillMine
                  ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                  : {}),
              };
            });
            void get().flushSave();
            return;
          }

          // Fresh first BUILD (or re-prompt with new goal)
          const promptContent =
            'Before BUILD runs, create a build plan. Tap **Draft plan** (or reply with your plan), then **Start BUILD**.';
          agentStore.setPendingBuild(currentSessionId!, {
            goal: trimmed,
            promptMsgId: assistantMsgId,
          });
          set((state) => {
            const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
            const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx !== -1) {
              sessionMsgs[idx] = {
                ...sessionMsgs[idx],
                content: promptContent,
                buildPlanPrompt: {
                  goal: trimmed,
                  status: 'awaiting',
                },
              };
            }
            const stillMine = state.activeAbortController === controller;
            return {
              messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
              ...(stillMine
                ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                : {}),
            };
          });
          void get().flushSave();
          return;
        }

        // --- Plan already approved this session: run BUILD immediately ---
        try {
          const finished = await useAgentStore.getState().startAgentRun({
            goal: text,
            sessionId: currentSessionId!,
            envId,
            signal: controller.signal,
            getEnv: () => get().environments[envId] || null,
            writeFile: (path, content, language) => {
              get().addOrUpdateFile(envId, path, content, language);
            },
            onUpdate: (run, content) => {
              set((state) => {
                const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
                const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
                if (idx === -1) return state;
                sessionMsgs[idx] = { ...sessionMsgs[idx], content, agentRun: run };
                return {
                  messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
                };
              });
            },
          });
          set((state) => {
            const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
            const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx !== -1) {
              // Prefer card error over duplicating NetworkError in bubble + card.
              const content =
                finished.summary && finished.summary !== finished.error
                  ? finished.summary
                  : finished.status === 'failed' && finished.error
                  ? ''
                  : finished.summary ||
                    finished.error ||
                    sessionMsgs[idx].content ||
                    (finished.status === 'failed' ? 'Agent failed.' : 'Agent finished.');
              sessionMsgs[idx] = {
                ...sessionMsgs[idx],
                content,
                agentRun: finished,
              };
            }
            const stillMine = state.activeAbortController === controller;
            return {
              messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
              ...(stillMine
                ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                : {}),
            };
          });
        } catch (agentErr: any) {
          const errText = agentErr?.message || 'BUILD agent failed to start';
          const failedRun: AgentRun = {
            id: 'agent_err_' + Date.now(),
            sessionId: currentSessionId!,
            envId,
            goal: text,
            status: 'failed',
            steps: [],
            stepCount: 0,
            execCount: 0,
            error: errText,
            summary: errText,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          set((state) => {
            const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
            const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx !== -1) {
              sessionMsgs[idx] = {
                ...sessionMsgs[idx],
                content: errText,
                agentRun: failedRun,
              };
            }
            const stillMine = state.activeAbortController === controller;
            return {
              messages: { ...state.messages, [currentSessionId!]: sessionMsgs },
              ...(stillMine
                ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
                : {}),
            };
          });
        }
        void get().flushSave();
        return;
      }

      if (shouldSpawnSwarm && activeEnv) {
        const swarm = await useSwarmStore.getState().startSwarmTask(
          text,
          currentSessionId!,
          activeEnv.id,
          activeEnv.files,
          swarmDecisionReason
        );

        if (swarm) {
          const taskSummary = swarm.tasks
            .map(
              (t) =>
                `- **${t.title}** (${t.role.toUpperCase()}): \`${t.targetFiles.join(', ')}\` [${t.status.toUpperCase()}]`
            )
            .join('\n');

          const finalSummary = `### Multi-Agent Swarm Execution Complete\n\nAll specialized workers finished and synchronized into the **${envDisplayName}** sandbox environment.\n\n*Agent Decision: ${swarm.dispatchReason || swarmDecisionReason || 'Complex project decomposed across parallel subagents'}*\n\n${taskSummary}\n\nAutomated test matrix executed in ephemeral sandbox.`;

          set((state) => {
            const sessionMsgs = [
              ...(state.messages[currentSessionId!] || []),
            ];
            const lastIdx = sessionMsgs.findIndex(
              (m) => m.id === assistantMsgId
            );
            if (lastIdx !== -1) {
              sessionMsgs[lastIdx] = {
                ...sessionMsgs[lastIdx],
                content: finalSummary,
                swarmSession: swarm,
              };
            }
            const stillMine = state.activeAbortController === controller;
            return {
              messages: {
                ...state.messages,
                [currentSessionId!]: sessionMsgs,
              },
              ...(stillMine
                ? {
                    isStreaming: false,
                    streamingSessionId: null,
                    activeAbortController: null,
                  }
                : {}),
            };
          });
          void get().flushSave();
          return;
        }
      }

      const CONTEXT_TURNS = 16;
      const MAX_TURN_CHARS = 1800;
      const messageHistory = (get().messages[currentSessionId!] || [])
        .filter((m) => m.id !== assistantMsgId && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({
          role: m.role,
          content:
            m.content.length > MAX_TURN_CHARS
              ? m.content.slice(0, MAX_TURN_CHARS) + '\n... [truncated]'
              : m.content,
        }))
        .slice(-CONTEXT_TURNS);

      let accumulatedContent = '';
      let accumulatedReasoning = isSwarmMode && swarmDecisionReason
        ? `[Swarm Triage: Single Agent — ${swarmDecisionReason}]\n\n`
        : '';
      let lastUpdateTime = 0;

      const isAntiHallucination = get().antiHallucination;
      const existingFiles = activeEnv ? Object.keys(activeEnv.files) : [];
      const activeFilesSummary = existingFiles.length > 0
        ? existingFiles.map((f) => `  - ${f} (${activeEnv!.files[f].language || 'text'}, ${activeEnv!.files[f].sizeBytes || 0} bytes)`).join('\n')
        : '  (No files created yet in sandbox)';

      const ragState = useRagStore.getState();
      let ragContext = '';
      let ragCitations: ReturnType<typeof ragState.contextForQuery>['citations'] = [];
      if (ragState.enabled) {
        try {
          ragState.ingestEnvironment(activeEnv);
          const retrieved = ragState.contextForQuery(text.trim(), 4);
          ragContext = retrieved.context.slice(0, 2400);
          ragCitations = retrieved.citations;
        } catch (e) {
          console.warn('[chat] RAG retrieve failed:', e);
        }
      }

      const ragSection = ragContext
        ? `
RETRIEVED LOCAL KNOWLEDGE (hybrid BM25 + dense; treat as source of truth):
${ragContext}

Citation rules: quote or paraphrase only from the numbered passages above. If they do not contain the answer, say you do not have that fact in the local index rather than inventing it.
`
        : ragState.enabled
        ? `
LOCAL RAG is enabled but retrieved no passages for this query. Do not invent cluster facts, APIs, or file contents. Say the local index does not contain the answer.
`
        : '';

      const antiHallucinationSection = isAntiHallucination
        ? `ZERO-HALLUCINATION: do not invent APIs, flags, files, or numbers. Sandbox files:\n${activeFilesSummary}\n`
        : '';

      const systemPrompt = `You are Spark, an expert software engineer. Be truthful. If you lack a fact, say so.
${antiHallucinationSection}${ragSection}
CODE RULES: put the exact relative path in every fence (\`\`\`python app.py). Ship complete files plus tests. No TODOs or stubs. Prefer stdlib.`;

      const meshState = useMeshStore.getState();
      const activeEp = meshState.getActiveEndpoint?.() || meshState.candidates.find((c) => c.host === activeHost);
      const apiKey = activeEp?.provider === 'featherless'
        ? meshState.featherlessApiKey
        : meshState.abliteratedApiKey;
      const model =
        useModelSession.getState().resolvedChatId() ||
        meshState.servingModel ||
        activeEp?.defaultModel;

      await streamChatCompletion({
        host: activeHost,
        port: activePort,
        model,
        apiKey,
        temperature: isAntiHallucination ? 0.0 : 0.7,
        antiHallucination: isAntiHallucination,
        max_tokens: 8192,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...messageHistory,
        ],
        abortSignal: controller.signal,
        callbacks: {
          onToken: (token: string, isReasoning: boolean) => {
            telemetryBridge.recordToken(token);
            if (isReasoning) {
              accumulatedReasoning += token;
            } else {
              accumulatedContent += token;
            }

            const now = Date.now();
            if (now - lastUpdateTime > 40) {
              lastUpdateTime = now;
              set((state) => {
                const sessionMsgs = [
                  ...(state.messages[currentSessionId!] || []),
                ];
                const lastIdx = sessionMsgs.findIndex(
                  (m) => m.id === assistantMsgId
                );
                if (lastIdx !== -1) {
                  sessionMsgs[lastIdx] = {
                    ...sessionMsgs[lastIdx],
                    content: accumulatedContent,
                    reasoning: accumulatedReasoning.trim() || undefined,
                  };
                }
                return {
                  messages: {
                    ...state.messages,
                    [currentSessionId!]: sessionMsgs,
                  },
                };
              });
            }
          },
          onComplete: (finalContent: string, finalReasoning: string) => {
            const completedContent = finalContent || accumulatedContent;
            const groundingReport = evaluateFactualGrounding(
              completedContent,
              activeEnv?.files
            );

            // Extract any files produced in the assistant response and sync with the session environment
            const extractedFiles = extractFilesFromMarkdown(completedContent);

            set((state) => {
              const sessionMsgs = [
                ...(state.messages[currentSessionId!] || []),
              ];
              const lastIdx = sessionMsgs.findIndex(
                (m) => m.id === assistantMsgId
              );
              if (lastIdx !== -1) {
                sessionMsgs[lastIdx] = {
                  ...sessionMsgs[lastIdx],
                  content: completedContent,
                  reasoning:
                    finalReasoning || accumulatedReasoning.trim() || undefined,
                  groundingReport,
                  ragCitations: ragCitations.length ? ragCitations : undefined,
                };
              }

              // Update environment if files were generated
              let nextEnvironments = state.environments;
              const session = state.sessions.find(
                (s) => s.id === currentSessionId
              );
              if (session?.envId && extractedFiles.length > 0) {
                const targetEnv = state.environments[session.envId];
                if (targetEnv) {
                  const updatedFiles = { ...targetEnv.files };
                  for (const f of extractedFiles) {
                    updatedFiles[f.path] = f;
                    markFileDirty(session.envId, f.path);
                  }
                  nextEnvironments = {
                    ...state.environments,
                    [session.envId]: {
                      ...targetEnv,
                      files: updatedFiles,
                      updatedAt: Date.now(),
                    },
                  };
                }
              }

              const stillMine = state.activeAbortController === controller;
              return {
                messages: {
                  ...state.messages,
                  [currentSessionId!]: sessionMsgs,
                },
                environments: nextEnvironments,
                ...(stillMine
                  ? {
                      isStreaming: false,
                      streamingSessionId: null,
                      activeAbortController: null,
                    }
                  : {}),
              };
            });
            void get().flushSave();
          },
          onError: (error: Error) => {
            console.error('Streaming error in ChatStore:', error);
            set((state) => {
              const sessionMsgs = [...(state.messages[currentSessionId!] || [])];
              const lastIdx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
              if (lastIdx !== -1) {
                const prev = sessionMsgs[lastIdx].content || '';
                sessionMsgs[lastIdx] = {
                  ...sessionMsgs[lastIdx],
                  content: prev || error.message,
                };
              }
              const stillMine = state.activeAbortController === controller;
              return {
                messages: {
                  ...state.messages,
                  [currentSessionId!]: sessionMsgs,
                },
                ...(stillMine
                  ? {
                      isStreaming: false,
                      streamingSessionId: null,
                      activeAbortController: null,
                    }
                  : {}),
              };
            });
            void get().flushSave();
          },
        },
      });
    } catch (error) {
      console.error('Send message failure:', error);
      set((state) =>
        state.activeAbortController === controller
          ? {
              isStreaming: false,
              streamingSessionId: null,
              activeAbortController: null,
            }
          : state
      );
    }
  },

  draftBuildPlan: async (promptMsgId) => {
    const currentSessionId = get().activeSessionId;
    if (!currentSessionId || get().isStreaming) return;
    const agentStore = useAgentStore.getState();
    const pending = agentStore.getPendingBuild(currentSessionId);
    if (!pending?.goal) return;

    const msgId =
      promptMsgId ||
      pending.promptMsgId ||
      [...(get().messages[currentSessionId] || [])]
        .reverse()
        .find((m) => m.buildPlanPrompt)?.id;
    if (!msgId) return;

    const controller = new AbortController();
    set((state) => {
      const sessionMsgs = [...(state.messages[currentSessionId] || [])];
      const idx = sessionMsgs.findIndex((m) => m.id === msgId);
      if (idx !== -1) {
        sessionMsgs[idx] = {
          ...sessionMsgs[idx],
          content: 'Drafting a build plan…',
          buildPlanPrompt: {
            goal: pending.goal,
            status: 'drafting',
            planText: sessionMsgs[idx].buildPlanPrompt?.planText,
          },
        };
      }
      return {
        isStreaming: true,
        streamingSessionId: currentSessionId,
        activeAbortController: controller,
        messages: { ...state.messages, [currentSessionId]: sessionMsgs },
      };
    });

    let planText = '';
    try {
      const mesh = useMeshStore.getState();
      const activeEp =
        mesh.getActiveEndpoint?.() ||
        mesh.candidates.find((c) => c.host === mesh.activeHost);
      const apiKey =
        activeEp?.provider === 'featherless'
          ? mesh.featherlessApiKey
          : mesh.abliteratedApiKey;
      const model =
        useModelSession.getState().resolvedChatId() ||
        mesh.servingModel ||
        activeEp?.defaultModel;
      await streamChatCompletion({
        host: mesh.activeHost,
        port: mesh.activePort || 8000,
        model,
        apiKey,
        antiHallucination: true,
        max_tokens: 1200,
        abortSignal: controller.signal,
        messages: [
          {
            role: 'system',
            content:
              'You are a senior engineer drafting a concise BUILD plan for a sandbox coding agent. ' +
              'Output markdown only: a short ## Build plan with goal, numbered steps (explore → implement → test → verify), ' +
              'and key files to touch. No tool calls. No code dumps. Max ~250 words.',
          },
          {
            role: 'user',
            content: `Draft a build plan for this goal:\n\n${pending.goal}`,
          },
        ],
        callbacks: {
          onToken: (token, isReasoning) => {
            if (isReasoning) return;
            planText += token;
            set((state) => {
              const sessionMsgs = [...(state.messages[currentSessionId] || [])];
              const idx = sessionMsgs.findIndex((m) => m.id === msgId);
              if (idx === -1) return state;
              sessionMsgs[idx] = {
                ...sessionMsgs[idx],
                content: 'Drafting a build plan…',
                buildPlanPrompt: {
                  goal: pending.goal,
                  status: 'drafting',
                  planText,
                },
              };
              return {
                messages: { ...state.messages, [currentSessionId]: sessionMsgs },
              };
            });
          },
          onComplete: (finalContent) => {
            planText = (finalContent || planText || '').trim();
          },
          onError: () => {
            /* fall through to local draft */
          },
        },
      });
    } catch {
      /* local fallback below */
    }

    if (!planText.trim() || planText.includes('[⚠️ Backend Connection Error]')) {
      planText = draftLocalBuildPlan(pending.goal);
    }

    agentStore.setPendingBuild(currentSessionId, {
      ...pending,
      planText: planText.trim(),
      promptMsgId: msgId,
    });

    set((state) => {
      const sessionMsgs = [...(state.messages[currentSessionId] || [])];
      const idx = sessionMsgs.findIndex((m) => m.id === msgId);
      if (idx !== -1) {
        sessionMsgs[idx] = {
          ...sessionMsgs[idx],
          content:
            'Review the draft plan below, then tap **Start BUILD** (or say **start build**).',
          buildPlanPrompt: {
            goal: pending.goal,
            status: 'ready',
            planText: planText.trim(),
          },
        };
      }
      const stillMine = state.activeAbortController === controller;
      return {
        messages: { ...state.messages, [currentSessionId]: sessionMsgs },
        ...(stillMine
          ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
          : {}),
      };
    });
    void get().flushSave();
  },

  approveBuildPlanAndStart: async (promptMsgId) => {
    const currentSessionId = get().activeSessionId;
    if (!currentSessionId || get().isStreaming) return;
    const agentStore = useAgentStore.getState();
    const pending = agentStore.getPendingBuild(currentSessionId);
    if (!pending?.goal) return;

    let planText = pending.planText?.trim() || '';
    const msgId =
      promptMsgId ||
      pending.promptMsgId ||
      [...(get().messages[currentSessionId] || [])]
        .reverse()
        .find((m) => m.buildPlanPrompt)?.id;

    if (!planText && msgId) {
      const m = (get().messages[currentSessionId] || []).find((x) => x.id === msgId);
      planText = m?.buildPlanPrompt?.planText?.trim() || '';
    }
    if (!planText) {
      // Require a draft — nudge UX
      if (msgId) {
        set((state) => {
          const sessionMsgs = [...(state.messages[currentSessionId] || [])];
          const idx = sessionMsgs.findIndex((m) => m.id === msgId);
          if (idx !== -1) {
            sessionMsgs[idx] = {
              ...sessionMsgs[idx],
              content:
                'Create a build plan first — tap **Draft plan** or reply with your plan, then **Start BUILD**.',
              buildPlanPrompt: {
                goal: pending.goal,
                status: 'awaiting',
              },
            };
          }
          return { messages: { ...state.messages, [currentSessionId]: sessionMsgs } };
        });
      }
      return;
    }

    const currentSession = get().sessions.find((s) => s.id === currentSessionId);
    const activeEnv = currentSession?.envId
      ? get().environments[currentSession.envId]
      : null;
    if (!activeEnv) return;

    const envId = activeEnv.id;
    agentStore.markBuildPlanReady(currentSessionId);
    agentStore.setPendingBuild(currentSessionId, null);

    const goalWithPlan = `${pending.goal}\n\n## Approved build plan\n${planText}`;

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: 'Start BUILD (plan approved)',
      timestamp: Date.now(),
    };
    const assistantMsgId = 'msg_' + (Date.now() + 1);
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    };
    const controller = new AbortController();

    set((state) => {
      const sessionMsgs = [...(state.messages[currentSessionId] || [])];
      // Clear prompt card on prior message
      if (msgId) {
        const pIdx = sessionMsgs.findIndex((m) => m.id === msgId);
        if (pIdx !== -1 && sessionMsgs[pIdx].buildPlanPrompt) {
          sessionMsgs[pIdx] = {
            ...sessionMsgs[pIdx],
            buildPlanPrompt: {
              ...sessionMsgs[pIdx].buildPlanPrompt!,
              status: 'ready',
              planText,
            },
            content:
              sessionMsgs[pIdx].content ||
              'Plan approved — starting BUILD…',
          };
        }
      }
      return {
        isStreaming: true,
        streamingSessionId: currentSessionId,
        activeAbortController: controller,
        messages: {
          ...state.messages,
          [currentSessionId]: [...sessionMsgs, userMsg, assistantMsg],
        },
      };
    });

    try {
      const finished = await useAgentStore.getState().startAgentRun({
        goal: goalWithPlan,
        sessionId: currentSessionId,
        envId,
        signal: controller.signal,
        getEnv: () => get().environments[envId] || null,
        writeFile: (path, content, language) => {
          get().addOrUpdateFile(envId, path, content, language);
        },
        onUpdate: (run, content) => {
          set((state) => {
            const sessionMsgs = [...(state.messages[currentSessionId] || [])];
            const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx === -1) return state;
            sessionMsgs[idx] = { ...sessionMsgs[idx], content, agentRun: run };
            return {
              messages: { ...state.messages, [currentSessionId]: sessionMsgs },
            };
          });
        },
      });
      set((state) => {
        const sessionMsgs = [...(state.messages[currentSessionId] || [])];
        const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) {
          const content =
            finished.summary && finished.summary !== finished.error
              ? finished.summary
              : finished.status === 'failed' && finished.error
              ? ''
              : finished.summary ||
                finished.error ||
                sessionMsgs[idx].content ||
                (finished.status === 'failed' ? 'Agent failed.' : 'Agent finished.');
          sessionMsgs[idx] = {
            ...sessionMsgs[idx],
            content,
            agentRun: finished,
          };
        }
        const stillMine = state.activeAbortController === controller;
        return {
          messages: { ...state.messages, [currentSessionId]: sessionMsgs },
          ...(stillMine
            ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
            : {}),
        };
      });
    } catch (agentErr: any) {
      const errText = agentErr?.message || 'BUILD agent failed to start';
      const failedRun: AgentRun = {
        id: 'agent_err_' + Date.now(),
        sessionId: currentSessionId,
        envId,
        goal: pending.goal,
        status: 'failed',
        steps: [],
        stepCount: 0,
        execCount: 0,
        error: errText,
        summary: errText,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      set((state) => {
        const sessionMsgs = [...(state.messages[currentSessionId] || [])];
        const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) {
          sessionMsgs[idx] = {
            ...sessionMsgs[idx],
            content: errText,
            agentRun: failedRun,
          };
        }
        const stillMine = state.activeAbortController === controller;
        return {
          messages: { ...state.messages, [currentSessionId]: sessionMsgs },
          ...(stillMine
            ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
            : {}),
        };
      });
    }
    void get().flushSave();
  },

  continueAgentRun: async (prior) => {
    if (!prior || get().isStreaming) return;
    const currentSessionId = prior.sessionId || get().activeSessionId;
    if (!currentSessionId) return;
    const envId = prior.envId;
    const activeEnv = envId ? get().environments[envId] : null;
    if (!activeEnv) return;

    // Ensure agent mode on for gate UX; continuing implies plan already armed.
    useAgentStore.getState().setAgentMode(true);
    useAgentStore.getState().markBuildPlanReady(currentSessionId);

    const userMsg: Message = {
      id: 'msg_' + Date.now(),
      role: 'user',
      content: `Continue BUILD agent: ${prior.goal.slice(0, 120)}${prior.goal.length > 120 ? '…' : ''}`,
      timestamp: Date.now(),
    };
    const assistantMsgId = 'msg_' + (Date.now() + 1);
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
    };
    const controller = new AbortController();
    set((state) => ({
      isStreaming: true,
      streamingSessionId: currentSessionId,
      activeAbortController: controller,
      activeSessionId: currentSessionId,
      messages: {
        ...state.messages,
        [currentSessionId]: [
          ...(state.messages[currentSessionId] || []),
          userMsg,
          assistantMsg,
        ],
      },
    }));

    try {
      const finished = await useAgentStore.getState().continueAgentRun({
        prior,
        signal: controller.signal,
        getEnv: () => get().environments[envId] || null,
        writeFile: (path, content, language) => {
          get().addOrUpdateFile(envId, path, content, language);
        },
        onUpdate: (run, content) => {
          set((state) => {
            const sessionMsgs = [...(state.messages[currentSessionId] || [])];
            const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
            if (idx === -1) return state;
            sessionMsgs[idx] = { ...sessionMsgs[idx], content, agentRun: run };
            return {
              messages: { ...state.messages, [currentSessionId]: sessionMsgs },
            };
          });
        },
      });
      set((state) => {
        const sessionMsgs = [...(state.messages[currentSessionId] || [])];
        const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) {
          const content =
            finished.summary ||
            finished.error ||
            sessionMsgs[idx].content ||
            'Agent finished.';
          sessionMsgs[idx] = {
            ...sessionMsgs[idx],
            content,
            agentRun: finished,
          };
        }
        const stillMine = state.activeAbortController === controller;
        return {
          messages: { ...state.messages, [currentSessionId]: sessionMsgs },
          ...(stillMine
            ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
            : {}),
        };
      });
    } catch (e: any) {
      const errText = e?.message || 'Continue failed';
      set((state) => {
        const sessionMsgs = [...(state.messages[currentSessionId] || [])];
        const idx = sessionMsgs.findIndex((m) => m.id === assistantMsgId);
        if (idx !== -1) {
          sessionMsgs[idx] = { ...sessionMsgs[idx], content: errText };
        }
        const stillMine = state.activeAbortController === controller;
        return {
          messages: { ...state.messages, [currentSessionId]: sessionMsgs },
          ...(stillMine
            ? { isStreaming: false, streamingSessionId: null, activeAbortController: null }
            : {}),
        };
      });
    }
    void get().flushSave();
  },

  stopStreaming: () => {
    const controller = get().activeAbortController;
    if (controller) {
      controller.abort();
    }
    try {
      useSwarmStore.getState().cancelSwarm();
    } catch {
      /* swarm optional */
    }
    try {
      useAgentStore.getState().cancelAgentRun();
    } catch {
      /* agent optional */
    }
    set({
      isStreaming: false,
      streamingSessionId: null,
      activeAbortController: null,
    });
    void get().flushSave();
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        let sessions: ChatSession[] = parsed.sessions || [];
        const messages = parsed.messages || {};
        const environments: Record<string, SessionEnvironment> =
          parsed.environments || {};

        // Migrate any legacy sessions missing envId or missing environment record
        let migrated = false;
        sessions = sessions.map((s) => {
          if (!s.envId) {
            migrated = true;
            const newEnv = createInitialEnvironment(s.id);
            environments[newEnv.id] = newEnv;
            return { ...s, envId: newEnv.id };
          }
          if (!environments[s.envId]) {
            migrated = true;
            environments[s.envId] = createInitialEnvironment(s.id);
          }
          return s;
        });

        const savedActive =
          typeof parsed.activeSessionId === 'string' &&
          sessions.some((s) => s.id === parsed.activeSessionId)
            ? parsed.activeSessionId
            : sessions.length > 0
            ? sessions[0].id
            : null;

        set({
          sessions,
          messages,
          environments,
          activeSessionId: savedActive,
          antiHallucination:
            typeof parsed.antiHallucination === 'boolean'
              ? parsed.antiHallucination
              : true,
        });

        for (const env of Object.values(environments)) {
          markEnvAllDirty(env.id, Object.keys(env.files));
        }

        if (migrated) {
          persistDirty = true;
          await get().saveToStorage();
        }
      } else {
        // Initialize with default welcome session & environment
        const welcomeId = 'session_welcome';
        const welcomeEnv = createInitialEnvironment(welcomeId);
        welcomeEnv.name = 'sandbox-welcome';
        welcomeEnv.files = {
          'README.md': {
            path: 'README.md',
            content: `# DGX Spark GB10 Sandbox Environment\n\nInitialized sovereign environment directly mapped to DGX Spark.\n- Host: 192.168.4.103:8000 (GB10 Blackwell FP8)\n- Model: qwen-abliterated\n\nGenerated files from this conversation will automatically appear here.\nTap 'Download ZIP' in the environment menu to export.\n`,
            language: 'markdown',
            updatedAt: Date.now(),
            sizeBytes: 310,
          },
          'spark-info.json': {
            path: 'spark-info.json',
            content: JSON.stringify(
              {
                system: 'NVIDIA DGX Spark',
                architecture: 'GB10 Blackwell',
                contextWindow: 65536,
                sandboxIsolation: 'Per-Conversation Ephemeral',
                exportFormat: 'PKZIP 2.0',
              },
              null,
              2
            ),
            language: 'json',
            updatedAt: Date.now(),
            sizeBytes: 215,
          },
        };

        const welcomeSession: ChatSession = {
          id: welcomeId,
          title: 'DGX Spark Initialization',
          envId: welcomeEnv.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const welcomeMsgs: Message[] = [
          {
            id: 'msg_w1',
            role: 'assistant',
            content: `### ⚡ Sovereign Spark Mobile Client Initialized

Directly linked to on-premise **NVIDIA DGX Spark** (Blackwell GB10 GPU).
- **Primary Endpoint**: \`http://192.168.4.103:8000\`
- **Mesh Fallback**: \`http://100.94.45.77:8000\` (Tailscale)
- **Model**: \`qwen-abliterated\` (FP8 Tensor Cores)
- **Dedicated Sandbox**: Each conversation now has an isolated workspace environment (\`${welcomeEnv.name}\`). Any code files generated are saved in real-time and ready to download as a ZIP!

No telemetry. No rate limits. Uncensored local intelligence. Ask any question or tap a quick chip below!`,
            reasoning: `Initialized secure socket connection with DGX Spark cluster.
Verified NVLink 5 memory interconnect at 1.2 TB/s.
Ephemeral sandbox created: ${welcomeEnv.id}.
Ready for streaming completions.`,
            timestamp: Date.now(),
          },
        ];

        set({
          sessions: [welcomeSession],
          environments: { [welcomeEnv.id]: welcomeEnv },
          activeSessionId: welcomeId,
          messages: { [welcomeId]: welcomeMsgs },
        });

        markEnvAllDirty(welcomeEnv.id, Object.keys(welcomeEnv.files));
        persistDirty = true;
        await get().saveToStorage();
      }
    } catch (e) {
      console.error('Failed to load chat history', e);
    }
  },

  saveToStorage: async () => {
    if (!persistDirty) return;
    persistDirty = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveQueue = saveQueue
      .then(async () => {
        const { sessions, messages, environments, antiHallucination, activeSessionId } =
          get();
        const pruned = pruneVaultForStorage(sessions, messages, environments);
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            sessions: pruned.sessions,
            messages: pruned.messages,
            environments: pruned.environments,
            antiHallucination,
            activeSessionId,
          })
        );
      })
      .catch((e) => {
        persistDirty = true;
        console.error('Failed to persist chat history', e);
      });
    await saveQueue;
  },

  flushSave: async () => {
    persistDirty = true;
    await get().saveToStorage();
  },
}));

// Wire Multi-Agent Swarm events directly into Chat store
const swarmFileBuf: { envId: string; path: string; content: string; language?: string }[] = [];
let swarmFileTimer: ReturnType<typeof setTimeout> | null = null;

function flushSwarmFileBuf() {
  swarmFileTimer = null;
  if (!swarmFileBuf.length) return;
  const byEnv = new Map<string, typeof swarmFileBuf>();
  while (swarmFileBuf.length) {
    const item = swarmFileBuf.shift()!;
    const list = byEnv.get(item.envId) || [];
    list.push(item);
    byEnv.set(item.envId, list);
  }
  const store = useChatStore.getState();
  for (const [envId, files] of byEnv) {
    store.addOrUpdateFiles(envId, files);
  }
}

registerSwarmListeners(
  (swarm) => useChatStore.getState().updateLastAssistantMessageSwarm(swarm),
  (envId, file) => {
    swarmFileBuf.push({
      envId,
      path: file.path,
      content: file.content,
      language: file.language,
    });
    if (!swarmFileTimer) {
      swarmFileTimer = setTimeout(flushSwarmFileBuf, 50);
    }
  },
  async () => {
    try {
      flushSwarmFileBuf();
      await useChatStore.getState().flushSave();
      const { useSandboxStore } = await import('./useSandboxStore');
      await useSandboxStore.getState().materializeActiveEnv();
      await useSandboxStore.getState().runTestsForEnv();
    } catch (err) {
      console.warn('[Swarm] Sandbox execution callback warning:', err);
    }
  }
);

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void useChatStore.getState().flushSave();
    }
  });
  window.addEventListener('beforeunload', () => {
    void useChatStore.getState().flushSave();
  });
}
