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
