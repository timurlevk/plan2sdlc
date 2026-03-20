import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOKS_DIR = resolve(__dirname, '..', '..', 'hooks');
const SECRETS_GUARD = resolve(HOOKS_DIR, 'sdlc-secrets-guard.cjs');
const WRITE_GUARD = resolve(HOOKS_DIR, 'sdlc-write-guard.cjs');
const ENTRY_CHECK = resolve(HOOKS_DIR, 'entry-check.cjs');

function runHook(
  hookPath: string,
  stdinData?: string,
  options?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cwd = options?.['cwd'];
  const envOverrides = options ? Object.fromEntries(Object.entries(options).filter(([k]) => k !== 'cwd')) : {};
  return new Promise((resolve) => {
    const child = execFile(
      'node',
      [hookPath],
      {
        env: { ...process.env, ...envOverrides },
        cwd: cwd || undefined,
        timeout: 5000,
      },
      (error, stdout, stderr) => {
        const exitCode = child.exitCode ?? (error ? 1 : 0);
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode });
      },
    );
    if (stdinData) {
      child.stdin?.write(stdinData);
    }
    child.stdin?.end();
  });
}

function makeInput(toolName: string, toolInput: Record<string, string>) {
  return JSON.stringify({ tool_name: toolName, tool_input: toolInput });
}

describe('sdlc-secrets-guard', () => {
  it('blocks .env file on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.env' }));
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('SDLC secrets guard');
  });

  it('blocks .env.production on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.env.production' }));
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
  });

  it('allows .env.example on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.env.example' }));
    expect(result.exitCode).toBe(0);
  });

  it('allows .env.template on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.env.template' }));
    expect(result.exitCode).toBe(0);
  });

  it('allows src/config.ts on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'src/config.ts' }));
    expect(result.exitCode).toBe(0);
  });

  it('blocks credentials.json on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'credentials.json' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks nested credentials file', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'config/credentials.yaml' }));
    expect(result.exitCode).toBe(2);
  });

  it('allows docs/secrets-management.md (docs exception)', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'docs/secrets-management.md' }));
    expect(result.exitCode).toBe(0);
  });

  it('blocks .npmrc on Write', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Write', { file_path: '.npmrc' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks .npmrc on Read (matches never-read patterns indirectly via npmrc)', async () => {
    // .npmrc doesn't match never-read patterns, only write-only, so Read should allow
    // Actually per spec: .npmrc is write-only blocked, Read should be allowed unless it matches another pattern
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.npmrc' }));
    // .npmrc only in write-only list, so Read should allow
    expect(result.exitCode).toBe(0);
  });

  it('blocks .pem file on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'certs/server.pem' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks .key file on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'ssl/private.key' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks service-account.json on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'config/service-account-prod.json' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks id_rsa on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.ssh/id_rsa' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks id_ed25519 on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: '.ssh/id_ed25519' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks secrets directory on Read', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Read', { file_path: 'config/secrets/db.yaml' }));
    expect(result.exitCode).toBe(2);
  });

  it('allows non-sensitive Glob pattern', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Glob', { pattern: 'src/**/*.ts' }));
    expect(result.exitCode).toBe(0);
  });

  it('blocks secret-containing Glob pattern', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Glob', { pattern: '**/*.pem' }));
    expect(result.exitCode).toBe(2);
  });

  it('blocks Bash: cat .env', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'cat .env' }));
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('SDLC secrets guard');
  });

  it('allows Bash: cat .env.example', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'cat .env.example' }));
    expect(result.exitCode).toBe(0);
  });

  it('blocks Bash: printenv', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'printenv' }));
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
  });

  it('blocks Bash: echo $SECRET_KEY', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'echo $SECRET_KEY' }));
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
  });

  it('allows Bash: cat src/config.ts', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'cat src/config.ts' }));
    expect(result.exitCode).toBe(0);
  });

  it('allows Bash: ls -la', async () => {
    const result = await runHook(SECRETS_GUARD, makeInput('Bash', { command: 'ls -la' }));
    expect(result.exitCode).toBe(0);
  });
});

describe('sdlc-write-guard', () => {
  it('blocks non-governance agent writing to .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: '.claude/rules/test.md' }),
      { CLAUDE_AGENT_NAME: 'api-developer' },
    );
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('only governance agents');
  });

  it('allows governance-architect to write to .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: '.claude/rules/test.md' }),
      { CLAUDE_AGENT_NAME: 'governance-architect' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows orchestrator to write to .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Write', { file_path: '.claude/settings.json' }),
      { CLAUDE_AGENT_NAME: 'orchestrator' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows any agent to write outside .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: 'src/index.ts' }),
      { CLAUDE_AGENT_NAME: 'api-developer' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows Read tool on .claude/ for any agent', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Read', { file_path: '.claude/rules/test.md' }),
      { CLAUDE_AGENT_NAME: 'api-developer' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows skill (no agent name) to write .claude/ during init', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Write', { file_path: '.claude/rules/new.md' }),
      { CLAUDE_AGENT_NAME: '' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows qa-lead to write testing.md in .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Write', { file_path: '.claude/rules/testing.md' }),
      { CLAUDE_AGENT_NAME: 'qa-lead' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows qa-lead to write e2e.md in .claude/', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: '.claude/rules/e2e.md' }),
      { CLAUDE_AGENT_NAME: 'qa-lead' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('blocks qa-lead from writing other .claude/ files', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Write', { file_path: '.claude/settings.json' }),
      { CLAUDE_AGENT_NAME: 'qa-lead' },
    );
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.reason).toContain('qa-lead');
  });

  it('blocks non-governance agent from writing .sdlc/ state files', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: '.sdlc/backlog.json' }),
      { CLAUDE_AGENT_NAME: 'api-developer' },
    );
    expect(result.exitCode).toBe(2);
    const output = JSON.parse(result.stdout);
    expect(output.decision).toBe('block');
    expect(output.reason).toContain('.sdlc/');
  });

  it('allows orchestrator to write .sdlc/ state files', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Write', { file_path: '.sdlc/backlog.json' }),
      { CLAUDE_AGENT_NAME: 'orchestrator' },
    );
    expect(result.exitCode).toBe(0);
  });

  it('allows governance-architect to write .sdlc/ state files', async () => {
    const result = await runHook(
      WRITE_GUARD,
      makeInput('Edit', { file_path: '.sdlc/state.json' }),
      { CLAUDE_AGENT_NAME: 'governance-architect' },
    );
    expect(result.exitCode).toBe(0);
  });
});

describe('entry-check', () => {
  it('shows init prompt when .sdlc/ does not exist', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hook-entry-'));
    const result = await runHook(ENTRY_CHECK, undefined, { CLAUDE_AGENT_NAME: '', SDLC_PROJECT_DIR: tmpDir });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.result).toContain('SDLC PLUGIN INSTALLED');
    expect(output.result).toContain('/sdlc init');
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it('outputs warning when not orchestrator and .sdlc/ exists', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hook-entry-'));
    await fs.promises.mkdir(path.join(tmpDir, '.sdlc'), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, '.sdlc', 'config.yaml'), 'project:\n  name: test\n');
    const result = await runHook(ENTRY_CHECK, undefined, { CLAUDE_AGENT_NAME: '', SDLC_PROJECT_DIR: tmpDir });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.result).toContain('NOT RUNNING AS ORCHESTRATOR');
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  it('outputs no warning when orchestrator and .sdlc/ exists', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hook-entry-'));
    await fs.promises.mkdir(path.join(tmpDir, '.sdlc'), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, '.sdlc', 'config.yaml'), 'project:\n  name: test\n');
    const result = await runHook(ENTRY_CHECK, undefined, { CLAUDE_AGENT_NAME: 'orchestrator', SDLC_PROJECT_DIR: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    await fs.promises.rm(tmpDir, { recursive: true });
  });
});
