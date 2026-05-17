import { useLicense } from '../contexts/LicenseContext';
import { FEATURE_GATES } from '../constants';

export function useEnterpriseFeature(gate: string): boolean {
  const { tier } = useLicense();
  const gateConfig = FEATURE_GATES[gate];
  if (!gateConfig) return false;
  return gateConfig[tier] === true;
}
