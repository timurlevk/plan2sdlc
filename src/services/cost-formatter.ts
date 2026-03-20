/**
 * Formats a PeriodCostReport into a displayable string.
 */

import type { PeriodCostReport } from './cost-tracker.js';

export interface CostDisplayConfig {
  monthlyWarning: number;
  monthlyHardCap: number;
}

const SEPARATOR = '───────────────────────────────────────────────────────';

/**
 * Pad or truncate a string to a fixed width.
 */
function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/**
 * Format a dollar amount to 2 decimal places with $ prefix.
 */
function dollar(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Sort entries by cost descending and return as [key, value] pairs.
 */
function sortByCostDesc<T extends { totalCost: number }>(
  record: Record<string, T>,
): [string, T][] {
  return Object.entries(record).sort(([, a], [, b]) => b.totalCost - a.totalCost);
}

/**
 * Format a cost report into a displayable string.
 *
 * Returns a human-readable multi-section report showing totals,
 * breakdowns by session type, domain, and model.
 */
export function formatCostReport(
  report: PeriodCostReport,
  config: CostDisplayConfig,
): string {
  const hasData =
    Object.keys(report.bySessionType).length > 0 ||
    Object.keys(report.byDomain).length > 0 ||
    Object.keys(report.byModel).length > 0;

  if (!hasData) {
    return 'No cost data yet. Costs are tracked automatically during SDLC sessions.';
  }

  const sections: string[] = [];

  // Header
  const capLabel = config.monthlyHardCap > 0 ? dollar(config.monthlyHardCap) + ' hard cap' : 'no hard cap';
  sections.push(
    `COST REPORT — ${report.period}\n${SEPARATOR}\nTotal:        ${dollar(report.totalCost)} / ${dollar(config.monthlyWarning)} warning / ${capLabel}`,
  );

  // By session type
  const sessionTypeEntries = sortByCostDesc(report.bySessionType);
  if (sessionTypeEntries.length > 0) {
    const lines = sessionTypeEntries.map(
      ([type, data]) =>
        `  ${pad(type, 20)} ${dollar(data.totalCost)}  (${data.count} sessions, avg ${dollar(data.avgCost)})`,
    );
    sections.push(`By session type:\n${lines.join('\n')}`);
  }

  // By domain
  const domainEntries = sortByCostDesc(report.byDomain);
  if (domainEntries.length > 0) {
    const lines = domainEntries.map(
      ([domain, data]) =>
        `  ${pad(domain, 20)} ${dollar(data.totalCost)}  (${Math.round(data.percentage)}%)`,
    );
    sections.push(`By domain:\n${lines.join('\n')}`);
  }

  // By model
  const modelEntries = sortByCostDesc(report.byModel);
  if (modelEntries.length > 0) {
    const lines = modelEntries.map(
      ([model, data]) =>
        `  ${pad(model, 20)} ${dollar(data.totalCost)}  (${Math.round(data.percentage)}%)`,
    );
    sections.push(`By model:\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
