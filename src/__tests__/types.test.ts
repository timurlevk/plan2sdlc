import { describe, it, expect } from 'vitest';
import type {
  BacklogItem,
  SessionRef,
  WorkflowState,
  ActiveWorkflow,
  SessionLog,
  AgentLog,
  PluginConfig,
  AgentRegistry,
  AgentEntry,
  TechDebtRegister,
  TechDebtItem,
  SessionHandoff,
} from '../types/index.js';
import { SESSION_TYPES } from '../types/index.js';

describe('Backlog types', () => {
  it('should create a valid BacklogItem', () => {
    const item: BacklogItem = {
      id: 'TASK-001',
      title: 'Test task',
      description: 'A test task',
      type: 'feature',
      complexity: 'M',
      domains: ['api'],
      tags: ['test'],
      status: 'inbox',
      priority: 'medium',
      created: '2025-01-01T00:00:00Z',
      updated: '2025-01-01T00:00:00Z',
      sessions: [],
    };
    expect(item.id).toBe('TASK-001');
    expect(item.status).toBe('inbox');
  });

  it('should create a valid SessionRef', () => {
    const ref: SessionRef = {
      sessionType: 'EXECUTE',
      timestamp: '2025-01-01T00:00:00Z',
      result: 'completed',
      cost: 0.5,
      agentsUsed: ['developer'],
    };
    expect(ref.result).toBe('completed');
  });
});

describe('Workflow types', () => {
  it('should create a valid WorkflowState', () => {
    const state: WorkflowState = {
      activeWorkflows: [],
      cadence: { mergesSinceRetro: 0 },
      sessionQueue: [],
      domainLocks: {},
    };
    expect(state.activeWorkflows).toHaveLength(0);
  });

  it('should create a valid ActiveWorkflow', () => {
    const wf: ActiveWorkflow = {
      id: 'WF-001',
      backlogItemId: 'TASK-001',
      currentSession: 'EXECUTE',
      context: { reviewAttempt: 0, maxRetries: 3 },
      history: [],
      startedAt: '2025-01-01T00:00:00Z',
      totalCost: 0,
    };
    expect(wf.id).toBe('WF-001');
  });

  it('should create a valid SessionHandoff', () => {
    const handoff: SessionHandoff = {
      from: 'PLAN',
      to: 'EXECUTE',
      backlogItemId: 'TASK-001',
      artifacts: { spec: 'docs/spec.md' },
      decisions: ['Use REST API'],
      openIssues: [],
    };
    expect(handoff.from).toBe('PLAN');
  });
});

describe('Session types', () => {
  it('SESSION_TYPES should contain 18 session types', () => {
    expect(SESSION_TYPES).toHaveLength(18);
    expect(SESSION_TYPES).toContain('QUICK_FIX');
    expect(SESSION_TYPES).toContain('DEPENDENCY_AUDIT');
  });

  it('should create a valid SessionLog', () => {
    const log: SessionLog = {
      id: 'session-1',
      workflowId: 'WF-001',
      backlogItemId: 'TASK-001',
      sessionType: 'EXECUTE',
      startTime: '2025-01-01T00:00:00Z',
      endTime: '2025-01-01T01:00:00Z',
      agents: [],
      totalCost: 1.5,
      result: 'completed',
      turnsUsed: 10,
    };
    expect(log.sessionType).toBe('EXECUTE');
  });

  it('should create a valid AgentLog', () => {
    const agent: AgentLog = {
      name: 'developer',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.05,
      turnsUsed: 3,
      toolCalls: 5,
      result: 'success',
    };
    expect(agent.result).toBe('success');
  });
});

describe('Config types', () => {
  it('should create a valid PluginConfig', () => {
    const config: PluginConfig = {
      project: { name: 'test-project', type: 'single-app' },
      workflow: { maxRetries: 3 },
      budget: { monthlyWarning: 50, monthlyHardCap: 100 },
      hitl: {},
      git: { mainBranch: 'main' },
    };
    expect(config.project.name).toBe('test-project');
  });
});

describe('Registry types', () => {
  it('should create a valid AgentRegistry', () => {
    const entry: AgentEntry = {
      name: 'developer',
      description: 'Core development agent',
      category: 'development',
      tier: 'mandatory',
      model: 'claude-sonnet-4-20250514',
      tools: ['Read', 'Edit', 'Bash'],
      domains: ['api'],
      status: 'active',
    };
    const registry: AgentRegistry = { agents: [entry] };
    expect(registry.agents).toHaveLength(1);
    expect(registry.agents[0]!.category).toBe('development');
  });
});

describe('Tech debt types', () => {
  it('should create a valid TechDebtRegister', () => {
    const item: TechDebtItem = {
      id: 'TD-001',
      title: 'Tight coupling in auth module',
      description: 'Auth is tightly coupled to user service',
      domain: 'auth',
      severity: 'high',
      type: 'coupling',
      detected: '2025-01-01',
      detectedBy: 'architecture-reviewer',
      effort: 'L',
      impact: 'Hard to test auth independently',
      proposedFix: 'Extract auth interface',
      status: 'open',
      linkedTasks: ['TASK-001'],
    };
    const register: TechDebtRegister = {
      items: [item],
      metrics: { total: 1, open: 1, resolvedThisMonth: 0, trend: 'stable' },
    };
    expect(register.items).toHaveLength(1);
    expect(register.metrics.trend).toBe('stable');
  });
});
