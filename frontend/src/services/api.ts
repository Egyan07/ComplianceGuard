/*
API Service Layer for ComplianceGuard Frontend

Provides TypeScript interfaces and API client functions for communicating
with the ComplianceGuard backend API endpoints.
*/

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// Base API configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';

// Create axios instance with default configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding authentication tokens
apiClient.interceptors.request.use(
  (config) => {
    // In a real implementation, get token from secure storage
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// TypeScript interfaces for API responses

export interface AWSCredentials {
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_region: string;
}

export interface EvidenceCollectionRequest {
  aws_credentials?: AWSCredentials;
  collection_types?: string[];
}

export interface EvidenceItem {
  id: string;
  type: string;
  status: string;
  data: Record<string, any>;
  timestamp: string;
  source: string;
}

export interface EvidenceResponse {
  collection_id: string;
  collection_timestamp: string;
  collection_status: string;
  evidence_count: number;
  evidence_items: EvidenceItem[];
  failed_collections: Array<Record<string, any>>;
  summary: {
    total_evidence: number;
    compliance_score: number;
    critical_issues: number;
    warning_issues: number;
  };
}

export interface CollectionStatus {
  collection_id: string;
  status: string;
  timestamp: string;
  evidence_count: number;
  user_id: string;
}

export interface ComplianceMetrics {
  s3_encryption_compliance: number;
  iam_policy_compliance: number;
  overall_compliance_score: number;
}

export interface EvidenceSummary {
  total_collections: number;
  last_collection: string | null;
  compliance_metrics: ComplianceMetrics;
  user_id: string;
}

export interface ValidationResult {
  is_complete: boolean;
  missing_types: string[];
  coverage_percentage: number;
  recommendations: string[];
}

// API service functions

/**
 * Collect compliance evidence from configured sources
 */
export const collectEvidence = async (
  request: EvidenceCollectionRequest
): Promise<EvidenceResponse> => {
  try {
    const response: AxiosResponse<EvidenceResponse> = await apiClient.post(
      '/evidence/collect',
      request
    );
    return response.data;
  } catch (error) {
    console.error('Error collecting evidence:', error);
    throw error;
  }
};

/**
 * Get status of evidence collection by ID
 */
export const getCollectionStatus = async (
  collectionId: string
): Promise<CollectionStatus> => {
  try {
    const response: AxiosResponse<CollectionStatus> = await apiClient.get(
      `/evidence/status/${collectionId}`
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching collection status:', error);
    throw error;
  }
};

/**
 * Get summary of all evidence collections
 */
export const getEvidenceSummary = async (): Promise<EvidenceSummary> => {
  try {
    const response: AxiosResponse<EvidenceSummary> = await apiClient.get(
      '/evidence/summary'
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching evidence summary:', error);
    throw error;
  }
};

/**
 * Validate completeness of evidence bundle
 */
export const validateEvidenceCompleteness = async (
  evidenceBundle: Record<string, any>,
  requiredTypes: string[]
): Promise<ValidationResult> => {
  try {
    const response: AxiosResponse<ValidationResult> = await apiClient.post(
      '/evidence/validate',
      evidenceBundle,
      {
        params: { required_types: requiredTypes.join(',') }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error validating evidence completeness:', error);
    throw error;
  }
};

/**
 * Health check for backend API
 */
export const checkHealth = async (): Promise<Record<string, any>> => {
  try {
    const response = await axios.get('http://localhost:8000/health');
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
};

// Mock data for development/testing when backend is not available
export const getMockEvidenceSummary = (): EvidenceSummary => {
  return {
    total_collections: 5,
    last_collection: '2024-01-15T10:30:00Z',
    compliance_metrics: {
      s3_encryption_compliance: 85,
      iam_policy_compliance: 92,
      overall_compliance_score: 88
    },
    user_id: 'user_123'
  };
};

export const getMockEvidenceItems = (): EvidenceItem[] => {
  return [
    {
      id: 'evidence_1',
      type: 's3_encryption',
      status: 'compliant',
      data: { bucket_name: 'secure-data-bucket', encryption: 'AES256' },
      timestamp: '2024-01-15T10:30:00Z',
      source: 'aws_s3'
    },
    {
      id: 'evidence_2',
      type: 'iam_policy',
      status: 'warning',
      data: { policy_name: 'admin-policy', risk_level: 'medium' },
      timestamp: '2024-01-15T10:25:00Z',
      source: 'aws_iam'
    },
    {
      id: 'evidence_3',
      type: 's3_encryption',
      status: 'non_compliant',
      data: { bucket_name: 'legacy-bucket', encryption: 'none' },
      timestamp: '2024-01-15T10:20:00Z',
      source: 'aws_s3'
    }
  ];
};
