import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { detectTechStack } from '../services/tech-stack-detector.js';

function makeTmpDir(): string {
  return join(tmpdir(), `claude-sdlc-detect-${randomUUID()}`);
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

describe('tech-stack-detector', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
    dirs.length = 0;
  });

  it('should return unknown/empty for an empty directory', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    const profile = await detectTechStack(dir);

    expect(profile.packageManager).toBe('unknown');
    expect(profile.languages).toEqual([]);
    expect(profile.frameworks).toEqual([]);
    expect(profile.orms).toEqual([]);
    expect(profile.databases).toEqual([]);
    expect(profile.cicd).toEqual([]);
    expect(profile.monorepoTools).toEqual([]);
    expect(profile.features).toEqual([]);
    expect(profile.projectType).toBe('single-app');
    expect(profile.testFrameworks).toEqual([]);
  });

  it('should detect a Node.js project with react, vitest, pnpm', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      dependencies: { react: '^18.0.0' },
      devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
    });
    await writeText(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');

    const profile = await detectTechStack(dir);

    expect(profile.packageManager).toBe('pnpm');
    expect(profile.languages).toContain('typescript');
    expect(profile.languages).toContain('javascript');
    expect(profile.frameworks).toContain('react');
    expect(profile.testFrameworks).toContain('vitest');
  });

  it('should detect a monorepo with pnpm-workspaces and turborepo', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      devDependencies: { typescript: '^5.0.0' },
    });
    await writeText(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    await writeText(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    await writeJson(join(dir, 'turbo.json'), { pipeline: {} });

    const profile = await detectTechStack(dir);

    expect(profile.monorepoTools).toContain('pnpm-workspaces');
    expect(profile.monorepoTools).toContain('turborepo');
    expect(profile.projectType).toBe('monorepo');
  });

  it('should detect prisma ORM from prisma/schema.prisma', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      dependencies: {},
      devDependencies: {},
    });
    // Create prisma/schema.prisma without prisma in deps
    await writeText(
      join(dir, 'prisma', 'schema.prisma'),
      'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n',
    );

    const profile = await detectTechStack(dir);

    expect(profile.orms).toContain('prisma');
  });

  it('should detect github-actions from .github/workflows/ directory', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeText(
      join(dir, '.github', 'workflows', 'ci.yml'),
      'name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n',
    );

    const profile = await detectTechStack(dir);

    expect(profile.cicd).toContain('github-actions');
  });

  it('should detect postgresql from .env.example', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeText(
      join(dir, '.env.example'),
      'DATABASE_URL=postgres://user:pass@localhost:5432/mydb\nREDIS_URL=redis://localhost:6379\n',
    );

    const profile = await detectTechStack(dir);

    expect(profile.databases).toContain('postgresql');
    expect(profile.databases).toContain('redis');
  });

  it('should detect features: auth, ai-sdk', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      dependencies: {
        'next-auth': '^4.0.0',
        '@ai-sdk/openai': '^1.0.0',
      },
    });

    const profile = await detectTechStack(dir);

    expect(profile.features).toContain('auth');
    expect(profile.features).toContain('ai-sdk');
  });

  it('should detect microservices from multiple services/ subdirs', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await mkdir(join(dir, 'services', 'api'), { recursive: true });
    await mkdir(join(dir, 'services', 'worker'), { recursive: true });
    await mkdir(join(dir, 'services', 'gateway'), { recursive: true });

    const profile = await detectTechStack(dir);

    expect(profile.projectType).toBe('microservices');
  });

  it('should detect pip package manager and python language', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeText(join(dir, 'requirements.txt'), 'django==4.2\npytest==7.0\n');

    const profile = await detectTechStack(dir);

    expect(profile.packageManager).toBe('pip');
    expect(profile.languages).toContain('python');
    expect(profile.frameworks).toContain('django');
    expect(profile.orms).toContain('django-orm');
  });

  it('should detect multiple test frameworks', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      devDependencies: {
        jest: '^29.0.0',
        '@playwright/test': '^1.40.0',
        cypress: '^13.0.0',
      },
    });

    const profile = await detectTechStack(dir);

    expect(profile.testFrameworks).toContain('jest');
    expect(profile.testFrameworks).toContain('playwright');
    expect(profile.testFrameworks).toContain('cypress');
  });
});
