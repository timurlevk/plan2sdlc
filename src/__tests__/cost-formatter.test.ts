import { describe, it, expect } from 'vitest';
import { formatCostReport, type CostDisplayConfig } from '../services/cost-formatter.js';
import type { PeriodCostReport } from '../services/cost-tracker.js';

function emptyReport(): PeriodCostReport {
  return {
    period: 'March 2026',
    totalCost: 0,
    bySessionType: {},
    byDomain: {},
    byModel: {},
  };
}

function sampleReport(): PeriodCostReport {
  return {
    period: 'March 2026',
    totalCost: 12.5,
    bySessionType: {
      EXECUTE: { count: 5, totalCost: 8.0, avgCost: 1.6 },
      REVIEW: { count: 3, totalCost: 3.0, avgCost: 1.0 },
      PLAN: { count: 2, totalCost: 1.5, avgCost: 0.75 },
    },
    byDomain: {
      auth: { totalCost: 7.5, percentage: 60 },
      payments: { totalCost: 3.75, percentage: 30 },
      ui: { totalCost: 1.25, percentage: 10 },
    },
    byModel: {
      'claude-opus-4': { totalCost: 10.0, percentage: 80 },
      'claude-sonnet-4': { totalCost: 2.5, percentage: 20 },
    },
  };
}

const defaultConfig: CostDisplayConfig = {
  monthlyWarning: 50,
  monthlyHardCap: 100,
};

describe('formatCostReport', () => {
  it('returns "No cost data" message for empty report', () => {
    const output = formatCostReport(emptyReport(), defaultConfig);
    expect(output).toBe('No cost data yet. Costs are tracked automatically during SDLC sessions.');
  });

  it('shows correct header with total, warning, and hard cap', () => {
    const output = formatCostReport(sampleReport(), defaultConfig);
    expect(output).toContain('COST REPORT — March 2026');
    expect(output).toContain('Total:        $12.50 / $50.00 warning / $100.00 hard cap');
  });

  it('shows "no hard cap" when hardCap is 0', () => {
    const config: CostDisplayConfig = { monthlyWarning: 50, monthlyHardCap: 0 };
    const output = formatCostReport(sampleReport(), config);
    expect(output).toContain('no hard cap');
    expect(output).not.toContain('$0.00 hard cap');
  });

  it('shows session type breakdown sorted by cost descending', () => {
    const output = formatCostReport(sampleReport(), defaultConfig);
    expect(output).toContain('By session type:');

    const lines = output.split('\n');
    const sessionLines = lines.filter((l) => l.includes('sessions, avg'));
    expect(sessionLines).toHaveLength(3);

    // EXECUTE ($8.00) should come first, then REVIEW ($3.00), then PLAN ($1.50)
    expect(sessionLines[0]).toContain('EXECUTE');
    expect(sessionLines[0]).toContain('$8.00');
    expect(sessionLines[0]).toContain('5 sessions');
    expect(sessionLines[0]).toContain('avg $1.60');

    expect(sessionLines[1]).toContain('REVIEW');
    expect(sessionLines[1]).toContain('$3.00');

    expect(sessionLines[2]).toContain('PLAN');
    expect(sessionLines[2]).toContain('$1.50');
  });

  it('shows domain breakdown sorted by cost descending with percentages', () => {
    const output = formatCostReport(sampleReport(), defaultConfig);
    expect(output).toContain('By domain:');

    const lines = output.split('\n');
    const domainLines = lines.filter((l) => l.match(/^\s{2}\S.*%\)$/));
    // Filter domain lines (after "By domain:" header, before "By model:")
    const domainSection = output.split('By domain:')[1]!.split('By model:')[0]!;
    const domainEntries = domainSection.trim().split('\n');

    expect(domainEntries).toHaveLength(3);
    expect(domainEntries[0]).toContain('auth');
    expect(domainEntries[0]).toContain('$7.50');
    expect(domainEntries[0]).toContain('60%');

    expect(domainEntries[1]).toContain('payments');
    expect(domainEntries[1]).toContain('30%');

    expect(domainEntries[2]).toContain('ui');
    expect(domainEntries[2]).toContain('10%');
  });

  it('shows model breakdown sorted by cost descending with percentages', () => {
    const output = formatCostReport(sampleReport(), defaultConfig);
    expect(output).toContain('By model:');

    const modelSection = output.split('By model:')[1]!;
    const modelEntries = modelSection.trim().split('\n');

    expect(modelEntries).toHaveLength(2);
    expect(modelEntries[0]).toContain('claude-opus-4');
    expect(modelEntries[0]).toContain('$10.00');
    expect(modelEntries[0]).toContain('80%');

    expect(modelEntries[1]).toContain('claude-sonnet-4');
    expect(modelEntries[1]).toContain('$2.50');
    expect(modelEntries[1]).toContain('20%');
  });

  it('percentages add up to approximately 100%', () => {
    const report = sampleReport();
    const domainPercentages = Object.values(report.byDomain).map((d) => d.percentage);
    const domainTotal = domainPercentages.reduce((a, b) => a + b, 0);
    expect(domainTotal).toBeCloseTo(100, 0);

    const modelPercentages = Object.values(report.byModel).map((m) => m.percentage);
    const modelTotal = modelPercentages.reduce((a, b) => a + b, 0);
    expect(modelTotal).toBeCloseTo(100, 0);
  });

  it('formats numbers to 2 decimal places', () => {
    const output = formatCostReport(sampleReport(), defaultConfig);
    // Check that costs show 2 decimal places
    expect(output).toContain('$12.50');
    expect(output).toContain('$8.00');
    expect(output).toContain('$1.60');
    expect(output).toContain('$0.75');
  });

  it('shows warning threshold in header', () => {
    const config: CostDisplayConfig = { monthlyWarning: 25, monthlyHardCap: 75 };
    const output = formatCostReport(sampleReport(), config);
    expect(output).toContain('$25.00 warning');
    expect(output).toContain('$75.00 hard cap');
  });
});
