export type Role = 'user' | 'assistant' | 'system';

export interface GroundingReport {
  isGrounded: boolean;
  groundingScore: number; // 0 - 100
  warnings: string[];
  verifiedFiles: string[];
  detectedImports: string[];
  hasPlaceholders: boolean;
  timestamp: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  timestamp: number;
  groundingReport?: GroundingReport;
  swarmSession?: SwarmSession;
}

export interface WorkspaceFile {
  path: string;
  content: string;
  language?: string;
  updatedAt: number;
  sizeBytes: number;
}

export interface SessionEnvironment {
  id: string;
  sessionId: string;
  name: string;
  files: Record<string, WorkspaceFile>;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  envId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Endpoint {
  id: string;
  name: string;
  host: string;
  port: number;
  latencyMs: number;
  isOnline: boolean;
  type: 'direct_lan' | 'secondary_lan' | 'tailscale' | 'localhost';
}

export type ServiceStatus = 'ONLINE' | 'STANDBY' | 'READY' | 'OFFLINE';

export interface Microservice {
  id: string;
  name: string;
  port: number;
  status: ServiceStatus;
  model: string;
  description: string;
}

export interface HardwareTelemetry {
  gpuModel: string;
  gpuTemp: number;
  gpuTempMax: number;
  vramUsedGb: number;
  vramTotalGb: number;
  powerDrawWatts: number;
  powerLimitWatts: number;
  gpuClockMhz: number;
  memoryClockMhz: number;
  tensorCoresActive: number;
  busUsagePercent: number;
  uptimeSeconds: number;
}

export type AspectRatioType = '1:1' | '9:16' | '16:9' | '4:5' | '21:9';

export interface GeneratedImage {
  id: string;
  uri: string;
  prompt: string;
  aspectRatio: AspectRatioType;
  model: string;
  timestamp: number;
  hasMask?: boolean;
}

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceSubtitle {
  userTranscript: string;
  assistantReply: string;
}

// ==========================================
// Sandbox & Test Runner Environment Types
// ==========================================

export type SandboxStatus =
  | 'idle'
  | 'materializing'
  | 'installing'
  | 'building'
  | 'testing'
  | 'running'
  | 'success'
  | 'failed';

export type ExecutionTarget = 'local_mac' | 'dgx_spark' | 'docker';

export type TestFramework = 'pytest' | 'unittest' | 'vitest' | 'jest' | 'bash' | 'custom';

export interface TestCaseResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  failureMessage?: string;
  traceback?: string;
}

export interface TestRunReport {
  id: string;
  envId: string;
  timestamp: number;
  framework: TestFramework;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  tests: TestCaseResult[];
  rawOutput: string;
  exitCode: number;
}

export interface BuildReport {
  id: string;
  envId: string;
  timestamp: number;
  runtime: string;
  success: boolean;
  durationMs: number;
  output: string;
  exitCode: number;
}

export interface SandboxInfo {
  envId: string;
  path: string;
  runtime: string;
  target: ExecutionTarget;
  activePid?: number;
  webPreviewUrl?: string;
  filesCount: number;
}

// Multi-Agent Swarm Orchestration Types
export type AgentRole = 'orchestrator' | 'worker' | 'tester' | 'critic';
export type AgentStatus = 'queued' | 'planning' | 'generating' | 'verifying' | 'completed' | 'failed';

export interface SwarmSubtask {
  id: string;
  role: AgentRole;
  title: string;
  description: string;
  targetFiles: string[];
  dependencies: string[];
  status: AgentStatus;
  tokensGenerated?: number;
  tokensPerSec?: number;
  content?: string;
  reasoning?: string;
  error?: string;
  groundingScore?: number;
  startTime?: number;
  finishTime?: number;
}

export interface SwarmSession {
  id: string;
  envId: string;
  sessionId: string;
  masterGoal: string;
  tasks: SwarmSubtask[];
  status: 'planning' | 'running' | 'testing' | 'completed' | 'failed';
  overallProgress: number; // 0 - 100
  createdAt: number;
  updatedAt: number;
  activeWorkerCount: number;
  totalFilesGenerated: number;
  dispatchReason?: string;
}
