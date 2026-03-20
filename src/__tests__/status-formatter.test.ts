import { describe, it, expect } from 'vitest';
import { formatStatus, type StatusData } from '../services/status-formatter.js';
import type { BacklogItem } from '../types/backlog.js';
import type { WorkflowState } from '../types/workflow.js';
import type { TechDebtRegister } from '../types/tech-debt.js';

function emptyState(): WorkflowState {
  return {
    activeWorkflows: [],
    cadence: { mergesSinceRetro: 0 },
    sessionQueue: [],
    domainLocks: {},
  };
}

function makeItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: 'TASK-001',
    title: 'Test task',
    description: 'desc',
    type: 'feature',
    complexity: 'M',
    domains: [],
    tags: [],
    status: 'inbox',
    priority: 'medium',
    created: '2026-03-15T00:00:00Z',
    updated: '2026-03-15T00:00:00Z',
    sessions: [],
    ...overrides,
  };
}

const NOW = new Date('2026-03-20T12:00:00Z');

describe('formatStatus', () => {
  it('shows "No items" messages for empty data', () => {
    const data: StatusData = {
      backlog: [],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('BACKLOG (0 items)');
    expect(output).toContain('No items.');
    expect(output).toContain('No active workflows.');
    expect(output).toContain('No recent completions.');
    expect(output).not.toContain('TECH DEBT');
    expect(output).not.toContain('DOMAIN LOCKS');
  });

  it('shows backlog items in correct table format and sorted by priority then status', () => {
    const data: StatusData = {
      backlog: [
        makeItem({ id: 'TASK-001', priority: 'low', status: 'inbox', title: 'Low task' }),
        makeItem({ id: 'TASK-002', priority: 'critical', status: 'planned', title: 'Critical planned' }),
        makeItem({ id: 'TASK-003', priority: 'critical', status: 'executing', title: 'Critical exec' }),
        makeItem({ id: 'TASK-004', priority: 'medium', status: 'triaged', title: 'Medium triaged' }),
      ],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);

    expect(output).toContain('BACKLOG (4 items)');

    // Check ordering: critical executing before critical planned before medium before low
    const lines = output.split('\n');
    const itemLines = lines.filter((l) => l.startsWith('TASK-'));
    expect(itemLines).toHaveLength(4);
    expect(itemLines[0]).toContain('TASK-003');
    expect(itemLines[1]).toContain('TASK-002');
    expect(itemLines[2]).toContain('TASK-004');
    expect(itemLines[3]).toContain('TASK-001');

    // Check format
    expect(itemLines[0]).toContain('[M]');
    expect(itemLines[0]).toContain('feature');
    expect(itemLines[0]).toContain('critical');
    expect(itemLines[0]).toContain('"Critical exec"');
    expect(itemLines[0]).toContain('executing');
  });

  it('excludes done and abandoned items from backlog', () => {
    const data: StatusData = {
      backlog: [
        makeItem({ id: 'TASK-001', status: 'done' }),
        makeItem({ id: 'TASK-002', status: 'abandoned' }),
        makeItem({ id: 'TASK-003', status: 'inbox' }),
      ],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('BACKLOG (1 items)');
    expect(output).toContain('TASK-003');
  });

  it('shows active workflows', () => {
    const state = emptyState();
    state.activeWorkflows = [
      {
        id: 'WF-001',
        backlogItemId: 'TASK-005',
        currentSession: 'EXECUTE',
        context: { reviewAttempt: 0, maxRetries: 3 },
        history: [],
        startedAt: '2026-03-19T10:00:00Z',
        totalCost: 0.5,
      },
    ];

    const data: StatusData = {
      backlog: [],
      state,
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('ACTIVE WORKFLOWS');
    expect(output).toContain('WF-001');
    expect(output).toContain('TASK-005');
    expect(output).toContain('EXECUTE');
  });

  it('shows domain locks when present', () => {
    const state = emptyState();
    state.domainLocks = {
      auth: { workflowId: 'WF-001', lockedAt: '2026-03-19T10:00:00Z' },
      payments: null,
    };

    const data: StatusData = {
      backlog: [],
      state,
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('DOMAIN LOCKS');
    expect(output).toContain('auth: locked by WF-001');
    expect(output).not.toContain('payments');
  });

  it('shows done items completed within last 7 days in RECENT', () => {
    const data: StatusData = {
      backlog: [
        makeItem({
          id: 'TASK-010',
          status: 'done',
          title: 'Recent done',
          updated: '2026-03-18T00:00:00Z',
          actualCost: 1.25,
          sessions: [
            { sessionType: 'EXECUTE', timestamp: '2026-03-18T00:00:00Z', result: 'completed', cost: 1.25, agentsUsed: ['dev'] },
          ],
        }),
      ],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('RECENT (last 7 days)');
    expect(output).toContain('TASK-010');
    expect(output).toContain('"Recent done"');
    expect(output).toContain('$1.25');
    expect(output).toContain('1 sessions');
  });

  it('excludes done items older than 7 days from RECENT', () => {
    const data: StatusData = {
      backlog: [
        makeItem({
          id: 'TASK-011',
          status: 'done',
          title: 'Old done',
          updated: '2026-03-01T00:00:00Z',
        }),
      ],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('No recent completions.');
    expect(output).not.toContain('TASK-011');
  });

  it('shows tech debt summary when data is provided', () => {
    const techDebt: TechDebtRegister = {
      items: [
        {
          id: 'TD-001',
          title: 'Coupling issue',
          description: 'desc',
          domain: 'auth',
          severity: 'high',
          type: 'coupling',
          detected: '2026-03-10',
          detectedBy: 'arch-agent',
          effort: 'M',
          impact: 'hard to test',
          proposedFix: 'extract interface',
          status: 'open',
          linkedTasks: [],
        },
        {
          id: 'TD-002',
          title: 'Perf issue',
          description: 'desc',
          domain: 'api',
          severity: 'critical',
          type: 'performance',
          detected: '2026-03-12',
          detectedBy: 'perf-agent',
          effort: 'L',
          impact: 'slow queries',
          proposedFix: 'add index',
          status: 'open',
          linkedTasks: [],
        },
      ],
      metrics: {
        total: 2,
        open: 2,
        resolvedThisMonth: 0,
        trend: 'worsening',
      },
    };

    const data: StatusData = {
      backlog: [],
      state: emptyState(),
      techDebt,
    };
    const output = formatStatus(data, NOW);
    expect(output).toContain('TECH DEBT (2 items, 2 open, trend: worsening)');
    expect(output).toContain('critical: 1 items');
    expect(output).toContain('high: 1 items');
  });

  it('skips tech debt section when no tech debt data', () => {
    const data: StatusData = {
      backlog: [],
      state: emptyState(),
      techDebt: null,
    };
    const output = formatStatus(data, NOW);
    expect(output).not.toContain('TECH DEBT');
  });

  it('skips tech debt section when items array is empty', () => {
    const data: StatusData = {
      backlog: [],
      state: emptyState(),
      techDebt: {
        items: [],
        metrics: { total: 0, open: 0, resolvedThisMonth: 0, trend: 'stable' },
      },
    };
    const output = formatStatus(data, NOW);
    expect(output).not.toContain('TECH DEBT');
  });
});
