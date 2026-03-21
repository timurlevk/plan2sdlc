#!/usr/bin/env tsx
/**
 * SDLC Dispatcher — deterministic code orchestration.
 *
 * Reads .sdlc/plan.json, spawns headless `claude -p` sessions
 * for each task, enforces domain boundaries, updates plan status.
 *
 * This is NOT an LLM — it's a Node.js script that enforces rules
 * the LLM would otherwise bypass.
 */

import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadPlan, savePlan, updateTaskStatus, updateWaveStatus,
  updatePlanStatus, getNextPendingWave, isWaveComplete, isPlanComplete,
} from '../src/services/plan.js';
import { getHeadHash, getChangedFiles, checkBoundary, revertFiles } from './boundary-check.js';
import type { Plan, PlanTask, Wave } from '../src/types/plan.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const projectDir = process.env['SDLC_PROJECT_DIR'] || process.cwd();
const sdlcDir = join(projectDir, '.sdlc');
const planPath = join(sdlcDir, 'plan.json');
const TASK_TIMEOUT = 10 * 60 * 1000; // 10 minutes per task

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function log(msg: string) { console.log(`[dispatcher] ${msg}`); }
function logError(msg: string) { console.error(`[dispatcher] ERROR: ${msg}`); }

function printProgress(plan: Plan, wave: Wave, task: PlanTask) {
  const totalTasks = plan.waves.reduce((sum, w) => sum + w.tasks.length, 0);
  const doneTasks = plan.waves.reduce((sum, w) => sum + w.tasks.filter(t => t.status === 'done').length, 0);
  log(`━━━ Wave ${wave.id}/${plan.waves.length} | Task ${task.id} | ${doneTasks}/${totalTasks} done ━━━`);
  log(`Agent: ${task.agent} | Domain: ${task.domain} | Attempt: ${task.attempts + 1}/${task.maxAttempts}`);
  log(`Task: ${task.description}`);
}

function printBoundaryViolation(task: PlanTask, violations: string[]) {
  logError(`BOUNDARY VIOLATION: ${task.agent} modified files outside ${task.writablePath}`);
  for (const f of violations) logError(`  - ${f}`);
  log('Violating files reverted. Retrying with warning...');
}

function printTaskDone(task: PlanTask) {
  log(`✓ ${task.id} (${task.agent}) — ${task.result || 'done'}`);
}

function printTaskFailed(task: PlanTask) {
  logError(`✗ ${task.id} (${task.agent}) — ${task.status}: ${task.error || 'unknown error'}`);
}

function printSummary(plan: Plan) {
  const total = plan.waves.reduce((s, w) => s + w.tasks.length, 0);
  const done = plan.waves.reduce((s, w) => s + w.tasks.filter(t => t.status === 'done').length, 0);
  log(`━━━ EXECUTION COMPLETE ━━━`);
  log(`${done}/${total} tasks completed across ${plan.waves.length} waves`);
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
Report your status as the LAST line of your response:
STATUS: DONE
or STATUS: DONE_WITH_CONCERNS — <explanation>
or STATUS: NEEDS_CONTEXT — <what you need>
or STATUS: BLOCKED — <why>`;
}

// ---------------------------------------------------------------------------
// Extract status from agent output
// ---------------------------------------------------------------------------

function extractStatus(output: string): string {
  // Look for STATUS: line in output
  const lines = output.split('\n').reverse();
  for (const line of lines) {
    const match = line.match(/STATUS:\s*(DONE_WITH_CONCERNS|DONE|NEEDS_CONTEXT|BLOCKED|DOMAIN_VIOLATION)/i);
    if (match) return match[1].toUpperCase();
  }
  // If no explicit status, check if output looks successful
  if (output.includes('tests pass') || output.includes('implemented')) return 'DONE';
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Spawn headless claude session
// ---------------------------------------------------------------------------

function runAgent(task: PlanTask): { output: string; exitCode: number } {
  const prompt = buildTaskPrompt(task);

  const result = spawnSync('claude', [
    '-p', prompt,
    '--output-format', 'text',
    '--max-turns', '30',
  ], {
    cwd: projectDir,
    timeout: TASK_TIMEOUT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDECODE: undefined },  // unset to allow nested claude -p
  });

  return {
    output: (result.stdout || '') + (result.stderr || ''),
    exitCode: result.status ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Main dispatcher loop
// ---------------------------------------------------------------------------

async function main() {
  log('Loading plan...');
  let plan: Plan;

  try {
    plan = await loadPlan(planPath);
  } catch (err: any) {
    logError(`Cannot load plan: ${err.message}`);
    logError(`Expected: ${planPath}`);
    process.exit(1);
  }

  if (plan.status === 'completed') {
    log('Plan already completed. Nothing to do.');
    process.exit(0);
  }

  updatePlanStatus(plan, 'executing');
  await savePlan(planPath, plan);

  for (const wave of plan.waves) {
    if (wave.status === 'completed') continue;

    updateWaveStatus(plan, wave.id, 'executing');
    plan.currentWave = wave.id;
    await savePlan(planPath, plan);

    log(`━━━ Starting Wave ${wave.id}: ${wave.description} ━━━`);

    for (const task of wave.tasks) {
      if (task.status === 'done') continue;

      printProgress(plan, wave, task);

      let success = false;

      for (let attempt = 1; attempt <= task.maxAttempts; attempt++) {
        updateTaskStatus(plan, task.id, 'running', {
          attempts: attempt,
          startedAt: new Date().toISOString(),
        });
        plan.currentTask = task.id;
        await savePlan(planPath, plan);

        // Snapshot git state
        let beforeHash: string;
        try {
          beforeHash = getHeadHash(projectDir);
        } catch {
          beforeHash = 'HEAD';
        }

        // Run agent
        log(`Spawning ${task.agent}...`);
        const { output, exitCode } = runAgent(task);
        const agentStatus = extractStatus(output);

        // Boundary check
        let changedFiles: string[] = [];
        try {
          changedFiles = getChangedFiles(projectDir, beforeHash);
        } catch { /* no git changes */ }

        const violations = checkBoundary(changedFiles, task.writablePath);

        updateTaskStatus(plan, task.id, task.status, {
          changedFiles,
          boundaryViolations: violations,
        });

        if (violations.length > 0) {
          revertFiles(projectDir, violations);
          printBoundaryViolation(task, violations);

          if (attempt >= task.maxAttempts) {
            updateTaskStatus(plan, task.id, 'boundary_violation', {
              error: `Boundary violations after ${attempt} attempts: ${violations.join(', ')}`,
            });
            break;
          }
          continue; // retry
        }

        if (agentStatus === 'DONE' || agentStatus === 'DONE_WITH_CONCERNS') {
          updateTaskStatus(plan, task.id, 'done', {
            result: agentStatus,
            completedAt: new Date().toISOString(),
          });
          printTaskDone(task);
          success = true;
          break;
        }

        if (agentStatus === 'BLOCKED' || agentStatus === 'NEEDS_CONTEXT') {
          updateTaskStatus(plan, task.id, 'blocked', {
            error: `${agentStatus}: ${output.slice(-500)}`,
          });
          break;
        }

        // Unknown status or failure — retry
        if (attempt >= task.maxAttempts) {
          updateTaskStatus(plan, task.id, 'failed', {
            error: `Failed after ${attempt} attempts. Last output: ${output.slice(-500)}`,
          });
        }
      }

      await savePlan(planPath, plan);

      if (!success) {
        updateWaveStatus(plan, wave.id, 'failed');
        updatePlanStatus(plan, 'paused');
        await savePlan(planPath, plan);
        printTaskFailed(task);
        logError('Execution paused. Fix the issue and re-run /sdlc execute to resume.');
        process.exit(1);
      }
    }

    updateWaveStatus(plan, wave.id, 'completed');
    await savePlan(planPath, plan);
    log(`✓ Wave ${wave.id} completed`);
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
