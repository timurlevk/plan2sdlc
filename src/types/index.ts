/**
 * Central type exports for the claude-sdlc plugin.
 */

export type {
  BacklogItem,
  BacklogItemType,
  BacklogStatus,
  Backlog,
  Complexity,
  Priority,
  SessionRef,
  SessionResult,
} from './backlog.js';

export type {
  WorkflowState,
  ActiveWorkflow,
  WorkflowContext,
  Cadence,
  QueuedSession,
  DomainLock,
  SessionHandoff,
  HandoffArtifacts,
} from './workflow.js';

export { SESSION_TYPES } from './session.js';
export type {
  SessionType,
  SessionLog,
  AgentLog,
  AgentResult,
} from './session.js';

export type {
  PluginConfig,
  ProjectConfig,
  ProjectType,
  DomainConfig,
  ComplexityThresholds,
  WorkflowConfig,
  RetroTrigger,
  TriggersConfig,
  BudgetConfig,
  HitlConfig,
  GitConfig,
} from './config.js';

export type {
  AgentRegistry,
  AgentEntry,
  AgentCategory,
  AgentTier,
  AgentStatus,
  AgentMetrics,
  AgentTrend,
} from './registry.js';

export type {
  TechDebtRegister,
  TechDebtItem,
  TechDebtMetrics,
  TechDebtSeverity,
  TechDebtType,
  TechDebtStatus,
  TechDebtTrend,
} from './tech-debt.js';

export type {
  ProjectProfile,
  DomainMap,
  DomainEntry,
} from './detection.js';

export { DEFAULT_ENV_CONFIG } from './environment.js';
export type {
  Environment,
  EnvironmentPermissions,
  EnvironmentInfo,
  EnvironmentConfig,
} from './environment.js';
