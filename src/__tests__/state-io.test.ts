import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readJsonFile, writeJsonFile, readYamlFile, writeYamlFile, ensureDir } from '../utils/state-io.js';

function tmpPath(filename: string): string {
  return join(tmpdir(), `claude-sdlc-test-${randomUUID()}`, filename);
}

describe('JSON I/O', () => {
  const paths: string[] = [];

  afterEach(async () => {
    for (const p of paths) {
      const dir = join(p, '..');
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    paths.length = 0;
  });

  it('should write then read JSON', async () => {
    const path = tmpPath('test.json');
    paths.push(path);
    const data = { name: 'test', items: [1, 2, 3] };
    await writeJsonFile(path, data);
    const result = await readJsonFile<typeof data>(path);
    expect(result).toEqual(data);
  });

  it('should throw on non-existent file', async () => {
    await expect(readJsonFile('/nonexistent/path/file.json')).rejects.toThrow();
  });
});

describe('YAML I/O', () => {
  const paths: string[] = [];

  afterEach(async () => {
    for (const p of paths) {
      const dir = join(p, '..');
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    paths.length = 0;
  });

  it('should write then read YAML', async () => {
    const path = tmpPath('test.yaml');
    paths.push(path);
    const data = { name: 'test', items: [1, 2, 3] };
    await writeYamlFile(path, data);
    const result = await readYamlFile<typeof data>(path);
    expect(result).toEqual(data);
  });
});

describe('ensureDir', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
    dirs.length = 0;
  });

  it('should create a nested directory', async () => {
    const dir = join(tmpdir(), `claude-sdlc-test-${randomUUID()}`, 'a', 'b', 'c');
    dirs.push(join(tmpdir(), dir.split(tmpdir())[1]!.split(/[\\/]/)[1]!));
    await ensureDir(dir);
    const s = await stat(dir);
    expect(s.isDirectory()).toBe(true);
  });

  it('should not throw if directory already exists', async () => {
    const dir = join(tmpdir(), `claude-sdlc-test-${randomUUID()}`);
    dirs.push(dir);
    await ensureDir(dir);
    await expect(ensureDir(dir)).resolves.toBeUndefined();
  });
});
