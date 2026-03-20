/**
 * Ecosystem Scanner
 *
 * Scans an existing project's conventions (naming, style, testing, CI, git)
 * and makes INHERIT/ENHANCE/PROPOSE decisions for the SDLC plugin to follow.
 * Read-only — no file modifications.
 */

import { readFile, readdir, stat, access } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConventionDecision = 'inherit' | 'enhance' | 'propose';

export interface ConventionEntry {
  category: string;
  name: string;
  detected: string | null;
  decision: ConventionDecision;
  description: string;
  proposal?: string;
}

export interface EcosystemReport {
  conventions: ConventionEntry[];
  summary: {
    inherited: number;
    enhanced: number;
    proposed: number;
    gaps: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
}

function execGit(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Recursively collect file names from a directory (non-directory entries only).
 * Limits depth to avoid scanning very deep trees.
 */
async function collectFileNames(
  dir: string,
  maxDepth: number = 3,
  currentDepth: number = 0,
): Promise<string[]> {
  if (currentDepth >= maxDepth) return [];
  const names: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      if (entry.isFile()) {
        names.push(entry.name);
      } else if (entry.isDirectory()) {
        const subNames = await collectFileNames(join(dir, entry.name), maxDepth, currentDepth + 1);
        names.push(...subNames);
      }
    }
  } catch {
    // directory not readable
  }
  return names;
}

// ---------------------------------------------------------------------------
// Naming convention detection
// ---------------------------------------------------------------------------

type NamingPattern = 'kebab-case' | 'camelCase' | 'PascalCase' | 'snake_case';

function classifyFileName(name: string): NamingPattern | null {
  const stem = name.replace(/\.[^.]+$/, ''); // remove extension
  if (!stem || stem.length < 2) return null;

  // Skip files that are all uppercase (e.g., README, LICENSE)
  if (/^[A-Z_]+$/.test(stem)) return null;

  // kebab-case: contains hyphens, all lowercase
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(stem)) return 'kebab-case';

  // snake_case: contains underscores, all lowercase
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(stem)) return 'snake_case';

  // PascalCase: starts uppercase, mixed case, no separators
  if (/^[A-Z][a-zA-Z0-9]+$/.test(stem) && /[a-z]/.test(stem)) return 'PascalCase';

  // camelCase: starts lowercase, mixed case, no separators
  if (/^[a-z][a-zA-Z0-9]+$/.test(stem) && /[A-Z]/.test(stem)) return 'camelCase';

  return null;
}

async function detectFileNaming(projectDir: string): Promise<ConventionEntry> {
  const srcDir = join(projectDir, 'src');
  const scanDir = (await dirExists(srcDir)) ? srcDir : projectDir;

  const files = await collectFileNames(scanDir);
  const counts: Record<NamingPattern, number> = {
    'kebab-case': 0,
    'camelCase': 0,
    'PascalCase': 0,
    'snake_case': 0,
  };

  let classified = 0;
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    // Only classify source files
    if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.rs', '.go', '.java', '.cs'].includes(ext)) {
      continue;
    }
    const pattern = classifyFileName(f);
    if (pattern) {
      counts[pattern]++;
      classified++;
    }
  }

  if (classified === 0) {
    return {
      category: 'naming',
      name: 'file-naming',
      detected: null,
      decision: 'propose',
      description: 'No source files found to determine naming convention',
      proposal: 'Use kebab-case for file names',
    };
  }

  // Find dominant pattern (>60%)
  const threshold = classified * 0.6;
  let dominant: NamingPattern | null = null;
  for (const [pattern, count] of Object.entries(counts) as Array<[NamingPattern, number]>) {
    if (count > threshold) {
      dominant = pattern;
      break;
    }
  }

  if (dominant) {
    return {
      category: 'naming',
      name: 'file-naming',
      detected: dominant,
      decision: 'inherit',
      description: `Detected ${dominant} file naming convention (${counts[dominant]}/${classified} files)`,
    };
  }

  // No dominant pattern - mixed naming
  const sorted = (Object.entries(counts) as Array<[NamingPattern, number]>)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a);
  const topPattern = sorted[0]?.[0] ?? 'kebab-case';

  return {
    category: 'naming',
    name: 'file-naming',
    detected: `mixed (${sorted.map(([p, c]) => `${p}:${c}`).join(', ')})`,
    decision: 'enhance',
    description: 'Mixed file naming conventions detected',
    proposal: `Standardize on ${topPattern} (most common pattern)`,
  };
}

// ---------------------------------------------------------------------------
// Commit convention detection
// ---------------------------------------------------------------------------

function detectCommitConvention(projectDir: string): ConventionEntry {
  const logOutput = execGit('git log --oneline -20', projectDir);

  if (!logOutput) {
    return {
      category: 'git',
      name: 'commit-format',
      detected: null,
      decision: 'propose',
      description: 'No git history found or not a git repository',
      proposal: 'Adopt Conventional Commits (feat:, fix:, chore:, etc.)',
    };
  }

  const lines = logOutput.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      category: 'git',
      name: 'commit-format',
      detected: null,
      decision: 'propose',
      description: 'No commits found in git history',
      proposal: 'Adopt Conventional Commits (feat:, fix:, chore:, etc.)',
    };
  }

  // Check for conventional commits pattern (type: message or type(scope): message)
  const conventionalPattern = /^[a-f0-9]+ (feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\(.+\))?[!]?:\s/;
  const jiraPattern = /^[a-f0-9]+ [A-Z]{2,}-\d+/;

  let conventionalCount = 0;
  let jiraCount = 0;

  for (const line of lines) {
    if (conventionalPattern.test(line)) conventionalCount++;
    if (jiraPattern.test(line)) jiraCount++;
  }

  const total = lines.length;

  if (conventionalCount / total > 0.5) {
    return {
      category: 'git',
      name: 'commit-format',
      detected: 'conventional-commits',
      decision: 'inherit',
      description: `Conventional Commits detected (${conventionalCount}/${total} commits)`,
    };
  }

  if (jiraCount / total > 0.5) {
    return {
      category: 'git',
      name: 'commit-format',
      detected: 'jira-prefix',
      decision: 'inherit',
      description: `JIRA-prefixed commits detected (${jiraCount}/${total} commits)`,
    };
  }

  return {
    category: 'git',
    name: 'commit-format',
    detected: 'free-form',
    decision: 'propose',
    description: 'No consistent commit convention detected',
    proposal: 'Adopt Conventional Commits (feat:, fix:, chore:, etc.)',
  };
}

// ---------------------------------------------------------------------------
// Linter detection
// ---------------------------------------------------------------------------

async function detectLinter(projectDir: string): Promise<ConventionEntry> {
  const linterFiles = [
    { pattern: '.eslintrc', name: 'eslint' },
    { pattern: '.eslintrc.js', name: 'eslint' },
    { pattern: '.eslintrc.cjs', name: 'eslint' },
    { pattern: '.eslintrc.json', name: 'eslint' },
    { pattern: '.eslintrc.yml', name: 'eslint' },
    { pattern: '.eslintrc.yaml', name: 'eslint' },
    { pattern: 'eslint.config.js', name: 'eslint' },
    { pattern: 'eslint.config.mjs', name: 'eslint' },
    { pattern: 'eslint.config.cjs', name: 'eslint' },
    { pattern: 'eslint.config.ts', name: 'eslint' },
    { pattern: 'biome.json', name: 'biome' },
    { pattern: 'biome.jsonc', name: 'biome' },
    { pattern: 'ruff.toml', name: 'ruff' },
    { pattern: '.ruff.toml', name: 'ruff' },
  ];

  const formatterFiles = [
    { pattern: '.prettierrc', name: 'prettier' },
    { pattern: '.prettierrc.js', name: 'prettier' },
    { pattern: '.prettierrc.cjs', name: 'prettier' },
    { pattern: '.prettierrc.json', name: 'prettier' },
    { pattern: '.prettierrc.yml', name: 'prettier' },
    { pattern: '.prettierrc.yaml', name: 'prettier' },
    { pattern: '.prettierrc.toml', name: 'prettier' },
    { pattern: 'prettier.config.js', name: 'prettier' },
    { pattern: 'prettier.config.cjs', name: 'prettier' },
    { pattern: 'prettier.config.mjs', name: 'prettier' },
  ];

  const detected: string[] = [];

  for (const { pattern, name } of [...linterFiles, ...formatterFiles]) {
    if (await fileExists(join(projectDir, pattern))) {
      if (!detected.includes(name)) detected.push(name);
    }
  }

  if (detected.length > 0) {
    return {
      category: 'style',
      name: 'linter',
      detected: detected.join(', '),
      decision: 'inherit',
      description: `Detected linter/formatter: ${detected.join(', ')}`,
    };
  }

  // Check if it's a JS/TS project that should have a linter
  const hasPkg = await fileExists(join(projectDir, 'package.json'));
  const hasTsConfig = await fileExists(join(projectDir, 'tsconfig.json'));

  if (hasPkg || hasTsConfig) {
    return {
      category: 'style',
      name: 'linter',
      detected: null,
      decision: 'propose',
      description: 'No linter configuration found for JS/TS project',
      proposal: 'Add ESLint with recommended rules',
    };
  }

  return {
    category: 'style',
    name: 'linter',
    detected: null,
    decision: 'propose',
    description: 'No linter configuration found',
    proposal: 'Add a linter appropriate for the project language',
  };
}

// ---------------------------------------------------------------------------
// Test framework detection
// ---------------------------------------------------------------------------

async function detectTestFramework(projectDir: string): Promise<ConventionEntry> {
  const configFiles = [
    { pattern: 'vitest.config.ts', name: 'vitest' },
    { pattern: 'vitest.config.js', name: 'vitest' },
    { pattern: 'vitest.config.mts', name: 'vitest' },
    { pattern: 'vite.config.ts', name: 'vitest' }, // vitest can use vite config
    { pattern: 'jest.config.ts', name: 'jest' },
    { pattern: 'jest.config.js', name: 'jest' },
    { pattern: 'jest.config.cjs', name: 'jest' },
    { pattern: 'jest.config.mjs', name: 'jest' },
    { pattern: 'pytest.ini', name: 'pytest' },
    { pattern: 'pyproject.toml', name: 'pytest' },
    { pattern: '.rspec', name: 'rspec' },
  ];

  const detected: string[] = [];

  for (const { pattern, name } of configFiles) {
    if (await fileExists(join(projectDir, pattern))) {
      if (!detected.includes(name)) detected.push(name);
    }
  }

  // Also check package.json for test framework deps
  const pkgContent = await readTextFile(join(projectDir, 'package.json'));
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ('vitest' in deps && !detected.includes('vitest')) detected.push('vitest');
      if (('jest' in deps || '@jest/core' in deps) && !detected.includes('jest')) detected.push('jest');
    } catch {
      // skip
    }
  }

  if (detected.length > 0) {
    // Check for coverage configuration and thresholds
    const coverageEntry = await detectCoverageThreshold(projectDir, detected);

    return {
      category: 'testing',
      name: 'test-framework',
      detected: detected.join(', '),
      decision: coverageEntry ? 'enhance' : 'inherit',
      description: `Detected test framework: ${detected.join(', ')}`,
      ...(coverageEntry ? { proposal: coverageEntry } : {}),
    };
  }

  return {
    category: 'testing',
    name: 'test-framework',
    detected: null,
    decision: 'propose',
    description: 'No test framework detected',
    proposal: 'Add vitest (for JS/TS) or pytest (for Python)',
  };
}

async function detectCoverageThreshold(
  projectDir: string,
  frameworks: string[],
): Promise<string | null> {
  // Check vitest/jest config for coverage thresholds
  for (const fw of frameworks) {
    const configNames =
      fw === 'vitest'
        ? ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts']
        : ['jest.config.ts', 'jest.config.js', 'jest.config.cjs', 'jest.config.mjs'];

    for (const configName of configNames) {
      const content = await readTextFile(join(projectDir, configName));
      if (content) {
        // Look for coverage thresholds
        if (/coverage/i.test(content) && /threshold/i.test(content)) {
          // Check if thresholds are low (below 80%)
          const thresholdMatch = /(\d+)/.exec(
            content.match(/threshold[^}]*?(\d+)/i)?.[0] ?? '',
          );
          if (thresholdMatch) {
            const threshold = parseInt(thresholdMatch[1] ?? '0', 10);
            if (threshold > 0 && threshold < 80) {
              return `Increase coverage threshold from ${threshold}% to 80%`;
            }
          }
          return null; // Has thresholds, they seem fine
        }
        // Has config but no coverage thresholds
        if (/coverage/i.test(content)) {
          return null; // Coverage configured but no thresholds — acceptable
        }
      }
    }
  }

  // No coverage configuration at all — suggest adding
  return 'Add coverage thresholds (recommend 80% minimum)';
}

// ---------------------------------------------------------------------------
// Test location detection
// ---------------------------------------------------------------------------

async function detectTestLocation(projectDir: string): Promise<ConventionEntry> {
  const locations: string[] = [];

  // Check for __tests__ directories co-located in src
  const srcDir = join(projectDir, 'src');
  if (await dirExists(srcDir)) {
    const srcTestsDir = join(srcDir, '__tests__');
    if (await dirExists(srcTestsDir)) locations.push('src/__tests__/ (co-located)');
  }

  // Check root-level test directories
  if (await dirExists(join(projectDir, '__tests__'))) locations.push('__tests__/ (root)');
  if (await dirExists(join(projectDir, 'tests'))) locations.push('tests/ (root)');
  if (await dirExists(join(projectDir, 'test'))) locations.push('test/ (root)');

  if (locations.length > 0) {
    return {
      category: 'testing',
      name: 'test-location',
      detected: locations.join(', '),
      decision: 'inherit',
      description: `Test files located in: ${locations.join(', ')}`,
    };
  }

  return {
    category: 'testing',
    name: 'test-location',
    detected: null,
    decision: 'propose',
    description: 'No test directory structure detected',
    proposal: 'Use src/__tests__/ for co-located unit tests',
  };
}

// ---------------------------------------------------------------------------
// Documentation detection
// ---------------------------------------------------------------------------

async function detectDocumentation(projectDir: string): Promise<ConventionEntry[]> {
  const entries: ConventionEntry[] = [];

  // Check for docs directory
  const hasDocs = await dirExists(join(projectDir, 'docs'));
  const hasReadme = await fileExists(join(projectDir, 'README.md'));
  const hasChangelog =
    (await fileExists(join(projectDir, 'CHANGELOG.md'))) ||
    (await fileExists(join(projectDir, 'CHANGES.md'))) ||
    (await fileExists(join(projectDir, 'HISTORY.md')));
  const hasContributing = await fileExists(join(projectDir, 'CONTRIBUTING.md'));

  const detected: string[] = [];
  if (hasDocs) detected.push('docs/');
  if (hasReadme) detected.push('README.md');
  if (hasChangelog) detected.push('CHANGELOG.md');
  if (hasContributing) detected.push('CONTRIBUTING.md');

  if (detected.length > 0) {
    entries.push({
      category: 'documentation',
      name: 'docs-structure',
      detected: detected.join(', '),
      decision: 'inherit',
      description: `Documentation found: ${detected.join(', ')}`,
    });
  } else {
    entries.push({
      category: 'documentation',
      name: 'docs-structure',
      detected: null,
      decision: 'propose',
      description: 'No documentation structure found',
      proposal: 'Add README.md and docs/ directory',
    });
  }

  // Specifically check for CHANGELOG
  if (!hasChangelog) {
    entries.push({
      category: 'documentation',
      name: 'changelog',
      detected: null,
      decision: 'propose',
      description: 'No CHANGELOG found',
      proposal: 'Add CHANGELOG.md following keep-a-changelog format',
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// CI/CD detection
// ---------------------------------------------------------------------------

async function detectCiCd(projectDir: string): Promise<ConventionEntry> {
  const ciSystems: string[] = [];

  if (await dirExists(join(projectDir, '.github', 'workflows'))) ciSystems.push('GitHub Actions');
  if (await fileExists(join(projectDir, '.gitlab-ci.yml'))) ciSystems.push('GitLab CI');
  if (await fileExists(join(projectDir, 'Jenkinsfile'))) ciSystems.push('Jenkins');
  if (await dirExists(join(projectDir, '.circleci'))) ciSystems.push('CircleCI');

  if (ciSystems.length > 0) {
    return {
      category: 'ci-cd',
      name: 'ci-pipeline',
      detected: ciSystems.join(', '),
      decision: 'inherit',
      description: `CI/CD detected: ${ciSystems.join(', ')}`,
    };
  }

  return {
    category: 'ci-cd',
    name: 'ci-pipeline',
    detected: null,
    decision: 'propose',
    description: 'No CI/CD pipeline detected',
    proposal: 'Add GitHub Actions workflow for CI',
  };
}

// ---------------------------------------------------------------------------
// Git workflow detection
// ---------------------------------------------------------------------------

function detectGitWorkflow(projectDir: string): ConventionEntry {
  const branchOutput = execGit('git branch --list', projectDir);

  if (!branchOutput) {
    return {
      category: 'git',
      name: 'branch-strategy',
      detected: null,
      decision: 'propose',
      description: 'No git branches found or not a git repository',
      proposal: 'Use feature/* branch naming convention',
    };
  }

  const branches = branchOutput
    .split('\n')
    .map((b) => b.replace(/^\*?\s*/, '').trim())
    .filter((b) => b.length > 0);

  // Look for branch patterns
  const patterns: Record<string, number> = {};
  for (const branch of branches) {
    const prefix = branch.split('/')[0];
    if (prefix && branch.includes('/')) {
      const key = `${prefix}/*`;
      patterns[key] = (patterns[key] ?? 0) + 1;
    }
  }

  const detectedPatterns = Object.entries(patterns)
    .filter(([, count]) => count >= 1)
    .map(([pattern]) => pattern);

  if (detectedPatterns.length > 0) {
    return {
      category: 'git',
      name: 'branch-strategy',
      detected: detectedPatterns.join(', '),
      decision: 'inherit',
      description: `Branch patterns detected: ${detectedPatterns.join(', ')}`,
    };
  }

  return {
    category: 'git',
    name: 'branch-strategy',
    detected: null,
    decision: 'propose',
    description: 'No branch naming pattern detected',
    proposal: 'Use feature/* branch naming convention',
  };
}

// ---------------------------------------------------------------------------
// CLAUDE.md detection
// ---------------------------------------------------------------------------

async function detectClaudeMd(projectDir: string): Promise<ConventionEntry> {
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const claudeDirPath = join(projectDir, '.claude');

  const hasClaudeMd = await fileExists(claudeMdPath);
  const hasClaudeDir = await dirExists(claudeDirPath);

  if (hasClaudeMd) {
    const size = await getFileSize(claudeMdPath);

    if (size > 8192) {
      return {
        category: 'claude',
        name: 'claude-config',
        detected: `CLAUDE.md (${Math.round(size / 1024)}KB)`,
        decision: 'enhance',
        description: 'Large CLAUDE.md detected — never overwrite',
        proposal: 'Consider splitting into domain-specific .claude/ files',
      };
    }

    return {
      category: 'claude',
      name: 'claude-config',
      detected: `CLAUDE.md${hasClaudeDir ? ', .claude/' : ''}`,
      decision: 'inherit',
      description: 'CLAUDE.md found — will read and respect, never overwrite',
    };
  }

  if (hasClaudeDir) {
    return {
      category: 'claude',
      name: 'claude-config',
      detected: '.claude/',
      decision: 'inherit',
      description: '.claude/ directory found — will respect existing configuration',
    };
  }

  return {
    category: 'claude',
    name: 'claude-config',
    detected: null,
    decision: 'propose',
    description: 'No CLAUDE.md or .claude/ directory found',
    proposal: 'Create CLAUDE.md with project conventions and guidelines',
  };
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

/**
 * Scan a project directory for existing conventions.
 * Read-only — no file modifications.
 */
export async function scanEcosystem(projectDir: string): Promise<EcosystemReport> {
  const conventions: ConventionEntry[] = [];

  // 1. File naming convention
  conventions.push(await detectFileNaming(projectDir));

  // 2. Commit convention
  conventions.push(detectCommitConvention(projectDir));

  // 3. Linter
  conventions.push(await detectLinter(projectDir));

  // 4. Test framework
  conventions.push(await detectTestFramework(projectDir));

  // 5. Test location
  conventions.push(await detectTestLocation(projectDir));

  // 6. Documentation
  const docEntries = await detectDocumentation(projectDir);
  conventions.push(...docEntries);

  // 7. CI/CD
  conventions.push(await detectCiCd(projectDir));

  // 8. Git workflow
  conventions.push(detectGitWorkflow(projectDir));

  // 9. CLAUDE.md
  conventions.push(await detectClaudeMd(projectDir));

  // Build summary
  const summary = {
    inherited: conventions.filter((c) => c.decision === 'inherit').length,
    enhanced: conventions.filter((c) => c.decision === 'enhance').length,
    proposed: conventions.filter((c) => c.decision === 'propose').length,
    gaps: conventions.filter((c) => c.detected === null).length,
  };

  return { conventions, summary };
}
