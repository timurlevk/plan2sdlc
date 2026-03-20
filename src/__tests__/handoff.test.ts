import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeHandoff, readHandoff, appendSessionToBacklog } from '../services/handoff.js';
import { createWorkflow } from '../services/workflow.js';
import { addBacklogItem, getBacklogItem } from '../services/backlog.js';
import type { SessionHandoff } from '../types/workflow.js';
import type { SessionRef } from '../types/backlog.js';

describe('Handoff Service', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-handoff-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  const sampleHandoff: SessionHandoff = {
    from: 'PLAN',
    to: 'EXECUTE',
    backlogItemId: 'TASK-001',
    artifacts: {
      spec: 'docs/spec/auth.md',
      plan: 'docs/plan/auth.md',
      worktrees: { auth: '/tmp/auth-worktree' },
    },
    decisions: ['Use JWT for auth', 'Add rate limiting'],
    openIssues: ['Need to decide on token expiry'],
  };

  describe('writeHandoff / readHandoff', () => {
    it('should write then read the same handoff data', async () => {
      // Need to create a workflow first
      const item = await addBacklogItem(sdlcDir, {
        title: 'Auth feature',
        description: 'Implement authentication',
        type: 'feature',
        complexity: 'L',
        domains: ['auth'],
        tags: [],
        status: 'executing',
        priority: 'high',
      });

      const wf = await createWorkflow(sdlcDir, item.id, 'PLAN');
      await writeHandoff(sdlcDir, wf.id, sampleHandoff);
      const result = await readHandoff(sdlcDir, wf.id);

      expect(result).toBeDefined();
      expect(result!.from).toBe('PLAN');
      expect(result!.to).toBe('EXECUTE');
      expect(result!.backlogItemId).toBe('TASK-001');
      expect(result!.artifacts.spec).toBe('docs/spec/auth.md');
      expect(result!.decisions).toEqual(['Use JWT for auth', 'Add rate limiting']);
      expect(result!.openIssues).toEqual(['Need to decide on token expiry']);
    });

    it('should return undefined when no handoff exists', async () => {
      const result = await readHandoff(sdlcDir, 'WF-999');
      expect(result).toBeUndefined();
    });
  });

  describe('appendSessionToBacklog', () => {
    it('should add session ref to the backlog item sessions array', async () => {
      const item = await addBacklogItem(sdlcDir, {
        title: 'Auth feature',
        description: 'Implement authentication',
        type: 'feature',
        complexity: 'L',
        domains: ['auth'],
        tags: [],
        status: 'executing',
        priority: 'high',
      });

      const sessionRef: SessionRef = {
        sessionType: 'PLAN',
        timestamp: new Date().toISOString(),
        result: 'completed',
        cost: 0.25,
        agentsUsed: ['architect', 'planner'],
      };

      await appendSessionToBacklog(sdlcDir, item.id, sessionRef);
      const updated = await getBacklogItem(sdlcDir, item.id);

      expect(updated).toBeDefined();
      expect(updated!.sessions).toHaveLength(1);
      expect(updated!.sessions[0]!.sessionType).toBe('PLAN');
      expect(updated!.sessions[0]!.cost).toBe(0.25);
      expect(updated!.actualCost).toBe(0.25);
    });

    it('should accumulate costs across multiple sessions', async () => {
      const item = await addBacklogItem(sdlcDir, {
        title: 'Auth feature',
        description: 'Implement authentication',
        type: 'feature',
        complexity: 'L',
        domains: ['auth'],
        tags: [],
        status: 'executing',
        priority: 'high',
      });

      const session1: SessionRef = {
        sessionType: 'PLAN',
        timestamp: new Date().toISOString(),
        result: 'completed',
        cost: 0.25,
        agentsUsed: ['architect'],
      };

      const session2: SessionRef = {
        sessionType: 'EXECUTE',
        timestamp: new Date().toISOString(),
        result: 'completed',
        cost: 0.50,
        agentsUsed: ['developer'],
      };

      await appendSessionToBacklog(sdlcDir, item.id, session1);
      await appendSessionToBacklog(sdlcDir, item.id, session2);

      const updated = await getBacklogItem(sdlcDir, item.id);
      expect(updated!.sessions).toHaveLength(2);
      expect(updated!.actualCost).toBe(0.75);
    });

    it('should throw for missing backlog item', async () => {
      const sessionRef: SessionRef = {
        sessionType: 'PLAN',
        timestamp: new Date().toISOString(),
        result: 'completed',
        cost: 0.10,
        agentsUsed: [],
      };

      await expect(
        appendSessionToBacklog(sdlcDir, 'TASK-999', sessionRef),
      ).rejects.toThrow('Backlog item not found: TASK-999');
    });
  });
});
