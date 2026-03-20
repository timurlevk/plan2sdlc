/**
 * Init Service
 *
 * Orchestrates the /sdlc init bootstrap flow:
 *   ecosystem scan -> domain mapping -> agent selection -> config generation -> verification.
 *
 * Read-only analysis phase (runInitScan) followed by a write phase (generateConfig).
 */

import { readFile, readdir, copyFile, access, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { detectTechStack } from './tech-stack-detector.js';
import { scanEcosystem } from './ecosystem-scanner.js';
import { selectTemplate } from './template-selector.js';
import type { ProjectProfile, DomainEntry, DomainMap } from '../types/detection.js';
import type { EcosystemReport } from './ecosystem-scanner.js';
import type { TemplateName } from './template-selector.js';
import { writeJsonFile, writeYamlFile, ensureDir } from '../utils/state-io.js';

/**
 * Dynamic import of the domain detector (lives in scripts/, outside src/ rootDir).
 * Uses a computed module path to avoid TypeScript's rootDir check.
 */
async function loadDomainDetector(): Promise<{ detectDomains: (dir: string) => Promise<DomainMap> }> {
  // Computed path bypasses TypeScript's static rootDir analysis
  const modulePath = ['..', '..', 'scripts', 'domain-detector.js'].join('/');
  return import(modulePath) as Promise<{ detectDomains: (dir: string) => Promise<DomainMap> }>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitResult {
  profile: ProjectProfile;
  domains: DomainMap;
  ecosystem: EcosystemReport;
  selectedTemplate: TemplateName;
  generatedFiles: string[];
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

/**
 * Recursively collect all file paths relative to a directory.
 */
async function collectFilesRecursive(
  dir: string,
  base: string,
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = join(base, entry.name);
      if (entry.isFile()) {
        results.push(relPath);
      } else if (entry.isDirectory()) {
        const sub = await collectFilesRecursive(fullPath, relPath);
        results.push(...sub);
      }
    }
  } catch {
    // directory not readable
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full init scan (read-only analysis phase).
 */
export async function runInitScan(projectDir: string): Promise<InitResult> {
  const { detectDomains } = await loadDomainDetector();
  const [profile, domains, ecosystem] = await Promise.all([
    detectTechStack(projectDir),
    detectDomains(projectDir),
    scanEcosystem(projectDir),
  ]);

  const selectedTemplate = selectTemplate(profile);

  return {
    profile,
    domains,
    ecosystem,
    selectedTemplate,
    generatedFiles: [],
  };
}

/**
 * Generate config files from init results.
 *
 * @param projectDir  - path to the project root
 * @param sdlcDir     - path to .sdlc/ directory
 * @param pluginDir   - path to the plugin installation (for reading templates)
 * @param initResult  - result from runInitScan
 * @param selectedAgents - list of agent names the user confirmed
 * @returns list of generated file paths (absolute)
 */
export async function generateConfig(
  projectDir: string,
  sdlcDir: string,
  pluginDir: string,
  initResult: InitResult,
  selectedAgents: string[],
): Promise<string[]> {
  const generated: string[] = [];

  await ensureDir(sdlcDir);

  // 1. config.yaml from template
  const templateDir = join(pluginDir, 'templates', initResult.selectedTemplate);
  const templateConfigPath = join(templateDir, 'config.yaml');
  const templateContent = await readTextFile(templateConfigPath);
  const configPath = join(sdlcDir, 'config.yaml');

  if (templateContent) {
    const { writeFile } = await import('node:fs/promises');
    await ensureDir(sdlcDir);
    await writeFile(configPath, templateContent, 'utf-8');
  } else {
    // Fallback: write a minimal config
    await writeYamlFile(configPath, {
      project: {
        type: initResult.profile.projectType,
        techStack: initResult.profile.frameworks,
      },
    });
  }
  generated.push(configPath);

  // 2. registry.yaml
  await generateRegistry(sdlcDir, initResult.domains.domains, selectedAgents);
  generated.push(join(sdlcDir, 'registry.yaml'));

  // 3. backlog.json (empty)
  const backlogPath = join(sdlcDir, 'backlog.json');
  await writeJsonFile(backlogPath, { schemaVersion: 1, items: [] });
  generated.push(backlogPath);

  // 4. state.json (empty)
  const statePath = join(sdlcDir, 'state.json');
  await writeJsonFile(statePath, {
    schemaVersion: 1,
    activeWorkflows: [],
    cadence: { mergesSinceRetro: 0 },
    sessionQueue: [],
    domainLocks: {},
  });
  generated.push(statePath);

  // 5. tech-debt.json (empty)
  const techDebtPath = join(sdlcDir, 'tech-debt.json');
  await writeJsonFile(techDebtPath, { schemaVersion: 1, items: [], metrics: { total: 0, open: 0, resolvedThisMonth: 0, trend: 'stable' } });
  generated.push(techDebtPath);

  // 6. Orchestrator agent
  const orchestratorFiles = await generateOrchestratorAgent(
    projectDir,
    pluginDir,
    initResult.domains.domains,
  );
  generated.push(...orchestratorFiles);

  // 7. Domain agents
  const domainFiles = await generateDomainAgents(
    projectDir,
    pluginDir,
    initResult.domains.domains,
    'sonnet',
  );
  generated.push(...domainFiles);

  // 8. Governance agents
  const govFiles = await generateGovernanceAgents(
    projectDir,
    pluginDir,
    initResult.domains.domains,
  );
  generated.push(...govFiles);

  // 9. Update .gitignore
  const gitignorePath = join(projectDir, '.gitignore');
  await updateGitignore(gitignorePath);
  generated.push(gitignorePath);

  return generated;
}

/**
 * Backup existing .claude/ directory to .sdlc/backup/.
 * Returns list of backed-up files (relative paths from project root).
 */
export async function backupClaudeConfig(
  projectDir: string,
  sdlcDir: string,
): Promise<string[]> {
  const backedUp: string[] = [];
  const backupDir = join(sdlcDir, 'backup');
  await ensureDir(backupDir);

  // Backup CLAUDE.md
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  if (await fileExists(claudeMdPath)) {
    const dest = join(backupDir, 'CLAUDE.md');
    await copyFile(claudeMdPath, dest);
    backedUp.push('CLAUDE.md');
  }

  // Backup .claude/ subdirectories and files
  const claudeDir = join(projectDir, '.claude');
  if (await dirExists(claudeDir)) {
    const dirsToBackup = ['agents', 'rules', 'skills'];
    for (const subDir of dirsToBackup) {
      const srcDir = join(claudeDir, subDir);
      if (await dirExists(srcDir)) {
        const files = await collectFilesRecursive(srcDir, '');
        for (const relFile of files) {
          const src = join(srcDir, relFile);
          const dest = join(backupDir, '.claude', subDir, relFile);
          await ensureDir(join(backupDir, '.claude', subDir));
          await copyFile(src, dest);
          backedUp.push(join('.claude', subDir, relFile));
        }
      }
    }

    // Backup settings.json
    const settingsPath = join(claudeDir, 'settings.json');
    if (await fileExists(settingsPath)) {
      const dest = join(backupDir, '.claude', 'settings.json');
      await ensureDir(join(backupDir, '.claude'));
      await copyFile(settingsPath, dest);
      backedUp.push(join('.claude', 'settings.json'));
    }
  }

  return backedUp;
}

/**
 * Generate agent file from template by replacing {{variables}}.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    // Replace all occurrences of {{key}} with value
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
}

/**
 * Generate per-domain agent files (developer + tester for each domain).
 */
export async function generateDomainAgents(
  projectDir: string,
  pluginDir: string,
  domains: DomainEntry[],
  model: string,
): Promise<string[]> {
  const generated: string[] = [];
  const agentsDir = join(projectDir, '.claude', 'agents');
  await ensureDir(agentsDir);

  const devTemplatePath = join(pluginDir, 'agents', 'templates', 'domain-developer.md');
  const testTemplatePath = join(pluginDir, 'agents', 'templates', 'domain-tester.md');

  const devTemplate = await readTextFile(devTemplatePath);
  const testTemplate = await readTextFile(testTemplatePath);

  const projectName = basename(projectDir);

  for (const domain of domains) {
    const variables: Record<string, string> = {
      domain: domain.name,
      path: domain.path,
      model,
      project_name: projectName,
      tech_stack: domain.techStack.join(', ') || 'general',
      test_command: `pnpm test`,
      test_framework: 'vitest',
      coverage_command: `pnpm test:coverage`,
      e2e_framework: 'playwright',
      domain_description: domain.description,
    };

    // Developer agent
    if (devTemplate) {
      const rendered = renderTemplate(devTemplate, variables);
      const devPath = join(agentsDir, `${domain.name}-developer.md`);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(devPath, rendered, 'utf-8');
      generated.push(devPath);
    }

    // Tester agent
    if (testTemplate) {
      const rendered = renderTemplate(testTemplate, variables);
      const testPath = join(agentsDir, `${domain.name}-tester.md`);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(testPath, rendered, 'utf-8');
      generated.push(testPath);
    }
  }

  return generated;
}

/**
 * Generate orchestrator agent from template.
 */
async function generateOrchestratorAgent(
  projectDir: string,
  pluginDir: string,
  domains: DomainEntry[],
): Promise<string[]> {
  const generated: string[] = [];
  const agentsDir = join(projectDir, '.claude', 'agents');
  await ensureDir(agentsDir);

  const templatePath = join(pluginDir, 'agents', 'orchestrator.md');
  const template = await readTextFile(templatePath);

  if (template) {
    const projectName = basename(projectDir);
    const domainMapStr = domains
      .map((d) => `- **${d.name}**: \`${d.path}\` (${d.techStack.join(', ') || 'general'})`)
      .join('\n');

    const rendered = renderTemplate(template, {
      project_name: projectName,
      domain_map: domainMapStr,
    });

    const destPath = join(agentsDir, 'orchestrator.md');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(destPath, rendered, 'utf-8');
    generated.push(destPath);
  }

  return generated;
}

/**
 * Generate governance agent files (architect + reviewer).
 */
async function generateGovernanceAgents(
  projectDir: string,
  pluginDir: string,
  domains: DomainEntry[],
): Promise<string[]> {
  const generated: string[] = [];
  const agentsDir = join(projectDir, '.claude', 'agents');
  await ensureDir(agentsDir);

  const projectName = basename(projectDir);
  const domainMapStr = domains
    .map((d) => `- **${d.name}**: \`${d.path}\` (${d.techStack.join(', ') || 'general'})`)
    .join('\n');

  const templates = ['governance-architect.md', 'governance-reviewer.md'];
  for (const templateName of templates) {
    const templatePath = join(pluginDir, 'agents', 'templates', templateName);
    const template = await readTextFile(templatePath);
    if (template) {
      const rendered = renderTemplate(template, {
        project_name: projectName,
        domain_map: domainMapStr,
      });
      const destPath = join(agentsDir, templateName);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(destPath, rendered, 'utf-8');
      generated.push(destPath);
    }
  }

  return generated;
}

/**
 * Generate registry.yaml from selected agents.
 */
export async function generateRegistry(
  sdlcDir: string,
  domains: DomainEntry[],
  selectedAgents: string[],
): Promise<void> {
  interface RegistryAgent {
    name: string;
    role: string;
    scope: string;
    category: 'mandatory' | 'auto-detected' | 'on-demand';
  }

  const agents: RegistryAgent[] = [];

  // Mandatory: orchestrator
  agents.push({
    name: 'orchestrator',
    role: 'orchestrator',
    scope: 'global',
    category: 'mandatory',
  });

  // Mandatory: per-domain developer and tester
  for (const domain of domains) {
    agents.push({
      name: `${domain.name}-developer`,
      role: 'developer',
      scope: domain.path,
      category: 'mandatory',
    });
    agents.push({
      name: `${domain.name}-tester`,
      role: 'tester',
      scope: domain.path,
      category: 'mandatory',
    });
  }

  // Mandatory governance agents
  agents.push({
    name: 'governance-architect',
    role: 'architect',
    scope: 'global',
    category: 'mandatory',
  });
  agents.push({
    name: 'governance-reviewer',
    role: 'reviewer',
    scope: 'global',
    category: 'mandatory',
  });

  // Auto-detected / on-demand agents from selection
  for (const agentName of selectedAgents) {
    // Skip agents already added as mandatory
    if (agents.some((a) => a.name === agentName)) continue;
    agents.push({
      name: agentName,
      role: agentName,
      scope: 'global',
      category: 'auto-detected',
    });
  }

  const registry = {
    version: '1.0',
    agents,
  };

  const registryPath = join(sdlcDir, 'registry.yaml');
  await writeYamlFile(registryPath, registry);
}

/**
 * Update .gitignore with SDLC-specific entries.
 */
async function updateGitignore(gitignorePath: string): Promise<void> {
  const sdlcEntries = [
    '',
    '# SDLC plugin',
    '.sdlc/state.json',
    '.sdlc/cost-log/',
    '.sdlc/backup/',
  ];

  let existing = await readTextFile(gitignorePath) ?? '';

  // Check if SDLC section already exists
  if (existing.includes('# SDLC plugin')) {
    return;
  }

  const newContent = existing.trimEnd() + '\n' + sdlcEntries.join('\n') + '\n';
  const { writeFile } = await import('node:fs/promises');
  await writeFile(gitignorePath, newContent, 'utf-8');
}
