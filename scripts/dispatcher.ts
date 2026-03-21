#!/usr/bin/env tsx
/**
 * SDLC Dispatcher v3 — parallel Agent SDK execution with git worktree isolation.
 *
 * Reads .sdlc/plan.json, creates worktrees per task, spawns parallel agents
 * via @anthropic-ai/claude-agent-sdk, enforces boundaries, merges results.
 *
 * Waves are sequential. Tasks within a wave are parallel.
 */

import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  loadPlan, savePlan, updateTaskStatus, updateWaveStatus,
  updatePlanStatus, isPlanComplete,
} from '../src/services/plan.js';
import { getHeadHash, getChangedFiles, checkBoundary } from './boundary-check.js';
import { createWorktree, mergeWorktree, removeWorktree, commitWorktree, pruneWorktrees } from './worktree.js';
import type { Plan, PlanTask, Wave } from '../src/types/plan.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const projectDir = process.env['SDLC_PROJECT_DIR'] || process.cwd();
const sdlcDir = join(projectDir, '.sdlc');
const planPath = join(sdlcDir, 'plan.json');
const MAX_CONCURRENCY = parseInt(process.env['SDLC_MAX_CONCURRENCY'] || '3', 10);
const MAX_TURNS_PER_TASK = 200;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string) { console.log(`[dispatcher] ${msg}`); }
function logError(msg: string) { console.error(`[dispatcher] ERROR: ${msg}`); }

function printWaveStart(wave: Wave, plan: Plan) {
  const taskCount = wave.tasks.length;
  const parallel = Math.min(taskCount, MAX_CONCURRENCY);
  log(`━━━ Wave ${wave.id}/${plan.waves.length}: ${wave.description} (${taskCount} tasks, ${parallel} parallel) ━━━`);
}

function printTaskStart(task: PlanTask) {
  log(`  ▶ ${task.id} [${task.agent}] ${task.description.slice(0, 60)}`);
}

function printTaskDone(task: PlanTask) {
  log(`  ✓ ${task.id} [${task.agent}] — ${task.result || 'done'}`);
}

function printTaskFailed(task: PlanTask) {
  logError(`  ✗ ${task.id} [${task.agent}] — ${task.status}: ${task.error?.slice(0, 100) || 'unknown'}`);
}

function printMergeResult(task: PlanTask, success: boolean, conflicts: string[]) {
  if (success) {
    log(`  ↗ ${task.id} merged to main`);
  } else {
    logError(`  ↗ ${task.id} merge CONFLICT: ${conflicts.join(', ')}`);
  }
}

function printSummary(plan: Plan) {
  const total = plan.waves.reduce((s, w) => s + w.tasks.length, 0);
  const done = plan.waves.reduce((s, w) => s + w.tasks.filter(t => t.status === 'done').length, 0);
  const failed = plan.waves.reduce((s, w) => s + w.tasks.filter(t => t.status !== 'done' && t.status !== 'pending').length, 0);
  log(`━━━ COMPLETE: ${done}/${total} done, ${failed} failed ━━━`);
}

// ---------------------------------------------------------------------------
// Build prompt for domain developer
// ---------------------------------------------------------------------------

function buildTaskPrompt(task: PlanTask): string {
  const criteria = task.acceptanceCriteria.map(c => `- ${c}`).join('\n');
  return `## Task: ${task.description}

### Acceptance Criteria
${criteria}

### Domain Constraint
You work EXCLUSIVELY within \`${task.writablePath}\`.
Do NOT modify files outside this path.
Test command: \`${task.testCommand}\`

### Context
${task.context}

### When Done
Report your status as the LAST line of your response, exactly like this:
STATUS: DONE
or STATUS: DONE_WITH_CONCERNS — <explanation>
or STATUS: NEEDS_CONTEXT — <what you need>
or STATUS: BLOCKED — <why>`;
}

// ---------------------------------------------------------------------------
// Extract status from agent output
// ---------------------------------------------------------------------------

function extractStatus(output: string): string {
  const lines = output.split('\n').reverse();
  for (const line of lines) {
    const match = line.match(/STATUS:\s*(DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED|DOMAIN_VIOLATION)/i);
    if (match) return match[1].toUpperCase();
  }
  if (output.includes('tests pass') || output.includes('implemented') || output.includes('complete')) return 'DONE';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Run single agent in worktree via SDK
// ---------------------------------------------------------------------------

async function runTask(task: PlanTask): Promise<void> {
  const useWorktree = task.isolation === 'worktree';
  let workDir = projectDir;
  let worktreeInfo: { path: string; branch: string } | null = null;

  // Create worktree if needed
  if (useWorktree) {
    try {
      worktreeInfo = createWorktree(projectDir, task.id);
      workDir = worktreeInfo.path;
      task.worktreePath = worktreeInfo.path;
      task.branch = worktreeInfo.branch;
      log(`  ⎔ ${task.id} worktree: ${worktreeInfo.branch}`);
    } catch (err: any) {
      logError(`  ⎔ ${task.id} worktree failed: ${err.message}. Falling back to direct.`);
      workDir = projectDir;
    }
  }

  const prompt = buildTaskPrompt(task);
  try {
    let fullOutput = '';

    const conversation = query({
      prompt,
      options: {
        cwd: workDir,
        allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions',
        model: 'sonnet',
        maxTurns: MAX_TURNS_PER_TASK,
        persistSession: false,
        systemPrompt: `You are ${task.agent}, a domain developer for the ${task.domain} domain. You write code ONLY within ${task.writablePath}.`,
      },
    });

    for await (const message of conversation) {
      if (message.type === 'result') {
        fullOutput = message.result ?? '';
      }
    }

    const agentStatus = extractStatus(fullOutput);

    // Commit changes in worktree
    if (useWorktree && worktreeInfo) {
      const committed = commitWorktree(worktreeInfo.path, `feat(${task.domain}): ${task.description.slice(0, 50)}`);
      log(`  💾 ${task.id} ${committed ? 'committed' : 'no new changes to commit'}`);
    }

    // Boundary check
    if (!useWorktree) {
      const changedFiles = getChangedFiles(projectDir, 'HEAD~1');
      const violations = checkBoundary(changedFiles, task.writablePath);
      task.boundaryViolations = violations;
      if (violations.length > 0) {
        task.status = 'boundary_violation';
        task.error = `Files outside domain: ${violations.join(', ')}`;
        return;
      }
    }

    if (agentStatus === 'DONE' || agentStatus === 'DONE_WITH_CONCERNS') {
      task.status = 'done';
      task.result = agentStatus;
      task.completedAt = new Date().toISOString();
    } else if (agentStatus === 'BLOCKED' || agentStatus === 'NEEDS_CONTEXT') {
      task.status = 'blocked';
      task.error = `${agentStatus}: ${fullOutput.slice(-300)}`;
    } else {
      task.status = 'done';
      task.result = 'UNKNOWN_STATUS_ASSUMED_DONE';
      task.completedAt = new Date().toISOString();
    }
  } catch (err: any) {
    task.status = 'failed';
    task.error = err.message?.slice(0, 300) || 'Unknown error';
  }
}

// ---------------------------------------------------------------------------
// Run wave: parallel tasks with concurrency limit
// ---------------------------------------------------------------------------

async function runWave(wave: Wave, plan: Plan): Promise<boolean> {
  printWaveStart(wave, plan);

  const pendingTasks = wave.tasks.filter(t => t.status === 'pending' || t.status === 'running');
  if (pendingTasks.length === 0) return true;

  // Run tasks in parallel with concurrency limit
  const batches: PlanTask[][] = [];
  for (let i = 0; i < pendingTasks.length; i += MAX_CONCURRENCY) {
    batches.push(pendingTasks.slice(i, i + MAX_CONCURRENCY));
  }

  for (const batch of batches) {
    // Start all tasks in batch
    for (const task of batch) {
      task.status = 'running';
      task.attempts = (task.attempts || 0) + 1;
      task.startedAt = new Date().toISOString();
      printTaskStart(task);
    }
    await savePlan(planPath, plan);

    // Run in parallel
    await Promise.allSettled(batch.map(task => runTask(task)));
    await savePlan(planPath, plan);

    // Report results
    for (const task of batch) {
      if (task.status === 'done') {
        printTaskDone(task);
      } else {
        printTaskFailed(task);
      }
    }
  }

  // Merge worktree branches back to main
  log(`  Merging wave ${wave.id} branches...`);
  let allMerged = true;

  for (const task of wave.tasks) {
    if (task.status !== 'done') continue;
    if (!task.branch) continue;

    const { success, conflicts } = mergeWorktree(projectDir, task.branch);
    printMergeResult(task, success, conflicts);

    if (!success) {
      task.status = 'failed';
      task.error = `Merge conflict: ${conflicts.join(', ')}`;
      allMerged = false;
    }

    // Cleanup worktree
    if (task.worktreePath) {
      removeWorktree(projectDir, task.worktreePath, task.branch);
    }
  }

  pruneWorktrees(projectDir);

  const allDone = wave.tasks.every(t => t.status === 'done');
  return allDone && allMerged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('Loading plan...');
  let plan: Plan;

  try {
    plan = await loadPlan(planPath);
  } catch (err: any) {
    logError(`Cannot load plan: ${err.message}`);
    process.exit(1);
  }

  if (plan.status === 'completed') {
    log('Plan already completed.');
    process.exit(0);
  }

  updatePlanStatus(plan, 'executing');
  await savePlan(planPath, plan);

  for (const wave of plan.waves) {
    if (wave.status === 'completed') continue;

    updateWaveStatus(plan, wave.id, 'executing');
    plan.currentWave = wave.id;
    await savePlan(planPath, plan);

    const success = await runWave(wave, plan);

    if (success) {
      updateWaveStatus(plan, wave.id, 'completed');
      await savePlan(planPath, plan);
      log(`✓ Wave ${wave.id} completed and merged`);
    } else {
      updateWaveStatus(plan, wave.id, 'failed');
      updatePlanStatus(plan, 'paused');
      await savePlan(planPath, plan);
      logError(`Wave ${wave.id} failed. Fix issues and re-run /sdlc execute.`);
      process.exit(1);
    }
  }

  updatePlanStatus(plan, 'completed');
  plan.currentTask = null;
  await savePlan(planPath, plan);
  printSummary(plan);
  process.exit(0);
}

main().catch(err => {
  logError(`Dispatcher crashed: ${err.message}`);
  process.exit(1);
});
