/**
 * Metrics service for agent health and workflow efficiency.
 * Aggregates performance data from session cost logs.
 */

import type { AgentMetrics, AgentTrend } from '../types/registry.js';
import type { SessionCostSummary } from './cost-tracker.js';

export interface WorkflowMetrics {
  totalWorkflows: number;
  avgCycleTime: Record<string, number>;      // per complexity in minutes
  firstTimePassRate: number;                  // % approved on first review
  escalationRate: number;                     // % needing HITL escalation
  costPerComplexity: Record<string, number>;  // S, M, L, XL
  bottlenecks: string[];                      // e.g., "REVIEW takes 3x longer than EXECUTE"
}

export interface AgentHealthReport {
  agents: Record<string, AgentMetrics>;
  alerts: string[];
}

/**
 * Compute per-agent metrics from session logs.
 *
 * For each agent appearing in logs:
 *   - totalSessions: count of sessions they participated in
 *   - successRate: % of sessions with result 'success' (not 'failure'/'escalated')
 *   - avgCost: average cost per session
 *   - avgTurns: average turns per session
 *   - retryRate: % of sessions that were retries (same backlogItemId + sessionType, count > 1)
 *   - lastUsed: most recent timestamp
 *   - trend: compare last 10 sessions to previous 10
 *
 * Alerts when:
 *   - success rate < 80%
 *   - avgCost > 2x typical (median across all agents)
 *   - retryRate > 15%
 *   - lastUsed > 30 days ago
 */
export function computeAgentMetrics(logs: SessionCostSummary[]): AgentHealthReport {
  if (logs.length === 0) {
    return { agents: {}, alerts: [] };
  }

  // Build a set of retry session IDs:
  // A session is a "retry" if there are multiple sessions with the same backlogItemId + sessionType
  const groupKey = (log: SessionCostSummary): string =>
    `${log.backlogItemId}::${log.sessionType}`;

  const groupCounts = new Map<string, number>();
  for (const log of logs) {
    const key = groupKey(log);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  const retryGroups = new Set<string>();
  for (const [key, count] of groupCounts) {
    if (count > 1) {
      retryGroups.add(key);
    }
  }

  // Per-agent accumulators
  interface AgentAccum {
    totalSessions: number;
    successCount: number;
    totalCost: number;
    totalTurns: number;
    retryCount: number;
    lastUsed: string;
    // Ordered list of session success booleans (chronological)
    sessionResults: { timestamp: string; success: boolean }[];
  }

  const accum = new Map<string, AgentAccum>();

  for (const log of logs) {
    const isRetry = retryGroups.has(groupKey(log));
    const isSuccess = log.result !== 'failure' && log.result !== 'escalated';

    for (const agent of log.agents) {
      let a = accum.get(agent.agentName);
      if (!a) {
        a = {
          totalSessions: 0,
          successCount: 0,
          totalCost: 0,
          totalTurns: 0,
          retryCount: 0,
          lastUsed: '',
          sessionResults: [],
        };
        accum.set(agent.agentName, a);
      }

      a.totalSessions += 1;
      if (isSuccess) a.successCount += 1;
      a.totalCost += agent.cost;
      a.totalTurns += agent.turnsUsed;
      if (isRetry) a.retryCount += 1;

      const ts = agent.timestamp || log.startTime;
      if (!a.lastUsed || ts > a.lastUsed) {
        a.lastUsed = ts;
      }

      a.sessionResults.push({ timestamp: ts, success: isSuccess });
    }
  }

  // Compute metrics
  const agentMetrics: Record<string, AgentMetrics> = {};
  const allAvgCosts: number[] = [];

  for (const [name, a] of accum) {
    const successRate = a.totalSessions > 0 ? (a.successCount / a.totalSessions) * 100 : 100;
    const avgCost = a.totalSessions > 0 ? a.totalCost / a.totalSessions : 0;
    const avgTurns = a.totalSessions > 0 ? a.totalTurns / a.totalSessions : 0;
    const retryRate = a.totalSessions > 0 ? (a.retryCount / a.totalSessions) * 100 : 0;

    // Trend: compare last 10 sessions vs previous 10
    const sorted = [...a.sessionResults].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    const trend = computeTrend(sorted);

    agentMetrics[name] = {
      totalSessions: a.totalSessions,
      successRate: Math.round(successRate * 100) / 100,
      avgCost: Math.round(avgCost * 10000) / 10000,
      avgTurns: Math.round(avgTurns * 100) / 100,
      retryRate: Math.round(retryRate * 100) / 100,
      lastUsed: a.lastUsed,
      trend,
    };

    allAvgCosts.push(avgCost);
  }

  // Compute typical (median) cost across all agents
  const typicalCost = median(allAvgCosts);

  // Generate alerts
  const alerts: string[] = [];
  const now = new Date();

  for (const [name, m] of Object.entries(agentMetrics)) {
    if (m.successRate !== undefined && m.successRate < 80) {
      alerts.push(
        `${name} needs prompt refinement (success rate ${m.successRate}%)`,
      );
    }

    if (m.avgCost !== undefined && typicalCost > 0 && m.avgCost > 2 * typicalCost) {
      alerts.push(
        `${name} cost above average ($${m.avgCost.toFixed(4)} vs $${typicalCost.toFixed(4)} typical)`,
      );
    }

    if (m.retryRate !== undefined && m.retryRate > 15) {
      alerts.push(
        `${name} high retry rate (${m.retryRate}%) — spec clarity issue?`,
      );
    }

    if (m.lastUsed) {
      const lastDate = new Date(m.lastUsed);
      const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 30) {
        alerts.push(
          `${name} unused for 30+ days — consider removing`,
        );
      }
    }
  }

  return { agents: agentMetrics, alerts };
}

/**
 * Compute workflow-level metrics from session logs.
 *
 * Groups by workflowId:
 *   - cycleTime: endTime of last session - startTime of first session, grouped by complexity
 *   - firstTimePassRate: workflows where REVIEW approved on first attempt
 *   - escalationRate: workflows with any 'escalated' result
 *   - costPerComplexity: total cost grouped by complexity
 *   - bottlenecks: compare avg duration of each session type, flag if any is 3x+ longer than average
 */
export function computeWorkflowMetrics(logs: SessionCostSummary[]): WorkflowMetrics {
  if (logs.length === 0) {
    return {
      totalWorkflows: 0,
      avgCycleTime: {},
      firstTimePassRate: 0,
      escalationRate: 0,
      costPerComplexity: {},
      bottlenecks: [],
    };
  }

  // Group by workflowId
  const workflows = new Map<string, SessionCostSummary[]>();
  for (const log of logs) {
    if (!log.workflowId) continue;
    const group = workflows.get(log.workflowId) ?? [];
    group.push(log);
    workflows.set(log.workflowId, group);
  }

  const totalWorkflows = workflows.size;

  // Cycle time per complexity
  const cycleTimesByComplexity = new Map<string, number[]>();
  // First-time pass tracking
  let firstTimePassCount = 0;
  let workflowsWithReview = 0;
  // Escalation tracking
  let escalatedCount = 0;
  // Cost per complexity
  const costByComplexity = new Map<string, number[]>();

  for (const [, sessions] of workflows) {
    // Sort by startTime
    const sorted = [...sessions].sort((a, b) => a.startTime.localeCompare(b.startTime));

    const firstStart = sorted[0]!.startTime;
    const lastEnd = sorted[sorted.length - 1]!.endTime || sorted[sorted.length - 1]!.startTime;

    // Cycle time in minutes
    const cycleMs = new Date(lastEnd).getTime() - new Date(firstStart).getTime();
    const cycleMinutes = cycleMs / (1000 * 60);

    // Determine complexity from the first session that has it
    const complexity = sorted.find((s) => s.complexity)?.complexity ?? 'unknown';
    const times = cycleTimesByComplexity.get(complexity) ?? [];
    times.push(cycleMinutes);
    cycleTimesByComplexity.set(complexity, times);

    // Total cost for this workflow
    const wfCost = sorted.reduce((sum, s) => sum + s.totalCost, 0);
    const costs = costByComplexity.get(complexity) ?? [];
    costs.push(wfCost);
    costByComplexity.set(complexity, costs);

    // First-time pass: check if REVIEW sessions exist and the first one was successful
    const reviewSessions = sorted.filter((s) => s.sessionType === 'REVIEW');
    if (reviewSessions.length > 0) {
      workflowsWithReview += 1;
      const firstReview = reviewSessions[0]!;
      if (firstReview.result === 'success' || firstReview.result === undefined) {
        // If result is undefined, we consider it a pass (no explicit failure)
        // But only if there's exactly one review (no retries)
        if (reviewSessions.length === 1) {
          firstTimePassCount += 1;
        }
      }
    }

    // Escalation: any session with escalated result
    const hasEscalation = sorted.some((s) => s.result === 'escalated');
    if (hasEscalation) {
      escalatedCount += 1;
    }
  }

  // Compute averages
  const avgCycleTime: Record<string, number> = {};
  for (const [complexity, times] of cycleTimesByComplexity) {
    avgCycleTime[complexity] = Math.round(
      (times.reduce((a, b) => a + b, 0) / times.length) * 100,
    ) / 100;
  }

  const firstTimePassRate = workflowsWithReview > 0
    ? Math.round((firstTimePassCount / workflowsWithReview) * 10000) / 100
    : 0;

  const escalationRate = totalWorkflows > 0
    ? Math.round((escalatedCount / totalWorkflows) * 10000) / 100
    : 0;

  const costPerComplexity: Record<string, number> = {};
  for (const [complexity, costs] of costByComplexity) {
    costPerComplexity[complexity] = Math.round(
      (costs.reduce((a, b) => a + b, 0) / costs.length) * 10000,
    ) / 10000;
  }

  // Bottleneck detection: compare avg duration of each session type
  const bottlenecks = detectBottlenecks(logs);

  return {
    totalWorkflows,
    avgCycleTime,
    firstTimePassRate,
    escalationRate,
    costPerComplexity,
    bottlenecks,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

function computeTrend(
  sorted: { timestamp: string; success: boolean }[],
): AgentTrend {
  if (sorted.length < 4) return 'stable';

  const recent = sorted.slice(-10);
  const previous = sorted.slice(-20, -10);

  if (previous.length === 0) return 'stable';

  const recentRate = recent.filter((r) => r.success).length / recent.length;
  const previousRate = previous.filter((r) => r.success).length / previous.length;

  const diff = recentRate - previousRate;
  if (diff > 0.1) return 'improving';
  if (diff < -0.1) return 'declining';
  return 'stable';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Detect bottlenecks by comparing average durations of each session type.
 * Flags any session type whose avg duration is 3x+ longer than the overall average.
 */
function detectBottlenecks(logs: SessionCostSummary[]): string[] {
  // Compute avg duration per session type
  const durationsByType = new Map<string, number[]>();

  for (const log of logs) {
    if (!log.startTime || !log.endTime) continue;
    const durationMs = new Date(log.endTime).getTime() - new Date(log.startTime).getTime();
    if (durationMs <= 0) continue;

    const durations = durationsByType.get(log.sessionType) ?? [];
    durations.push(durationMs);
    durationsByType.set(log.sessionType, durations);
  }

  if (durationsByType.size < 2) return [];

  const avgByType = new Map<string, number>();
  let totalAvg = 0;
  let typeCount = 0;

  for (const [type, durations] of durationsByType) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    avgByType.set(type, avg);
    totalAvg += avg;
    typeCount += 1;
  }

  const overallAvg = totalAvg / typeCount;

  const bottlenecks: string[] = [];
  for (const [type, avg] of avgByType) {
    if (avg >= 3 * overallAvg) {
      const ratio = Math.round(avg / overallAvg);
      bottlenecks.push(
        `${type} takes ${ratio}x longer than average`,
      );
    }
  }

  return bottlenecks;
}
