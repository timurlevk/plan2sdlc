import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import type { WorkflowState } from '../types/workflow.js';
import {
  checkConflicts,
  compareWorkflowPriority,
  queueWorkflow,
  dequeueNext,
  preemptForHotfix,
} from '../services/concurrency.js';
import type { WorkflowPriorityInfo } from '../services/concurrency.js';
import { saveState } from '../services/workflow.js';

function emptyState(): WorkflowState {
  return {
    activeWorkflows: [],
    cadence: { mergesSinceRetro: 0 },
    sessionQueue: [],
    domainLocks: {},
  };
}

function makeWorkflow(id: string, startedAt?: string) {
  return {
    id,
    backlogItemId: `TASK-${id}`,
    currentSession: 'EXECUTE',
    context: { reviewAttempt: 0, maxRetries: 3 },
    history: [],
    startedAt: startedAt ?? new Date().toISOString(),
    totalCost: 0,
  };
}

describe('Concurrency Service', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-concurrency-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  // ---- checkConflicts ----

  describe('checkConflicts', () => {
    it('should allow workflow when no active workflows exist', () => {
      const state = emptyState();
      const result = checkConflicts(['auth', 'payments'], state);
      expect(result.canProceed).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(result.recommendation).toBe('proceed');
    });

    it('should detect same-domain conflict', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.domainLocks['auth'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };

      const result = checkConflicts(['auth'], state);
      expect(result.canProceed).toBe(false);
      expect(result.recommendation).toBe('queue');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        domain: 'auth',
        lockedBy: 'WF-001',
        type: 'same-domain',
      });
    });

    it('should allow different-domain workflows in parallel', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.domainLocks['auth'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };

      const result = checkConflicts(['payments'], state);
      expect(result.canProceed).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(result.recommendation).toBe('proceed');
    });

    it('should queue when max active workflows reached', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.activeWorkflows.push(makeWorkflow('WF-002'));
      state.activeWorkflows.push(makeWorkflow('WF-003'));

      const result = checkConflicts(['new-domain'], state, 3);
      expect(result.canProceed).toBe(false);
      expect(result.recommendation).toBe('queue');
    });

    it('should respect custom maxActive', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));

      // maxActive = 1 → already at capacity
      const result = checkConflicts(['new-domain'], state, 1);
      expect(result.canProceed).toBe(false);
      expect(result.recommendation).toBe('queue');
    });

    it('should recommend hitl for shared-file conflicts', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));

      const result = checkConflicts(['package.json'], state);
      expect(result.canProceed).toBe(false);
      expect(result.recommendation).toBe('hitl');
      expect(result.conflicts[0]!.type).toBe('shared-files');
    });

    it('should not flag shared files when no active workflows', () => {
      const state = emptyState();
      const result = checkConflicts(['package.json'], state);
      expect(result.canProceed).toBe(true);
      expect(result.recommendation).toBe('proceed');
    });

    it('should prioritize same-domain over shared-file conflicts', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.domainLocks['auth'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };

      // 'auth' is locked AND 'package.json' is shared — same-domain checked first
      const result = checkConflicts(['auth', 'package.json'], state);
      expect(result.canProceed).toBe(false);
      expect(result.recommendation).toBe('queue');
    });
  });

  // ---- compareWorkflowPriority ----

  describe('compareWorkflowPriority', () => {
    const base: WorkflowPriorityInfo = {
      isHotfix: false,
      complexity: 'M',
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00Z',
    };

    it('should rank HOTFIX above everything', () => {
      const hotfix: WorkflowPriorityInfo = { ...base, isHotfix: true };
      const normal: WorkflowPriorityInfo = {
        ...base,
        complexity: 'XL',
        priority: 'critical',
      };
      expect(compareWorkflowPriority(hotfix, normal)).toBeLessThan(0);
      expect(compareWorkflowPriority(normal, hotfix)).toBeGreaterThan(0);
    });

    it('should rank by complexity: XL > L > M > S', () => {
      const xl: WorkflowPriorityInfo = { ...base, complexity: 'XL' };
      const l: WorkflowPriorityInfo = { ...base, complexity: 'L' };
      const m: WorkflowPriorityInfo = { ...base, complexity: 'M' };
      const s: WorkflowPriorityInfo = { ...base, complexity: 'S' };

      expect(compareWorkflowPriority(xl, l)).toBeLessThan(0);
      expect(compareWorkflowPriority(l, m)).toBeLessThan(0);
      expect(compareWorkflowPriority(m, s)).toBeLessThan(0);
      expect(compareWorkflowPriority(s, xl)).toBeGreaterThan(0);
    });

    it('should rank by priority when complexity is equal', () => {
      const critical: WorkflowPriorityInfo = { ...base, priority: 'critical' };
      const high: WorkflowPriorityInfo = { ...base, priority: 'high' };
      const low: WorkflowPriorityInfo = { ...base, priority: 'low' };

      expect(compareWorkflowPriority(critical, high)).toBeLessThan(0);
      expect(compareWorkflowPriority(high, low)).toBeLessThan(0);
    });

    it('should use FIFO when complexity and priority are equal', () => {
      const earlier: WorkflowPriorityInfo = {
        ...base,
        createdAt: '2026-01-01T00:00:00Z',
      };
      const later: WorkflowPriorityInfo = {
        ...base,
        createdAt: '2026-01-02T00:00:00Z',
      };

      expect(compareWorkflowPriority(earlier, later)).toBeLessThan(0);
      expect(compareWorkflowPriority(later, earlier)).toBeGreaterThan(0);
    });

    it('should return 0 for identical priorities', () => {
      expect(compareWorkflowPriority(base, { ...base })).toBe(0);
    });
  });

  // ---- queueWorkflow / dequeueNext ----

  describe('queueWorkflow & dequeueNext', () => {
    it('should add to queue and dequeue in FIFO order', async () => {
      await queueWorkflow(sdlcDir, 'PLAN', 'TASK-001', 'medium');
      await queueWorkflow(sdlcDir, 'EXECUTE', 'TASK-002', 'high');

      const state = emptyState();
      // Load state from disk to get the queue
      const { loadState } = await import('../services/workflow.js');
      const loaded = await loadState(sdlcDir);

      expect(loaded.sessionQueue).toHaveLength(2);

      const first = await dequeueNext(sdlcDir, loaded);
      expect(first).not.toBeNull();
      expect(first!.sessionType).toBe('PLAN');
      expect(first!.backlogItemId).toBe('TASK-001');
    });

    it('should return null when queue is empty', async () => {
      const state = emptyState();
      const result = await dequeueNext(sdlcDir, state);
      expect(result).toBeNull();
    });
  });

  // ---- preemptForHotfix ----

  describe('preemptForHotfix', () => {
    it('should identify workflows to pause on affected domains', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.activeWorkflows.push(makeWorkflow('WF-002'));
      state.domainLocks['auth'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };
      state.domainLocks['payments'] = {
        workflowId: 'WF-002',
        lockedAt: new Date().toISOString(),
      };

      const result = preemptForHotfix(state, ['auth', 'payments']);
      expect(result.pausedWorkflows).toContain('WF-001');
      expect(result.pausedWorkflows).toContain('WF-002');
      expect(result.domainsToUnlock).toContain('auth');
      expect(result.domainsToUnlock).toContain('payments');
    });

    it('should not duplicate workflow IDs when multiple domains belong to same workflow', () => {
      const state = emptyState();
      state.activeWorkflows.push(makeWorkflow('WF-001'));
      state.domainLocks['auth'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };
      state.domainLocks['users'] = { workflowId: 'WF-001', lockedAt: new Date().toISOString() };

      const result = preemptForHotfix(state, ['auth', 'users']);
      expect(result.pausedWorkflows).toEqual(['WF-001']);
      expect(result.domainsToUnlock).toEqual(['auth', 'users']);
    });

    it('should return empty arrays when no domains are locked', () => {
      const state = emptyState();
      const result = preemptForHotfix(state, ['auth']);
      expect(result.pausedWorkflows).toEqual([]);
      expect(result.domainsToUnlock).toEqual([]);
    });
  });
});
