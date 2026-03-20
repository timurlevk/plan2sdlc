import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import type { AgentEntry } from '../types/registry.js';
import type { DomainEntry } from '../types/detection.js';
import type { SessionType } from '../types/session.js';
import type { SessionResult } from '../types/backlog.js';
import {
  dispatchTask,
  resumeWorkflow,
  composeTeam,
  getNextSession,
  canProceed,
} from '../services/orchestrator.js';
import { createWorkflow, loadState, saveState } from '../services/workflow.js';
import { writeJsonFile } from '../utils/state-io.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeAgent(name: string, overrides?: Partial<AgentEntry>): AgentEntry {
  return {
    name,
    description: `${name} agent`,
    category: 'development',
    tier: 'auto-detected',
    model: 'claude-sonnet',
    tools: [],
    domains: [],
    status: 'active',
    ...overrides,
  };
}

const BASE_DOMAINS: DomainEntry[] = [
  { name: 'api', path: 'apps/api', techStack: ['nestjs'], description: 'API domain' },
  { name: 'web', path: 'apps/web', techStack: ['nextjs'], description: 'Web domain' },
];

function baseRegistry(): AgentEntry[] {
  return [
    makeAgent('orchestrator', { category: 'governance', tier: 'mandatory' }),
    makeAgent('api-developer'),
    makeAgent('api-tester', { category: 'testing' }),
    makeAgent('web-developer'),
    makeAgent('web-tester', { category: 'testing' }),
    makeAgent('product-analyst', { category: 'product' }),
    makeAgent('qa-lead', { category: 'testing' }),
    makeAgent('code-reviewer', { category: 'governance' }),
    makeAgent('architect', { category: 'governance' }),
    makeAgent('tech-lead', { category: 'governance' }),
    makeAgent('ux-designer', { category: 'design' }),
    makeAgent('visual-qa', { category: 'testing' }),
    makeAgent('security-analyst', { category: 'specialist' }),
  ];
}

// ── dispatchTask ─────────────────────────────────────────────────────

describe('dispatchTask', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-orch-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  it('should create backlog item, workflow, and classification', async () => {
    const result = await dispatchTask(
      sdlcDir,
      'Add user authentication to the api',
      BASE_DOMAINS,
      baseRegistry(),
    );

    expect(result.backlogItem.id).toBe('TASK-001');
    expect(result.backlogItem.title).toBeTruthy();
    expect(result.backlogItem.status).toBe('inbox');

    expect(result.workflow.id).toBe('WF-001');
    expect(result.workflow.backlogItemId).toBe('TASK-001');

    expect(result.classification.taskType).toBe('feature');
    expect(result.classification.domains).toContain('api');
    expect(result.classification.sessionChain.length).toBeGreaterThan(0);

    expect(result.nextSession).toBe(result.classification.sessionChain[0]);
    expect(result.teamComposition.total).toBeGreaterThan(0);
  });
});

// ── resumeWorkflow ───────────────────────────────────────────────────

describe('resumeWorkflow', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-orch-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  it('should find an active workflow', async () => {
    await createWorkflow(sdlcDir, 'TASK-001', 'EXECUTE');

    const result = await resumeWorkflow(sdlcDir, []);
    expect(result).not.toBeNull();
    expect(result!.workflow.id).toBe('WF-001');
    expect(result!.nextSession).toBe('EXECUTE');
  });

  it('should find a specific workflow by ID', async () => {
    await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
    await createWorkflow(sdlcDir, 'TASK-002', 'EXECUTE');

    const result = await resumeWorkflow(sdlcDir, [], 'WF-002');
    expect(result).not.toBeNull();
    expect(result!.workflow.id).toBe('WF-002');
    expect(result!.nextSession).toBe('EXECUTE');
  });

  it('should return null when no active workflows', async () => {
    const result = await resumeWorkflow(sdlcDir, []);
    expect(result).toBeNull();
  });

  it('should return null when specified workflow not found', async () => {
    await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
    const result = await resumeWorkflow(sdlcDir, [], 'WF-999');
    expect(result).toBeNull();
  });

  it('should preserve classification data on resume after dispatch', async () => {
    const dispatchResult = await dispatchTask(
      sdlcDir,
      'Add user authentication to the api',
      BASE_DOMAINS,
      baseRegistry(),
    );

    const result = await resumeWorkflow(sdlcDir, baseRegistry());
    expect(result).not.toBeNull();
    expect(result!.workflow.taskType).toBe(dispatchResult.classification.taskType);
    expect(result!.workflow.complexity).toBe(dispatchResult.classification.complexity);
    expect(result!.workflow.domains).toEqual(dispatchResult.classification.domains);
    expect(result!.workflow.priority).toBe(dispatchResult.classification.priority);
    expect(result!.workflow.sessionChain).toEqual(dispatchResult.classification.sessionChain);
    // Team should be non-empty when registry is provided
    expect(result!.teamComposition.total).toBeGreaterThan(0);
  });
});

// ── composeTeam ──────────────────────────────────────────────────────

describe('composeTeam', () => {
  it('should compose minimal team for S task', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'S' as const,
      domains: ['api'],
      sessionChain: ['PLAN' as SessionType, 'EXECUTE' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Small task',
    };

    const team = composeTeam(classification, baseRegistry());

    expect(team.mandatory).toContain('orchestrator');
    expect(team.mandatory).toContain('api-developer');
    // S complexity: no product-analyst, no architect
    expect(team.autoDetected).not.toContain('product-analyst');
    expect(team.autoDetected).not.toContain('architect');
  });

  it('should add qa-lead, product-analyst, code-reviewer for M task', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'M' as const,
      domains: ['api'],
      sessionChain: ['PLAN' as SessionType, 'EXECUTE' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Medium task',
    };

    const team = composeTeam(classification, baseRegistry());

    expect(team.mandatory).toContain('orchestrator');
    expect(team.mandatory).toContain('api-developer');
    expect(team.autoDetected).toContain('product-analyst');
    expect(team.autoDetected).toContain('qa-lead');
    expect(team.autoDetected).toContain('code-reviewer');
    // M does not get architect
    expect(team.autoDetected).not.toContain('architect');
  });

  it('should add architect and tech-lead for L task', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'L' as const,
      domains: ['api'],
      sessionChain: ['BRAINSTORM' as SessionType, 'PLAN' as SessionType, 'EXECUTE' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Large task',
    };

    const team = composeTeam(classification, baseRegistry());

    expect(team.autoDetected).toContain('architect');
    expect(team.autoDetected).toContain('tech-lead');
    // L also gets M-level agents
    expect(team.autoDetected).toContain('product-analyst');
  });

  it('should filter by available agents in registry', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'L' as const,
      domains: ['api'],
      sessionChain: ['PLAN' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Test',
    };

    // Sparse registry missing architect and tech-lead
    const sparseRegistry = [
      makeAgent('orchestrator'),
      makeAgent('api-developer'),
      makeAgent('product-analyst'),
    ];

    const team = composeTeam(classification, sparseRegistry);

    expect(team.mandatory).toContain('orchestrator');
    expect(team.mandatory).toContain('api-developer');
    // api-tester is not in registry, so filtered out
    expect(team.mandatory).not.toContain('api-tester');
    // architect not in registry
    expect(team.autoDetected).not.toContain('architect');
    expect(team.autoDetected).toContain('product-analyst');
  });

  it('should add ux-designer for BRAINSTORM session', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'S' as const,
      domains: ['web'],
      sessionChain: ['BRAINSTORM' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Test',
    };

    const team = composeTeam(classification, baseRegistry(), 'BRAINSTORM');
    expect(team.sessionSpecific).toContain('ux-designer');
  });

  it('should add visual-qa for REVIEW session with UI domain', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'S' as const,
      domains: ['web'],
      sessionChain: ['REVIEW' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Test',
    };

    const team = composeTeam(classification, baseRegistry(), 'REVIEW');
    expect(team.sessionSpecific).toContain('visual-qa');
  });

  it('should not add visual-qa for REVIEW session without UI domain', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'S' as const,
      domains: ['api'],
      sessionChain: ['REVIEW' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Test',
    };

    const team = composeTeam(classification, baseRegistry(), 'REVIEW');
    expect(team.sessionSpecific).not.toContain('visual-qa');
  });

  it('should exclude disabled agents', () => {
    const classification = {
      taskType: 'feature' as const,
      complexity: 'S' as const,
      domains: ['api'],
      sessionChain: ['PLAN' as SessionType],
      priority: 'medium' as const,
      suggestedTitle: 'Test',
    };

    const registry = [
      makeAgent('orchestrator'),
      makeAgent('api-developer', { status: 'disabled' }),
    ];

    const team = composeTeam(classification, registry);
    expect(team.mandatory).toContain('orchestrator');
    expect(team.mandatory).not.toContain('api-developer');
  });
});

// ── getNextSession ───────────────────────────────────────────────────

describe('getNextSession', () => {
  const chain: SessionType[] = ['PLAN', 'EXECUTE', 'REVIEW', 'MERGE'];

  it('should advance from EXECUTE to REVIEW after completed', () => {
    const next = getNextSession(chain, 'EXECUTE', 'completed', 0, 3);
    expect(next).toBe('REVIEW');
  });

  it('should advance from REVIEW to MERGE after approved', () => {
    const next = getNextSession(chain, 'REVIEW', 'approved', 0, 3);
    expect(next).toBe('MERGE');
  });

  it('should go back to EXECUTE from REVIEW after needs-changes (retry < max)', () => {
    const next = getNextSession(chain, 'REVIEW', 'needs-changes', 1, 3);
    expect(next).toBe('EXECUTE');
  });

  it('should return null from REVIEW after needs-changes (retry >= max) for HITL', () => {
    const next = getNextSession(chain, 'REVIEW', 'needs-changes', 3, 3);
    expect(next).toBeNull();
  });

  it('should return null at end of chain (done)', () => {
    const next = getNextSession(chain, 'MERGE', 'completed', 0, 3);
    expect(next).toBeNull();
  });

  it('should return null on rejected (HITL escalation)', () => {
    const next = getNextSession(chain, 'REVIEW', 'rejected', 0, 3);
    expect(next).toBeNull();
  });

  it('should return null on escalated', () => {
    const next = getNextSession(chain, 'EXECUTE', 'escalated', 0, 3);
    expect(next).toBeNull();
  });

  it('should return null for session not in chain', () => {
    const next = getNextSession(chain, 'HOTFIX', 'completed', 0, 3);
    expect(next).toBeNull();
  });
});

// ── canProceed ───────────────────────────────────────────────────────

describe('canProceed', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-orch-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  const defaultBudget = {
    perSession: { PLAN: 5, EXECUTE: 10 },
    monthlyWarning: 50,
    monthlyHardCap: 100,
  };

  it('should allow proceeding when no conflicts and under budget', async () => {
    const result = await canProceed(sdlcDir, 'PLAN', ['api'], defaultBudget);
    expect(result.proceed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should block when monthly budget hard cap is exceeded', async () => {
    // Write enough cost history to exceed the hard cap
    const historyDir = join(sdlcDir, 'history');
    await mkdir(historyDir, { recursive: true });
    await writeJsonFile(join(historyDir, 'cost-log.json'), {
      sessionId: 'S-001',
      workflowId: 'WF-001',
      backlogItemId: 'TASK-001',
      sessionType: 'EXECUTE',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      agents: [],
      totalCost: 150,
      totalTurns: 10,
    });

    const result = await canProceed(sdlcDir, 'PLAN', ['api'], defaultBudget);
    expect(result.proceed).toBe(false);
    expect(result.reason).toContain('Monthly budget hard cap exceeded');
  });

  it('should block when domain conflicts exist', async () => {
    // Create domain lock
    const state = await loadState(sdlcDir);
    state.domainLocks['api'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };
    state.activeWorkflows.push({
      id: 'WF-001',
      backlogItemId: 'TASK-001',
      currentSession: 'EXECUTE',
      context: { reviewAttempt: 0, maxRetries: 3 },
      history: [],
      startedAt: new Date().toISOString(),
      totalCost: 0,
    });
    await saveState(sdlcDir, state);

    const result = await canProceed(sdlcDir, 'PLAN', ['api'], defaultBudget);
    expect(result.proceed).toBe(false);
    expect(result.reason).toContain('Domain conflicts');
  });
});
