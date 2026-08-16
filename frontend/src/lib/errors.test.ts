import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(getErrorMessage(new Error('offline'))).toBe('offline');
  });

  it('falls back when the Error message is empty', () => {
    expect(getErrorMessage(new Error(''), 'custom fallback')).toBe('custom fallback');
  });

  it('passes through string throws', () => {
    expect(getErrorMessage('plain string failure')).toBe('plain string failure');
  });

  it('returns the fallback for non-Error, non-string values', () => {
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred.');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred.');
    expect(getErrorMessage({ some: 'object' })).toBe('An unexpected error occurred.');
    expect(getErrorMessage(42, 'fallback')).toBe('fallback');
  });

  it('uses the provided fallback for unknown values', () => {
    expect(getErrorMessage(undefined, 'Failed to collect evidence.')).toBe('Failed to collect evidence.');
  });
});
