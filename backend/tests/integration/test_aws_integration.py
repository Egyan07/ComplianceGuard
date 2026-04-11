"""
Integration tests for AWS Evidence Collection

Tests AWS connectivity, S3 encryption evidence collection, and IAM policy monitoring.
"""

import pytest
from unittest.mock import Mock, patch
from datetime import datetime
from botocore.exceptions import ClientError, NoCredentialsError

from app.integrations.aws import AWSEvidenceCollector
from app.services.evidence_collector import EvidenceCollectionService


class TestAWSEvidenceCollector:
    """Test AWS Evidence Collection functionality"""

    @pytest.fixture
    def mock_aws_credentials(self):
        """Mock AWS credentials for testing"""
        return {
            "aws_access_key_id": "test_access_key",
            "aws_secret_access_key": "test_secret_key",
            "region_name": "us-east-1"
        }

    @pytest.fixture
    def mock_s3_client(self):
        """Mock S3 client"""
        with patch('boto3.client') as mock_client:
            mock_s3 = Mock()
            mock_client.return_value = mock_s3
            yield mock_s3

    @pytest.fixture
    def mock_iam_client(self):
        """Mock IAM client"""
        with patch('boto3.client') as mock_client:
            mock_iam = Mock()
            mock_client.return_value = mock_iam
            yield mock_iam

    def test_aws_client_initialization_success(self, mock_aws_credentials):
        """Test successful AWS client initialization"""
        collector = AWSEvidenceCollector(**mock_aws_credentials)
        assert collector.s3_client is not None
        assert collector.iam_client is not None

    def test_aws_client_initialization_failure(self):
        """Test AWS client initialization failure with invalid credentials"""
        with patch('boto3.client') as mock_client:
            mock_client.side_effect = NoCredentialsError()
            with pytest.raises(NoCredentialsError):
                AWSEvidenceCollector(
                    aws_access_key_id="invalid",
                    aws_secret_access_key="invalid",
                    region_name="us-east-1"
                )

    def test_collect_s3_encryption_evidence_success(self, mock_aws_credentials, mock_s3_client):
        """Test successful S3 encryption evidence collection"""
        # Mock S3 bucket data
        mock_s3_client.list_buckets.return_value = {
            'Buckets': [
                {'Name': 'test-bucket-1', 'CreationDate': datetime.now()},
                {'Name': 'test-bucket-2', 'CreationDate': datetime.now()}
            ]
        }

        # Mock bucket encryption settings
        mock_s3_client.get_bucket_encryption.side_effect = [
            {
                'ServerSideEncryptionConfiguration': {
                    'Rules': [{
                        'ApplyServerSideEncryptionByDefault': {
                            'SSEAlgorithm': 'AES256'
                        }
                    }]
                }
            },
            {
                'ServerSideEncryptionConfiguration': {
                    'Rules': [{
                        'ApplyServerSideEncryptionByDefault': {
                            'SSEAlgorithm': 'aws:kms'
                        }
                    }]
                }
            }
        ]

        collector = AWSEvidenceCollector(**mock_aws_credentials)
        evidence = collector.collect_s3_encryption_evidence()

        assert evidence['evidence_type'] == 's3_encryption'
        assert evidence['collection_timestamp'] is not None
        assert len(evidence['bucket_encryption_status']) == 2
        assert evidence['encryption_compliance_rate'] == 100.0

    def test_collect_s3_encryption_evidence_partial_compliance(self, mock_aws_credentials, mock_s3_client):
        """Test S3 encryption evidence collection with partial compliance"""
        # Mock S3 bucket data
        mock_s3_client.list_buckets.return_value = {
            'Buckets': [
                {'Name': 'encrypted-bucket', 'CreationDate': datetime.now()},
                {'Name': 'unencrypted-bucket', 'CreationDate': datetime.now()}
            ]
        }

        # Mock bucket encryption settings - one encrypted, one not
        mock_s3_client.get_bucket_encryption.side_effect = [
            {
                'ServerSideEncryptionConfiguration': {
                    'Rules': [{
                        'ApplyServerSideEncryptionByDefault': {
                            'SSEAlgorithm': 'AES256'
                        }
                    }]
                }
            },
            ClientError(
                error_response={'Error': {'Code': 'ServerSideEncryptionConfigurationNotFoundError'}},
                operation_name='GetBucketEncryption'
            )
        ]

        collector = AWSEvidenceCollector(**mock_aws_credentials)
        evidence = collector.collect_s3_encryption_evidence()

        assert evidence['evidence_type'] == 's3_encryption'
        assert evidence['encryption_compliance_rate'] == 50.0
        assert len(evidence['bucket_encryption_status']) == 2

    def test_collect_iam_policy_evidence_success(self, mock_aws_credentials, mock_iam_client):
        """Test successful IAM policy evidence collection"""
        # Mock IAM paginator and pages
        mock_paginator = Mock()
        mock_page = {
            'Policies': [
                {
                    'PolicyName': 'AdminPolicy',
                    'PolicyId': 'ABCDEFGHIJKLMNOPQRSTU',
                    'Arn': 'arn:aws:iam::123456789012:policy/AdminPolicy',
                    'DefaultVersionId': 'v1'
                },
                {
                    'PolicyName': 'ReadOnlyPolicy',
                    'PolicyId': 'BCDEFGHIJKLMNOPQRSTUV',
                    'Arn': 'arn:aws:iam::123456789012:policy/ReadOnlyPolicy',
                    'DefaultVersionId': 'v1'
                }
            ]
        }
        mock_paginator.paginate.return_value = [mock_page]
        mock_iam_client.get_paginator.return_value = mock_paginator

        # Mock policy versions
        mock_iam_client.get_policy_version.side_effect = [
            {
                'PolicyVersion': {
                    'Document': {
                        'Statement': [
                            {
                                'Effect': 'Allow',
                                'Action': '*',
                                'Resource': '*'
                            }
                        ]
                    }
                }
            },
            {
                'PolicyVersion': {
                    'Document': {
                        'Statement': [
                            {
                                'Effect': 'Allow',
                                'Action': ['s3:GetObject', 's3:ListBucket'],
                                'Resource': ['arn:aws:s3:::specific-bucket/*', 'arn:aws:s3:::specific-bucket']
                            }
                        ]
                    }
                }
            }
        ]

        collector = AWSEvidenceCollector(**mock_aws_credentials)
        evidence = collector.collect_iam_policy_evidence()

        assert evidence['evidence_type'] == 'iam_policy'
        assert evidence['collection_timestamp'] is not None
        assert len(evidence['policy_analysis']) == 2
        assert evidence['over_privileged_policies'] == 1  # AdminPolicy with '*' permissions

    def test_collect_iam_policy_evidence_error(self, mock_aws_credentials, mock_iam_client):
        """Test IAM policy evidence collection with AWS API errors"""
        # Mock IAM paginator to raise ClientError
        mock_paginator = Mock()
        mock_paginator.paginate.side_effect = ClientError(
            error_response={'Error': {'Code': 'AccessDenied', 'Message': 'Access denied'}},
            operation_name='ListPolicies'
        )
        mock_iam_client.get_paginator.return_value = mock_paginator

        collector = AWSEvidenceCollector(**mock_aws_credentials)

        with pytest.raises(Exception) as exc_info:
            collector.collect_iam_policy_evidence()

        assert "Failed to retrieve IAM policies" in str(exc_info.value)


class TestEvidenceCollectionService:
    """Test Evidence Collection Service"""

    @pytest.fixture
    def mock_aws_collector(self):
        """Mock AWS collector"""
        with patch('app.services.evidence_collector.AWSEvidenceCollector') as mock:
            yield mock

    @pytest.fixture
    def mock_aws_credentials(self):
        """Mock AWS credentials for testing"""
        return {
            "aws_access_key_id": "test_access_key",
            "aws_secret_access_key": "test_secret_key",
            "region_name": "us-east-1"
        }

    def test_collect_all_evidence_success(self, mock_aws_collector, mock_aws_credentials):
        """Test successful collection of all evidence types"""
        # Mock AWS collector responses
        mock_collector_instance = Mock()
        mock_collector_instance.collect_s3_encryption_evidence.return_value = {
            'evidence_type': 's3_encryption',
            'collection_timestamp': '2024-01-15T10:00:00Z',
            'bucket_encryption_status': [],
            'encryption_compliance_rate': 100.0
        }
        mock_collector_instance.collect_iam_policy_evidence.return_value = {
            'evidence_type': 'iam_policy',
            'collection_timestamp': '2024-01-15T10:00:00Z',
            'policy_analysis': [],
            'over_privileged_policies': 0
        }
        mock_aws_collector.return_value = mock_collector_instance

        service = EvidenceCollectionService()
        evidence_bundle = service.collect_all_evidence(**mock_aws_credentials)

        assert evidence_bundle['collection_timestamp'] is not None
        assert len(evidence_bundle['evidence_items']) == 2
        assert evidence_bundle['collection_status'] == 'success'
        assert evidence_bundle['evidence_count'] == 2

    def test_collect_all_evidence_partial_failure(self, mock_aws_collector, mock_aws_credentials):
        """Test evidence collection with partial failure"""
        # Mock AWS collector with one success, one failure
        mock_collector_instance = Mock()
        mock_collector_instance.collect_s3_encryption_evidence.return_value = {
            'evidence_type': 's3_encryption',
            'collection_timestamp': '2024-01-15T10:00:00Z',
            'bucket_encryption_status': [],
            'encryption_compliance_rate': 100.0
        }
        mock_collector_instance.collect_iam_policy_evidence.side_effect = Exception("AWS API Error")
        mock_aws_collector.return_value = mock_collector_instance

        service = EvidenceCollectionService()
        evidence_bundle = service.collect_all_evidence(**mock_aws_credentials)

        assert evidence_bundle['collection_status'] == 'partial_failure'
        assert len(evidence_bundle['evidence_items']) == 1
        assert len(evidence_bundle['failed_collections']) == 1
        assert evidence_bundle['failed_collections'][0]['evidence_type'] == 'iam_policy'

    def test_collect_all_evidence_complete_failure(self, mock_aws_collector, mock_aws_credentials):
        """Test complete evidence collection failure"""
        # Mock AWS collector to fail all collections
        mock_collector_instance = Mock()
        mock_collector_instance.collect_s3_encryption_evidence.side_effect = Exception("S3 Error")
        mock_collector_instance.collect_iam_policy_evidence.side_effect = Exception("IAM Error")
        mock_aws_collector.return_value = mock_collector_instance

        service = EvidenceCollectionService()

        with pytest.raises(Exception) as exc_info:
            service.collect_all_evidence(**mock_aws_credentials)

        assert "All evidence collection failed" in str(exc_info.value)