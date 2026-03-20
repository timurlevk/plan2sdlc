import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  startSession,
  recordAgentCost,
  finalizeSession,
  loadSessionLogs,
  generateCostReport,
  checkBudget,
  checkMonthlyBudget,
  type CostEntry,
  type SessionCostSummary,
} from '../services/cost-tracker.js';

function tmpSdlcDir(): string {
  return join(tmpdir(), `claude-sdlc-test-${randomUUID()}`);
}

function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    agentName: 'test-agent',
    model: 'claude-sonnet',
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.05,
    turnsUsed: 2,
    toolCalls: 3,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('startSession', () => {
  it('should create a summary with zero totals', () => {
    const session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    expect(session.sessionId).toBe('s1');
    expect(session.workflowId).toBe('wf1');
    expect(session.backlogItemId).toBe('BLI-001');
    expect(session.sessionType).toBe('EXECUTE');
    expect(session.agents).toEqual([]);
    expect(session.totalCost).toBe(0);
    expect(session.totalTurns).toBe(0);
    expect(session.startTime).toBeTruthy();
    expect(session.endTime).toBe('');
  });
});

describe('recordAgentCost', () => {
  it('should accumulate costs correctly', () => {
    let session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    const entry1 = makeCostEntry({ cost: 0.10, turnsUsed: 3 });
    const entry2 = makeCostEntry({ agentName: 'agent-2', cost: 0.25, turnsUsed: 5 });

    session = recordAgentCost(session, entry1);
    expect(session.agents).toHaveLength(1);
    expect(session.totalCost).toBeCloseTo(0.10);
    expect(session.totalTurns).toBe(3);

    session = recordAgentCost(session, entry2);
    expect(session.agents).toHaveLength(2);
    expect(session.totalCost).toBeCloseTo(0.35);
    expect(session.totalTurns).toBe(8);
  });

  it('should not mutate the original session', () => {
    const session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    const entry = makeCostEntry();
    const updated = recordAgentCost(session, entry);
    expect(session.totalCost).toBe(0);
    expect(updated.totalCost).toBeCloseTo(0.05);
  });
});

describe('finalizeSession + loadSessionLogs', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
    dirs.length = 0;
  });

  it('should write to .sdlc/history/ with correct filename pattern', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    let session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    session = recordAgentCost(session, makeCostEntry({ cost: 0.10 }));

    await finalizeSession(sdlcDir, session);

    const logs = await loadSessionLogs(sdlcDir);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.sessionId).toBe('s1');
    expect(logs[0]!.endTime).toBeTruthy();
    expect(logs[0]!.totalCost).toBeCloseTo(0.10);
  });

  it('should load multiple session logs', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    const s1 = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    const s2 = startSession('s2', 'wf2', 'BLI-002', 'REVIEW');

    await finalizeSession(sdlcDir, recordAgentCost(s1, makeCostEntry({ cost: 0.10 })));
    await finalizeSession(sdlcDir, recordAgentCost(s2, makeCostEntry({ cost: 0.20 })));

    const logs = await loadSessionLogs(sdlcDir);
    expect(logs).toHaveLength(2);
  });

  it('should filter logs by since date', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    // Create a session with an old startTime
    const oldSession: SessionCostSummary = {
      ...startSession('s-old', 'wf1', 'BLI-001', 'EXECUTE'),
      startTime: '2020-01-01T00:00:00.000Z',
    };
    const newSession = startSession('s-new', 'wf2', 'BLI-002', 'REVIEW');

    await finalizeSession(sdlcDir, oldSession);
    await finalizeSession(sdlcDir, newSession);

    const logs = await loadSessionLogs(sdlcDir, '2025-01-01T00:00:00.000Z');
    expect(logs).toHaveLength(1);
    expect(logs[0]!.sessionId).toBe('s-new');
  });

  it('should return empty array when history directory does not exist', async () => {
    const logs = await loadSessionLogs('/nonexistent/path');
    expect(logs).toEqual([]);
  });
});

describe('generateCostReport', () => {
  it('should aggregate by session type and model', () => {
    const logs: SessionCostSummary[] = [
      {
        ...startSession('s1', 'wf1', 'TASK-001', 'EXECUTE'),
        totalCost: 0.50,
        domains: ['frontend'],
        agents: [
          makeCostEntry({ model: 'claude-sonnet', cost: 0.30 }),
          makeCostEntry({ model: 'claude-opus', cost: 0.20 }),
        ],
      },
      {
        ...startSession('s2', 'wf2', 'TASK-002', 'EXECUTE'),
        totalCost: 0.40,
        domains: ['backend'],
        agents: [
          makeCostEntry({ model: 'claude-sonnet', cost: 0.40 }),
        ],
      },
      {
        ...startSession('s3', 'wf3', 'TASK-003', 'REVIEW'),
        totalCost: 0.10,
        domains: ['frontend'],
        agents: [
          makeCostEntry({ model: 'claude-opus', cost: 0.10 }),
        ],
      },
    ];

    const report = generateCostReport(logs, '2026-03-weekly');

    // Total
    expect(report.period).toBe('2026-03-weekly');
    expect(report.totalCost).toBeCloseTo(1.00);

    // By session type
    expect(report.bySessionType['EXECUTE']!.count).toBe(2);
    expect(report.bySessionType['EXECUTE']!.totalCost).toBeCloseTo(0.90);
    expect(report.bySessionType['EXECUTE']!.avgCost).toBeCloseTo(0.45);
    expect(report.bySessionType['REVIEW']!.count).toBe(1);

    // By model
    expect(report.byModel['claude-sonnet']!.totalCost).toBeCloseTo(0.70);
    expect(report.byModel['claude-opus']!.totalCost).toBeCloseTo(0.30);
    expect(report.byModel['claude-sonnet']!.percentage).toBeCloseTo(70);
    expect(report.byModel['claude-opus']!.percentage).toBeCloseTo(30);

    // By domain (extracted from backlogItemId prefix)
    expect(report.byDomain['frontend']!.totalCost).toBeCloseTo(0.60);
    expect(report.byDomain['backend']!.totalCost).toBeCloseTo(0.40);
  });

  it('should handle empty logs', () => {
    const report = generateCostReport([], '2026-03-monthly');
    expect(report.totalCost).toBe(0);
    expect(report.bySessionType).toEqual({});
    expect(report.byModel).toEqual({});
    expect(report.byDomain).toEqual({});
  });
});

describe('checkBudget', () => {
  it('should detect exceeded budget', () => {
    let session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    session = recordAgentCost(session, makeCostEntry({ cost: 1.50 }));

    const result = checkBudget(session, 1.00);
    expect(result.exceeded).toBe(true);
    expect(result.amount).toBeCloseTo(1.50);
    expect(result.cap).toBe(1.00);
  });

  it('should detect not-exceeded budget', () => {
    let session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    session = recordAgentCost(session, makeCostEntry({ cost: 0.50 }));

    const result = checkBudget(session, 1.00);
    expect(result.exceeded).toBe(false);
    expect(result.amount).toBeCloseTo(0.50);
  });

  it('should not exceed when exactly at cap', () => {
    let session = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    session = recordAgentCost(session, makeCostEntry({ cost: 1.00 }));

    const result = checkBudget(session, 1.00);
    expect(result.exceeded).toBe(false);
  });
});

describe('checkMonthlyBudget', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
    dirs.length = 0;
  });

  it('should aggregate from history files and detect warning/exceeded', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    // Create sessions with costs that sum to 1.50
    let s1 = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    s1 = recordAgentCost(s1, makeCostEntry({ cost: 0.80 }));
    await finalizeSession(sdlcDir, s1);

    let s2 = startSession('s2', 'wf2', 'BLI-002', 'REVIEW');
    s2 = recordAgentCost(s2, makeCostEntry({ cost: 0.70 }));
    await finalizeSession(sdlcDir, s2);

    // Warning at 1.00, hard cap at 2.00
    const result = await checkMonthlyBudget(sdlcDir, 1.00, 2.00);
    expect(result.warning).toBe(true);
    expect(result.exceeded).toBe(false);
    expect(result.total).toBeCloseTo(1.50);
  });

  it('should detect hard cap exceeded', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    let s1 = startSession('s1', 'wf1', 'BLI-001', 'EXECUTE');
    s1 = recordAgentCost(s1, makeCostEntry({ cost: 5.00 }));
    await finalizeSession(sdlcDir, s1);

    const result = await checkMonthlyBudget(sdlcDir, 1.00, 2.00);
    expect(result.warning).toBe(true);
    expect(result.exceeded).toBe(true);
    expect(result.total).toBeCloseTo(5.00);
  });

  it('should return zeros when no history exists', async () => {
    const sdlcDir = tmpSdlcDir();
    dirs.push(sdlcDir);

    const result = await checkMonthlyBudget(sdlcDir, 1.00, 2.00);
    expect(result.warning).toBe(false);
    expect(result.exceeded).toBe(false);
    expect(result.total).toBe(0);
  });
});
