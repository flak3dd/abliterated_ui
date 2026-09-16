import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgentBudgetTier, AgentRun } from '../types/agent';
import type { SessionEnvironment } from '../types';
import { runBuildAgent } from '../services/agent/loop';
import { buildArtifacts } from '../services/agent/context';
import { useMeshStore } from './useMeshStore';
import { useSandboxStore } from './useSandboxStore';

const STORAGE_KEY = '@abliterated_agent_mode_v1';
const TIER_KEY = '@abliterated_agent_budget_tier_v1';

type AgentUpdate = (run: AgentRun, content: string) => void;

type AgentEnvDeps = {
  getEnv: () => SessionEnvironment | null;
  writeFile: (path: string, content: string, language?: string) => void;
};

interface AgentState {
  isAgentMode: boolean;
  hydrated: boolean;
  activeRun: AgentRun | null;
  /** Last run that ended budget/cancelled/failed — for Continue */
  lastUnfinishedRun: AgentRun | null;
  budgetTier: AgentBudgetTier;
  toggleAgentMode: () => void;
  setAgentMode: (on: boolean) => void;
  setBudgetTier: (tier: AgentBudgetTier) => void;
  loadAgentMode: () => Promise<void>;
  startAgentRun: (opts: {
    goal: string;
    sessionId: string;
    envId: string;
    signal: AbortSignal;
    onUpdate: AgentUpdate;
    getEnv: AgentEnvDeps['getEnv'];
    writeFile: AgentEnvDeps['writeFile'];
    resumeFrom?: AgentRun;
  }) => Promise<AgentRun>;
  continueAgentRun: (opts: {
    prior: AgentRun;
    signal: AbortSignal;
    onUpdate: AgentUpdate;
    getEnv: AgentEnvDeps['getEnv'];
    writeFile: AgentEnvDeps['writeFile'];
    goalOverride?: string;
  }) => Promise<AgentRun>;
  cancelAgentRun: () => void;
  rememberUnfinished: (run: AgentRun | null) => void;
}

function persistMode(on: boolean) {
  AsyncStorage.setItem(STORAGE_KEY, on ? '1' : '0').catch(() => {});
}

function persistTier(tier: AgentBudgetTier) {
  AsyncStorage.setItem(TIER_KEY, tier).catch(() => {});
}

function isUnfinished(status: AgentRun['status']): boolean {
  return status === 'budget' || status === 'cancelled' || status === 'failed';
}

export const useAgentStore = create<AgentState>((set, get) => ({
  isAgentMode: false,
  hydrated: false,
  activeRun: null,
  lastUnfinishedRun: null,
  budgetTier: 'large',

  toggleAgentMode: () => {
    get().setAgentMode(!get().isAgentMode);
  },

  setAgentMode: (on) => {
    set({ isAgentMode: on });
    persistMode(on);
  },

  setBudgetTier: (tier) => {
    set({ budgetTier: tier });
    persistTier(tier);
  },

  rememberUnfinished: (run) => {
    if (run && isUnfinished(run.status)) {
      set({
        lastUnfinishedRun: {
          ...run,
          artifacts: run.artifacts || buildArtifacts(run),
        },
      });
    } else if (run && run.status === 'completed') {
      set({ lastUnfinishedRun: null });
    }
  },

  loadAgentMode: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const tierRaw = await AsyncStorage.getItem(TIER_KEY);
      const tier =
        tierRaw === 'quick' || tierRaw === 'standard' || tierRaw === 'large'
          ? tierRaw
          : 'large';
      if (raw === '1' || raw === 'true') {
        set({ isAgentMode: true, budgetTier: tier, hydrated: true });
        return;
      }
      if (raw === '0' || raw === 'false') {
        set({ isAgentMode: false, budgetTier: tier, hydrated: true });
        return;
      }
      set({ budgetTier: tier, hydrated: true });
      return;
    } catch {
      /* ignore */
    }
    set({ hydrated: true });
  },

  cancelAgentRun: () => {
    const run = get().activeRun;
    if (run && run.status === 'running') {
      const cancelled: AgentRun = {
        ...run,
        status: 'cancelled',
        updatedAt: Date.now(),
        error: 'Stopped',
        summary: run.summary || 'Stopped by user.',
      };
      set({ activeRun: cancelled, lastUnfinishedRun: cancelled });
    }
  },

  startAgentRun: async ({ goal, sessionId, envId, signal, onUpdate, getEnv, writeFile, resumeFrom }) => {
    const tier = get().budgetTier;
    const run: AgentRun = {
      id: 'agent_' + Date.now(),
      sessionId,
      envId,
      goal,
      status: 'running',
      steps: [],
      stepCount: 0,
      execCount: 0,
      phase: resumeFrom ? resumeFrom.phase || 'implement' : 'explore',
      plan: resumeFrom?.plan ? [...resumeFrom.plan] : undefined,
      fileManifest: resumeFrom?.fileManifest ? [...resumeFrom.fileManifest] : [],
      artifacts: resumeFrom?.artifacts,
      budgetTier: tier,
      resumedFromId: resumeFrom?.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ activeRun: run });

    try {
      const mesh = useMeshStore.getState();
      const target = useSandboxStore.getState().target;
      const finished = await runBuildAgent({
        host: mesh.activeHost,
        port: mesh.activePort || 8000,
        model: mesh.servingModel || 'qwen-abliterated',
        goal,
        run,
        budgetTier: tier,
        resumeFrom,
        ctx: {
          envId,
          getEnv,
          writeFile,
          target,
        },
        signal,
        onUpdate: (next, content) => {
          set({ activeRun: next });
          onUpdate(next, content);
        },
      });
      const normalized =
        finished.status === 'running'
          ? { ...finished, status: 'completed' as const, phase: 'done' as const, updatedAt: Date.now() }
          : finished;
      set({ activeRun: normalized });
      get().rememberUnfinished(normalized);
      return normalized;
    } catch (e: any) {
      const failed: AgentRun = {
        ...run,
        status: 'failed',
        error: e?.message || 'Agent failed to start',
        summary: e?.message || 'Agent failed to start',
        updatedAt: Date.now(),
      };
      set({ activeRun: failed, lastUnfinishedRun: failed });
      onUpdate(failed, failed.summary || failed.error || 'Agent failed');
      return failed;
    }
  },

  continueAgentRun: async ({ prior, signal, onUpdate, getEnv, writeFile, goalOverride }) => {
    const goal = goalOverride || prior.goal;
    return get().startAgentRun({
      goal,
      sessionId: prior.sessionId,
      envId: prior.envId,
      signal,
      onUpdate,
      getEnv,
      writeFile,
      resumeFrom: prior,
    });
  },
}));
