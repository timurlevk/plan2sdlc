/**
 * Environment awareness types for the claude-sdlc plugin.
 * Maps git branches to environments with permission controls.
 */

export type Environment = 'development' | 'staging' | 'production';

export interface EnvironmentPermissions {
  write: boolean;
  test: boolean;
  deploy: boolean;
  seedData: boolean;
  readLogs: boolean;
}

export interface EnvironmentInfo {
  environment: Environment;
  branch: string;
  permissions: EnvironmentPermissions;
  safetyLevel: 'normal' | 'elevated' | 'maximum';
}

export interface EnvironmentConfig {
  branchPatterns: string[];
  permissions: EnvironmentPermissions;
  safetyLevel: 'normal' | 'elevated' | 'maximum';
}

/** Default environment configs mapping branch patterns to permissions. */
export const DEFAULT_ENV_CONFIG: Record<Environment, EnvironmentConfig> = {
  development: {
    branchPatterns: [
      'release/*',
      'feature/*',
      'feat/*',
      'worktree-*',
      'fix/*',
      'bugfix/*',
      'hotfix/*',
      'chore/*',
    ],
    permissions: { write: true, test: true, deploy: true, seedData: true, readLogs: false },
    safetyLevel: 'normal',
  },
  staging: {
    branchPatterns: ['staging', 'rc/*'],
    permissions: { write: true, test: true, deploy: false, seedData: false, readLogs: true },
    safetyLevel: 'elevated',
  },
  production: {
    branchPatterns: ['main', 'master'],
    permissions: { write: false, test: false, deploy: false, seedData: false, readLogs: true },
    safetyLevel: 'maximum',
  },
};
