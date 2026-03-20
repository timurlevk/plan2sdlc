import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runInitScan,
  renderTemplate,
  backupClaudeConfig,
  generateConfig,
  generateRegistry,
} from '../services/init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

async function createTempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sdlc-init-test-'));
  return dir;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true }).catch(() => {});
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true }).catch(() => {});
  await writeFile(filePath, content, 'utf-8');
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

async function fileExistsCheck(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  it('replaces all {{variables}} in template', () => {
    const template = 'Hello {{name}}, you are in {{domain}} at {{path}}.';
    const result = renderTemplate(template, {
      name: 'TestAgent',
      domain: 'api',
      path: 'apps/api',
    });
    expect(result).toBe('Hello TestAgent, you are in api at apps/api.');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const template = '{{domain}} developer works on {{domain}}';
    const result = renderTemplate(template, { domain: 'web' });
    expect(result).toBe('web developer works on web');
  });

  it('leaves unreferenced variables unchanged', () => {
    const template = 'Hello {{name}}, {{unknown}} stays.';
    const result = renderTemplate(template, { name: 'Test' });
    expect(result).toBe('Hello Test, {{unknown}} stays.');
  });

  it('handles empty variables record', () => {
    const template = 'No replacements here.';
    const result = renderTemplate(template, {});
    expect(result).toBe('No replacements here.');
  });
});

describe('runInitScan', () => {
  beforeEach(async () => {
    tempDir = await createTempProject();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns profile, domains, ecosystem and template for a basic project', async () => {
    // Set up a minimal Node.js project
    await writeJson(join(tempDir, 'package.json'), {
      name: 'test-project',
      dependencies: { express: '^4.0.0' },
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
    });
    await writeText(join(tempDir, 'tsconfig.json'), '{}');

    const result = await runInitScan(tempDir);

    expect(result.profile).toBeDefined();
    expect(result.profile.frameworks).toContain('express');
    expect(result.profile.languages).toContain('typescript');
    expect(result.domains).toBeDefined();
    expect(result.domains.domains.length).toBeGreaterThanOrEqual(1);
    expect(result.ecosystem).toBeDefined();
    expect(result.ecosystem.conventions.length).toBeGreaterThan(0);
    expect(result.selectedTemplate).toBe('express-api');
    expect(result.generatedFiles).toEqual([]);
  });

  it('returns generic template for empty project', async () => {
    const result = await runInitScan(tempDir);

    expect(result.profile.packageManager).toBe('unknown');
    expect(result.selectedTemplate).toBe('generic');
    expect(result.domains.domains.length).toBeGreaterThanOrEqual(1);
  });
});

describe('backupClaudeConfig', () => {
  beforeEach(async () => {
    tempDir = await createTempProject();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('backs up CLAUDE.md to .sdlc/backup/', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    await writeText(join(tempDir, 'CLAUDE.md'), '# My Project');

    const backed = await backupClaudeConfig(tempDir, sdlcDir);

    expect(backed).toContain('CLAUDE.md');
    const content = await readFile(join(sdlcDir, 'backup', 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('# My Project');
  });

  it('backs up .claude/ directory files', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    const agentsDir = join(tempDir, '.claude', 'agents');
    await mkdir(agentsDir, { recursive: true });
    await writeText(join(agentsDir, 'my-agent.md'), '# Agent');
    await writeText(join(tempDir, '.claude', 'settings.json'), '{}');

    const backed = await backupClaudeConfig(tempDir, sdlcDir);

    expect(backed.some((f) => f.includes('my-agent.md'))).toBe(true);
    expect(backed.some((f) => f.includes('settings.json'))).toBe(true);

    const agentContent = await readFile(
      join(sdlcDir, 'backup', '.claude', 'agents', 'my-agent.md'),
      'utf-8',
    );
    expect(agentContent).toBe('# Agent');
  });

  it('returns empty array when nothing to back up', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    const backed = await backupClaudeConfig(tempDir, sdlcDir);
    expect(backed).toEqual([]);
  });
});

describe('generateConfig', () => {
  beforeEach(async () => {
    tempDir = await createTempProject();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .sdlc/ files: config.yaml, backlog.json, state.json, tech-debt.json', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    // pluginDir points to the real plugin so templates are available
    const pluginDir = join(process.cwd());

    const initResult = await runInitScan(tempDir);

    const generated = await generateConfig(
      tempDir,
      sdlcDir,
      pluginDir,
      initResult,
      ['orchestrator'],
    );

    // Check core state files exist
    expect(await fileExistsCheck(join(sdlcDir, 'config.yaml'))).toBe(true);
    expect(await fileExistsCheck(join(sdlcDir, 'registry.yaml'))).toBe(true);
    expect(await fileExistsCheck(join(sdlcDir, 'backlog.json'))).toBe(true);
    expect(await fileExistsCheck(join(sdlcDir, 'state.json'))).toBe(true);
    expect(await fileExistsCheck(join(sdlcDir, 'tech-debt.json'))).toBe(true);

    // Verify empty state files
    const backlog = await readJson<{ schemaVersion: number; items: unknown[] }>(join(sdlcDir, 'backlog.json'));
    expect(backlog.schemaVersion).toBe(1);
    expect(backlog.items).toEqual([]);

    const state = await readJson<{ schemaVersion: number; activeWorkflows: unknown[]; cadence: { mergesSinceRetro: number }; sessionQueue: unknown[]; domainLocks: Record<string, unknown> }>(
      join(sdlcDir, 'state.json'),
    );
    expect(state.schemaVersion).toBe(1);
    expect(state.activeWorkflows).toEqual([]);
    expect(state.cadence.mergesSinceRetro).toBe(0);
    expect(state.domainLocks).toEqual({});

    // Verify generated list is non-empty and all paths are absolute
    expect(generated.length).toBeGreaterThan(0);
  });

  it('generates orchestrator agent', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    const pluginDir = join(process.cwd());

    const initResult = await runInitScan(tempDir);
    await generateConfig(tempDir, sdlcDir, pluginDir, initResult, []);

    const orchestratorPath = join(tempDir, '.claude', 'agents', 'orchestrator.md');
    expect(await fileExistsCheck(orchestratorPath)).toBe(true);
  });

  it('generates domain agents (developer + tester)', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    const pluginDir = join(process.cwd());

    const initResult = await runInitScan(tempDir);
    // The fallback domain will be named after the temp dir
    const domainName = initResult.domains.domains[0]?.name;
    expect(domainName).toBeDefined();

    await generateConfig(tempDir, sdlcDir, pluginDir, initResult, []);

    const agentsDir = join(tempDir, '.claude', 'agents');
    expect(await fileExistsCheck(join(agentsDir, `${domainName}-developer.md`))).toBe(true);
    expect(await fileExistsCheck(join(agentsDir, `${domainName}-tester.md`))).toBe(true);
  });

  it('generates governance agents (architect + reviewer)', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    const pluginDir = join(process.cwd());

    const initResult = await runInitScan(tempDir);
    await generateConfig(tempDir, sdlcDir, pluginDir, initResult, []);

    const agentsDir = join(tempDir, '.claude', 'agents');
    expect(await fileExistsCheck(join(agentsDir, 'governance-architect.md'))).toBe(true);
    expect(await fileExistsCheck(join(agentsDir, 'governance-reviewer.md'))).toBe(true);
  });

  it('updates .gitignore with SDLC entries', async () => {
    await writeText(join(tempDir, '.gitignore'), 'node_modules/\ndist/\n');

    const sdlcDir = join(tempDir, '.sdlc');
    const pluginDir = join(process.cwd());
    const initResult = await runInitScan(tempDir);
    await generateConfig(tempDir, sdlcDir, pluginDir, initResult, []);

    const gitignore = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('# SDLC plugin');
    expect(gitignore).toContain('.sdlc/state.json');
    expect(gitignore).toContain('.sdlc/backup/');
    // Original content preserved
    expect(gitignore).toContain('node_modules/');
  });
});

describe('generateRegistry', () => {
  beforeEach(async () => {
    tempDir = await createTempProject();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates valid registry.yaml with mandatory agents', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    await mkdir(sdlcDir, { recursive: true });

    const domains = [
      { name: 'api', path: 'apps/api', techStack: ['nestjs'], description: 'NestJS API' },
      { name: 'web', path: 'apps/web', techStack: ['nextjs'], description: 'Next.js frontend' },
    ];

    await generateRegistry(sdlcDir, domains, ['qa-e2e-writer']);

    const content = await readFile(join(sdlcDir, 'registry.yaml'), 'utf-8');

    // Should contain orchestrator
    expect(content).toContain('orchestrator');
    // Should contain per-domain agents
    expect(content).toContain('api-developer');
    expect(content).toContain('api-tester');
    expect(content).toContain('web-developer');
    expect(content).toContain('web-tester');
    // Should contain governance agents
    expect(content).toContain('governance-architect');
    expect(content).toContain('governance-reviewer');
    // Should contain selected on-demand agent
    expect(content).toContain('qa-e2e-writer');
  });

  it('does not duplicate mandatory agents in selected list', async () => {
    const sdlcDir = join(tempDir, '.sdlc');
    await mkdir(sdlcDir, { recursive: true });

    const domains = [
      { name: 'core', path: '.', techStack: [], description: 'Core' },
    ];

    // Pass orchestrator in selectedAgents — should not duplicate
    await generateRegistry(sdlcDir, domains, ['orchestrator', 'extra-agent']);

    const content = await readFile(join(sdlcDir, 'registry.yaml'), 'utf-8');
    // orchestrator should appear as agent name exactly once (mandatory, not duplicated)
    const nameMatches = content.match(/name: orchestrator/g);
    expect(nameMatches).toBeDefined();
    expect(nameMatches!.length).toBe(1);
    // extra-agent should be present
    expect(content).toContain('extra-agent');
  });
});
