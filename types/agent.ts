export type AgentToolName =
  | 'list_files'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'grep'
  | 'exec'
  | 'test'
  | 'build'
  | 'github'
  | 'serve_app'
  | 'browser_test'
  | 'vision_heal'
  | 'pty_session'
  | 'set_plan'
  | 'update_task';

export type AgentRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget';

export type AgentStepStatus = 'running' | 'ok' | 'error';

export type AgentPhase = 'explore' | 'plan' | 'implement' | 'verify' | 'done';

export type AgentBudgetTier = 'quick' | 'standard' | 'large';

export type AgentTaskStatus = 'open' | 'done' | 'blocked';

export interface AgentTask {
  id: string;
  title: string;
  status: AgentTaskStatus;
}

export interface AgentFileManifestEntry {
  path: string;
  op: 'read' | 'write' | 'edit';
  at: number;
  bytes?: number;
}

export interface AgentArtifacts {
  filesWritten: string[];
  filesRead: string[];
  lastTestPassed?: boolean;
  lastBuildOk?: boolean;
  lastTestAt?: number;
  lastBuildAt?: number;
  lastBrowserTestOk?: boolean;
  lastServePreviewUrl?: string;
}

export interface AgentCompactMeta {
  keptFull: number;
  compacted: number;
  lastCompactAt?: number;
}

export interface AgentStep {
  id: string;
  index: number;
  tool: AgentToolName | 'think';
  status: AgentStepStatus;
  argsPreview?: string;
  excerpt?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  envId: string;
  goal: string;
  status: AgentRunStatus;
  steps: AgentStep[];
  stepCount: number;
  execCount: number;
  lastTestPassed?: boolean;
  lastBuildOk?: boolean;
  summary?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  /** Current workflow phase */
  phase?: AgentPhase;
  /** Checklist / task graph */
  plan?: AgentTask[];
  /** Paths touched this run */
  fileManifest?: AgentFileManifestEntry[];
  /** Compact artifact summary for UI / resume */
  artifacts?: AgentArtifacts;
  /** Context compaction stats */
  compactMeta?: AgentCompactMeta;
  /** Budget tier used for this run */
  budgetTier?: AgentBudgetTier;
  /** Prior run id if this is a Continue */
  resumedFromId?: string;
  /** Soft verify notes when finishing without full gates */
  verifyNotes?: string[];
  /** Wrote code since last successful test */
  wroteSinceTest?: boolean;
  /** Wrote js/ts and package.json present — soft build gate */
  needsBuild?: boolean;
}
