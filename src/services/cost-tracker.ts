/**
 * Cost tracking service for agent invocations.
 * Captures per-agent costs, computes session totals,
 * persists session logs, and aggregates cost reports.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/state-io.js';

export interface CostEntry {
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turnsUsed: number;
  toolCalls: number;
  timestamp: string;
}

export interface SessionCostSummary {
  sessionId: string;
  workflowId: string;
  backlogItemId: string;
  sessionType: string;
  startTime: string;
  endTime: string;
  agents: CostEntry[];
  totalCost: number;
  totalTurns: number;
  /** Session outcome — populated when available (e.g., from SessionLog merge). */
  result?: 'success' | 'failure' | 'escalated';
  /** Complexity tier — populated from backlog item when available. */
  complexity?: 'S' | 'M' | 'L' | 'XL';
  /** Affected domains — populated from classification when available. */
  domains?: string[];
}

export interface PeriodCostReport {
  period: string;
  totalCost: number;
  bySessionType: Record<string, { count: number; totalCost: number; avgCost: number }>;
  byDomain: Record<string, { totalCost: number; percentage: number }>;
  byModel: Record<string, { totalCost: number; percentage: number }>;
}

/**
 * Start tracking a new session. Initializes a summary with zero totals.
 */
export function startSession(
  sessionId: string,
  workflowId: string,
  backlogItemId: string,
  sessionType: string,
): SessionCostSummary {
  return {
    sessionId,
    workflowId,
    backlogItemId,
    sessionType,
    startTime: new Date().toISOString(),
    endTime: '',
    agents: [],
    totalCost: 0,
    totalTurns: 0,
  };
}

/**
 * Record an agent invocation cost. Returns a new summary with accumulated totals.
 */
export function recordAgentCost(
  session: SessionCostSummary,
  entry: CostEntry,
): SessionCostSummary {
  const agents = [...session.agents, entry];
  return {
    ...session,
    agents,
    totalCost: session.totalCost + entry.cost,
    totalTurns: session.totalTurns + entry.turnsUsed,
  };
}

/**
 * Build the history filename for a session.
 */
function historyFilename(session: SessionCostSummary): string {
  // Use startTime date portion as the timestamp prefix
  const ts = session.startTime.replace(/[:.]/g, '-');
  return `${ts}-${session.sessionType}-${session.workflowId}.json`;
}

/**
 * Finalize a session and write its log to .sdlc/history/.
 */
export async function finalizeSession(
  sdlcDir: string,
  session: SessionCostSummary,
): Promise<void> {
  const finalized: SessionCostSummary = {
    ...session,
    endTime: new Date().toISOString(),
  };
  const historyDir = join(sdlcDir, 'history');
  const filePath = join(historyDir, historyFilename(finalized));
  await writeJsonFile(filePath, finalized);
}

/**
 * Load all session logs from .sdlc/history/, optionally filtered to entries on or after `since`.
 */
export async function loadSessionLogs(
  sdlcDir: string,
  since?: string,
): Promise<SessionCostSummary[]> {
  const historyDir = join(sdlcDir, 'history');
  let files: string[];
  try {
    files = await readdir(historyDir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const logs: SessionCostSummary[] = [];

  for (const file of jsonFiles) {
    const log = await readJsonFile<SessionCostSummary>(join(historyDir, file));
    if (since && log.startTime < since) {
      continue;
    }
    logs.push(log);
  }

  return logs;
}

/**
 * Generate an aggregated cost report from a set of session logs.
 */
export function generateCostReport(
  logs: SessionCostSummary[],
  period: string,
): PeriodCostReport {
  const totalCost = logs.reduce((sum, l) => sum + l.totalCost, 0);

  // Aggregate by session type
  const bySessionType: PeriodCostReport['bySessionType'] = {};
  for (const log of logs) {
    const entry = bySessionType[log.sessionType] ?? { count: 0, totalCost: 0, avgCost: 0 };
    entry.count += 1;
    entry.totalCost += log.totalCost;
    entry.avgCost = entry.totalCost / entry.count;
    bySessionType[log.sessionType] = entry;
  }

  // Aggregate by model (across all agent entries)
  const modelTotals: Record<string, number> = {};
  for (const log of logs) {
    for (const agent of log.agents) {
      modelTotals[agent.model] = (modelTotals[agent.model] ?? 0) + agent.cost;
    }
  }
  const byModel: PeriodCostReport['byModel'] = {};
  for (const [model, cost] of Object.entries(modelTotals)) {
    byModel[model] = {
      totalCost: cost,
      percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
    };
  }

  // byDomain: use explicit domains array if available, otherwise 'unknown'
  const domainTotals: Record<string, number> = {};
  for (const log of logs) {
    const domains = log.domains && log.domains.length > 0 ? log.domains : ['unknown'];
    const costPerDomain = log.totalCost / domains.length;
    for (const domain of domains) {
      domainTotals[domain] = (domainTotals[domain] ?? 0) + costPerDomain;
    }
  }
  const byDomain: PeriodCostReport['byDomain'] = {};
  for (const [domain, cost] of Object.entries(domainTotals)) {
    byDomain[domain] = {
      totalCost: cost,
      percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
    };
  }

  return { period, totalCost, bySessionType, byDomain, byModel };
}

/**
 * Check whether a session has exceeded its per-session budget cap.
 */
export function checkBudget(
  session: SessionCostSummary,
  perSessionCap: number,
): { exceeded: boolean; amount: number; cap: number } {
  return {
    exceeded: session.totalCost > perSessionCap,
    amount: session.totalCost,
    cap: perSessionCap,
  };
}

/**
 * Check whether monthly spending has hit warning or hard-cap thresholds.
 */
export async function checkMonthlyBudget(
  sdlcDir: string,
  warningThreshold: number,
  hardCap: number,
): Promise<{ warning: boolean; exceeded: boolean; total: number }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const logs = await loadSessionLogs(sdlcDir, monthStart);
  const total = logs.reduce((sum, l) => sum + l.totalCost, 0);

  return {
    warning: total >= warningThreshold,
    exceeded: hardCap > 0 && total >= hardCap,
    total,
  };
}
