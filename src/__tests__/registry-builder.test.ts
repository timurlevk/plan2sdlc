import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  buildRegistry,
  parseFrontmatter,
} from '../../scripts/registry-builder.js';

describe('registry-builder', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'registry-builder-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('parseFrontmatter extracts YAML from markdown', () => {
    const content = `---
name: test-agent
description: A test agent
model: sonnet
tools: Read, Grep, Glob
maxTurns: 10
---

# Test Agent

You are a test agent.
`;
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test-agent');
    expect(result!.description).toBe('A test agent');
    expect(result!.model).toBe('sonnet');
    expect(result!.tools).toBe('Read, Grep, Glob');
    expect(result!.maxTurns).toBe(10);
  });

  it('parseFrontmatter returns null for files without frontmatter', () => {
    const content = '# No Frontmatter\n\nJust plain markdown.';
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it('buildRegistry generates registry from agent files', async () => {
    const dir = await makeTempDir();
    const outputPath = join(dir, 'output', 'registry.yaml');

    // Create agent directory structure
    await mkdir(join(dir, 'agents', 'development'), { recursive: true });
    await mkdir(join(dir, 'agents', 'governance'), { recursive: true });

    // Create agent files
    await writeFile(
      join(dir, 'agents', 'development', 'api-developer.md'),
      `---
name: api-developer
description: API development specialist
model: sonnet
tools: Read, Write, Bash
maxTurns: 30
---

# API Developer
`,
    );

    await writeFile(
      join(dir, 'agents', 'governance', 'orchestrator.md'),
      `---
name: orchestrator
description: Main orchestrator agent
model: opus
tools: Read, Grep, Glob, Bash
maxTurns: 50
---

# Orchestrator
`,
    );

    const entries = await buildRegistry(join(dir, 'agents'), outputPath);

    expect(entries).toHaveLength(2);

    const apiDev = entries.find((e) => e.name === 'api-developer');
    expect(apiDev).toBeDefined();
    expect(apiDev!.category).toBe('development');
    expect(apiDev!.model).toBe('sonnet');
    expect(apiDev!.tools).toEqual(['Read', 'Write', 'Bash']);
    expect(apiDev!.domains).toEqual(['api']);
    expect(apiDev!.tier).toBe('worker');

    const orch = entries.find((e) => e.name === 'orchestrator');
    expect(orch).toBeDefined();
    expect(orch!.category).toBe('governance');
    expect(orch!.tier).toBe('orchestrator');
    expect(orch!.model).toBe('opus');

    // Verify YAML output file
    const outputContent = await readFile(outputPath, 'utf-8');
    const parsed = parseYaml(outputContent) as {
      version: string;
      agents: unknown[];
    };
    expect(parsed.version).toBe('1.0');
    expect(parsed.agents).toHaveLength(2);
  });

  it('buildRegistry handles empty directory', async () => {
    const dir = await makeTempDir();
    const outputPath = join(dir, 'output', 'registry.yaml');
    await mkdir(join(dir, 'agents'), { recursive: true });

    const entries = await buildRegistry(join(dir, 'agents'), outputPath);

    expect(entries).toHaveLength(0);

    const outputContent = await readFile(outputPath, 'utf-8');
    const parsed = parseYaml(outputContent) as {
      version: string;
      agents: unknown[];
    };
    expect(parsed.agents).toHaveLength(0);
  });
});
