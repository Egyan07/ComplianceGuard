import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { LicenseProvider, useLicense } from './LicenseContext';

// No AuthProvider → user is null → web mode resolves tier to 'free'.
const wrapper = ({ children }: { children: ReactNode }) => (
  <LicenseProvider>{children}</LicenseProvider>
);

describe('LicenseContext.isFeatureAllowed', () => {
  it('denies an unknown/typo gate name (fail-closed)', () => {
    // Regression: a missing gate must NOT unlock the feature for everyone.
    const { result } = renderHook(() => useLicense(), { wrapper });
    expect(result.current.isFeatureAllowed('nonexistent_gate')).toBe(false);
  });

  it('denies a pro gate for a free user', () => {
    const { result } = renderHook(() => useLicense(), { wrapper });
    expect(result.current.isFeatureAllowed('all_controls')).toBe(false);
  });
});
