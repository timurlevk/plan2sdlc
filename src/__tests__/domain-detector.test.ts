import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectDomains } from '../../scripts/domain-detector.js';

describe('domain-detector', () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'domain-detector-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('empty project returns single domain', async () => {
    const dir = await makeTempDir();

    const result = await detectDomains(dir);

    expect(result.projectType).toBe('single-app');
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0]!.path).toBe('.');
  });

  it('monorepo with apps/ and packages/ returns multiple domains', async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, 'apps', 'api'), { recursive: true });
    await mkdir(join(dir, 'apps', 'web'), { recursive: true });
    await mkdir(join(dir, 'packages', 'shared'), { recursive: true });

    const result = await detectDomains(dir);

    expect(result.projectType).toBe('monorepo');
    expect(result.domains).toHaveLength(3);

    const names = result.domains.map((d) => d.name).sort();
    expect(names).toEqual(['api', 'shared', 'web']);

    const apiDomain = result.domains.find((d) => d.name === 'api');
    expect(apiDomain!.path).toBe(join('apps', 'api'));

    const sharedDomain = result.domains.find((d) => d.name === 'shared');
    expect(sharedDomain!.path).toBe(join('packages', 'shared'));
  });

  it('single app with src/domains/ returns subdomain entries', async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, 'src', 'domains', 'auth'), { recursive: true });
    await mkdir(join(dir, 'src', 'domains', 'billing'), { recursive: true });

    const result = await detectDomains(dir);

    expect(result.projectType).toBe('single-app');
    expect(result.domains).toHaveLength(2);

    const names = result.domains.map((d) => d.name).sort();
    expect(names).toEqual(['auth', 'billing']);

    const authDomain = result.domains.find((d) => d.name === 'auth');
    expect(authDomain!.path).toBe(join('src', 'domains', 'auth'));
  });

  it('domain with @nestjs/core dependency detects nestjs in techStack', async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, 'apps', 'api'), { recursive: true });

    const pkg = {
      name: 'api',
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
      },
    };
    await writeFile(
      join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify(pkg),
    );

    const result = await detectDomains(dir);

    const apiDomain = result.domains.find((d) => d.name === 'api');
    expect(apiDomain).toBeDefined();
    expect(apiDomain!.techStack).toContain('nestjs');
    expect(apiDomain!.description).toBe('NestJS application');
  });

  it('no src/ directory returns single domain named after project', async () => {
    const dir = await makeTempDir();
    // Create a file so the directory isn't totally empty
    await writeFile(join(dir, 'README.md'), '# Hello');

    const result = await detectDomains(dir);

    expect(result.projectType).toBe('single-app');
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0]!.path).toBe('.');
    // Name is derived from temp dir name (kebab-case)
    expect(result.domains[0]!.name).toBeTruthy();
  });
});
