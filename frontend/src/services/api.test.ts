import { describe, it, expect } from 'vitest';
import { getMockEvidenceSummary } from './api';

describe('API Service', () => {
  describe('getMockEvidenceSummary', () => {
    it('returns a valid summary with zero initial values', () => {
      const summary = getMockEvidenceSummary();
      expect(summary).toHaveProperty('total_collections', 0);
      expect(summary).toHaveProperty('last_collection', null);
      expect(summary.compliance_metrics).toHaveProperty('overall_compliance_score', 0);
      expect(summary.compliance_metrics).toHaveProperty('s3_encryption_compliance', 0);
      expect(summary.compliance_metrics).toHaveProperty('iam_policy_compliance', 0);
    });
  });
});
