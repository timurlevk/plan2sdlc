/**
 * Template Selector
 *
 * Selects the best matching tech stack template based on a detected ProjectProfile.
 * Returns the template directory name to use for pre-filling .sdlc/config.yaml.
 */

import type { ProjectProfile } from '../types/detection.js';

export type TemplateName =
  | 'nestjs-monorepo'
  | 'nextjs-app'
  | 'django'
  | 'express-api'
  | 'react-spa'
  | 'generic';

/**
 * Select the best matching template for a detected tech stack.
 *
 * Priority order:
 * 1. Monorepo + NestJS → nestjs-monorepo
 * 2. Next.js (any) → nextjs-app
 * 3. Django → django
 * 4. Express → express-api
 * 5. React (without Next.js) → react-spa
 * 6. Fallback → generic
 */
export function selectTemplate(profile: ProjectProfile): TemplateName {
  const { frameworks, projectType } = profile;

  // Monorepo with NestJS gets the nestjs-monorepo template
  if (projectType === 'monorepo' && frameworks.includes('nestjs')) {
    return 'nestjs-monorepo';
  }

  // Next.js projects (includes React implicitly)
  if (frameworks.includes('nextjs')) {
    return 'nextjs-app';
  }

  // Django projects
  if (frameworks.includes('django')) {
    return 'django';
  }

  // Express API projects
  if (frameworks.includes('express')) {
    return 'express-api';
  }

  // React SPA (without Next.js — already checked above)
  if (frameworks.includes('react')) {
    return 'react-spa';
  }

  // Fallback to generic
  return 'generic';
}
