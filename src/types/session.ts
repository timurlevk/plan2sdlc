/**
 * Session types for the claude-sdlc plugin.
 * Aligned with schema/session-log.schema.json
 */

import type { SessionResult } from './backlog.js';

export const SESSION_TYPES = [
  'QUICK_FIX',
  'TRIAGE',
  'BRAINSTORM',
  'PLAN',
  'EXECUTE',
  'REVIEW',
  'INTEGRATION_CHECK',
  'MERGE',
  'GAP_ANALYSIS',
  'RETRO',
  'POST_MORTEM',
  'ARCHITECTURE_REVIEW',
  'SECURITY_REVIEW',
  'RELEASE',
  'DOCS_SYNC',
  'ONBOARD',
  'HOTFIX',
  'DEPENDENCY_AUDIT',
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

export type AgentResult = 'success' | 'failure' | 'escalated';

export interface AgentLog {
  name: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  turnsUsed: number;
  toolCalls: number;
  result: AgentResult;
}

export interface SessionLog {
  id: string;
  workflowId: string;
  backlogItemId: string;
  sessionType: SessionType;
  startTime: string;
  endTime: string;
  agents: AgentLog[];
  totalCost: number;
  result: SessionResult;
  turnsUsed: number;
}
