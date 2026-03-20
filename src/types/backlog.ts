/**
 * Backlog types for the claude-sdlc plugin.
 * Aligned with schema/backlog.schema.json
 */

export type BacklogItemType = 'feature' | 'bugfix' | 'refactor' | 'research' | 'docs' | 'ops';

export type Complexity = 'S' | 'M' | 'L' | 'XL';

export type BacklogStatus =
  | 'inbox'
  | 'triaged'
  | 'planned'
  | 'executing'
  | 'reviewing'
  | 'done'
  | 'blocked'
  | 'abandoned';

export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'unprioritized';

export type SessionResult = 'approved' | 'rejected' | 'needs-changes' | 'completed' | 'escalated';

export interface SessionRef {
  sessionType: string;
  timestamp: string;
  result: SessionResult;
  cost: number;
  agentsUsed: string[];
}

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  type: BacklogItemType;
  complexity: Complexity;
  domains: string[];
  tags: string[];
  status: BacklogStatus;
  priority: Priority;
  specPath?: string;
  planPath?: string;
  workflowId?: string;
  created: string;
  updated: string;
  sessions: SessionRef[];
  estimatedCost?: number;
  actualCost?: number;
}

export type Backlog = BacklogItem[];
