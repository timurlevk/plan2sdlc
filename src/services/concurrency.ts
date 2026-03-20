/**
 * Concurrent workflow management service.
 * Provides conflict detection, priority-based queuing, and HOTFIX preemption
 * on top of the lower-level domain lock primitives in workflow.ts.
 */

import type { WorkflowState, QueuedSession } from '../types/workflow.js';
import type { Priority, Complexity } from '../types/backlog.js';
import { loadState, saveState } from './workflow.js';

// ----- Shared-file domains -----

/** Files that are shared across domains and require HITL when concurrent workflows exist. */
const SHARED_FILES = ['package.json', 'CLAUDE.md', 'tsconfig.json', '.eslintrc', '.prettierrc'];

// ----- Public interfaces -----

export interface ConflictInfo {
  domain: string;
  lockedBy: string;
  type: 'same-domain' | 'shared-files';
}

export interface ConflictCheckResult {
  canProceed: boolean;
  conflicts: ConflictInfo[];
  recommendation: 'proceed' | 'queue' | 'hitl';
}

export interface WorkflowPriorityInfo {
  isHotfix: boolean;
  complexity: Complexity;
  priority: Priority;
  createdAt: string; // ISO 8601
}

// ----- Priority maps -----

const COMPLEXITY_RANK: Record<Complexity, number> = { S: 1, M: 2, L: 3, XL: 4 };
const PRIORITY_RANK: Record<Priority, number> = {
  unprioritized: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ----- Core functions -----

/**
 * Check if a new workflow can proceed given current domain locks.
 *
 * Rules:
 * 1. If activeWorkflows >= maxActive → queue
 * 2. For each requested domain, if it is already locked → same-domain conflict → queue
 * 3. If any requested domain is a shared file and at least one other workflow is active → hitl
 * 4. Otherwise → proceed
 */
export function checkConflicts(
  domains: string[],
  state: WorkflowState,
  maxActive = 3,
): ConflictCheckResult {
  const conflicts: ConflictInfo[] = [];

  // Rule 1: max concurrency cap
  if (state.activeWorkflows.length >= maxActive) {
    return { canProceed: false, conflicts: [], recommendation: 'queue' };
  }

  // Rule 2: same-domain conflicts
  for (const domain of domains) {
    const lock = state.domainLocks[domain];
    if (lock) {
      conflicts.push({
        domain,
        lockedBy: lock.workflowId,
        type: 'same-domain',
      });
    }
  }

  if (conflicts.length > 0) {
    return { canProceed: false, conflicts, recommendation: 'queue' };
  }

  // Rule 3: shared-file conflicts (only when other workflows are active)
  if (state.activeWorkflows.length > 0) {
    const sharedConflicts: ConflictInfo[] = [];
    for (const domain of domains) {
      if (SHARED_FILES.includes(domain)) {
        // Any active workflow could touch shared files
        for (const wf of state.activeWorkflows) {
          sharedConflicts.push({
            domain,
            lockedBy: wf.id,
            type: 'shared-files',
          });
        }
      }
    }
    if (sharedConflicts.length > 0) {
      return { canProceed: false, conflicts: sharedConflicts, recommendation: 'hitl' };
    }
  }

  return { canProceed: true, conflicts: [], recommendation: 'proceed' };
}

/**
 * Comparator for sorting workflows by priority (highest priority first).
 *
 * Ordering rules:
 * 1. HOTFIX always wins
 * 2. Higher complexity first (XL > L > M > S)
 * 3. Higher priority first (critical > high > medium > low > unprioritized)
 * 4. Earlier createdAt first (FIFO tiebreak)
 */
export function compareWorkflowPriority(a: WorkflowPriorityInfo, b: WorkflowPriorityInfo): number {
  // Hotfix always first
  if (a.isHotfix && !b.isHotfix) return -1;
  if (!a.isHotfix && b.isHotfix) return 1;

  // Complexity (higher first → descending)
  const complexityDiff = COMPLEXITY_RANK[b.complexity] - COMPLEXITY_RANK[a.complexity];
  if (complexityDiff !== 0) return complexityDiff;

  // Priority (higher first → descending)
  const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // FIFO (earlier first → ascending)
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Add a workflow to the session queue when it cannot proceed immediately.
 */
export async function queueWorkflow(
  sdlcDir: string,
  sessionType: string,
  backlogItemId: string,
  priority: Priority,
): Promise<void> {
  const state = await loadState(sdlcDir);

  const entry: QueuedSession = {
    sessionType,
    backlogItemId,
    priority,
  };

  state.sessionQueue.push(entry);
  await saveState(sdlcDir, state);
}

/**
 * Get the next workflow from the queue that can proceed (no domain conflicts).
 * Removes it from the queue if found.
 */
export async function dequeueNext(
  sdlcDir: string,
  state: WorkflowState,
): Promise<QueuedSession | null> {
  if (state.sessionQueue.length === 0) {
    return null;
  }

  // Find first queued session whose domains are not locked.
  // Since QueuedSession doesn't carry domain info directly, we simply
  // return the first item in the queue (FIFO) — the caller is responsible
  // for checking domain conflicts before starting the workflow.
  const next = state.sessionQueue.shift()!;
  await saveState(sdlcDir, state);
  return next;
}

/**
 * Handle HOTFIX preemption: identify active workflows on affected domains
 * that should be paused so the hotfix can proceed.
 */
export function preemptForHotfix(
  state: WorkflowState,
  affectedDomains: string[],
): { pausedWorkflows: string[]; domainsToUnlock: string[] } {
  const pausedWorkflows: string[] = [];
  const domainsToUnlock: string[] = [];

  for (const domain of affectedDomains) {
    const lock = state.domainLocks[domain];
    if (lock) {
      if (!pausedWorkflows.includes(lock.workflowId)) {
        pausedWorkflows.push(lock.workflowId);
      }
      domainsToUnlock.push(domain);
    }
  }

  return { pausedWorkflows, domainsToUnlock };
}
