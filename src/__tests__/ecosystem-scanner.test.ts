import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { scanEcosystem } from '../services/ecosystem-scanner.js';

function makeTmpDir(): string {
  return join(tmpdir(), `claude-sdlc-eco-${randomUUID()}`);
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
}

function gitCommit(dir: string, message: string): void {
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit --allow-empty -m "${message}"`, { cwd: dir, stdio: 'pipe' });
}

describe('ecosystem-scanner', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
    dirs.length = 0;
  });

  it('should return all PROPOSE for an empty project', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    const report = await scanEcosystem(dir);

    // Every convention should be propose (no existing conventions)
    for (const c of report.conventions) {
      expect(c.decision).not.toBe('inherit');
    }
    expect(report.summary.proposed).toBeGreaterThan(0);
    expect(report.summary.inherited).toBe(0);
  });

  it('should detect .eslintrc.json as linter=INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeJson(join(dir, '.eslintrc.json'), {
      extends: ['eslint:recommended'],
    });

    const report = await scanEcosystem(dir);
    const linter = report.conventions.find((c) => c.name === 'linter');

    expect(linter).toBeDefined();
    expect(linter!.decision).toBe('inherit');
    expect(linter!.detected).toContain('eslint');
  });

  it('should detect conventional commits in git log as commits=INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    initGitRepo(dir);
    gitCommit(dir, 'feat: add user authentication');
    gitCommit(dir, 'fix: resolve login redirect bug');
    gitCommit(dir, 'chore: update dependencies');
    gitCommit(dir, 'docs: add API documentation');
    gitCommit(dir, 'feat(auth): add oauth2 support');

    const report = await scanEcosystem(dir);
    const commits = report.conventions.find((c) => c.name === 'commit-format');

    expect(commits).toBeDefined();
    expect(commits!.decision).toBe('inherit');
    expect(commits!.detected).toBe('conventional-commits');
  });

  it('should detect jest.config.js as test-framework=INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeText(
      join(dir, 'jest.config.js'),
      'module.exports = { testEnvironment: "node" };',
    );

    const report = await scanEcosystem(dir);
    const testFw = report.conventions.find((c) => c.name === 'test-framework');

    expect(testFw).toBeDefined();
    expect(testFw!.detected).toContain('jest');
    // Decision is inherit (or enhance if coverage suggestion added)
    expect(['inherit', 'enhance']).toContain(testFw!.decision);
  });

  it('should PROPOSE keep-a-changelog when no CHANGELOG.md exists', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    // Create a README but no CHANGELOG
    await writeText(join(dir, 'README.md'), '# My Project\n');

    const report = await scanEcosystem(dir);
    const changelog = report.conventions.find((c) => c.name === 'changelog');

    expect(changelog).toBeDefined();
    expect(changelog!.decision).toBe('propose');
    expect(changelog!.proposal).toContain('keep-a-changelog');
  });

  it('should have correct summary counts', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    // Set up some detectable conventions
    await writeJson(join(dir, '.eslintrc.json'), { extends: [] });
    await writeText(join(dir, 'README.md'), '# Test\n');
    await mkdir(join(dir, '.github', 'workflows'), { recursive: true });
    await writeText(join(dir, '.github', 'workflows', 'ci.yml'), 'name: CI\n');

    const report = await scanEcosystem(dir);

    const total =
      report.summary.inherited +
      report.summary.enhanced +
      report.summary.proposed;

    expect(total).toBe(report.conventions.length);
    expect(report.summary.inherited).toBeGreaterThan(0);
  });

  it('should detect kebab-case file naming convention', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    // Create src/ with kebab-case files
    const srcDir = join(dir, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeText(join(srcDir, 'my-service.ts'), '');
    await writeText(join(srcDir, 'user-controller.ts'), '');
    await writeText(join(srcDir, 'data-mapper.ts'), '');
    await writeText(join(srcDir, 'auth-guard.ts'), '');
    await writeText(join(srcDir, 'api-client.ts'), '');

    const report = await scanEcosystem(dir);
    const naming = report.conventions.find((c) => c.name === 'file-naming');

    expect(naming).toBeDefined();
    expect(naming!.decision).toBe('inherit');
    expect(naming!.detected).toBe('kebab-case');
  });

  it('should detect camelCase file naming convention', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    const srcDir = join(dir, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeText(join(srcDir, 'myService.ts'), '');
    await writeText(join(srcDir, 'userController.ts'), '');
    await writeText(join(srcDir, 'dataMapper.ts'), '');
    await writeText(join(srcDir, 'authGuard.ts'), '');

    const report = await scanEcosystem(dir);
    const naming = report.conventions.find((c) => c.name === 'file-naming');

    expect(naming).toBeDefined();
    expect(naming!.decision).toBe('inherit');
    expect(naming!.detected).toBe('camelCase');
  });

  it('should detect GitHub Actions CI as INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await mkdir(join(dir, '.github', 'workflows'), { recursive: true });
    await writeText(
      join(dir, '.github', 'workflows', 'ci.yml'),
      'name: CI\non: push\n',
    );

    const report = await scanEcosystem(dir);
    const ci = report.conventions.find((c) => c.name === 'ci-pipeline');

    expect(ci).toBeDefined();
    expect(ci!.decision).toBe('inherit');
    expect(ci!.detected).toContain('GitHub Actions');
  });

  it('should detect test location as INHERIT when __tests__ exists in src', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await mkdir(join(dir, 'src', '__tests__'), { recursive: true });
    await writeText(join(dir, 'src', '__tests__', 'foo.test.ts'), '');

    const report = await scanEcosystem(dir);
    const testLoc = report.conventions.find((c) => c.name === 'test-location');

    expect(testLoc).toBeDefined();
    expect(testLoc!.decision).toBe('inherit');
    expect(testLoc!.detected).toContain('co-located');
  });

  it('should INHERIT CLAUDE.md and ENHANCE if large', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    // Small CLAUDE.md → inherit
    await writeText(join(dir, 'CLAUDE.md'), '# Project\nSome guidelines.\n');

    let report = await scanEcosystem(dir);
    let claudeConv = report.conventions.find((c) => c.name === 'claude-config');
    expect(claudeConv).toBeDefined();
    expect(claudeConv!.decision).toBe('inherit');

    // Large CLAUDE.md → enhance
    const largeContent = 'x'.repeat(9000);
    await writeText(join(dir, 'CLAUDE.md'), largeContent);

    report = await scanEcosystem(dir);
    claudeConv = report.conventions.find((c) => c.name === 'claude-config');
    expect(claudeConv).toBeDefined();
    expect(claudeConv!.decision).toBe('enhance');
    expect(claudeConv!.proposal).toContain('split');
  });

  it('should detect git branch patterns as INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    initGitRepo(dir);
    gitCommit(dir, 'initial');

    // Create feature branches
    execSync('git branch feature/auth', { cwd: dir, stdio: 'pipe' });
    execSync('git branch feature/payments', { cwd: dir, stdio: 'pipe' });

    const report = await scanEcosystem(dir);
    const workflow = report.conventions.find((c) => c.name === 'branch-strategy');

    expect(workflow).toBeDefined();
    expect(workflow!.decision).toBe('inherit');
    expect(workflow!.detected).toContain('feature/*');
  });

  it('should detect prettier as formatter via INHERIT', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeJson(join(dir, '.prettierrc.json'), { singleQuote: true });

    const report = await scanEcosystem(dir);
    const linter = report.conventions.find((c) => c.name === 'linter');

    expect(linter).toBeDefined();
    expect(linter!.decision).toBe('inherit');
    expect(linter!.detected).toContain('prettier');
  });

  it('should PROPOSE linter for JS/TS project without one', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);
    await mkdir(dir, { recursive: true });

    await writeJson(join(dir, 'package.json'), { name: 'test' });

    const report = await scanEcosystem(dir);
    const linter = report.conventions.find((c) => c.name === 'linter');

    expect(linter).toBeDefined();
    expect(linter!.decision).toBe('propose');
    expect(linter!.proposal).toContain('ESLint');
  });

  it('should detect vitest from package.json devDependencies', async () => {
    const dir = makeTmpDir();
    dirs.push(dir);

    await writeJson(join(dir, 'package.json'), {
      devDependencies: { vitest: '^1.0.0' },
    });

    const report = await scanEcosystem(dir);
    const testFw = report.conventions.find((c) => c.name === 'test-framework');

    expect(testFw).toBeDefined();
    expect(testFw!.detected).toContain('vitest');
  });
});
