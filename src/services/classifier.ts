/**
 * Task classifier service for the claude-sdlc plugin.
 * Heuristic-based classification of user task descriptions into
 * type, complexity, domains, session chain, and priority.
 */

import type { BacklogItemType, Complexity, Priority } from '../types/backlog.js';
import type { SessionType } from '../types/session.js';
import type { DomainEntry } from '../types/detection.js';

export interface ClassificationResult {
  taskType: BacklogItemType;
  complexity: Complexity;
  domains: string[];
  sessionChain: SessionType[];
  priority: Priority;
  suggestedTitle: string;
}

export interface ClassifierContext {
  domainMap: DomainEntry[];
  description: string;
}

// ── Keyword maps ──────────────────────────────────────────────────────

const TASK_TYPE_KEYWORDS: Record<BacklogItemType, string[]> = {
  bugfix: ['fix', 'bug', 'broken', 'crash', 'error', 'issue'],
  refactor: ['refactor', 'clean', 'extract', 'rename', 'move', 'reorganize'],
  research: ['research', 'investigate', 'explore', 'analyze', 'spike'],
  docs: ['doc', 'document', 'readme', 'guide', 'changelog'],
  ops: ['deploy', 'ci', 'pipeline', 'docker', 'infra', 'devops'],
  feature: [], // default fallback
};

const COMPLEXITY_SIGNALS: Record<Complexity, string[]> = {
  S: ['small', 'quick', 'simple', 'trivial'],
  M: [],
  L: ['large', 'complex', 'redesign', 'major'],
  XL: ['architecture', 'system', 'platform', 'migrate'],
};

const PRIORITY_KEYWORDS: { priority: Priority; keywords: string[] }[] = [
  { priority: 'critical', keywords: ['critical', 'urgent', 'asap', 'production down'] },
  { priority: 'high', keywords: ['important', 'high priority', 'blocker'] },
  { priority: 'low', keywords: ['low priority', 'nice to have', 'when possible'] },
];

const SPECIAL_SESSION_KEYWORDS: { keywords: string[]; chain: SessionType[] }[] = [
  { keywords: ['hotfix', 'emergency', 'production down'], chain: ['HOTFIX'] },
  { keywords: ['triage'], chain: ['TRIAGE'] },
  { keywords: ['retro'], chain: ['RETRO'] },
  { keywords: ['release'], chain: ['RELEASE'] },
];

// ── Internal helpers ──────────────────────────────────────────────────

function lower(s: string): string {
  return s.toLowerCase();
}

function containsWord(text: string, word: string): boolean {
  // Multi-word phrases use simple includes
  if (word.includes(' ')) {
    return text.includes(word);
  }
  // Single words need word-boundary matching to avoid false positives
  const re = new RegExp(`\\b${word}\\b`, 'i');
  return re.test(text);
}

function detectTaskType(desc: string): BacklogItemType {
  const text = lower(desc);
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS) as [BacklogItemType, string[]][]) {
    if (type === 'feature') continue; // skip default
    if (keywords.some((kw) => containsWord(text, kw))) {
      return type;
    }
  }
  return 'feature';
}

function detectDomains(desc: string, domainMap: DomainEntry[]): string[] {
  const text = lower(desc);
  const matched: string[] = [];

  for (const domain of domainMap) {
    if (containsWord(text, lower(domain.name)) || text.includes(lower(domain.path))) {
      matched.push(domain.name);
    }
  }

  // If nothing matched, use the first domain as default (if available)
  if (matched.length === 0 && domainMap.length > 0) {
    matched.push(domainMap[0]!.name);
  }

  return matched;
}

function detectComplexity(desc: string, domainCount: number): Complexity {
  const text = lower(desc);

  // Check explicit XL signals first
  if (COMPLEXITY_SIGNALS.XL.some((kw) => containsWord(text, kw))) {
    return 'XL';
  }

  // Check explicit L signals
  if (COMPLEXITY_SIGNALS.L.some((kw) => containsWord(text, kw))) {
    return 'L';
  }

  // Check explicit S signals
  if (COMPLEXITY_SIGNALS.S.some((kw) => containsWord(text, kw))) {
    return 'S';
  }

  // Domain-count heuristic
  if (domainCount >= 3) return 'XL';
  if (domainCount === 2) return 'L';

  // Description length heuristic
  if (desc.length < 50) return 'S';
  if (desc.length > 200) return 'L';

  return 'M';
}

function detectPriority(desc: string): Priority {
  const text = lower(desc);

  for (const { priority, keywords } of PRIORITY_KEYWORDS) {
    if (keywords.some((kw) => text.includes(kw))) {
      return priority;
    }
  }

  return 'medium';
}

function detectSpecialSession(desc: string): SessionType[] | null {
  const text = lower(desc);

  for (const { keywords, chain } of SPECIAL_SESSION_KEYWORDS) {
    if (keywords.some((kw) => text.includes(kw))) {
      return chain;
    }
  }

  return null;
}

function buildSessionChain(
  taskType: BacklogItemType,
  complexity: Complexity,
  domainCount: number,
): SessionType[] {
  let chain: SessionType[];

  if (complexity === 'XL') {
    chain = ['ARCHITECTURE_REVIEW', 'BRAINSTORM', 'PLAN', 'EXECUTE', 'REVIEW', 'MERGE'];
  } else if (complexity === 'L') {
    chain = ['BRAINSTORM', 'PLAN', 'EXECUTE', 'REVIEW', 'MERGE'];
  } else if (complexity === 'S' && taskType === 'bugfix') {
    chain = ['QUICK_FIX', 'MERGE'];
  } else {
    // M or S non-bugfix
    chain = ['PLAN', 'EXECUTE', 'REVIEW', 'MERGE'];
  }

  // Insert INTEGRATION_CHECK before MERGE for multi-domain tasks (except S)
  if (domainCount >= 2 && complexity !== 'S') {
    const mergeIdx = chain.indexOf('MERGE');
    if (mergeIdx > 0) {
      chain.splice(mergeIdx, 0, 'INTEGRATION_CHECK');
    }
  }

  return chain;
}

function buildSuggestedTitle(desc: string): string {
  // Strip leading/trailing whitespace, collapse whitespace
  let title = desc.trim().replace(/\s+/g, ' ');

  // Remove leading common prefixes like "please", "can you"
  title = title.replace(/^(please\s+|can you\s+|could you\s+|i want to\s+|i need to\s+)/i, '');

  // Capitalize first letter
  if (title.length > 0) {
    title = title[0]!.toUpperCase() + title.slice(1);
  }

  // Truncate if too long
  if (title.length > 80) {
    title = title.slice(0, 77) + '...';
  }

  return title;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Classify a task based on description and project context.
 * This is a heuristic classifier — real LLM classification happens in the orchestrator.
 * This provides a reasonable default that can be overridden.
 */
export function classifyTask(ctx: ClassifierContext): ClassificationResult {
  const { description, domainMap } = ctx;

  // Check special session keywords first (hotfix, triage, retro, release)
  const specialChain = detectSpecialSession(description);

  const taskType = detectTaskType(description);
  const domains = detectDomains(description, domainMap);
  const complexity = detectComplexity(description, domains.length);
  let priority = detectPriority(description);

  // Hotfix always gets critical priority
  if (specialChain && specialChain[0] === 'HOTFIX') {
    priority = 'critical';
  }

  const sessionChain = specialChain ?? buildSessionChain(taskType, complexity, domains.length);
  const suggestedTitle = buildSuggestedTitle(description);

  return {
    taskType,
    complexity,
    domains,
    sessionChain,
    priority,
    suggestedTitle,
  };
}
