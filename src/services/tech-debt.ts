/**
 * Tech Debt Register service for managing tech debt items in .sdlc/tech-debt.json.
 */

import { join } from 'node:path';
import type {
  TechDebtItem,
  TechDebtMetrics,
  TechDebtRegister,
  TechDebtStatus,
  TechDebtTrend,
} from '../types/tech-debt.js';
import { readJsonFile, writeJsonFile } from '../utils/state-io.js';
import { generateTechDebtId } from '../utils/id-generator.js';
import { CURRENT_SCHEMA_VERSION, validateSchemaVersion } from '../utils/schema-version.js';

const TECH_DEBT_FILE = 'tech-debt.json';

/**
 * Create an empty tech debt register with zeroed metrics.
 */
function emptyRegister(): TechDebtRegister {
  return {
    items: [],
    metrics: {
      total: 0,
      open: 0,
      resolvedThisMonth: 0,
      trend: 'stable',
    },
  };
}

/**
 * Load tech debt register, returns empty register if file doesn't exist.
 */
export async function loadTechDebt(sdlcDir: string): Promise<TechDebtRegister> {
  try {
    const data = await readJsonFile<TechDebtRegister>(join(sdlcDir, TECH_DEBT_FILE));
    validateSchemaVersion(data, TECH_DEBT_FILE);
    return data;
  } catch {
    return emptyRegister();
  }
}

/**
 * Save tech debt register (always includes schemaVersion).
 */
export async function saveTechDebt(sdlcDir: string, register: TechDebtRegister): Promise<void> {
  await writeJsonFile(join(sdlcDir, TECH_DEBT_FILE), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...register,
  });
}

/**
 * Add a new tech debt item. Generates TD-NNN ID, recalculates metrics, and persists.
 */
export async function addTechDebtItem(
  sdlcDir: string,
  item: Omit<TechDebtItem, 'id' | 'resolvedDate'>,
): Promise<TechDebtItem> {
  const register = await loadTechDebt(sdlcDir);
  const id = generateTechDebtId(register.items.map((i) => i.id));

  const newItem: TechDebtItem = {
    ...item,
    id,
    resolvedDate: null,
  };

  register.items.push(newItem);
  register.metrics = calculateMetrics(register.items);
  await saveTechDebt(sdlcDir, register);
  return newItem;
}

/**
 * Update a tech debt item by ID. Recalculates metrics and persists.
 * Throws if the item is not found.
 */
export async function updateTechDebtItem(
  sdlcDir: string,
  id: string,
  updates: Partial<TechDebtItem>,
): Promise<TechDebtItem> {
  const register = await loadTechDebt(sdlcDir);
  const index = register.items.findIndex((i) => i.id === id);
  if (index === -1) {
    throw new Error(`Tech debt item not found: ${id}`);
  }

  const updated: TechDebtItem = {
    ...register.items[index]!,
    ...updates,
    id, // prevent ID overwrite
  };

  register.items[index] = updated;
  register.metrics = calculateMetrics(register.items);
  await saveTechDebt(sdlcDir, register);
  return updated;
}

/**
 * Resolve a tech debt item — sets status and resolvedDate.
 * Throws if the item is not found.
 */
export async function resolveTechDebtItem(
  sdlcDir: string,
  id: string,
  status: 'resolved' | 'accepted-risk' | 'wont-fix',
): Promise<TechDebtItem> {
  return updateTechDebtItem(sdlcDir, id, {
    status,
    resolvedDate: new Date().toISOString().slice(0, 10),
  });
}

/**
 * Recalculate metrics from items.
 */
export function calculateMetrics(items: TechDebtItem[]): TechDebtMetrics {
  const total = items.length;
  const openStatuses: TechDebtStatus[] = ['open', 'in-progress'];
  const open = items.filter((i) => openStatuses.includes(i.status)).length;

  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();

  const resolvedThisMonth = items.filter((i) => {
    if (!i.resolvedDate) return false;
    const d = new Date(i.resolvedDate);
    return d.getFullYear() * 12 + d.getMonth() === currentMonth;
  }).length;

  // Count items detected this month
  const newThisMonth = items.filter((i) => {
    const d = new Date(i.detected);
    return d.getFullYear() * 12 + d.getMonth() === currentMonth;
  }).length;

  let trend: TechDebtTrend;
  if (resolvedThisMonth > newThisMonth) {
    trend = 'improving';
  } else if (resolvedThisMonth === newThisMonth) {
    trend = 'stable';
  } else {
    trend = 'worsening';
  }

  return { total, open, resolvedThisMonth, trend };
}

/**
 * Get items grouped by severity for prioritization.
 */
export function getItemsBySeverity(items: TechDebtItem[]): Record<string, TechDebtItem[]> {
  const result: Record<string, TechDebtItem[]> = {};
  for (const item of items) {
    if (!result[item.severity]) {
      result[item.severity] = [];
    }
    result[item.severity]!.push(item);
  }
  return result;
}

/**
 * Link a tech debt item to a backlog task.
 * Appends taskId to linkedTasks if not already present.
 * Throws if the item is not found.
 */
export async function linkToTask(
  sdlcDir: string,
  debtId: string,
  taskId: string,
): Promise<TechDebtItem> {
  const register = await loadTechDebt(sdlcDir);
  const item = register.items.find((i) => i.id === debtId);
  if (!item) {
    throw new Error(`Tech debt item not found: ${debtId}`);
  }

  if (!item.linkedTasks.includes(taskId)) {
    item.linkedTasks.push(taskId);
  }

  await saveTechDebt(sdlcDir, register);
  return item;
}
