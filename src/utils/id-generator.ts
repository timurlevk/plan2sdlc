/**
 * ID generation utilities for backlog items, workflows, and tech debt.
 */

function extractNumber(id: string, prefix: string): number | null {
  const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
  return match ? parseInt(match[1]!, 10) : null;
}

function nextId(prefix: string, existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const num = extractNumber(id, prefix);
    if (num !== null && num > max) {
      max = num;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/**
 * Generate the next TASK-NNN identifier.
 */
export function generateTaskId(existingIds: string[]): string {
  return nextId('TASK-', existingIds);
}

/**
 * Generate the next WF-NNN identifier.
 */
export function generateWorkflowId(existingIds: string[]): string {
  return nextId('WF-', existingIds);
}

/**
 * Generate the next TD-NNN identifier.
 */
export function generateTechDebtId(existingIds: string[]): string {
  return nextId('TD-', existingIds);
}
