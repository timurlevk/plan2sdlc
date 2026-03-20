/**
 * Workflow CRUD service for managing ActiveWorkflows and domain locks in .sdlc/state.json.
 */

import { join } from 'node:path';
import type { WorkflowState, ActiveWorkflow, DomainLock } from '../types/workflow.js';
import { readJsonFile, writeJsonFile } from '../utils/state-io.js';
import { generateWorkflowId } from '../utils/id-generator.js';
import { CURRENT_SCHEMA_VERSION, validateSchemaVersion } from '../utils/schema-version.js';

const STATE_FILE = 'state.json';

function defaultState(): WorkflowState {
  return {
    activeWorkflows: [],
    cadence: {
      mergesSinceRetro: 0,
    },
    sessionQueue: [],
    domainLocks: {},
  };
}

/**
 * Load workflow state from disk. Returns a default empty state if the file does not exist.
 */
export async function loadState(sdlcDir: string): Promise<WorkflowState> {
  try {
    const data = await readJsonFile<WorkflowState>(join(sdlcDir, STATE_FILE));
    validateSchemaVersion(data, STATE_FILE);
    return data;
  } catch {
    return defaultState();
  }
}

/**
 * Save workflow state to disk (always includes schemaVersion).
 */
export async function saveState(sdlcDir: string, state: WorkflowState): Promise<void> {
  await writeJsonFile(join(sdlcDir, STATE_FILE), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...state,
  });
}

/**
 * Create a new active workflow for a backlog item with an auto-incrementing WF-NNN ID.
 */
export async function createWorkflow(
  sdlcDir: string,
  backlogItemId: string,
  firstSession: string,
): Promise<ActiveWorkflow> {
  const state = await loadState(sdlcDir);
  const id = generateWorkflowId(state.activeWorkflows.map((w) => w.id));

  const workflow: ActiveWorkflow = {
    id,
    backlogItemId,
    currentSession: firstSession,
    context: {
      reviewAttempt: 0,
      maxRetries: 3,
    },
    history: [],
    startedAt: new Date().toISOString(),
    totalCost: 0,
  };

  state.activeWorkflows.push(workflow);
  await saveState(sdlcDir, state);
  return workflow;
}

/**
 * Update an existing active workflow by ID.
 * Throws if the workflow is not found.
 */
export async function updateWorkflow(
  sdlcDir: string,
  workflowId: string,
  updates: Partial<ActiveWorkflow>,
): Promise<ActiveWorkflow> {
  const state = await loadState(sdlcDir);
  const index = state.activeWorkflows.findIndex((w) => w.id === workflowId);
  if (index === -1) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const updated: ActiveWorkflow = {
    ...state.activeWorkflows[index]!,
    ...updates,
    id: workflowId, // prevent ID overwrite
  };

  state.activeWorkflows[index] = updated;
  await saveState(sdlcDir, state);
  return updated;
}

/**
 * Complete a workflow by removing it from the active workflows list.
 * Throws if the workflow is not found.
 */
export async function completeWorkflow(
  sdlcDir: string,
  workflowId: string,
): Promise<void> {
  const state = await loadState(sdlcDir);
  const index = state.activeWorkflows.findIndex((w) => w.id === workflowId);
  if (index === -1) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  state.activeWorkflows.splice(index, 1);
  await saveState(sdlcDir, state);
}

/**
 * Lock a domain to a specific workflow.
 */
export async function lockDomain(
  sdlcDir: string,
  domain: string,
  workflowId: string,
  _agent?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  const state = await loadState(sdlcDir);
  state.domainLocks[domain] = {
    workflowId,
    lockedAt: new Date().toISOString(),
  };
  await saveState(sdlcDir, state);
}

/**
 * Unlock a domain.
 */
export async function unlockDomain(
  sdlcDir: string,
  domain: string,
): Promise<void> {
  const state = await loadState(sdlcDir);
  delete state.domainLocks[domain];
  await saveState(sdlcDir, state);
}

/**
 * Check if a domain is locked. Returns the DomainLock if locked, null otherwise.
 */
export async function isDomainLocked(
  sdlcDir: string,
  domain: string,
): Promise<DomainLock | null> {
  const state = await loadState(sdlcDir);
  return state.domainLocks[domain] ?? null;
}
