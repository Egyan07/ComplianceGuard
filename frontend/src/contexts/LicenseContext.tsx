import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { activateLicenseHttp, getLicenseInfoHttp } from '../services/api';
import { AuthContext } from './AuthContext';

const isElectron = !!(window as any).electronAPI;

const FEATURE_GATES: Record<string, Record<string, boolean>> = {
  all_controls:        { free: false, pro: true },
  per_control_scoring: { free: false, pro: true },
  remediation:         { free: false, pro: true },
  pdf_reports:         { free: false, pro: true },
  evidence_upload:     { free: false, pro: true },
  evaluation_history:  { free: false, pro: true },
};

export interface LicenseInfo {
  tier: 'free' | 'pro';
  licenseId?: string | null;
  email?: string | null;
  maxMachines?: number;
  expiresAt?: string | null;
  daysRemaining?: number | null;
  isExpired?: boolean;
  isGracePeriod?: boolean;
}

interface LicenseContextValue {
  tier: 'free' | 'pro';
  licenseInfo: LicenseInfo;
  loading: boolean;
  isFeatureAllowed: (feature: string) => boolean;
  activateLicense: (key: string) => Promise<{ valid: boolean; error?: string }>;
  deactivateLicense: () => Promise<void>;
}

const defaultInfo: LicenseInfo = { tier: 'free' };

const LicenseContext = createContext<LicenseContextValue>({
  tier: 'free',
  licenseInfo: defaultInfo,
  loading: true,
  isFeatureAllowed: () => false,
  activateLicense: async () => ({ valid: false }),
  deactivateLicense: async () => {},
});

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>(defaultInfo);
  const [loading, setLoading] = useState(true);

  // Consume AuthContext directly (not via useAuth()) so this provider works
  // even when rendered outside AuthProvider (e.g. in isolated tests).
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user ?? null;

  useEffect(() => {
    if (!isElectron) {
      // Web mode: fetch license from backend. Skip if the user is not logged in.
      if (!user) {
        setLicenseInfo(defaultInfo);
        setLoading(false);
        return;
      }

      getLicenseInfoHttp()
        .then((info) => {
          setLicenseInfo({
            tier: info.tier === 'pro' ? 'pro' : 'free',
            licenseId: info.license_id ?? info.licenseId ?? null,
            email: info.email ?? null,
            maxMachines: info.max_machines ?? info.maxMachines,
            expiresAt: info.expires_at ?? info.expiresAt ?? null,
            daysRemaining: info.days_remaining ?? info.daysRemaining ?? null,
            isExpired: info.is_expired ?? info.isExpired,
            isGracePeriod: info.is_grace_period ?? info.isGracePeriod,
          });
        })
        .catch(() => setLicenseInfo(defaultInfo))
        .finally(() => setLoading(false));
      return;
    }

    const api = (window as any).electronAPI;
    api.getLicenseInfo().then((info: LicenseInfo) => {
      setLicenseInfo(info);
      setLoading(false);
    }).catch(() => setLoading(false));

    const cleanup = api.onLicenseChanged?.((info: LicenseInfo) => {
      setLicenseInfo(info);
    });

    return () => { cleanup?.(); };
  }, [user]);

  const isFeatureAllowed = useCallback((feature: string) => {
    const gate = FEATURE_GATES[feature];
    if (!gate) return true;
    return gate[licenseInfo.tier] === true;
  }, [licenseInfo.tier]);

  const activateLicense = useCallback(async (key: string) => {
    if (!isElectron) {
      // Web mode: hit the backend's /api/auth/activate-license endpoint and
      // mirror the returned payload into local state. Errors from the server
      // bubble up as structured { valid: false, error }.
      try {
        const result = await activateLicenseHttp(key);
        const info: LicenseInfo = {
          tier: result.tier === 'pro' ? 'pro' : 'free',
          licenseId: result.license_id ?? null,
          email: result.email ?? null,
          expiresAt: result.expires_at ?? null,
          daysRemaining: result.days_remaining ?? null,
          isExpired: result.is_expired ?? false,
          isGracePeriod: result.is_grace_period ?? false,
        };
        setLicenseInfo(info);
        return { valid: true };
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.message || 'License activation failed';
        return { valid: false, error: detail };
      }
    }

    const api = (window as any).electronAPI;
    const result = await api.activateLicense(key);
    if (result.valid) {
      setLicenseInfo(result.payload || { tier: 'pro' });
    }
    return result;
  }, []);

  const deactivateLicense = useCallback(async () => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    await api.deactivateLicense();
    setLicenseInfo(defaultInfo);
  }, []);

  return (
    <LicenseContext.Provider value={{
      tier: licenseInfo.tier,
      licenseInfo,
      loading,
      isFeatureAllowed,
      activateLicense,
      deactivateLicense,
    }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
