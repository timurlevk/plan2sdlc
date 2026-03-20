/**
 * Plugin configuration types for the claude-sdlc plugin.
 * Aligned with schema/config.schema.json
 */

export type ProjectType = 'auto' | 'monorepo' | 'single-app' | 'microservices';

export interface ProjectConfig {
  name: string;
  type: ProjectType;
  techStack?: string[];
}

export interface DomainConfig {
  path: string;
  techStack?: string[];
  rules?: string[];
  claudeMd?: string;
}

export interface ComplexityThresholds {
  S?: number;
  M?: number;
  L?: number;
  XL?: number;
}

export interface WorkflowConfig {
  complexityThresholds?: ComplexityThresholds;
  autoQuickFix?: boolean;
  autoMerge?: boolean;
  maxRetries: number;
  requireArchReview?: boolean;
}

export interface RetroTrigger {
  cadence?: string;
  mergeThreshold?: number;
}

export interface TriggersConfig {
  retro?: RetroTrigger;
  gapAnalysis?: string;
  architectureReview?: string;
  securityReview?: string;
}

export interface BudgetConfig {
  perSession?: Record<string, number>;
  monthlyWarning: number;
  monthlyHardCap: number;
  preferredModels?: Record<string, string>;
}

export interface HitlConfig {
  mergeApproval?: boolean;
  budgetApproval?: boolean;
  silentMode?: boolean;
}

export interface GitConfig {
  releaseBranch?: string;
  mainBranch?: string;
  commitPrefix?: string;
  tagFormat?: string;
}

export interface PluginConfig {
  project: ProjectConfig;
  domains?: Record<string, DomainConfig>;
  workflow: WorkflowConfig;
  triggers?: TriggersConfig;
  budget: BudgetConfig;
  hitl: HitlConfig;
  git: GitConfig;
}
