/**
 * Tech Stack Detector
 *
 * Scans a project directory (read-only) to detect its tech stack:
 * package manager, languages, frameworks, ORMs, databases, CI/CD,
 * monorepo tools, features, project type, and test frameworks.
 */

import { readFile, readdir, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectProfile } from '../types/detection.js';

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
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

async function readPackageJson(projectDir: string): Promise<PackageJson | null> {
  const content = await readTextFile(join(projectDir, 'package.json'));
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

function hasDep(deps: Record<string, string>, name: string): boolean {
  return name in deps;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

async function detectPackageManager(
  projectDir: string,
): Promise<ProjectProfile['packageManager']> {
  if (await fileExists(join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(join(projectDir, 'yarn.lock'))) return 'yarn';
  if (await fileExists(join(projectDir, 'package-lock.json'))) return 'npm';
  if (
    (await fileExists(join(projectDir, 'Pipfile'))) ||
    (await fileExists(join(projectDir, 'requirements.txt')))
  )
    return 'pip';
  if (await fileExists(join(projectDir, 'Gemfile'))) return 'gem';
  if (await fileExists(join(projectDir, 'Cargo.toml'))) return 'cargo';
  if (await fileExists(join(projectDir, 'go.mod'))) return 'go';
  return 'unknown';
}

function detectLanguages(
  _projectDir: string,
  deps: Record<string, string>,
  pm: ProjectProfile['packageManager'],
): string[] {
  const langs: string[] = [];
  if (hasDep(deps, 'typescript') || hasDep(deps, 'ts-node') || hasDep(deps, 'tsx'))
    langs.push('typescript');
  if (pm === 'npm' || pm === 'yarn' || pm === 'pnpm') {
    if (!langs.includes('typescript')) langs.push('javascript');
    else langs.push('javascript'); // TS projects also have JS
  }
  if (pm === 'pip') langs.push('python');
  if (pm === 'gem') langs.push('ruby');
  if (pm === 'cargo') langs.push('rust');
  if (pm === 'go') langs.push('go');
  return langs;
}

function detectFrameworks(
  deps: Record<string, string>,
  requirementsTxt: string | null,
  gemfile: string | null,
): string[] {
  const frameworks: string[] = [];
  const checks: Array<[string, string]> = [
    ['@nestjs/core', 'nestjs'],
    ['next', 'nextjs'],
    ['react', 'react'],
    ['expo', 'expo'],
    ['express', 'express'],
    ['vue', 'vue'],
    ['@angular/core', 'angular'],
    ['angular', 'angular'],
    ['fastify', 'fastify'],
    ['hono', 'hono'],
  ];
  for (const [dep, name] of checks) {
    if (hasDep(deps, dep) && !frameworks.includes(name)) {
      frameworks.push(name);
    }
  }
  if (requirementsTxt && /django/i.test(requirementsTxt) && !frameworks.includes('django')) {
    frameworks.push('django');
  }
  if (gemfile && /rails/i.test(gemfile) && !frameworks.includes('rails')) {
    frameworks.push('rails');
  }
  return frameworks;
}

async function detectOrms(
  projectDir: string,
  deps: Record<string, string>,
  frameworks: string[],
): Promise<string[]> {
  const orms: string[] = [];
  if (
    hasDep(deps, 'prisma') ||
    hasDep(deps, '@prisma/client') ||
    (await fileExists(join(projectDir, 'prisma', 'schema.prisma')))
  ) {
    orms.push('prisma');
  }
  if (hasDep(deps, 'typeorm')) orms.push('typeorm');
  if (hasDep(deps, 'sequelize')) orms.push('sequelize');
  if (hasDep(deps, 'mongoose')) orms.push('mongoose');
  if (hasDep(deps, 'drizzle-orm')) orms.push('drizzle');
  if (frameworks.includes('django')) orms.push('django-orm');
  return orms;
}

async function detectDatabases(projectDir: string): Promise<string[]> {
  const dbs: string[] = [];
  const envFiles = ['.env.example', '.env.sample', '.env', 'docker-compose.yml', 'docker-compose.yaml'];
  let combined = '';
  for (const f of envFiles) {
    const content = await readTextFile(join(projectDir, f));
    if (content) combined += '\n' + content;
  }
  if (/postgres(ql)?:\/\//i.test(combined) || /POSTGRES/i.test(combined)) dbs.push('postgresql');
  if (/mysql:\/\//i.test(combined)) dbs.push('mysql');
  if (/mongodb:\/\/|MONGODB_URI/i.test(combined)) dbs.push('mongodb');
  if (/file:|\.sqlite/i.test(combined)) dbs.push('sqlite');
  if (/redis:\/\/|REDIS_URL/i.test(combined)) dbs.push('redis');
  return dbs;
}

async function detectCicd(projectDir: string): Promise<string[]> {
  const cicd: string[] = [];
  if (await dirExists(join(projectDir, '.github', 'workflows'))) cicd.push('github-actions');
  if (await fileExists(join(projectDir, '.gitlab-ci.yml'))) cicd.push('gitlab-ci');
  if (await fileExists(join(projectDir, 'Jenkinsfile'))) cicd.push('jenkins');
  if (await dirExists(join(projectDir, '.circleci'))) cicd.push('circleci');
  if (await fileExists(join(projectDir, 'vercel.json'))) cicd.push('vercel');
  return cicd;
}

async function detectMonorepoTools(projectDir: string): Promise<string[]> {
  const tools: string[] = [];
  if (await fileExists(join(projectDir, 'pnpm-workspace.yaml'))) tools.push('pnpm-workspaces');
  if (await fileExists(join(projectDir, 'turbo.json'))) tools.push('turborepo');
  if (await fileExists(join(projectDir, 'nx.json'))) tools.push('nx');
  if (await fileExists(join(projectDir, 'lerna.json'))) tools.push('lerna');
  return tools;
}

function detectFeatures(deps: Record<string, string>): string[] {
  const features: string[] = [];

  // i18n
  const i18nDeps = ['i18next', 'next-i18next', 'react-intl', 'vue-i18n', '@formatjs/intl'];
  if (i18nDeps.some((d) => hasDep(deps, d))) features.push('i18n');

  // AI SDK
  const aiDeps = ['@ai-sdk/core', '@ai-sdk/openai', '@anthropic-ai/sdk', 'openai', 'langchain'];
  if (aiDeps.some((d) => hasDep(deps, d))) features.push('ai-sdk');

  // Auth
  const authDeps = [
    'passport', 'jsonwebtoken', 'next-auth', '@auth/core', 'bcrypt',
    'oauth2-server', '@supabase/supabase-js',
  ];
  if (authDeps.some((d) => hasDep(deps, d))) features.push('auth');

  // E-commerce
  const ecomDeps = ['stripe', '@stripe/stripe-js', 'paypal-rest-sdk', 'shopify-api-node'];
  if (ecomDeps.some((d) => hasDep(deps, d))) features.push('e-commerce');

  // Real-time
  const rtDeps = ['socket.io', 'ws', '@socket.io/redis-adapter', 'pusher'];
  if (rtDeps.some((d) => hasDep(deps, d))) features.push('real-time');

  // CMS
  const cmsDeps = ['contentful', '@sanity/client', 'strapi', 'keystonejs'];
  if (cmsDeps.some((d) => hasDep(deps, d))) features.push('cms');

  return features;
}

async function detectProjectType(
  projectDir: string,
  monorepoTools: string[],
): Promise<ProjectProfile['projectType']> {
  if (monorepoTools.length > 0) return 'monorepo';

  const appsDir = join(projectDir, 'apps');
  const servicesDir = join(projectDir, 'services');
  let subDirCount = 0;

  for (const dir of [appsDir, servicesDir]) {
    if (await dirExists(dir)) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        subDirCount += entries.filter((e) => e.isDirectory()).length;
      } catch {
        // skip
      }
    }
  }

  if (subDirCount >= 2) return 'microservices';
  return 'single-app';
}

function detectTestFrameworks(deps: Record<string, string>): string[] {
  const tests: string[] = [];
  if (hasDep(deps, 'vitest')) tests.push('vitest');
  if (hasDep(deps, 'jest') || hasDep(deps, '@jest/core') || hasDep(deps, 'ts-jest'))
    tests.push('jest');
  if (hasDep(deps, 'playwright') || hasDep(deps, '@playwright/test')) tests.push('playwright');
  if (hasDep(deps, 'cypress')) tests.push('cypress');
  if (hasDep(deps, 'pytest') || hasDep(deps, 'pytest-cov')) tests.push('pytest');
  if (hasDep(deps, 'mocha')) tests.push('mocha');
  return tests;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function detectTechStack(projectDir: string): Promise<ProjectProfile> {
  const pkg = await readPackageJson(projectDir);
  const deps = pkg ? allDeps(pkg) : {};

  const requirementsTxt = await readTextFile(join(projectDir, 'requirements.txt'));
  const gemfile = await readTextFile(join(projectDir, 'Gemfile'));

  const packageManager = await detectPackageManager(projectDir);
  const languages = detectLanguages(projectDir, deps, packageManager);
  const frameworks = detectFrameworks(deps, requirementsTxt, gemfile);
  const orms = await detectOrms(projectDir, deps, frameworks);
  const databases = await detectDatabases(projectDir);
  const cicd = await detectCicd(projectDir);
  const monorepoTools = await detectMonorepoTools(projectDir);
  const features = detectFeatures(deps);
  const projectType = await detectProjectType(projectDir, monorepoTools);
  const testFrameworks = detectTestFrameworks(deps);

  return {
    packageManager,
    languages,
    frameworks,
    orms,
    databases,
    cicd,
    monorepoTools,
    features,
    projectType,
    testFrameworks,
  };
}
