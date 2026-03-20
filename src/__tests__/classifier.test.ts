import { describe, it, expect } from 'vitest';
import { classifyTask } from '../services/classifier.js';
import type { DomainEntry } from '../types/detection.js';

const testDomains: DomainEntry[] = [
  { name: 'api', path: 'apps/api', techStack: ['nestjs'], description: 'Backend API' },
  { name: 'web', path: 'apps/web', techStack: ['nextjs'], description: 'Web frontend' },
];

describe('Task Classifier', () => {
  describe('task type detection', () => {
    it('should classify "fix login bug in api" as bugfix', () => {
      const result = classifyTask({ description: 'fix login bug in api', domainMap: testDomains });
      expect(result.taskType).toBe('bugfix');
    });

    it('should classify "add daily rewards system" as feature', () => {
      const result = classifyTask({ description: 'add daily rewards system', domainMap: testDomains });
      expect(result.taskType).toBe('feature');
    });

    it('should classify "refactor auth middleware" as refactor', () => {
      const result = classifyTask({ description: 'refactor auth middleware', domainMap: testDomains });
      expect(result.taskType).toBe('refactor');
    });

    it('should classify "document the API endpoints" as docs', () => {
      const result = classifyTask({ description: 'document the API endpoints', domainMap: testDomains });
      expect(result.taskType).toBe('docs');
    });

    it('should classify "set up CI pipeline" as ops', () => {
      const result = classifyTask({ description: 'set up CI pipeline', domainMap: testDomains });
      expect(result.taskType).toBe('ops');
    });

    it('should classify "investigate memory leak" as research', () => {
      const result = classifyTask({ description: 'investigate memory leak', domainMap: testDomains });
      expect(result.taskType).toBe('research');
    });

    it('should default to feature for unrecognized descriptions', () => {
      const result = classifyTask({ description: 'add user profiles', domainMap: testDomains });
      expect(result.taskType).toBe('feature');
    });
  });

  describe('complexity detection', () => {
    it('should detect S complexity from "small fix: typo in error message"', () => {
      const result = classifyTask({ description: 'small fix: typo in error message', domainMap: testDomains });
      expect(result.complexity).toBe('S');
    });

    it('should detect XL complexity from "migrate to new architecture"', () => {
      const result = classifyTask({ description: 'migrate to new architecture', domainMap: testDomains });
      expect(result.complexity).toBe('XL');
    });

    it('should detect L complexity for multi-domain tasks', () => {
      const result = classifyTask({
        description: 'update api and web for new auth flow',
        domainMap: testDomains,
      });
      expect(result.domains).toContain('api');
      expect(result.domains).toContain('web');
      expect(['L', 'XL']).toContain(result.complexity);
    });

    it('should detect S for short descriptions', () => {
      const result = classifyTask({ description: 'fix typo', domainMap: testDomains });
      expect(result.complexity).toBe('S');
    });

    it('should detect L for long descriptions', () => {
      const longDesc = 'We need to implement a comprehensive logging system that captures all API requests and responses, stores them in a structured format, provides filtering and search capabilities, and integrates with our existing monitoring dashboard for real-time alerting';
      const result = classifyTask({ description: longDesc, domainMap: testDomains });
      expect(['L', 'XL']).toContain(result.complexity);
    });

    it('should detect XL for 3+ domains', () => {
      const threeDomains: DomainEntry[] = [
        ...testDomains,
        { name: 'mobile', path: 'apps/mobile', techStack: ['react-native'], description: 'Mobile app' },
      ];
      const result = classifyTask({
        description: 'update api and web and mobile for new auth',
        domainMap: threeDomains,
      });
      expect(result.complexity).toBe('XL');
    });
  });

  describe('domain detection', () => {
    it('should detect api domain from description', () => {
      const result = classifyTask({ description: 'fix login bug in api', domainMap: testDomains });
      expect(result.domains).toContain('api');
    });

    it('should detect both api and web domains', () => {
      const result = classifyTask({
        description: 'update api and web for new auth flow',
        domainMap: testDomains,
      });
      expect(result.domains).toContain('api');
      expect(result.domains).toContain('web');
    });

    it('should fall back to first domain when none matched', () => {
      const result = classifyTask({
        description: 'add a new feature',
        domainMap: testDomains,
      });
      expect(result.domains).toEqual(['api']);
    });

    it('should return empty domains when domainMap is empty', () => {
      const result = classifyTask({
        description: 'add a new feature',
        domainMap: [],
      });
      expect(result.domains).toEqual([]);
    });

    it('should match domain by path', () => {
      const result = classifyTask({
        description: 'update apps/web component',
        domainMap: testDomains,
      });
      expect(result.domains).toContain('web');
    });
  });

  describe('session chain determination', () => {
    it('should return [QUICK_FIX, MERGE] for S bugfix', () => {
      const result = classifyTask({
        description: 'small fix: typo in error message',
        domainMap: testDomains,
      });
      expect(result.complexity).toBe('S');
      expect(result.taskType).toBe('bugfix');
      expect(result.sessionChain).toEqual(['QUICK_FIX', 'MERGE']);
    });

    it('should return [PLAN, EXECUTE, REVIEW, MERGE] for M complexity', () => {
      const result = classifyTask({
        description: 'add user authentication to the api service with JWT tokens',
        domainMap: testDomains,
      });
      expect(result.complexity).toBe('M');
      expect(result.sessionChain).toEqual(['PLAN', 'EXECUTE', 'REVIEW', 'MERGE']);
    });

    it('should include BRAINSTORM for L feature', () => {
      const result = classifyTask({
        description: 'add a large daily rewards system with complex gamification mechanics and leaderboards',
        domainMap: testDomains,
      });
      expect(['L', 'XL']).toContain(result.complexity);
      expect(result.sessionChain).toContain('BRAINSTORM');
    });

    it('should include ARCHITECTURE_REVIEW for XL', () => {
      const result = classifyTask({
        description: 'migrate to new architecture',
        domainMap: testDomains,
      });
      expect(result.complexity).toBe('XL');
      expect(result.sessionChain).toContain('ARCHITECTURE_REVIEW');
    });

    it('should insert INTEGRATION_CHECK for multi-domain non-S tasks', () => {
      const result = classifyTask({
        description: 'update api and web for new auth flow',
        domainMap: testDomains,
      });
      expect(result.sessionChain).toContain('INTEGRATION_CHECK');
      // INTEGRATION_CHECK should come before MERGE
      const icIdx = result.sessionChain.indexOf('INTEGRATION_CHECK');
      const mergeIdx = result.sessionChain.indexOf('MERGE');
      expect(icIdx).toBeLessThan(mergeIdx);
    });

    it('should return [TRIAGE] for "triage"', () => {
      const result = classifyTask({ description: 'triage', domainMap: testDomains });
      expect(result.sessionChain).toEqual(['TRIAGE']);
    });

    it('should return [HOTFIX] for "hotfix: production login crash"', () => {
      const result = classifyTask({
        description: 'hotfix: production login crash',
        domainMap: testDomains,
      });
      expect(result.sessionChain).toEqual(['HOTFIX']);
    });

    it('should return [RELEASE] for "release"', () => {
      const result = classifyTask({ description: 'release', domainMap: testDomains });
      expect(result.sessionChain).toEqual(['RELEASE']);
    });

    it('should return [RETRO] for "retro"', () => {
      const result = classifyTask({ description: 'retro', domainMap: testDomains });
      expect(result.sessionChain).toEqual(['RETRO']);
    });
  });

  describe('priority detection', () => {
    it('should set critical priority for "production down"', () => {
      const result = classifyTask({
        description: 'production down - users cannot login',
        domainMap: testDomains,
      });
      expect(result.priority).toBe('critical');
    });

    it('should set critical priority for hotfix', () => {
      const result = classifyTask({
        description: 'hotfix: production login crash',
        domainMap: testDomains,
      });
      expect(result.priority).toBe('critical');
    });

    it('should set high priority for "blocker"', () => {
      const result = classifyTask({
        description: 'blocker: auth flow blocks deployment',
        domainMap: testDomains,
      });
      expect(result.priority).toBe('high');
    });

    it('should set low priority for "nice to have"', () => {
      const result = classifyTask({
        description: 'nice to have: add dark mode support',
        domainMap: testDomains,
      });
      expect(result.priority).toBe('low');
    });

    it('should default to medium priority', () => {
      const result = classifyTask({
        description: 'add user profiles',
        domainMap: testDomains,
      });
      expect(result.priority).toBe('medium');
    });
  });

  describe('suggested title', () => {
    it('should capitalize first letter', () => {
      const result = classifyTask({ description: 'fix login bug', domainMap: testDomains });
      expect(result.suggestedTitle).toBe('Fix login bug');
    });

    it('should strip common prefixes', () => {
      const result = classifyTask({ description: 'please fix the login bug', domainMap: testDomains });
      expect(result.suggestedTitle).toBe('Fix the login bug');
    });

    it('should truncate long titles', () => {
      const longDesc = 'a'.repeat(100);
      const result = classifyTask({ description: longDesc, domainMap: testDomains });
      expect(result.suggestedTitle.length).toBeLessThanOrEqual(80);
      expect(result.suggestedTitle.endsWith('...')).toBe(true);
    });
  });

  describe('full classification scenarios', () => {
    it('should fully classify "fix login bug in api"', () => {
      const result = classifyTask({ description: 'fix login bug in api', domainMap: testDomains });
      expect(result.taskType).toBe('bugfix');
      expect(result.domains).toContain('api');
      expect(result.priority).toBe('medium');
      expect(result.suggestedTitle).toBe('Fix login bug in api');
    });

    it('should fully classify "hotfix: production login crash"', () => {
      const result = classifyTask({
        description: 'hotfix: production login crash',
        domainMap: testDomains,
      });
      expect(result.taskType).toBe('bugfix');
      expect(result.sessionChain).toEqual(['HOTFIX']);
      expect(result.priority).toBe('critical');
    });
  });
});
