import { create } from 'zustand';
import { SwarmSession, SwarmSubtask, WorkspaceFile } from '../types';
import { planSwarmSession, executeWorkerSubtask } from '../services/swarmService';
import { useMeshStore } from './useMeshStore';

type SwarmUpdateListener = (swarm: SwarmSession) => void;
type FileGeneratedListener = (envId: string, file: WorkspaceFile) => void;
type SyncSandboxListener = () => Promise<void>;

let swarmUpdateListener: SwarmUpdateListener | null = null;
let fileGeneratedListener: FileGeneratedListener | null = null;
let syncSandboxListener: SyncSandboxListener | null = null;

export function registerSwarmListeners(
  onSwarmUpdate: SwarmUpdateListener,
  onFileGenerated: FileGeneratedListener,
  onSyncSandbox?: SyncSandboxListener
) {
  swarmUpdateListener = onSwarmUpdate;
  fileGeneratedListener = onFileGenerated;
  if (onSyncSandbox) syncSandboxListener = onSyncSandbox;
}

interface WorkerStreamData {
  content: string;
  reasoning: string;
  tokensGenerated: number;
  tokensPerSec: number;
}

interface SwarmState {
  isSwarmMode: boolean;
  isOrchestrating: boolean;
  activeSwarm: SwarmSession | null;
  selectedTaskId: string | null;
  workerOutputs: Record<string, WorkerStreamData>;
  concurrencyLimit: number;

  // Actions
  toggleSwarmMode: () => void;
  setSwarmMode: (enabled: boolean) => void;
  setSelectedTaskId: (taskId: string | null) => void;
  startSwarmTask: (
    masterPrompt: string,
    sessionId: string,
    envId: string,
    existingFiles?: Record<string, WorkspaceFile>,
    dispatchReason?: string
  ) => Promise<SwarmSession | null>;
  cancelSwarm: () => void;
  retrySubtask: (taskId: string, sharedFiles?: Record<string, string>) => Promise<void>;
  syncSwarmToSandbox: () => Promise<void>;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  isSwarmMode: false,
  isOrchestrating: false,
  activeSwarm: null,
  selectedTaskId: null,
  workerOutputs: {},
  concurrencyLimit: 4,

  toggleSwarmMode: () => {
    set((state) => ({ isSwarmMode: !state.isSwarmMode }));
  },

  setSwarmMode: (enabled: boolean) => {
    set({ isSwarmMode: enabled });
  },

  setSelectedTaskId: (taskId: string | null) => {
    set({ selectedTaskId: taskId });
  },

  cancelSwarm: () => {
    const { activeSwarm } = get();
    if (activeSwarm) {
      set({
        isOrchestrating: false,
        activeSwarm: {
          ...activeSwarm,
          status: 'failed',
        },
      });
    }
  },

  startSwarmTask: async (
    masterPrompt: string,
    sessionId: string,
    envId: string,
    existingFiles: Record<string, WorkspaceFile> = {},
    dispatchReason?: string
  ) => {
    const host = useMeshStore.getState().activeHost;
    const port = useMeshStore.getState().activePort;

    set({
      isOrchestrating: true,
      workerOutputs: {},
      selectedTaskId: null,
    });

    try {
      // Step 1: Decompose Prompt with Lead Architect Orchestrator
      const swarm = await planSwarmSession({
        masterPrompt,
        sessionId,
        envId,
        existingFiles,
        host,
        port,
        dispatchReason,
      });

      set({
        activeSwarm: swarm,
        selectedTaskId: swarm.tasks[0]?.id || null,
      });
      swarmUpdateListener?.(swarm);

      // Step 2: Execute Dependency Graph
      const completedFiles: Record<string, string> = {};
      for (const [p, f] of Object.entries(existingFiles)) {
        completedFiles[p] = f.content;
      }

      const pendingTasks = [...swarm.tasks];
      const completedTaskIds = new Set<string>();

      while (pendingTasks.length > 0) {
        if (!get().isOrchestrating) break;

        // Find all tasks whose prerequisites have finished
        const runnableTasks = pendingTasks.filter((t) =>
          t.dependencies.every((depId) => completedTaskIds.has(depId))
        );

        if (runnableTasks.length === 0) {
          // Deadlock or missing dependency: execute remaining anyway
          runnableTasks.push(pendingTasks[0]);
        }

        // Limit concurrent batch to avoid overwhelming VRAM
        const batch = runnableTasks.slice(0, get().concurrencyLimit);

        // Remove batch from pending queue
        for (const b of batch) {
          const idx = pendingTasks.findIndex((p) => p.id === b.id);
          if (idx !== -1) pendingTasks.splice(idx, 1);
        }

        // Update task states to 'generating'
        set((state) => {
          if (!state.activeSwarm) return state;
          const nextTasks = state.activeSwarm.tasks.map((t) => {
            if (batch.some((b) => b.id === t.id)) {
              return { ...t, status: 'generating' as const, startTime: Date.now() };
            }
            return t;
          });
          const nextSwarm = {
            ...state.activeSwarm,
            tasks: nextTasks,
            activeWorkerCount: batch.length,
          };
          swarmUpdateListener?.(nextSwarm);
          return {
            activeSwarm: nextSwarm,
          };
        });

        // Concurrently run all workers in this batch
        await Promise.allSettled(
          batch.map(async (task) => {
            const startT = Date.now();
            let tokenCount = 0;

            try {
              const res = await executeWorkerSubtask({
                task,
                swarmGoal: swarm.masterGoal,
                sharedContext: completedFiles,
                host,
                port,
                onToken: (tok) => {
                  tokenCount++;
                  const elapsedSec = Math.max(0.1, (Date.now() - startT) / 1000);
                  const tokSec = Math.round(tokenCount / elapsedSec);

                  set((state) => ({
                    workerOutputs: {
                      ...state.workerOutputs,
                      [task.id]: {
                        content: (state.workerOutputs[task.id]?.content || '') + tok,
                        reasoning: state.workerOutputs[task.id]?.reasoning || '',
                        tokensGenerated: tokenCount,
                        tokensPerSec: tokSec,
                      },
                    },
                  }));
                },
              });

              // Register generated files into shared context
              for (const f of res.files) {
                completedFiles[f.path] = f.content;
                fileGeneratedListener?.(envId, f);
              }

              completedTaskIds.add(task.id);

              set((state) => {
                if (!state.activeSwarm) return state;
                const nextTasks = state.activeSwarm.tasks.map((t) => {
                  if (t.id === task.id) {
                    return {
                      ...t,
                      status: 'completed' as const,
                      finishTime: Date.now(),
                      content: res.content,
                      reasoning: res.reasoning,
                      groundingScore: res.groundingScore,
                      tokensGenerated: tokenCount,
                    };
                  }
                  return t;
                });

                const finishedCount = nextTasks.filter((t) => t.status === 'completed').length;
                const progress = Math.round((finishedCount / nextTasks.length) * 100);
                const nextSwarm = {
                  ...state.activeSwarm,
                  tasks: nextTasks,
                  overallProgress: progress,
                  totalFilesGenerated: Object.keys(completedFiles).length,
                };
                swarmUpdateListener?.(nextSwarm);

                return {
                  activeSwarm: nextSwarm,
                };
              });
            } catch (err: any) {
              console.warn(`[Swarm] Subtask ${task.id} failed:`, err);
              set((state) => {
                if (!state.activeSwarm) return state;
                const nextTasks = state.activeSwarm.tasks.map((t) => {
                  if (t.id === task.id) {
                    return { ...t, status: 'failed' as const, error: err.message };
                  }
                  return t;
                });
                const nextSwarm = {
                  ...state.activeSwarm,
                  tasks: nextTasks,
                };
                swarmUpdateListener?.(nextSwarm);
                return {
                  activeSwarm: nextSwarm,
                };
              });
            }
          })
        );
      }

      // Step 3: Conclude Swarm and run automated tests
      set((state) => {
        if (!state.activeSwarm) return state;
        const cancelled = !state.isOrchestrating;
        const anyFailed = state.activeSwarm.tasks.some((t) => t.status === 'failed');
        const finalSwarm = {
          ...state.activeSwarm,
          status: (cancelled || anyFailed ? 'failed' : 'completed') as const,
          overallProgress: 100,
          activeWorkerCount: 0,
        };
        swarmUpdateListener?.(finalSwarm);
        return {
          isOrchestrating: false,
          activeSwarm: finalSwarm,
        };
      });

      // Auto-trigger test runner in ephemeral sandbox
      if (syncSandboxListener) {
        try {
          await syncSandboxListener();
        } catch (syncErr) {
          console.warn('[Swarm] Auto sandbox sync error:', syncErr);
        }
      }

      return get().activeSwarm;
    } catch (err) {
      console.error('[Swarm Error]:', err);
      set({ isOrchestrating: false });
      return null;
    }
  },

  retrySubtask: async (taskId: string, sharedFiles: Record<string, string> = {}) => {
    const { activeSwarm } = get();
    if (!activeSwarm) return;

    const task = activeSwarm.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const host = useMeshStore.getState().activeHost;
    const port = useMeshStore.getState().activePort;

    set((state) => {
      if (!state.activeSwarm) return state;
      return {
        activeSwarm: {
          ...state.activeSwarm,
          tasks: state.activeSwarm.tasks.map((t) =>
            t.id === taskId ? { ...t, status: 'generating' as const } : t
          ),
        },
      };
    });

    try {
      const res = await executeWorkerSubtask({
        task,
        swarmGoal: activeSwarm.masterGoal,
        sharedContext: sharedFiles,
        host,
        port,
      });

      for (const f of res.files) {
        fileGeneratedListener?.(activeSwarm.envId, f);
      }

      set((state) => {
        if (!state.activeSwarm) return state;
        const updatedSwarm = {
          ...state.activeSwarm,
          tasks: state.activeSwarm.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'completed' as const,
                  content: res.content,
                  reasoning: res.reasoning,
                  groundingScore: res.groundingScore,
                }
              : t
          ),
        };
        swarmUpdateListener?.(updatedSwarm);
        return {
          activeSwarm: updatedSwarm,
        };
      });
    } catch (err: any) {
      console.warn(`[Swarm] Subtask retry failed for ${taskId}:`, err);
      set((state) => {
        if (!state.activeSwarm) return state;
        const updatedSwarm = {
          ...state.activeSwarm,
          tasks: state.activeSwarm.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed' as const, error: err.message }
              : t
          ),
        };
        swarmUpdateListener?.(updatedSwarm);
        return { activeSwarm: updatedSwarm };
      });
    }
  },

  syncSwarmToSandbox: async () => {
    if (syncSandboxListener) {
      await syncSandboxListener();
    }
  },
}));
