/**
 * Environment awareness service.
 * Detects git branch, maps to environment, provides permissions context.
 */

import { execSync } from 'child_process';
import {
  type Environment,
  type EnvironmentConfig,
  type EnvironmentInfo,
  DEFAULT_ENV_CONFIG,
} from '../types/environment.js';

/**
 * Get the current git branch name.
 * Returns 'unknown' if not in a git repo or git is unavailable.
 */
export function getCurrentBranch(cwd?: string): string {
  try {
    const result = execSync('git branch --show-current', {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const branch = result.trim();
    return branch || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Match a branch name against a simple glob pattern.
 * Supports `*` as a wildcard matching any characters.
 * Exact strings match exactly (e.g. 'main' matches 'main').
 */
function matchPattern(branch: string, pattern: string): boolean {
  // Convert glob pattern to regex: escape special chars, replace * with .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
  return new RegExp(regexStr).test(branch);
}

/**
 * Detect the environment for a given branch name.
 * Matches branch against configured patterns; defaults to development if no match.
 */
export function detectEnvironment(
  branch: string,
  config?: Partial<Record<Environment, Partial<EnvironmentConfig>>>,
): EnvironmentInfo {
  const mergedConfig: Record<Environment, EnvironmentConfig> = {
    development: { ...DEFAULT_ENV_CONFIG.development, ...config?.development },
    staging: { ...DEFAULT_ENV_CONFIG.staging, ...config?.staging },
    production: { ...DEFAULT_ENV_CONFIG.production, ...config?.production },
  };

  // Check production first, then staging, then development patterns
  const checkOrder: Environment[] = ['production', 'staging', 'development'];

  for (const env of checkOrder) {
    const envConfig = mergedConfig[env];
    for (const pattern of envConfig.branchPatterns) {
      if (matchPattern(branch, pattern)) {
        return {
          environment: env,
          branch,
          permissions: { ...envConfig.permissions },
          safetyLevel: envConfig.safetyLevel,
        };
      }
    }
  }

  // Default to development for unrecognized branches
  const devConfig = mergedConfig.development;
  return {
    environment: 'development',
    branch,
    permissions: { ...devConfig.permissions },
    safetyLevel: devConfig.safetyLevel,
  };
}

/**
 * Format environment info as text for injection into agent context.
 */
export function formatEnvironmentContext(info: EnvironmentInfo): string {
  const yes = (v: boolean): string => (v ? 'yes' : 'no');

  const lines = [
    `Current environment: ${info.environment}`,
    `Branch: ${info.branch}`,
    `Safety level: ${info.safetyLevel}`,
    'Permissions:',
    `- Write code: ${yes(info.permissions.write)}`,
    `- Run tests: ${yes(info.permissions.test)}`,
    `- Deploy: ${yes(info.permissions.deploy)}`,
    `- Seed data: ${yes(info.permissions.seedData)}`,
    `- Read logs: ${yes(info.permissions.readLogs)}`,
  ];

  if (info.environment === 'production') {
    lines.push('');
    lines.push('\u26A0 PRODUCTION ENVIRONMENT. Read-only access.');
  }

  return lines.join('\n');
}
