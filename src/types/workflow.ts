/**
 * Workflow state types for the claude-sdlc plugin.
 * Aligned with schema/state.schema.json
 */

import type { Priority, SessionRef } from './backlog.js';

export interface WorkflowState {
  activeWorkflows: ActiveWorkflow[];
  cadence: Cadence;
  sessionQueue: QueuedSession[];
  domainLocks: Record<string, DomainLock | null>;
}

export interface ActiveWorkflow {
  id: string;
  backlogItemId: string;
  currentSession: string;
  context: WorkflowContext;
  history: SessionRef[];
  startedAt: string;
  totalCost: number;
  // Classification context (preserved for resume)
  taskType?: string;
  complexity?: string;
  domains?: string[];
  priority?: string;
  sessionChain?: string[];
}

export interface WorkflowContext {
  specPath?: string;
  planPath?: string;
  worktrees?: Record<string, string>;
  reviewAttempt: number;
  maxRetries: number;
}

export interface Cadence {
  lastRetro?: string;
  lastGapAnalysis?: string;
  lastArchReview?: string;
  mergesSinceRetro: number;
}

export interface QueuedSession {
  sessionType: string;
  backlogItemId: string;
  priority: Priority;
}

export interface DomainLock {
  workflowId: string;
  lockedAt: string;
}

export interface SessionHandoff {
  from: string;
  to: string;
  backlogItemId: string;
  artifacts: HandoffArtifacts;
  decisions: string[];
  openIssues: string[];
}

export interface HandoffArtifacts {
  spec?: string;
  plan?: string;
  worktrees?: Record<string, string>;
  testResults?: string;
  reviewReport?: string;
  gapReport?: string;
}
