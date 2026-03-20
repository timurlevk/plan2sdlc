import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  loadState,
  createWorkflow,
  updateWorkflow,
  completeWorkflow,
  lockDomain,
  unlockDomain,
  isDomainLocked,
} from '../services/workflow.js';

describe('Workflow Service', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-workflow-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  describe('loadState', () => {
    it('should return default empty state when no file exists', async () => {
      const state = await loadState(sdlcDir);
      expect(state.activeWorkflows).toEqual([]);
      expect(state.cadence.mergesSinceRetro).toBe(0);
      expect(state.sessionQueue).toEqual([]);
      expect(state.domainLocks).toEqual({});
    });
  });

  describe('createWorkflow', () => {
    it('should generate WF-001 ID for first workflow', async () => {
      const wf = await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      expect(wf.id).toBe('WF-001');
      expect(wf.backlogItemId).toBe('TASK-001');
      expect(wf.currentSession).toBe('PLAN');
      expect(wf.totalCost).toBe(0);
      expect(wf.history).toEqual([]);
      expect(wf.startedAt).toBeTruthy();
    });

    it('should generate sequential WF-NNN IDs', async () => {
      const wf1 = await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      const wf2 = await createWorkflow(sdlcDir, 'TASK-002', 'TRIAGE');
      expect(wf1.id).toBe('WF-001');
      expect(wf2.id).toBe('WF-002');
    });

    it('should persist to state file', async () => {
      await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      const state = await loadState(sdlcDir);
      expect(state.activeWorkflows).toHaveLength(1);
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow fields', async () => {
      const wf = await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      const updated = await updateWorkflow(sdlcDir, wf.id, {
        currentSession: 'EXECUTE',
        totalCost: 0.50,
      });
      expect(updated.currentSession).toBe('EXECUTE');
      expect(updated.totalCost).toBe(0.50);
      expect(updated.id).toBe(wf.id); // ID preserved
    });

    it('should throw for missing workflow', async () => {
      await expect(
        updateWorkflow(sdlcDir, 'WF-999', { currentSession: 'PLAN' }),
      ).rejects.toThrow('Workflow not found: WF-999');
    });
  });

  describe('completeWorkflow', () => {
    it('should remove workflow from active list', async () => {
      const wf = await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      await completeWorkflow(sdlcDir, wf.id);
      const state = await loadState(sdlcDir);
      expect(state.activeWorkflows).toHaveLength(0);
    });

    it('should throw for missing workflow', async () => {
      await expect(completeWorkflow(sdlcDir, 'WF-999')).rejects.toThrow(
        'Workflow not found: WF-999',
      );
    });

    it('should only remove the specified workflow', async () => {
      await createWorkflow(sdlcDir, 'TASK-001', 'PLAN');
      const wf2 = await createWorkflow(sdlcDir, 'TASK-002', 'TRIAGE');
      await completeWorkflow(sdlcDir, 'WF-001');
      const state = await loadState(sdlcDir);
      expect(state.activeWorkflows).toHaveLength(1);
      expect(state.activeWorkflows[0]!.id).toBe(wf2.id);
    });
  });

  describe('domain locks', () => {
    it('should lock and check domain', async () => {
      await lockDomain(sdlcDir, 'auth', 'WF-001', 'security-agent');
      const lock = await isDomainLocked(sdlcDir, 'auth');
      expect(lock).not.toBeNull();
      expect(lock!.workflowId).toBe('WF-001');
      expect(lock!.lockedAt).toBeTruthy();
    });

    it('should return null for unlocked domain', async () => {
      const lock = await isDomainLocked(sdlcDir, 'auth');
      expect(lock).toBeNull();
    });

    it('should unlock domain', async () => {
      await lockDomain(sdlcDir, 'auth', 'WF-001', 'security-agent');
      await unlockDomain(sdlcDir, 'auth');
      const lock = await isDomainLocked(sdlcDir, 'auth');
      expect(lock).toBeNull();
    });
  });
});
