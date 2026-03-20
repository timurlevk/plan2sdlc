import { describe, it, expect } from 'vitest';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(__dirname, '..', '..', 'schema');

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(resolve(schemaDir, name), 'utf-8'));
}

function compileSchema(name: string): ValidateFunction {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(loadSchema(name));
}

// ─── backlog.schema.json ───

describe('backlog.schema.json', () => {
  const validate = compileSchema('backlog.schema.json');

  it('validates a valid backlog', () => {
    const valid = validate({
      schemaVersion: 1,
      items: [
        {
          id: 'TASK-001',
          title: 'Add login page',
          description: 'Implement OAuth login',
          type: 'feature',
          complexity: 'M',
          domains: ['frontend'],
          tags: ['auth'],
          status: 'inbox',
          priority: 'high',
          created: '2026-01-15T10:00:00Z',
          updated: '2026-01-15T10:00:00Z',
          sessions: [],
        },
      ],
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates a backlog item with optional fields', () => {
    const valid = validate({
      schemaVersion: 1,
      items: [
        {
          id: 'TASK-042',
          title: 'Refactor DB layer',
          description: 'Extract repository pattern',
          type: 'refactor',
          complexity: 'L',
          domains: ['backend', 'database'],
          tags: ['tech-debt'],
          status: 'planned',
          priority: 'medium',
          specPath: '.sdlc/specs/TASK-042.md',
          planPath: '.sdlc/plans/TASK-042.md',
          workflowId: 'WF-001',
          created: '2026-02-01T08:30:00Z',
          updated: '2026-02-02T14:00:00Z',
          sessions: [
            {
              sessionType: 'PLAN',
              timestamp: '2026-02-01T09:00:00Z',
              result: 'approved',
              cost: 0.45,
              agentsUsed: ['orchestrator', 'architect'],
            },
          ],
          estimatedCost: 2.5,
          actualCost: 1.8,
        },
      ],
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects an empty backlog item', () => {
    expect(validate({ schemaVersion: 1, items: [{}] })).toBe(false);
  });

  it('rejects missing schemaVersion', () => {
    expect(validate({ items: [] })).toBe(false);
  });

  it('rejects invalid task id format', () => {
    expect(
      validate({
        schemaVersion: 1,
        items: [
          {
            id: 'BAD-ID',
            title: 'Test',
            description: 'Test',
            type: 'feature',
            complexity: 'S',
            domains: [],
            tags: [],
            status: 'inbox',
            priority: 'low',
            created: '2026-01-01T00:00:00Z',
            updated: '2026-01-01T00:00:00Z',
            sessions: [],
          },
        ],
      }),
    ).toBe(false);
  });

  it('rejects invalid status enum', () => {
    expect(
      validate({
        schemaVersion: 1,
        items: [
          {
            id: 'TASK-001',
            title: 'Test',
            description: 'Test',
            type: 'feature',
            complexity: 'S',
            domains: [],
            tags: [],
            status: 'unknown-status',
            priority: 'low',
            created: '2026-01-01T00:00:00Z',
            updated: '2026-01-01T00:00:00Z',
            sessions: [],
          },
        ],
      }),
    ).toBe(false);
  });
});

// ─── state.schema.json ───

describe('state.schema.json', () => {
  const validate = compileSchema('state.schema.json');

  it('validates a valid workflow state', () => {
    const valid = validate({
      schemaVersion: 1,
      activeWorkflows: [
        {
          id: 'WF-001',
          backlogItemId: 'TASK-001',
          currentSession: 'EXECUTE',
          context: {
            specPath: '.sdlc/specs/TASK-001.md',
            reviewAttempt: 0,
            maxRetries: 3,
          },
          history: [],
          startedAt: '2026-03-01T10:00:00Z',
          totalCost: 1.2,
        },
      ],
      cadence: {
        lastRetro: '2026-02-15T10:00:00Z',
        mergesSinceRetro: 5,
      },
      sessionQueue: [
        {
          sessionType: 'REVIEW',
          backlogItemId: 'TASK-002',
          priority: 'high',
        },
      ],
      domainLocks: {
        frontend: {
          workflowId: 'WF-001',
          lockedAt: '2026-03-01T10:00:00Z',
        },
        backend: null,
      },
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates a minimal workflow state', () => {
    const valid = validate({
      schemaVersion: 1,
      activeWorkflows: [],
      cadence: { mergesSinceRetro: 0 },
      sessionQueue: [],
      domainLocks: {},
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(validate({ schemaVersion: 1, activeWorkflows: [] })).toBe(false);
  });

  it('rejects missing schemaVersion', () => {
    expect(
      validate({
        activeWorkflows: [],
        cadence: { mergesSinceRetro: 0 },
        sessionQueue: [],
        domainLocks: {},
      }),
    ).toBe(false);
  });

  it('rejects invalid workflow id format', () => {
    expect(
      validate({
        schemaVersion: 1,
        activeWorkflows: [
          {
            id: 'BAD',
            backlogItemId: 'TASK-001',
            currentSession: 'EXECUTE',
            context: { reviewAttempt: 0, maxRetries: 3 },
            history: [],
            startedAt: '2026-03-01T10:00:00Z',
            totalCost: 0,
          },
        ],
        cadence: { mergesSinceRetro: 0 },
        sessionQueue: [],
        domainLocks: {},
      }),
    ).toBe(false);
  });
});

// ─── session-log.schema.json ───

describe('session-log.schema.json', () => {
  const validate = compileSchema('session-log.schema.json');

  it('validates a valid session log', () => {
    const valid = validate({
      schemaVersion: 1,
      id: 'SL-001',
      workflowId: 'WF-001',
      backlogItemId: 'TASK-001',
      sessionType: 'EXECUTE',
      startTime: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T10:15:00Z',
      agents: [
        {
          name: 'coder',
          model: 'claude-sonnet-4-20250514',
          inputTokens: 5000,
          outputTokens: 2000,
          cost: 0.35,
          turnsUsed: 4,
          toolCalls: 12,
          result: 'success',
        },
      ],
      totalCost: 0.35,
      result: 'completed',
      turnsUsed: 4,
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects missing agents field', () => {
    expect(
      validate({
        schemaVersion: 1,
        id: 'SL-001',
        workflowId: 'WF-001',
        backlogItemId: 'TASK-001',
        sessionType: 'EXECUTE',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T10:15:00Z',
        totalCost: 0,
        result: 'completed',
        turnsUsed: 0,
      }),
    ).toBe(false);
  });

  it('rejects invalid agent result enum', () => {
    expect(
      validate({
        schemaVersion: 1,
        id: 'SL-001',
        workflowId: 'WF-001',
        backlogItemId: 'TASK-001',
        sessionType: 'EXECUTE',
        startTime: '2026-03-01T10:00:00Z',
        endTime: '2026-03-01T10:15:00Z',
        agents: [
          {
            name: 'coder',
            model: 'claude-sonnet-4-20250514',
            inputTokens: 5000,
            outputTokens: 2000,
            cost: 0.35,
            turnsUsed: 4,
            toolCalls: 12,
            result: 'invalid-result',
          },
        ],
        totalCost: 0.35,
        result: 'completed',
        turnsUsed: 4,
      }),
    ).toBe(false);
  });
});

// ─── config.schema.json ───

describe('config.schema.json', () => {
  const validate = compileSchema('config.schema.json');

  it('validates a valid config', () => {
    const valid = validate({
      schemaVersion: 1,
      project: {
        name: 'my-app',
        type: 'single-app',
        techStack: ['typescript', 'nextjs', 'prisma'],
      },
      domains: {
        frontend: {
          path: 'apps/web',
          techStack: ['react', 'tailwind'],
          rules: ['no-any'],
        },
      },
      workflow: {
        complexityThresholds: { S: 5, M: 15, L: 30, XL: 60 },
        autoQuickFix: true,
        autoMerge: false,
        maxRetries: 3,
        requireArchReview: true,
      },
      triggers: {
        retro: { cadence: 'weekly', mergeThreshold: 10 },
        gapAnalysis: 'monthly',
        architectureReview: 'quarterly',
        securityReview: 'monthly',
      },
      budget: {
        perSession: { QUICK_FIX: 0.5, EXECUTE: 5.0 },
        monthlyWarning: 50,
        monthlyHardCap: 100,
        preferredModels: { default: 'claude-sonnet-4-20250514' },
      },
      hitl: {
        mergeApproval: true,
        budgetApproval: true,
        silentMode: false,
      },
      git: {
        releaseBranch: 'release',
        mainBranch: 'main',
        commitPrefix: 'sdlc',
        tagFormat: 'v{version}',
      },
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates a minimal config', () => {
    const valid = validate({
      schemaVersion: 1,
      project: { name: 'test', type: 'auto' },
      workflow: { maxRetries: 3 },
      budget: { monthlyWarning: 50, monthlyHardCap: 100 },
      hitl: {},
      git: {},
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects missing required project field', () => {
    expect(
      validate({
        schemaVersion: 1,
        workflow: { maxRetries: 3 },
        budget: { monthlyWarning: 50, monthlyHardCap: 100 },
        hitl: {},
        git: {},
      }),
    ).toBe(false);
  });

  it('rejects invalid project type', () => {
    expect(
      validate({
        schemaVersion: 1,
        project: { name: 'test', type: 'invalid-type' },
        workflow: { maxRetries: 3 },
        budget: { monthlyWarning: 50, monthlyHardCap: 100 },
        hitl: {},
        git: {},
      }),
    ).toBe(false);
  });
});

// ─── registry.schema.json ───

describe('registry.schema.json', () => {
  const validate = compileSchema('registry.schema.json');

  it('validates a valid registry', () => {
    const valid = validate({
      schemaVersion: 1,
      agents: [
        {
          name: 'orchestrator',
          description: 'Main entry point agent',
          category: 'governance',
          tier: 'mandatory',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Bash', 'Grep'],
          domains: ['*'],
          status: 'active',
        },
        {
          name: 'coder',
          description: 'Implementation agent',
          category: 'development',
          tier: 'auto-detected',
          model: 'claude-sonnet-4-20250514',
          tools: ['Read', 'Edit', 'Write', 'Bash'],
          domains: ['frontend', 'backend'],
          status: 'idle',
          metrics: {
            totalSessions: 42,
            successRate: 0.95,
            avgCost: 1.2,
            avgTurns: 8,
            retryRate: 0.05,
            lastUsed: '2026-03-15T10:00:00Z',
            trend: 'stable',
          },
        },
      ],
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates an empty registry', () => {
    const valid = validate({ schemaVersion: 1, agents: [] });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects agent with invalid category', () => {
    expect(
      validate({
        schemaVersion: 1,
        agents: [
          {
            name: 'bad-agent',
            description: 'test',
            category: 'nonexistent',
            tier: 'mandatory',
            model: 'test',
            tools: [],
            domains: [],
            status: 'active',
          },
        ],
      }),
    ).toBe(false);
  });

  it('rejects agent missing required name', () => {
    expect(
      validate({
        schemaVersion: 1,
        agents: [
          {
            description: 'test',
            category: 'governance',
            tier: 'mandatory',
            model: 'test',
            tools: [],
            domains: [],
            status: 'active',
          },
        ],
      }),
    ).toBe(false);
  });
});

// ─── tech-debt.schema.json ───

describe('tech-debt.schema.json', () => {
  const validate = compileSchema('tech-debt.schema.json');

  it('validates a valid tech debt register', () => {
    const valid = validate({
      schemaVersion: 1,
      items: [
        {
          id: 'TD-001',
          title: 'Circular dependency in auth module',
          description: 'Auth and user modules have circular imports',
          domain: 'backend',
          severity: 'high',
          type: 'coupling',
          detected: '2026-01-10',
          detectedBy: 'architecture-reviewer',
          effort: 'M',
          impact: 'Slows build and makes testing harder',
          proposedFix: 'Extract shared interfaces to a common module',
          status: 'open',
          linkedTasks: ['TASK-015'],
          resolvedDate: null,
        },
      ],
      metrics: {
        total: 1,
        open: 1,
        resolvedThisMonth: 0,
        trend: 'stable',
      },
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('validates a resolved tech debt item', () => {
    const valid = validate({
      schemaVersion: 1,
      items: [
        {
          id: 'TD-002',
          title: 'Deprecated API usage',
          description: 'Using deprecated v1 API endpoints',
          domain: 'frontend',
          severity: 'medium',
          type: 'obsolete',
          detected: '2026-01-05',
          detectedBy: 'dependency-auditor',
          effort: 'S',
          impact: 'Will break when v1 is removed',
          proposedFix: 'Migrate to v2 endpoints',
          status: 'resolved',
          linkedTasks: ['TASK-020'],
          resolvedDate: '2026-02-15',
        },
      ],
      metrics: {
        total: 1,
        open: 0,
        resolvedThisMonth: 1,
        trend: 'improving',
      },
    });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
  });

  it('rejects invalid tech debt id format', () => {
    expect(
      validate({
        schemaVersion: 1,
        items: [
          {
            id: 'INVALID',
            title: 'Test',
            description: 'Test',
            domain: 'backend',
            severity: 'low',
            type: 'complexity',
            detected: '2026-01-01',
            detectedBy: 'test',
            effort: 'S',
            impact: 'test',
            proposedFix: 'test',
            status: 'open',
            linkedTasks: [],
          },
        ],
        metrics: { total: 1, open: 1, resolvedThisMonth: 0, trend: 'stable' },
      }),
    ).toBe(false);
  });

  it('rejects missing metrics', () => {
    expect(validate({ schemaVersion: 1, items: [] })).toBe(false);
  });
});
