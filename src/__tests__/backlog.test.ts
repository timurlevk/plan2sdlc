import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  loadBacklog,
  addBacklogItem,
  updateBacklogItem,
  getBacklogItem,
  transitionStatus,
} from '../services/backlog.js';


describe('Backlog Service', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-backlog-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  const baseItem = {
    title: 'Test item',
    description: 'A test backlog item',
    type: 'feature' as const,
    complexity: 'M' as const,
    domains: ['auth'],
    tags: ['test'],
    status: 'inbox' as const,
    priority: 'medium' as const,
  };

  describe('loadBacklog', () => {
    it('should return empty array when no file exists', async () => {
      const items = await loadBacklog(sdlcDir);
      expect(items).toEqual([]);
    });
  });

  describe('addBacklogItem', () => {
    it('should generate sequential TASK-NNN IDs', async () => {
      const item1 = await addBacklogItem(sdlcDir, baseItem);
      expect(item1.id).toBe('TASK-001');

      const item2 = await addBacklogItem(sdlcDir, { ...baseItem, title: 'Second item' });
      expect(item2.id).toBe('TASK-002');

      const item3 = await addBacklogItem(sdlcDir, { ...baseItem, title: 'Third item' });
      expect(item3.id).toBe('TASK-003');
    });

    it('should set timestamps and empty sessions array', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      expect(item.created).toBeTruthy();
      expect(item.updated).toBeTruthy();
      expect(item.sessions).toEqual([]);
    });

    it('should persist items to disk', async () => {
      await addBacklogItem(sdlcDir, baseItem);
      const loaded = await loadBacklog(sdlcDir);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.title).toBe('Test item');
    });
  });

  describe('updateBacklogItem', () => {
    it('should update fields and timestamp', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      const originalUpdated = item.updated;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      const updated = await updateBacklogItem(sdlcDir, item.id, {
        title: 'Updated title',
        priority: 'high',
      });

      expect(updated.title).toBe('Updated title');
      expect(updated.priority).toBe('high');
      expect(updated.updated).not.toBe(originalUpdated);
      expect(updated.id).toBe(item.id); // ID preserved
    });

    it('should throw for missing ID', async () => {
      await expect(
        updateBacklogItem(sdlcDir, 'TASK-999', { title: 'nope' }),
      ).rejects.toThrow('Backlog item not found: TASK-999');
    });
  });

  describe('getBacklogItem', () => {
    it('should return item by ID', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      const found = await getBacklogItem(sdlcDir, item.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(item.id);
    });

    it('should return undefined for missing ID', async () => {
      const found = await getBacklogItem(sdlcDir, 'TASK-999');
      expect(found).toBeUndefined();
    });
  });

  describe('transitionStatus', () => {
    it('should allow valid transitions', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      // inbox -> triaged
      const triaged = await transitionStatus(sdlcDir, item.id, 'triaged');
      expect(triaged.status).toBe('triaged');
      // triaged -> executing
      const executing = await transitionStatus(sdlcDir, item.id, 'executing');
      expect(executing.status).toBe('executing');
      // executing -> reviewing
      const reviewing = await transitionStatus(sdlcDir, item.id, 'reviewing');
      expect(reviewing.status).toBe('reviewing');
      // reviewing -> done
      const done = await transitionStatus(sdlcDir, item.id, 'done');
      expect(done.status).toBe('done');
    });

    it('should reject invalid transitions', async () => {
      const item = await addBacklogItem(sdlcDir, {
        ...baseItem,
        status: 'inbox',
      });
      // inbox -> done is not allowed
      await expect(
        transitionStatus(sdlcDir, item.id, 'done'),
      ).rejects.toThrow('Invalid status transition: inbox -> done');
    });

    it('should reject transitions from done (terminal)', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      await transitionStatus(sdlcDir, item.id, 'triaged');
      await transitionStatus(sdlcDir, item.id, 'executing');
      await transitionStatus(sdlcDir, item.id, 'reviewing');
      await transitionStatus(sdlcDir, item.id, 'done');

      await expect(
        transitionStatus(sdlcDir, item.id, 'executing'),
      ).rejects.toThrow('Invalid status transition: done -> executing');
    });

    it('should allow abandoned -> inbox (reopen)', async () => {
      const item = await addBacklogItem(sdlcDir, baseItem);
      await transitionStatus(sdlcDir, item.id, 'abandoned');
      const reopened = await transitionStatus(sdlcDir, item.id, 'inbox');
      expect(reopened.status).toBe('inbox');
    });

    it('should throw for missing item', async () => {
      await expect(
        transitionStatus(sdlcDir, 'TASK-999', 'triaged'),
      ).rejects.toThrow('Backlog item not found: TASK-999');
    });
  });
});
