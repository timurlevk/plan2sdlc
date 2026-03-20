/**
 * Domain Detector
 *
 * Scans a project directory (read-only) to detect domain groupings
 * (bounded contexts). Returns a DomainMap with detected domains,
 * each annotated with tech stack and description.
 */

import { readFile, readdir, access, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { DomainMap, DomainEntry } from '../src/types/detection.js';

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

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  const content = await readTextFile(join(dir, 'package.json'));
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

function allDeps(pkg: PackageJson): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

async function getSubdirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tech stack detection per domain
// ---------------------------------------------------------------------------

async function detectDomainTechStack(domainPath: string): Promise<string[]> {
  const techStack: string[] = [];

  const pkg = await readPackageJson(domainPath);
  if (pkg) {
    const deps = allDeps(pkg);

    const frameworkChecks: Array<[string, string]> = [
      ['@nestjs/core', 'nestjs'],
      ['next', 'nextjs'],
      ['react', 'react'],
      ['expo', 'expo'],
      ['express', 'express'],
      ['vue', 'vue'],
      ['@angular/core', 'angular'],
      ['fastify', 'fastify'],
      ['hono', 'hono'],
    ];

    for (const [dep, name] of frameworkChecks) {
      if (dep in deps && !techStack.includes(name)) {
        techStack.push(name);
      }
    }

    const ormChecks: Array<[string, string]> = [
      ['prisma', 'prisma'],
      ['@prisma/client', 'prisma'],
      ['typeorm', 'typeorm'],
      ['sequelize', 'sequelize'],
      ['mongoose', 'mongoose'],
      ['drizzle-orm', 'drizzle'],
    ];

    for (const [dep, name] of ormChecks) {
      if (dep in deps && !techStack.includes(name)) {
        techStack.push(name);
      }
    }

    if ('typescript' in deps || 'ts-node' in deps || 'tsx' in deps) {
      techStack.push('typescript');
    }
  }

  // File-based detection
  if (await fileExists(join(domainPath, 'next.config.js')) ||
      await fileExists(join(domainPath, 'next.config.ts')) ||
      await fileExists(join(domainPath, 'next.config.mjs'))) {
    if (!techStack.includes('nextjs')) techStack.push('nextjs');
  }

  if (await fileExists(join(domainPath, 'tsconfig.json'))) {
    if (!techStack.includes('typescript')) techStack.push('typescript');
  }

  // Check for NestJS module files
  const srcDir = join(domainPath, 'src');
  if (await dirExists(srcDir)) {
    try {
      const srcFiles = await readdir(srcDir);
      if (srcFiles.some((f) => f.endsWith('.module.ts'))) {
        if (!techStack.includes('nestjs')) techStack.push('nestjs');
      }
    } catch {
      // skip
    }
  }

  // Check for app.json with expo
  const appJsonContent = await readTextFile(join(domainPath, 'app.json'));
  if (appJsonContent) {
    try {
      const appJson = JSON.parse(appJsonContent) as Record<string, unknown>;
      if ('expo' in appJson) {
        if (!techStack.includes('expo')) techStack.push('expo');
      }
    } catch {
      // skip
    }
  }

  // Check for Prisma schema
  if (await fileExists(join(domainPath, 'prisma', 'schema.prisma'))) {
    if (!techStack.includes('prisma')) techStack.push('prisma');
  }

  return techStack;
}

// ---------------------------------------------------------------------------
// Description generation
// ---------------------------------------------------------------------------

function generateDescription(name: string, techStack: string[], type: string): string {
  if (techStack.includes('nestjs')) return 'NestJS application';
  if (techStack.includes('nextjs')) return 'Next.js application';
  if (techStack.includes('expo')) return 'Expo/React Native application';
  if (techStack.includes('react')) return 'React frontend';
  if (techStack.includes('vue')) return 'Vue.js frontend';
  if (techStack.includes('angular')) return 'Angular frontend';
  if (techStack.includes('express')) return 'Express.js application';
  if (techStack.includes('fastify')) return 'Fastify application';
  if (techStack.includes('hono')) return 'Hono application';

  if (type === 'package') {
    if (techStack.includes('typescript')) return 'TypeScript library';
    return 'Shared package';
  }

  if (techStack.includes('typescript')) return 'TypeScript application';

  return `${name} domain`;
}

// ---------------------------------------------------------------------------
// Monorepo detection
// ---------------------------------------------------------------------------

async function detectMonorepoDomains(projectDir: string): Promise<DomainEntry[]> {
  const domains: DomainEntry[] = [];

  // Check apps/ directory
  const appsDir = join(projectDir, 'apps');
  if (await dirExists(appsDir)) {
    const subdirs = await getSubdirectories(appsDir);
    for (const sub of subdirs) {
      const domainPath = join(appsDir, sub);
      const techStack = await detectDomainTechStack(domainPath);
      domains.push({
        name: toKebabCase(sub),
        path: join('apps', sub),
        techStack,
        description: generateDescription(sub, techStack, 'app'),
      });
    }
  }

  // Check packages/ directory
  const packagesDir = join(projectDir, 'packages');
  if (await dirExists(packagesDir)) {
    const subdirs = await getSubdirectories(packagesDir);
    for (const sub of subdirs) {
      const domainPath = join(packagesDir, sub);
      const techStack = await detectDomainTechStack(domainPath);
      domains.push({
        name: toKebabCase(sub),
        path: join('packages', sub),
        techStack,
        description: generateDescription(sub, techStack, 'package'),
      });
    }
  }

  // Check services/ directory
  const servicesDir = join(projectDir, 'services');
  if (await dirExists(servicesDir)) {
    const subdirs = await getSubdirectories(servicesDir);
    for (const sub of subdirs) {
      const domainPath = join(servicesDir, sub);
      const techStack = await detectDomainTechStack(domainPath);
      domains.push({
        name: toKebabCase(sub),
        path: join('services', sub),
        techStack,
        description: generateDescription(sub, techStack, 'service'),
      });
    }
  }

  return domains;
}

// ---------------------------------------------------------------------------
// Workspace detection from config files
// ---------------------------------------------------------------------------

async function getWorkspacePatterns(projectDir: string): Promise<string[]> {
  const patterns: string[] = [];

  // Check pnpm-workspace.yaml
  const pnpmContent = await readTextFile(join(projectDir, 'pnpm-workspace.yaml'));
  if (pnpmContent) {
    // Simple YAML parsing for workspace packages
    const lines = pnpmContent.split('\n');
    let inPackages = false;
    for (const line of lines) {
      if (/^\s*packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        const match = /^\s*-\s*['"]?([^'"]+)['"]?\s*$/.exec(line);
        if (match?.[1]) {
          patterns.push(match[1]);
        } else if (/^\S/.test(line)) {
          inPackages = false;
        }
      }
    }
  }

  // Check package.json workspaces
  const pkg = await readPackageJson(projectDir);
  if (pkg?.workspaces) {
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages;
    if (ws) {
      patterns.push(...ws);
    }
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Single-app detection
// ---------------------------------------------------------------------------

async function detectSingleAppDomains(projectDir: string): Promise<DomainEntry[]> {
  const domains: DomainEntry[] = [];

  const domainDirs = ['src/domains', 'src/modules', 'src/features'];

  for (const domainDir of domainDirs) {
    const fullPath = join(projectDir, domainDir);
    if (await dirExists(fullPath)) {
      const subdirs = await getSubdirectories(fullPath);
      for (const sub of subdirs) {
        const domainPath = join(fullPath, sub);
        const techStack = await detectDomainTechStack(domainPath);
        domains.push({
          name: toKebabCase(sub),
          path: join(domainDir, sub),
          techStack,
          description: generateDescription(sub, techStack, 'domain'),
        });
      }
      // Found domains in this directory, stop checking others
      if (subdirs.length > 0) break;
    }
  }

  return domains;
}

// ---------------------------------------------------------------------------
// Project type detection
// ---------------------------------------------------------------------------

async function detectProjectType(
  projectDir: string,
): Promise<DomainMap['projectType']> {
  // Check for monorepo indicators
  if (
    await fileExists(join(projectDir, 'pnpm-workspace.yaml')) ||
    await fileExists(join(projectDir, 'turbo.json')) ||
    await fileExists(join(projectDir, 'nx.json')) ||
    await fileExists(join(projectDir, 'lerna.json'))
  ) {
    return 'monorepo';
  }

  // Check package.json workspaces
  const pkg = await readPackageJson(projectDir);
  if (pkg?.workspaces) {
    return 'monorepo';
  }

  // Check for apps/ or packages/ directories
  if (await dirExists(join(projectDir, 'apps')) ||
      await dirExists(join(projectDir, 'packages'))) {
    return 'monorepo';
  }

  // Check for services/ with multiple subdirs
  const servicesDir = join(projectDir, 'services');
  if (await dirExists(servicesDir)) {
    const subdirs = await getSubdirectories(servicesDir);
    if (subdirs.length >= 2) return 'microservices';
  }

  return 'single-app';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function detectDomains(projectDir: string): Promise<DomainMap> {
  const projectType = await detectProjectType(projectDir);
  let domains: DomainEntry[] = [];

  if (projectType === 'monorepo' || projectType === 'microservices') {
    domains = await detectMonorepoDomains(projectDir);

    // Also check workspace patterns for any directories not already found
    const patterns = await getWorkspacePatterns(projectDir);
    // Workspace patterns are used to confirm monorepo type but actual
    // domain detection is done via directory scanning above
    void patterns;
  }

  if (domains.length === 0 && (projectType === 'single-app' || projectType === 'unknown')) {
    domains = await detectSingleAppDomains(projectDir);
  }

  // Fallback: single domain named after project directory
  if (domains.length === 0) {
    const projectName = toKebabCase(basename(projectDir));
    const techStack = await detectDomainTechStack(projectDir);
    domains.push({
      name: projectName,
      path: '.',
      techStack,
      description: generateDescription(projectName, techStack, 'app'),
    });
  }

  return {
    domains,
    projectType,
  };
}
