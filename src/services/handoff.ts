/**
 * Session handoff service for cross-session context passing.
 */

import type { SessionHandoff } from '../types/workflow.js';
import type { SessionRef } from '../types/backlog.js';
import { loadState, saveState } from './workflow.js';
import { loadBacklog, saveBacklog } from './backlog.js';

/**
 * Write a session handoff to the workflow's context in state.json.
 * Stores the handoff under the workflow's context so the next session can read it.
 */
export async function writeHandoff(
  sdlcDir: string,
  workflowId: string,
  handoff: SessionHandoff,
): Promise<void> {
  const state = await loadState(sdlcDir);
  const workflow = state.activeWorkflows.find((w) => w.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Store handoff data in the workflow context
  workflow.context.specPath = handoff.artifacts.spec ?? workflow.context.specPath;
  workflow.context.planPath = handoff.artifacts.plan ?? workflow.context.planPath;
  if (handoff.artifacts.worktrees) {
    workflow.context.worktrees = {
      ...workflow.context.worktrees,
      ...handoff.artifacts.worktrees,
    };
  }

  // Store the full handoff as a serialisable property on the context
  // We use a well-known key in the state for retrieval
  const stateWithHandoffs = state as WorkflowStateWithHandoffs;
  if (!stateWithHandoffs.handoffs) {
    stateWithHandoffs.handoffs = {};
  }
  stateWithHandoffs.handoffs[workflowId] = handoff;

  await saveState(sdlcDir, state);
}

/**
 * Read the most recent session handoff for a workflow.
 */
export async function readHandoff(
  sdlcDir: string,
  workflowId: string,
): Promise<SessionHandoff | undefined> {
  const state = await loadState(sdlcDir) as WorkflowStateWithHandoffs;
  return state.handoffs?.[workflowId];
}

/**
 * Append a session reference to a backlog item's sessions array.
 * Accumulates the session cost into the item's actualCost.
 */
export async function appendSessionToBacklog(
  sdlcDir: string,
  backlogItemId: string,
  sessionRef: SessionRef,
): Promise<void> {
  const items = await loadBacklog(sdlcDir);
  const item = items.find((i) => i.id === backlogItemId);
  if (!item) {
    throw new Error(`Backlog item not found: ${backlogItemId}`);
  }

  item.sessions.push(sessionRef);
  item.actualCost = (item.actualCost ?? 0) + sessionRef.cost;
  item.updated = new Date().toISOString();

  await saveBacklog(sdlcDir, items);
}

/**
 * Extended WorkflowState that includes handoff storage.
 * This is an internal extension — the handoffs map is persisted alongside
 * the standard WorkflowState fields in state.json.
 */
interface WorkflowStateWithHandoffs {
  handoffs?: Record<string, SessionHandoff>;
}
