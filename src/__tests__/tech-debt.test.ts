import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  loadTechDebt,
  addTechDebtItem,
  updateTechDebtItem,
  resolveTechDebtItem,
  calculateMetrics,
  getItemsBySeverity,
  linkToTask,
} from '../services/tech-debt.js';
import type { TechDebtItem } from '../types/tech-debt.js';

describe('Tech Debt Service', () => {
  let sdlcDir: string;

  beforeEach(async () => {
    sdlcDir = await mkdtemp(join(tmpdir(), 'claude-sdlc-techdebt-'));
  });

  afterEach(async () => {
    await rm(sdlcDir, { recursive: true, force: true });
  });

  const baseItem = {
    title: 'Hardcoded config values',
    description: 'Configuration values are hardcoded instead of using env vars',
    domain: 'config',
    severity: 'medium' as const,
    type: 'coupling' as const,
    detected: new Date().toISOString().slice(0, 10),
    detectedBy: 'code-review-agent',
    effort: 'M' as const,
    impact: 'Makes deployment across environments difficult',
    proposedFix: 'Extract to environment variables with validation',
    status: 'open' as const,
    linkedTasks: [],
  };

  describe('loadTechDebt', () => {
    it('should return empty register when no file exists', async () => {
      const register = await loadTechDebt(sdlcDir);
      expect(register.items).toEqual([]);
      expect(register.metrics.total).toBe(0);
      expect(register.metrics.open).toBe(0);
      expect(register.metrics.resolvedThisMonth).toBe(0);
      expect(register.metrics.trend).toBe('stable');
    });
  });

  describe('addTechDebtItem', () => {
    it('should generate sequential TD-001, TD-002 IDs', async () => {
      const item1 = await addTechDebtItem(sdlcDir, baseItem);
      expect(item1.id).toBe('TD-001');

      const item2 = await addTechDebtItem(sdlcDir, {
        ...baseItem,
        title: 'Second debt',
      });
      expect(item2.id).toBe('TD-002');

      const item3 = await addTechDebtItem(sdlcDir, {
        ...baseItem,
        title: 'Third debt',
      });
      expect(item3.id).toBe('TD-003');
    });

    it('should set resolvedDate to null', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      expect(item.resolvedDate).toBeNull();
    });

    it('should persist items to disk', async () => {
      await addTechDebtItem(sdlcDir, baseItem);
      const register = await loadTechDebt(sdlcDir);
      expect(register.items).toHaveLength(1);
      expect(register.items[0]!.title).toBe('Hardcoded config values');
    });

    it('should update metrics on add', async () => {
      await addTechDebtItem(sdlcDir, baseItem);
      const register = await loadTechDebt(sdlcDir);
      expect(register.metrics.total).toBe(1);
      expect(register.metrics.open).toBe(1);
    });
  });

  describe('updateTechDebtItem', () => {
    it('should update fields', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      const updated = await updateTechDebtItem(sdlcDir, item.id, {
        title: 'Updated title',
        severity: 'high',
      });

      expect(updated.title).toBe('Updated title');
      expect(updated.severity).toBe('high');
      expect(updated.id).toBe(item.id); // ID preserved
    });

    it('should throw for missing ID', async () => {
      await expect(
        updateTechDebtItem(sdlcDir, 'TD-999', { title: 'nope' }),
      ).rejects.toThrow('Tech debt item not found: TD-999');
    });
  });

  describe('resolveTechDebtItem', () => {
    it('should set resolvedDate to current date and status', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      const resolved = await resolveTechDebtItem(sdlcDir, item.id, 'resolved');

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedDate).toBeTruthy();
      // resolvedDate should be YYYY-MM-DD format
      expect(resolved.resolvedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should support accepted-risk status', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      const resolved = await resolveTechDebtItem(sdlcDir, item.id, 'accepted-risk');
      expect(resolved.status).toBe('accepted-risk');
      expect(resolved.resolvedDate).toBeTruthy();
    });

    it('should support wont-fix status', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      const resolved = await resolveTechDebtItem(sdlcDir, item.id, 'wont-fix');
      expect(resolved.status).toBe('wont-fix');
      expect(resolved.resolvedDate).toBeTruthy();
    });
  });

  describe('calculateMetrics', () => {
    it('should count total items', () => {
      const items = [
        { ...baseItem, id: 'TD-001', resolvedDate: null },
        { ...baseItem, id: 'TD-002', resolvedDate: null },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.total).toBe(2);
    });

    it('should count open items (open + in-progress)', () => {
      const items = [
        { ...baseItem, id: 'TD-001', status: 'open' as const, resolvedDate: null },
        { ...baseItem, id: 'TD-002', status: 'in-progress' as const, resolvedDate: null },
        { ...baseItem, id: 'TD-003', status: 'resolved' as const, resolvedDate: '2026-03-15' },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.open).toBe(2);
    });

    it('should count resolved this month', () => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7); // YYYY-MM
      const items = [
        {
          ...baseItem,
          id: 'TD-001',
          status: 'resolved' as const,
          resolvedDate: `${thisMonth}-10`,
        },
        {
          ...baseItem,
          id: 'TD-002',
          status: 'resolved' as const,
          resolvedDate: '2020-01-01',
        },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.resolvedThisMonth).toBe(1);
    });

    it('should determine trend as improving when resolved > new', () => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      const items = [
        {
          ...baseItem,
          id: 'TD-001',
          status: 'resolved' as const,
          detected: '2020-01-01',
          resolvedDate: `${thisMonth}-10`,
        },
        {
          ...baseItem,
          id: 'TD-002',
          status: 'resolved' as const,
          detected: '2020-01-01',
          resolvedDate: `${thisMonth}-11`,
        },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.trend).toBe('improving');
    });

    it('should determine trend as worsening when new > resolved', () => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      const items = [
        {
          ...baseItem,
          id: 'TD-001',
          status: 'open' as const,
          detected: `${thisMonth}-05`,
          resolvedDate: null,
        },
        {
          ...baseItem,
          id: 'TD-002',
          status: 'open' as const,
          detected: `${thisMonth}-06`,
          resolvedDate: null,
        },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.trend).toBe('worsening');
    });

    it('should determine trend as stable when equal', () => {
      const now = new Date();
      const thisMonth = now.toISOString().slice(0, 7);
      const items = [
        {
          ...baseItem,
          id: 'TD-001',
          status: 'resolved' as const,
          detected: '2020-01-01',
          resolvedDate: `${thisMonth}-10`,
        },
        {
          ...baseItem,
          id: 'TD-002',
          status: 'open' as const,
          detected: `${thisMonth}-05`,
          resolvedDate: null,
        },
      ] as TechDebtItem[];

      const metrics = calculateMetrics(items);
      expect(metrics.trend).toBe('stable');
    });
  });

  describe('getItemsBySeverity', () => {
    it('should group items by severity', () => {
      const items = [
        { ...baseItem, id: 'TD-001', severity: 'critical' as const, resolvedDate: null },
        { ...baseItem, id: 'TD-002', severity: 'high' as const, resolvedDate: null },
        { ...baseItem, id: 'TD-003', severity: 'critical' as const, resolvedDate: null },
        { ...baseItem, id: 'TD-004', severity: 'low' as const, resolvedDate: null },
      ] as TechDebtItem[];

      const grouped = getItemsBySeverity(items);
      expect(grouped['critical']).toHaveLength(2);
      expect(grouped['high']).toHaveLength(1);
      expect(grouped['low']).toHaveLength(1);
      expect(grouped['medium']).toBeUndefined();
    });

    it('should return empty object for empty items', () => {
      const grouped = getItemsBySeverity([]);
      expect(grouped).toEqual({});
    });
  });

  describe('linkToTask', () => {
    it('should append taskId to linkedTasks', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      const linked = await linkToTask(sdlcDir, item.id, 'TASK-001');

      expect(linked.linkedTasks).toContain('TASK-001');
    });

    it('should not duplicate taskId', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      await linkToTask(sdlcDir, item.id, 'TASK-001');
      const linked = await linkToTask(sdlcDir, item.id, 'TASK-001');

      expect(linked.linkedTasks.filter((t) => t === 'TASK-001')).toHaveLength(1);
    });

    it('should support multiple linked tasks', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      await linkToTask(sdlcDir, item.id, 'TASK-001');
      const linked = await linkToTask(sdlcDir, item.id, 'TASK-002');

      expect(linked.linkedTasks).toEqual(['TASK-001', 'TASK-002']);
    });

    it('should throw for missing item', async () => {
      await expect(
        linkToTask(sdlcDir, 'TD-999', 'TASK-001'),
      ).rejects.toThrow('Tech debt item not found: TD-999');
    });

    it('should persist linked tasks to disk', async () => {
      const item = await addTechDebtItem(sdlcDir, baseItem);
      await linkToTask(sdlcDir, item.id, 'TASK-001');

      const register = await loadTechDebt(sdlcDir);
      expect(register.items[0]!.linkedTasks).toContain('TASK-001');
    });
  });
});
