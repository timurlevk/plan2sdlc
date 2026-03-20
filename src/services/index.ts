/**
 * Service barrel exports.
 */

export {
  loadBacklog,
  saveBacklog,
  addBacklogItem,
  updateBacklogItem,
  getBacklogItem,
  transitionStatus,
} from './backlog.js';

export {
  loadState,
  saveState,
  createWorkflow,
  updateWorkflow,
  completeWorkflow,
  lockDomain,
  unlockDomain,
  isDomainLocked,
} from './workflow.js';

export {
  writeHandoff,
  readHandoff,
  appendSessionToBacklog,
} from './handoff.js';

export {
  getCurrentBranch,
  detectEnvironment,
  formatEnvironmentContext,
} from './environment.js';

export {
  detectTechStack,
} from './tech-stack-detector.js';

export {
  selectTemplate,
} from './template-selector.js';
export type { TemplateName } from './template-selector.js';

export {
  startSession,
  recordAgentCost,
  finalizeSession,
  loadSessionLogs,
  generateCostReport,
  checkBudget,
  checkMonthlyBudget,
} from './cost-tracker.js';

export {
  formatStatus,
} from './status-formatter.js';

export type { StatusData } from './status-formatter.js';

export {
  loadTechDebt,
  saveTechDebt,
  addTechDebtItem,
  updateTechDebtItem,
  resolveTechDebtItem,
  calculateMetrics,
  getItemsBySeverity,
  linkToTask,
} from './tech-debt.js';

export {
  scanEcosystem,
  type ConventionDecision,
  type ConventionEntry,
  type EcosystemReport,
} from './ecosystem-scanner.js';

export {
  runInitScan,
  generateConfig,
  backupClaudeConfig,
  renderTemplate,
  generateDomainAgents,
  generateRegistry,
} from './init.js';
export type { InitResult } from './init.js';
