import { describe, it, expect } from 'vitest';
import { selectTemplate } from '../services/template-selector.js';
import type { ProjectProfile } from '../types/detection.js';

function makeProfile(overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    packageManager: 'npm',
    languages: [],
    frameworks: [],
    orms: [],
    databases: [],
    cicd: [],
    monorepoTools: [],
    features: [],
    projectType: 'single-app',
    testFrameworks: [],
    ...overrides,
  };
}

describe('selectTemplate', () => {
  it('selects nestjs-monorepo for monorepo with NestJS', () => {
    const profile = makeProfile({
      projectType: 'monorepo',
      frameworks: ['nestjs'],
      monorepoTools: ['pnpm-workspaces'],
      languages: ['typescript', 'javascript'],
      orms: ['prisma'],
    });
    expect(selectTemplate(profile)).toBe('nestjs-monorepo');
  });

  it('selects nextjs-app for Next.js projects', () => {
    const profile = makeProfile({
      frameworks: ['nextjs', 'react'],
      languages: ['typescript', 'javascript'],
    });
    expect(selectTemplate(profile)).toBe('nextjs-app');
  });

  it('selects django for Django projects', () => {
    const profile = makeProfile({
      packageManager: 'pip',
      frameworks: ['django'],
      languages: ['python'],
      orms: ['django-orm'],
    });
    expect(selectTemplate(profile)).toBe('django');
  });

  it('selects express-api for Express projects', () => {
    const profile = makeProfile({
      frameworks: ['express'],
      languages: ['typescript', 'javascript'],
    });
    expect(selectTemplate(profile)).toBe('express-api');
  });

  it('selects react-spa for React projects without Next.js', () => {
    const profile = makeProfile({
      frameworks: ['react'],
      languages: ['typescript', 'javascript'],
    });
    expect(selectTemplate(profile)).toBe('react-spa');
  });

  it('selects generic for unknown/unmatched projects', () => {
    const profile = makeProfile({
      packageManager: 'cargo',
      languages: ['rust'],
      frameworks: [],
    });
    expect(selectTemplate(profile)).toBe('generic');
  });

  it('prefers nextjs-app over react-spa when both Next.js and React detected', () => {
    const profile = makeProfile({
      frameworks: ['nextjs', 'react'],
    });
    expect(selectTemplate(profile)).toBe('nextjs-app');
  });

  it('prefers nestjs-monorepo over express when monorepo has both', () => {
    const profile = makeProfile({
      projectType: 'monorepo',
      frameworks: ['nestjs', 'express'],
      monorepoTools: ['pnpm-workspaces'],
    });
    expect(selectTemplate(profile)).toBe('nestjs-monorepo');
  });

  it('selects express-api for non-monorepo NestJS projects', () => {
    // NestJS single-app without monorepo falls through to express check
    // if express is also present, or to generic if not
    const profile = makeProfile({
      projectType: 'single-app',
      frameworks: ['nestjs', 'express'],
    });
    // NestJS single-app: nestjs is not matched without monorepo, falls to express
    expect(selectTemplate(profile)).toBe('express-api');
  });

  it('selects generic for Go projects', () => {
    const profile = makeProfile({
      packageManager: 'go',
      languages: ['go'],
    });
    expect(selectTemplate(profile)).toBe('generic');
  });

  it('selects generic for empty profile', () => {
    const profile = makeProfile();
    expect(selectTemplate(profile)).toBe('generic');
  });
});
