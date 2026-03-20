/**
 * Orchestrator runtime service for the claude-sdlc plugin.
 * Provides task dispatch, workflow resumption, team composition,
 * session chaining, and pre-session checks (budget + conflicts).
 */

import type { SessionType } from '../types/session.js';
import type { SessionResult } from '../types/backlog.js';
import type { ActiveWorkflow, SessionHandoff } from '../types/workflow.js';
import type { AgentEntry } from '../types/registry.js';
import type { DomainEntry } from '../types/detection.js';
import type { ClassificationResult } from './classifier.js';
import type { ConflictCheckResult } from './concurrency.js';
import type { BacklogItem } from '../types/backlog.js';
import { classifyTask } from './classifier.js';
import { addBacklogItem } from './backlog.js';
import { createWorkflow, updateWorkflow, loadState } from './workflow.js';
import { readHandoff } from './handoff.js';
import { checkConflicts } from './concurrency.js';
import { checkMonthlyBudget } from './cost-tracker.js';

// ── Public interfaces ────────────────────────────────────────────────

export interface DispatchResult {
  backlogItem: BacklogItem;
  workflow: ActiveWorkflow;
  classification: ClassificationResult;
  teamComposition: TeamComposition;
  nextSession: SessionType;
  conflicts?: ConflictCheckResult;
}

export interface TeamComposition {
  mandatory: string[];
  autoDetected: string[];
  sessionSpecific: string[];
  total: number;
}

export interface ResumeResult {
  workflow: ActiveWorkflow;
  handoff: SessionHandoff | undefined;
  nextSession: SessionType;
  teamComposition: TeamComposition;
}

// ── Agent name helpers ───────────────────────────────────────────────

function findAgent(registry: AgentEntry[], name: string): AgentEntry | undefined {
  return registry.find((a) => a.name === name && a.status !== 'disabled');
}

function collectAvailable(registry: AgentEntry[], names: string[]): string[] {
  return names.filter((n) => findAgent(registry, n) !== undefined);
}

// ── Team composition (spec section 12.6) ─────────────────────────────

/**
 * Compose team from registry based on classification.
 * Per spec section 12.6:
 * - Mandatory: orchestrator + {domain}-developer + {domain}-tester per domain
 * - For M+: + product-analyst + qa-lead + code-reviewer
 * - For L+: + architect + tech-lead
 * - Session-specific: BRAINSTORM adds ux-designer, REVIEW adds visual-qa for UI, etc.
 */
export function composeTeam(
  classification: ClassificationResult,
  registryAgents: AgentEntry[],
  currentSession?: SessionType,
): TeamComposition {
  const mandatory: string[] = [];
  const autoDetected: string[] = [];
  const sessionSpecific: string[] = [];

  // Always include orchestrator
  mandatory.push('orchestrator');

  // Per-domain developer and tester
  for (const domain of classification.domains) {
    mandatory.push(`${domain}-developer`);
    mandatory.push(`${domain}-tester`);
  }

  // M+ complexity: add product-analyst, qa-lead, code-reviewer
  const complexityRank = { S: 1, M: 2, L: 3, XL: 4 } as const;
  const rank = complexityRank[classification.complexity];

  if (rank >= 2) {
    autoDetected.push('product-analyst', 'qa-lead', 'code-reviewer');
  }

  // L+ complexity: add architect, tech-lead
  if (rank >= 3) {
    autoDetected.push('architect', 'tech-lead');
  }

  // Session-specific agents
  if (currentSession === 'BRAINSTORM') {
    sessionSpecific.push('ux-designer');
  }
  if (currentSession === 'REVIEW') {
    // Add visual-qa for UI domains
    const uiDomains = ['web', 'mobile', 'frontend', 'ui'];
    const hasUiDomain = classification.domains.some((d) =>
      uiDomains.includes(d.toLowerCase()),
    );
    if (hasUiDomain) {
      sessionSpecific.push('visual-qa');
    }
  }
  if (currentSession === 'SECURITY_REVIEW') {
    sessionSpecific.push('security-analyst');
  }

  // Filter each category to only agents present in the registry
  const filteredMandatory = collectAvailable(registryAgents, mandatory);
  const filteredAutoDetected = collectAvailable(registryAgents, autoDetected);
  const filteredSessionSpecific = collectAvailable(registryAgents, sessionSpecific);

  // Deduplicate across categories
  const seen = new Set(filteredMandatory);
  const dedupedAuto = filteredAutoDetected.filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  const dedupedSession = filteredSessionSpecific.filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  return {
    mandatory: filteredMandatory,
    autoDetected: dedupedAuto,
    sessionSpecific: dedupedSession,
    total: filteredMandatory.length + dedupedAuto.length + dedupedSession.length,
  };
}

// ── Session chaining ─────────────────────────────────────────────────

/**
 * Determine next session in chain after current one completes.
 * Returns null if chain is complete or escalation is needed.
 */
export function getNextSession(
  chain: SessionType[],
  currentSession: SessionType,
  result: SessionResult,
  reviewAttempt: number,
  maxRetries: number,
): SessionType | null {
  // Rejected or escalated → HITL escalation, stop chaining
  if (result === 'rejected' || result === 'escalated') {
    return null;
  }

  // Needs-changes in REVIEW → go back to EXECUTE if retries remain
  if (result === 'needs-changes' && currentSession === 'REVIEW') {
    if (reviewAttempt < maxRetries) {
      return 'EXECUTE';
    }
    // Max retries exceeded → HITL escalation
    return null;
  }

  // Approved or completed → advance to next in chain
  const currentIndex = chain.indexOf(currentSession);
  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= chain.length) {
    // End of chain
    return null;
  }

  return chain[nextIndex]!;
}

// ── Pre-session checks ───────────────────────────────────────────────

/**
 * Check if session can proceed (budget + conflicts).
 */
export async function canProceed(
  sdlcDir: string,
  sessionType: SessionType,
  domains: string[],
  budgetConfig: {
    perSession: Record<string, number>;
    monthlyWarning: number;
    monthlyHardCap: number;
  },
): Promise<{ proceed: boolean; reason?: string }> {
  // Check monthly budget hard cap
  const monthlyCheck = await checkMonthlyBudget(
    sdlcDir,
    budgetConfig.monthlyWarning,
    budgetConfig.monthlyHardCap,
  );
  if (monthlyCheck.exceeded) {
    return {
      proceed: false,
      reason: `Monthly budget hard cap exceeded: $${monthlyCheck.total.toFixed(2)} >= $${budgetConfig.monthlyHardCap.toFixed(2)}`,
    };
  }

  // Check domain conflicts
  const state = await loadState(sdlcDir);
  const conflictResult = checkConflicts(domains, state);
  if (!conflictResult.canProceed) {
    const conflictDomains = conflictResult.conflicts.map((c) => c.domain).join(', ');
    return {
      proceed: false,
      reason: `Domain conflicts detected: ${conflictDomains} (recommendation: ${conflictResult.recommendation})`,
    };
  }

  return { proceed: true };
}

// ── Dispatch ─────────────────────────────────────────────────────────

/**
 * Dispatch a new task: classify -> create backlog item -> compose team -> create workflow -> check conflicts.
 */
export async function dispatchTask(
  sdlcDir: string,
  description: string,
  domains: DomainEntry[],
  registryAgents: AgentEntry[],
): Promise<DispatchResult> {
  // 1. Classify the task
  const classification = classifyTask({ description, domainMap: domains });

  // 2. Create backlog item
  const backlogItem = await addBacklogItem(sdlcDir, {
    title: classification.suggestedTitle,
    description,
    type: classification.taskType,
    complexity: classification.complexity,
    domains: classification.domains,
    tags: [],
    status: 'inbox',
    priority: classification.priority,
  });

  // 3. Determine first session in the chain
  const nextSession = classification.sessionChain[0]!;

  // 4. Compose team
  const teamComposition = composeTeam(classification, registryAgents, nextSession);

  // 5. Create workflow
  const initialWorkflow = await createWorkflow(sdlcDir, backlogItem.id, nextSession);
  // Store classification for resume
  const workflow = await updateWorkflow(sdlcDir, initialWorkflow.id, {
    taskType: classification.taskType,
    complexity: classification.complexity,
    domains: classification.domains,
    priority: classification.priority,
    sessionChain: classification.sessionChain,
  } as Partial<ActiveWorkflow>);

  // 6. Check conflicts
  const state = await loadState(sdlcDir);
  const conflicts = checkConflicts(classification.domains, state);

  return {
    backlogItem,
    workflow,
    classification,
    teamComposition,
    nextSession,
    conflicts,
  };
}

// ── Resume ───────────────────────────────────────────────────────────

/**
 * Resume an active workflow: read state -> find workflow -> read handoff -> determine next session.
 * If no workflowId, finds the first active workflow.
 * Returns null if no active workflows.
 */
export async function resumeWorkflow(
  sdlcDir: string,
  registryAgents?: AgentEntry[],
  workflowId?: string,
): Promise<ResumeResult | null> {
  const state = await loadState(sdlcDir);

  if (state.activeWorkflows.length === 0) {
    return null;
  }

  let workflow: ActiveWorkflow | undefined;
  if (workflowId) {
    workflow = state.activeWorkflows.find((w) => w.id === workflowId);
  } else {
    workflow = state.activeWorkflows[0];
  }

  if (!workflow) {
    return null;
  }

  // Read the last handoff for context
  const handoff = await readHandoff(sdlcDir, workflow.id);

  // The current session on the workflow is the next session to run
  const nextSession = workflow.currentSession as SessionType;

  // Compose team for the current session using stored classification
  const classification: ClassificationResult = {
    taskType: (workflow.taskType as any) || 'feature',
    complexity: (workflow.complexity as any) || 'M',
    domains: workflow.domains || [],
    sessionChain: (workflow.sessionChain || [nextSession]) as SessionType[],
    priority: (workflow.priority as any) || 'medium',
    suggestedTitle: '',
  };
  const teamComposition = composeTeam(
    classification,
    registryAgents || [],
    nextSession,
  );

  return {
    workflow,
    handoff,
    nextSession,
    teamComposition,
  };
}
