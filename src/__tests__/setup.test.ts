import { describe, it, expect } from 'vitest';
import { PLUGIN_NAME, PLUGIN_VERSION } from '../index.js';

describe('claude-sdlc plugin', () => {
  it('exports the correct plugin name', () => {
    expect(PLUGIN_NAME).toBe('claude-sdlc');
  });

  it('exports a valid version string', () => {
    expect(PLUGIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
