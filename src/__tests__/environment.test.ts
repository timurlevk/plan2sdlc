import { describe, it, expect } from 'vitest';
import { detectEnvironment, formatEnvironmentContext } from '../services/environment.js';

describe('detectEnvironment', () => {
  it('should detect main as production with write:false', () => {
    const info = detectEnvironment('main');
    expect(info.environment).toBe('production');
    expect(info.permissions.write).toBe(false);
    expect(info.safetyLevel).toBe('maximum');
  });

  it('should detect master as production', () => {
    const info = detectEnvironment('master');
    expect(info.environment).toBe('production');
    expect(info.permissions.write).toBe(false);
  });

  it('should detect feature/* as development with write:true', () => {
    const info = detectEnvironment('feature/add-login');
    expect(info.environment).toBe('development');
    expect(info.permissions.write).toBe(true);
    expect(info.safetyLevel).toBe('normal');
  });

  it('should detect release/* as development', () => {
    const info = detectEnvironment('release/v1.0');
    expect(info.environment).toBe('development');
  });

  it('should detect staging as staging with deploy:false', () => {
    const info = detectEnvironment('staging');
    expect(info.environment).toBe('staging');
    expect(info.permissions.deploy).toBe(false);
    expect(info.safetyLevel).toBe('elevated');
  });

  it('should detect rc/* as staging', () => {
    const info = detectEnvironment('rc/1.0');
    expect(info.environment).toBe('staging');
  });

  it('should default unrecognized branches to development', () => {
    const info = detectEnvironment('random-branch');
    expect(info.environment).toBe('development');
    expect(info.permissions.write).toBe(true);
  });

  it('should include branch name in result', () => {
    const info = detectEnvironment('feature/test');
    expect(info.branch).toBe('feature/test');
  });

  it('should detect hotfix/* as development', () => {
    const info = detectEnvironment('hotfix/urgent-fix');
    expect(info.environment).toBe('development');
  });

  it('should detect chore/* as development', () => {
    const info = detectEnvironment('chore/update-deps');
    expect(info.environment).toBe('development');
  });

  it('should enforce production is read-only (all write-related false)', () => {
    const info = detectEnvironment('main');
    expect(info.permissions.write).toBe(false);
    expect(info.permissions.test).toBe(false);
    expect(info.permissions.deploy).toBe(false);
    expect(info.permissions.seedData).toBe(false);
    expect(info.permissions.readLogs).toBe(true);
  });

  it('should enforce staging has no direct deploy', () => {
    const info = detectEnvironment('staging');
    expect(info.permissions.deploy).toBe(false);
    expect(info.permissions.write).toBe(true);
    expect(info.permissions.test).toBe(true);
  });
});

describe('formatEnvironmentContext', () => {
  it('should include PRODUCTION ENVIRONMENT warning for production', () => {
    const info = detectEnvironment('main');
    const text = formatEnvironmentContext(info);
    expect(text).toContain('PRODUCTION ENVIRONMENT');
    expect(text).toContain('Read-only access');
    expect(text).toContain('Current environment: production');
    expect(text).toContain('Branch: main');
  });

  it('should NOT include production warning for development', () => {
    const info = detectEnvironment('feature/test');
    const text = formatEnvironmentContext(info);
    expect(text).not.toContain('PRODUCTION ENVIRONMENT');
    expect(text).toContain('Current environment: development');
  });

  it('should NOT include production warning for staging', () => {
    const info = detectEnvironment('staging');
    const text = formatEnvironmentContext(info);
    expect(text).not.toContain('PRODUCTION ENVIRONMENT');
    expect(text).toContain('Current environment: staging');
  });

  it('should list all permissions', () => {
    const info = detectEnvironment('feature/test');
    const text = formatEnvironmentContext(info);
    expect(text).toContain('Write code: yes');
    expect(text).toContain('Run tests: yes');
    expect(text).toContain('Deploy: yes');
    expect(text).toContain('Seed data: yes');
    expect(text).toContain('Read logs: no');
  });

  it('should include safety level', () => {
    const info = detectEnvironment('main');
    const text = formatEnvironmentContext(info);
    expect(text).toContain('Safety level: maximum');
  });
});
