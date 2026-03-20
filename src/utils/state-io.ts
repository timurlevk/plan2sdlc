/**
 * State I/O utilities for reading/writing JSON and YAML files.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * Read and parse a JSON file.
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write data as JSON with 2-space indentation.
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(dirname(filePath));
  const content = JSON.stringify(data, null, 2) + '\n';
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Read and parse a YAML file.
 */
export async function readYamlFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return parseYaml(content) as T;
}

/**
 * Write data as YAML.
 */
export async function writeYamlFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(dirname(filePath));
  const content = stringifyYaml(data);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Create a directory (and parents) if it does not exist.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}
