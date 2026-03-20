/**
 * Tech debt types for the claude-sdlc plugin.
 * Aligned with schema/tech-debt.schema.json
 */

import type { Complexity } from './backlog.js';

export type TechDebtSeverity = 'critical' | 'high' | 'medium' | 'low';

export type TechDebtType =
  | 'coupling'
  | 'complexity'
  | 'duplication'
  | 'obsolete'
  | 'performance'
  | 'security';

export type TechDebtStatus = 'open' | 'in-progress' | 'resolved' | 'accepted-risk' | 'wont-fix';

export type TechDebtTrend = 'improving' | 'stable' | 'worsening';

export interface TechDebtItem {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: TechDebtSeverity;
  type: TechDebtType;
  detected: string;
  detectedBy: string;
  effort: Complexity;
  impact: string;
  proposedFix: string;
  status: TechDebtStatus;
  linkedTasks: string[];
  resolvedDate?: string | null;
}

export interface TechDebtMetrics {
  total: number;
  open: number;
  resolvedThisMonth: number;
  trend: TechDebtTrend;
}

export interface TechDebtRegister {
  items: TechDebtItem[];
  metrics: TechDebtMetrics;
}
