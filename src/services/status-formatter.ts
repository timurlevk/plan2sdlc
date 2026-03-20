/**
 * Formats SDLC status data into a displayable string.
 */

import type { BacklogItem, BacklogStatus, Priority } from '../types/backlog.js';
import type { WorkflowState } from '../types/workflow.js';
import type { TechDebtRegister, TechDebtSeverity } from '../types/tech-debt.js';

export interface StatusData {
  backlog: BacklogItem[];
  state: WorkflowState;
  techDebt: TechDebtRegister | null;
}

const SEPARATOR = '───────────────────────────────────────────────────────';

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  unprioritized: 4,
};

const STATUS_ORDER: Record<BacklogStatus, number> = {
  executing: 0,
  reviewing: 1,
  planned: 2,
  triaged: 3,
  inbox: 4,
  blocked: 5,
  done: 6,
  abandoned: 7,
};

/**
 * Pad or truncate a string to a fixed width.
 */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/**
 * Format status data into a displayable string.
 */
export function formatStatus(data: StatusData, now?: Date): string {
  const sections: string[] = [];

  sections.push(formatBacklog(data.backlog));
  sections.push(formatActiveWorkflows(data.state));
  const domainLocksSection = formatDomainLocks(data.state);
  if (domainLocksSection) {
    sections.push(domainLocksSection);
  }
  sections.push(formatRecent(data.backlog, now));

  const techDebtSection = formatTechDebt(data.techDebt);
  if (techDebtSection) {
    sections.push(techDebtSection);
  }

  return sections.join('\n\n');
}

function formatBacklog(items: BacklogItem[]): string {
  const active = items.filter((i) => i.status !== 'done' && i.status !== 'abandoned');

  if (active.length === 0) {
    return `BACKLOG (0 items)\n${SEPARATOR}\nNo items.`;
  }

  const sorted = [...active].sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  });

  const lines = sorted.map(
    (item) =>
      `${item.id}  [${item.complexity}] ${pad(item.type, 8)}  ${pad(item.priority, 8)}  "${item.title}"  ${item.status}`,
  );

  return `BACKLOG (${active.length} items)\n${SEPARATOR}\n${lines.join('\n')}`;
}

function formatActiveWorkflows(state: WorkflowState): string {
  const header = `ACTIVE WORKFLOWS\n${SEPARATOR}`;

  if (state.activeWorkflows.length === 0) {
    return `${header}\nNo active workflows.`;
  }

  const lines = state.activeWorkflows.map(
    (wf) => `${wf.id}  ${wf.backlogItemId}  ${wf.currentSession}`,
  );

  return `${header}\n${lines.join('\n')}`;
}

function formatDomainLocks(state: WorkflowState): string | null {
  const locked = Object.entries(state.domainLocks).filter(
    ([, lock]) => lock !== null && lock !== undefined,
  );

  if (locked.length === 0) return null;

  const lines = locked.map(([domain, lock]) => {
    const l = lock!;
    return `${domain}: locked by ${l.workflowId} since ${l.lockedAt}`;
  });

  return `DOMAIN LOCKS\n${SEPARATOR}\n${lines.join('\n')}`;
}

function formatRecent(items: BacklogItem[], now?: Date): string {
  const reference = now ?? new Date();
  const sevenDaysAgo = new Date(reference.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recent = items.filter((i) => {
    if (i.status !== 'done') return false;
    const updated = new Date(i.updated);
    return updated >= sevenDaysAgo;
  });

  const header = `RECENT (last 7 days)\n${SEPARATOR}`;

  if (recent.length === 0) {
    return `${header}\nNo recent completions.`;
  }

  const lines = recent.map((item) => {
    const cost = item.actualCost != null ? `$${item.actualCost.toFixed(2)}` : '$0.00';
    const sessionCount = item.sessions.length;
    return `${item.id}  [${item.complexity}] ${item.type}  done  "${item.title}"  ${cost}  ${sessionCount} sessions`;
  });

  return `${header}\n${lines.join('\n')}`;
}

function formatTechDebt(techDebt: TechDebtRegister | null): string | null {
  if (!techDebt || techDebt.items.length === 0) return null;

  const { metrics } = techDebt;
  const header = `TECH DEBT (${metrics.total} items, ${metrics.open} open, trend: ${metrics.trend})\n${SEPARATOR}`;

  const severityCounts: Record<string, number> = {};
  const severityOrder: TechDebtSeverity[] = ['critical', 'high', 'medium', 'low'];

  for (const item of techDebt.items) {
    severityCounts[item.severity] = (severityCounts[item.severity] ?? 0) + 1;
  }

  const lines = severityOrder
    .filter((s) => (severityCounts[s] ?? 0) > 0)
    .map((s) => `${s}: ${severityCounts[s]} items`);

  return `${header}\n${lines.join('\n')}`;
}
