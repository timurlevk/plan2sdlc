/**
 * Plan types — structured artifact produced by orchestrator, consumed by dispatcher.
 */

export type PlanStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'paused';
export type WaveStatus = 'pending' | 'executing' | 'completed' | 'failed';
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked' | 'boundary_violation';

export interface PlanTask {
  id: string;                      // e.g. "W1-T1"
  domain: string;                  // e.g. "api", "ui", "shared"
  agent: string;                   // e.g. "api-developer"
  description: string;             // what to implement
  acceptanceCriteria: string[];    // concrete criteria
  writablePath: string;            // e.g. "packages/api/"
  testCommand: string;             // e.g. "pnpm test --filter api"
  context: string;                 // pasted types, interfaces, contracts
  isolation: 'worktree' | 'none';  // worktree = isolated git copy, none = direct
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  result: string | null;           // agent's reported status
  error: string | null;
  changedFiles: string[];
  boundaryViolations: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface Wave {
  id: number;
  description: string;
  status: WaveStatus;
  tasks: PlanTask[];
}

export interface Plan {
  schemaVersion: 1;
  id: string;
  workflowId: string | null;
  backlogItemId: string | null;
  title: string;
  createdAt: string;
  status: PlanStatus;
  currentWave: number;
  currentTask: string | null;
  waves: Wave[];
}
