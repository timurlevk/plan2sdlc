/**
 * Backlog CRUD service for managing BacklogItems in .sdlc/backlog.json.
 */

import { join } from 'node:path';
import type { BacklogItem, BacklogStatus } from '../types/backlog.js';
import { readJsonFile, writeJsonFile } from '../utils/state-io.js';
import { generateTaskId } from '../utils/id-generator.js';
import { CURRENT_SCHEMA_VERSION, validateSchemaVersion } from '../utils/schema-version.js';

const BACKLOG_FILE = 'backlog.json';

/** Wrapper object for the backlog file on disk. */
interface BacklogFile {
  schemaVersion: number;
  items: BacklogItem[];
}

/** Valid status transitions. Key = current status, value = allowed next statuses. */
const VALID_TRANSITIONS: Record<BacklogStatus, BacklogStatus[]> = {
  inbox: ['triaged', 'planned', 'abandoned'],
  triaged: ['planned', 'executing', 'abandoned'],
  planned: ['executing', 'abandoned'],
  executing: ['reviewing', 'blocked', 'abandoned'],
  reviewing: ['done', 'executing', 'blocked', 'abandoned'],
  blocked: ['executing', 'triaged', 'abandoned'],
  done: [],
  abandoned: ['inbox'],
};

/**
 * Load the backlog from disk. Returns an empty array if the file does not exist.
 * Supports both old (bare array) and new (object wrapper with schemaVersion) formats.
 */
export async function loadBacklog(sdlcDir: string): Promise<BacklogItem[]> {
  try {
    const data = await readJsonFile<BacklogFile | BacklogItem[]>(join(sdlcDir, BACKLOG_FILE));
    // Support both old (bare array) and new (object wrapper) formats
    if (Array.isArray(data)) return data;
    validateSchemaVersion(data, BACKLOG_FILE);
    return data.items;
  } catch {
    return [];
  }
}

/**
 * Save the backlog array to disk (always writes new wrapper format).
 */
export async function saveBacklog(sdlcDir: string, items: BacklogItem[]): Promise<void> {
  await writeJsonFile(join(sdlcDir, BACKLOG_FILE), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    items,
  });
}

/**
 * Add a new backlog item. Generates an auto-incrementing TASK-NNN ID,
 * sets timestamps, and initialises the sessions array.
 */
export async function addBacklogItem(
  sdlcDir: string,
  item: Omit<BacklogItem, 'id' | 'created' | 'updated' | 'sessions'>,
): Promise<BacklogItem> {
  const items = await loadBacklog(sdlcDir);
  const id = generateTaskId(items.map((i) => i.id));
  const now = new Date().toISOString();

  const newItem: BacklogItem = {
    ...item,
    id,
    created: now,
    updated: now,
    sessions: [],
  };

  items.push(newItem);
  await saveBacklog(sdlcDir, items);
  return newItem;
}

/**
 * Update an existing backlog item by ID. Sets the `updated` timestamp automatically.
 * Throws if the item is not found.
 */
export async function updateBacklogItem(
  sdlcDir: string,
  id: string,
  updates: Partial<BacklogItem>,
): Promise<BacklogItem> {
  const items = await loadBacklog(sdlcDir);
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) {
    throw new Error(`Backlog item not found: ${id}`);
  }

  const updated: BacklogItem = {
    ...items[index]!,
    ...updates,
    id, // prevent ID overwrite
    updated: new Date().toISOString(),
  };

  items[index] = updated;
  await saveBacklog(sdlcDir, items);
  return updated;
}

/**
 * Get a single backlog item by ID. Returns undefined if not found.
 */
export async function getBacklogItem(
  sdlcDir: string,
  id: string,
): Promise<BacklogItem | undefined> {
  const items = await loadBacklog(sdlcDir);
  return items.find((i) => i.id === id);
}

/**
 * Transition a backlog item to a new status. Validates the transition is legal.
 * Throws if the transition is not allowed or the item is not found.
 */
export async function transitionStatus(
  sdlcDir: string,
  id: string,
  newStatus: BacklogStatus,
): Promise<BacklogItem> {
  const items = await loadBacklog(sdlcDir);
  const item = items.find((i) => i.id === id);
  if (!item) {
    throw new Error(`Backlog item not found: ${id}`);
  }

  const allowed = VALID_TRANSITIONS[item.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${item.status} -> ${newStatus}. Allowed: ${(allowed ?? []).join(', ') || '(none)'}`,
    );
  }

  return updateBacklogItem(sdlcDir, id, { status: newStatus });
}
