/**
 * Session handoff service for cross-session context passing.
 * Handoffs are stored as separate files in .sdlc/handoffs/{workflowId}.json
 * to avoid polluting the workflow state schema.
 */

import { join } from 'path';
import type { SessionHandoff } from '../types/workflow.js';
import type { SessionRef } from '../types/backlog.js';
import { loadState, saveState } from './workflow.js';
import { loadBacklog, saveBacklog } from './backlog.js';
import { readJsonFile, writeJsonFile, ensureDir } from '../utils/state-io.js';

/**
 * Write a session handoff for a workflow.
 * Stores in .sdlc/handoffs/{workflowId}.json and updates workflow context.
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

  // Update workflow context with artifact paths
  workflow.context.specPath = handoff.artifacts.spec ?? workflow.context.specPath;
  workflow.context.planPath = handoff.artifacts.plan ?? workflow.context.planPath;
  if (handoff.artifacts.worktrees) {
    workflow.context.worktrees = {
      ...workflow.context.worktrees,
      ...handoff.artifacts.worktrees,
    };
  }

  await saveState(sdlcDir, state);

  // Write handoff to separate file
  const handoffsDir = join(sdlcDir, 'handoffs');
  await ensureDir(handoffsDir);
  await writeJsonFile(join(handoffsDir, `${workflowId}.json`), handoff);
}

/**
 * Read the most recent session handoff for a workflow.
 */
export async function readHandoff(
  sdlcDir: string,
  workflowId: string,
): Promise<SessionHandoff | undefined> {
  const handoffPath = join(sdlcDir, 'handoffs', `${workflowId}.json`);
  try {
    return await readJsonFile<SessionHandoff>(handoffPath);
  } catch {
    return undefined;
  }
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
