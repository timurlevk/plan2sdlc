import { describe, it, expect } from 'vitest';
import { generateTaskId, generateWorkflowId, generateTechDebtId } from '../utils/id-generator.js';

describe('generateTaskId', () => {
  it('should return TASK-001 for empty list', () => {
    expect(generateTaskId([])).toBe('TASK-001');
  });

  it('should return next sequential ID', () => {
    expect(generateTaskId(['TASK-001', 'TASK-002'])).toBe('TASK-003');
  });

  it('should find max even with gaps', () => {
    expect(generateTaskId(['TASK-001', 'TASK-003'])).toBe('TASK-004');
  });

  it('should ignore non-matching IDs', () => {
    expect(generateTaskId(['WF-005', 'TASK-002', 'TD-001'])).toBe('TASK-003');
  });

  it('should handle large numbers', () => {
    expect(generateTaskId(['TASK-999'])).toBe('TASK-1000');
  });
});

describe('generateWorkflowId', () => {
  it('should return WF-001 for empty list', () => {
    expect(generateWorkflowId([])).toBe('WF-001');
  });

  it('should return next sequential ID', () => {
    expect(generateWorkflowId(['WF-001', 'WF-003'])).toBe('WF-004');
  });
});

describe('generateTechDebtId', () => {
  it('should return TD-001 for empty list', () => {
    expect(generateTechDebtId([])).toBe('TD-001');
  });

  it('should return next sequential ID', () => {
    expect(generateTechDebtId(['TD-001', 'TD-003'])).toBe('TD-004');
  });
});
