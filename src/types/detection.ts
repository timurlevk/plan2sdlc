/**
 * Types for project tech stack detection and domain mapping.
 */

export interface DomainMap {
  domains: DomainEntry[];
  projectType: 'monorepo' | 'single-app' | 'microservices' | 'unknown';
}

export interface DomainEntry {
  name: string;           // e.g., "api", "web", "mobile"
  path: string;           // e.g., "apps/api"
  techStack: string[];    // e.g., ["nestjs", "prisma"]
  description: string;    // auto-generated description
}

export interface ProjectProfile {
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'gem' | 'cargo' | 'go' | 'unknown';
  languages: string[];
  frameworks: string[];
  orms: string[];
  databases: string[];
  cicd: string[];
  monorepoTools: string[];
  features: string[];
  projectType: 'monorepo' | 'single-app' | 'microservices' | 'unknown';
  testFrameworks: string[];
}
