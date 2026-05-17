import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEnterpriseFeature } from './useEnterpriseFeature';
import * as LicenseContext from '../contexts/LicenseContext';

describe('useEnterpriseFeature', () => {
  it('returns true for enterprise tier with valid gate', () => {
    vi.spyOn(LicenseContext, 'useLicense').mockReturnValue({ tier: 'enterprise' } as any);
    const { result } = renderHook(() => useEnterpriseFeature('enterprise_audit_log'));
    expect(result.current).toBe(true);
  });

  it('returns false for pro tier on enterprise gate', () => {
    vi.spyOn(LicenseContext, 'useLicense').mockReturnValue({ tier: 'pro' } as any);
    const { result } = renderHook(() => useEnterpriseFeature('enterprise_audit_log'));
    expect(result.current).toBe(false);
  });

  it('returns false for free tier on enterprise gate', () => {
    vi.spyOn(LicenseContext, 'useLicense').mockReturnValue({ tier: 'free' } as any);
    const { result } = renderHook(() => useEnterpriseFeature('enterprise_audit_log'));
    expect(result.current).toBe(false);
  });

  it('returns false for unknown gate', () => {
    vi.spyOn(LicenseContext, 'useLicense').mockReturnValue({ tier: 'enterprise' } as any);
    const { result } = renderHook(() => useEnterpriseFeature('nonexistent_gate'));
    expect(result.current).toBe(false);
  });
});
