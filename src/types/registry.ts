/**
 * Agent registry types for the claude-sdlc plugin.
 * Aligned with schema/registry.schema.json
 */

export type AgentCategory =
  | 'governance'
  | 'development'
  | 'testing'
  | 'design'
  | 'product'
  | 'business'
  | 'specialist'
  | 'consultant'
  | 'bridge';

export type AgentTier = 'mandatory' | 'auto-detected' | 'governance-requested' | 'user-requested';

export type AgentStatus = 'active' | 'idle' | 'disabled';

export type AgentTrend = 'improving' | 'stable' | 'declining';

export interface AgentMetrics {
  totalSessions?: number;
  successRate?: number;
  avgCost?: number;
  avgTurns?: number;
  retryRate?: number;
  lastUsed?: string;
  trend?: AgentTrend;
}

export interface AgentEntry {
  name: string;
  description: string;
  category: AgentCategory;
  tier: AgentTier;
  model: string;
  tools: string[];
  domains: string[];
  status: AgentStatus;
  metrics?: AgentMetrics;
}

export interface AgentRegistry {
  agents: AgentEntry[];
}
