import { describe, it, expect } from 'vitest';
import type { SessionCostSummary, CostEntry } from '../services/cost-tracker.js';
import { computeAgentMetrics, computeWorkflowMetrics } from '../services/metrics.js';

// ── Test helpers ──────────────────────────────────────────────

function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    agentName: 'test-agent',
    model: 'claude-sonnet',
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.05,
    turnsUsed: 2,
    toolCalls: 3,
    timestamp: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionCostSummary> = {}): SessionCostSummary {
  return {
    sessionId: 's1',
    workflowId: 'wf1',
    backlogItemId: 'BLI-001',
    sessionType: 'EXECUTE',
    startTime: '2026-03-15T10:00:00.000Z',
    endTime: '2026-03-15T10:30:00.000Z',
    agents: [makeCostEntry()],
    totalCost: 0.05,
    totalTurns: 2,
    result: 'success',
    ...overrides,
  };
}

// ── computeAgentMetrics ───────────────────────────────────────

describe('computeAgentMetrics', () => {
  it('should return empty report with no logs', () => {
    const report = computeAgentMetrics([]);
    expect(report.agents).toEqual({});
    expect(report.alerts).toEqual([]);
  });

  it('should compute metrics for a successful agent', () => {
    const logs = [
      makeSession({ sessionId: 's1', result: 'success' }),
      makeSession({ sessionId: 's2', backlogItemId: 'BLI-002', result: 'success' }),
      makeSession({ sessionId: 's3', backlogItemId: 'BLI-003', result: 'success' }),
    ];

    const report = computeAgentMetrics(logs);
    const metrics = report.agents['test-agent'];

    expect(metrics).toBeDefined();
    expect(metrics!.totalSessions).toBe(3);
    expect(metrics!.successRate).toBe(100);
    expect(metrics!.avgCost).toBeCloseTo(0.05);
    expect(metrics!.avgTurns).toBe(2);
    expect(metrics!.retryRate).toBe(0);
    // No alerts for a healthy agent with typical cost
    expect(report.alerts.filter((a) => a.includes('test-agent'))).toEqual([]);
  });

  it('should generate alert when success rate < 80%', () => {
    const logs = [
      makeSession({ sessionId: 's1', backlogItemId: 'BLI-001', result: 'success' }),
      makeSession({ sessionId: 's2', backlogItemId: 'BLI-002', result: 'failure' }),
      makeSession({ sessionId: 's3', backlogItemId: 'BLI-003', result: 'failure' }),
      makeSession({ sessionId: 's4', backlogItemId: 'BLI-004', result: 'failure' }),
      makeSession({ sessionId: 's5', backlogItemId: 'BLI-005', result: 'escalated' }),
    ];

    const report = computeAgentMetrics(logs);
    const metrics = report.agents['test-agent'];

    expect(metrics!.successRate).toBe(20);
    expect(report.alerts).toContainEqual(
      expect.stringContaining('test-agent needs prompt refinement'),
    );
  });

  it('should generate alert when retry rate > 15%', () => {
    // 5 sessions total, 3 sharing the same backlogItemId+sessionType = retry group
    // All 3 in retry group count as retries → 60% retry rate
    const logs = [
      makeSession({ sessionId: 's1', backlogItemId: 'BLI-001', sessionType: 'EXECUTE', result: 'success' }),
      makeSession({ sessionId: 's2', backlogItemId: 'BLI-001', sessionType: 'EXECUTE', result: 'success' }),
      makeSession({ sessionId: 's3', backlogItemId: 'BLI-001', sessionType: 'EXECUTE', result: 'success' }),
      makeSession({ sessionId: 's4', backlogItemId: 'BLI-002', sessionType: 'EXECUTE', result: 'success' }),
      makeSession({ sessionId: 's5', backlogItemId: 'BLI-003', sessionType: 'EXECUTE', result: 'success' }),
    ];

    const report = computeAgentMetrics(logs);
    const metrics = report.agents['test-agent'];

    expect(metrics!.retryRate).toBe(60);
    expect(report.alerts).toContainEqual(
      expect.stringContaining('test-agent high retry rate'),
    );
  });

  it('should generate alert when cost > 2x typical', () => {
    const cheapAgent = makeCostEntry({ agentName: 'cheap-agent', cost: 0.01 });
    const cheapAgent2 = makeCostEntry({ agentName: 'cheap-agent-2', cost: 0.01 });
    const expensiveAgent = makeCostEntry({ agentName: 'expensive-agent', cost: 0.50 });

    const logs = [
      makeSession({
        sessionId: 's1',
        backlogItemId: 'BLI-001',
        agents: [cheapAgent],
        result: 'success',
      }),
      makeSession({
        sessionId: 's2',
        backlogItemId: 'BLI-002',
        agents: [cheapAgent2],
        result: 'success',
      }),
      makeSession({
        sessionId: 's3',
        backlogItemId: 'BLI-003',
        agents: [expensiveAgent],
        result: 'success',
      }),
    ];

    const report = computeAgentMetrics(logs);
    expect(report.alerts).toContainEqual(
      expect.stringContaining('expensive-agent cost above average'),
    );
  });

  it('should generate alert when agent unused for 30+ days', () => {
    const oldTimestamp = '2025-01-01T00:00:00.000Z';
    const logs = [
      makeSession({
        sessionId: 's1',
        startTime: oldTimestamp,
        agents: [makeCostEntry({ agentName: 'stale-agent', timestamp: oldTimestamp })],
        result: 'success',
      }),
    ];

    const report = computeAgentMetrics(logs);
    expect(report.alerts).toContainEqual(
      expect.stringContaining('stale-agent unused for 30+ days'),
    );
  });

  it('should compute trend as stable for few sessions', () => {
    const logs = [
      makeSession({ sessionId: 's1', result: 'success' }),
    ];

    const report = computeAgentMetrics(logs);
    expect(report.agents['test-agent']!.trend).toBe('stable');
  });

  it('should compute trend as declining when recent sessions fail', () => {
    const logs: SessionCostSummary[] = [];
    // 10 old successes
    for (let i = 0; i < 10; i++) {
      logs.push(makeSession({
        sessionId: `s-old-${i}`,
        backlogItemId: `BLI-OLD-${i}`,
        startTime: `2026-03-01T${String(i).padStart(2, '0')}:00:00.000Z`,
        agents: [makeCostEntry({
          timestamp: `2026-03-01T${String(i).padStart(2, '0')}:00:00.000Z`,
        })],
        result: 'success',
      }));
    }
    // 10 recent failures
    for (let i = 0; i < 10; i++) {
      logs.push(makeSession({
        sessionId: `s-new-${i}`,
        backlogItemId: `BLI-NEW-${i}`,
        startTime: `2026-03-15T${String(i).padStart(2, '0')}:00:00.000Z`,
        agents: [makeCostEntry({
          timestamp: `2026-03-15T${String(i).padStart(2, '0')}:00:00.000Z`,
        })],
        result: 'failure',
      }));
    }

    const report = computeAgentMetrics(logs);
    expect(report.agents['test-agent']!.trend).toBe('declining');
  });
});

// ── computeWorkflowMetrics ────────────────────────────────────

describe('computeWorkflowMetrics', () => {
  it('should return empty metrics with no logs', () => {
    const metrics = computeWorkflowMetrics([]);
    expect(metrics.totalWorkflows).toBe(0);
    expect(metrics.avgCycleTime).toEqual({});
    expect(metrics.firstTimePassRate).toBe(0);
    expect(metrics.escalationRate).toBe(0);
    expect(metrics.costPerComplexity).toEqual({});
    expect(metrics.bottlenecks).toEqual([]);
  });

  it('should compute correct firstTimePassRate for complete workflows', () => {
    const logs = [
      // Workflow 1: EXECUTE then REVIEW (single review = first-time pass)
      makeSession({
        sessionId: 's1', workflowId: 'wf1', sessionType: 'EXECUTE',
        startTime: '2026-03-15T10:00:00.000Z', endTime: '2026-03-15T10:30:00.000Z',
        result: 'success', complexity: 'M',
      }),
      makeSession({
        sessionId: 's2', workflowId: 'wf1', sessionType: 'REVIEW',
        startTime: '2026-03-15T10:30:00.000Z', endTime: '2026-03-15T11:00:00.000Z',
        result: 'success', complexity: 'M',
      }),
      // Workflow 2: EXECUTE, REVIEW (failure), REVIEW (success) — NOT first-time pass
      makeSession({
        sessionId: 's3', workflowId: 'wf2', sessionType: 'EXECUTE',
        startTime: '2026-03-15T12:00:00.000Z', endTime: '2026-03-15T12:30:00.000Z',
        result: 'success', complexity: 'L',
      }),
      makeSession({
        sessionId: 's4', workflowId: 'wf2', sessionType: 'REVIEW',
        startTime: '2026-03-15T12:30:00.000Z', endTime: '2026-03-15T13:00:00.000Z',
        result: 'failure', complexity: 'L',
      }),
      makeSession({
        sessionId: 's5', workflowId: 'wf2', sessionType: 'REVIEW',
        startTime: '2026-03-15T13:00:00.000Z', endTime: '2026-03-15T13:30:00.000Z',
        result: 'success', complexity: 'L',
      }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    expect(metrics.totalWorkflows).toBe(2);
    // 1 out of 2 workflows passed on first review
    expect(metrics.firstTimePassRate).toBe(50);
  });

  it('should compute escalation rate', () => {
    const logs = [
      makeSession({ sessionId: 's1', workflowId: 'wf1', result: 'success' }),
      makeSession({ sessionId: 's2', workflowId: 'wf2', result: 'escalated' }),
      makeSession({ sessionId: 's3', workflowId: 'wf3', result: 'success' }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    expect(metrics.totalWorkflows).toBe(3);
    // 1 out of 3 workflows escalated = 33.33%
    expect(metrics.escalationRate).toBeCloseTo(33.33, 1);
  });

  it('should compute cycle time per complexity', () => {
    const logs = [
      makeSession({
        sessionId: 's1', workflowId: 'wf1', complexity: 'S',
        startTime: '2026-03-15T10:00:00.000Z', endTime: '2026-03-15T10:30:00.000Z',
      }),
      makeSession({
        sessionId: 's2', workflowId: 'wf2', complexity: 'L',
        startTime: '2026-03-15T11:00:00.000Z', endTime: '2026-03-15T13:00:00.000Z',
      }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    expect(metrics.avgCycleTime['S']).toBe(30);    // 30 minutes
    expect(metrics.avgCycleTime['L']).toBe(120);   // 120 minutes
  });

  it('should compute cost per complexity', () => {
    const logs = [
      makeSession({
        sessionId: 's1', workflowId: 'wf1', complexity: 'S', totalCost: 0.10,
      }),
      makeSession({
        sessionId: 's2', workflowId: 'wf2', complexity: 'S', totalCost: 0.20,
      }),
      makeSession({
        sessionId: 's3', workflowId: 'wf3', complexity: 'L', totalCost: 1.50,
      }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    // S: average of 0.10 and 0.20 = 0.15
    expect(metrics.costPerComplexity['S']).toBeCloseTo(0.15);
    expect(metrics.costPerComplexity['L']).toBeCloseTo(1.50);
  });

  it('should detect bottlenecks when a session type is 3x+ longer than average', () => {
    const logs = [
      // EXECUTE takes 10 minutes
      makeSession({
        sessionId: 's1', workflowId: 'wf1', sessionType: 'EXECUTE',
        startTime: '2026-03-15T10:00:00.000Z', endTime: '2026-03-15T10:10:00.000Z',
      }),
      // PLAN takes 10 minutes
      makeSession({
        sessionId: 's2', workflowId: 'wf1', sessionType: 'PLAN',
        startTime: '2026-03-15T09:00:00.000Z', endTime: '2026-03-15T09:10:00.000Z',
      }),
      // TRIAGE takes 10 minutes
      makeSession({
        sessionId: 's3', workflowId: 'wf1', sessionType: 'TRIAGE',
        startTime: '2026-03-15T08:00:00.000Z', endTime: '2026-03-15T08:10:00.000Z',
      }),
      // MERGE takes 10 minutes
      makeSession({
        sessionId: 's4', workflowId: 'wf1', sessionType: 'MERGE',
        startTime: '2026-03-15T11:00:00.000Z', endTime: '2026-03-15T11:10:00.000Z',
      }),
      // REVIEW takes 200 minutes — 5 types avg = (10+10+10+10+200)/5 = 48, so 200/48 ≈ 4.2x
      makeSession({
        sessionId: 's5', workflowId: 'wf1', sessionType: 'REVIEW',
        startTime: '2026-03-15T10:10:00.000Z', endTime: '2026-03-15T13:30:00.000Z',
      }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    expect(metrics.bottlenecks.length).toBeGreaterThan(0);
    expect(metrics.bottlenecks[0]).toContain('REVIEW');
    expect(metrics.bottlenecks[0]).toContain('longer than average');
  });

  it('should not report bottlenecks when durations are similar', () => {
    const logs = [
      makeSession({
        sessionId: 's1', workflowId: 'wf1', sessionType: 'EXECUTE',
        startTime: '2026-03-15T10:00:00.000Z', endTime: '2026-03-15T10:30:00.000Z',
      }),
      makeSession({
        sessionId: 's2', workflowId: 'wf1', sessionType: 'REVIEW',
        startTime: '2026-03-15T10:30:00.000Z', endTime: '2026-03-15T11:00:00.000Z',
      }),
    ];

    const metrics = computeWorkflowMetrics(logs);
    expect(metrics.bottlenecks).toEqual([]);
  });
});
