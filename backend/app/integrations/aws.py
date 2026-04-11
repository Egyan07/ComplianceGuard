"""
AWS Integration for Evidence Collection

Provides AWS S3 encryption and IAM policy monitoring for SOC 2 compliance evidence collection.
"""

import boto3
from typing import Dict, List, Any, Optional
from datetime import datetime
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError
import logging

logger = logging.getLogger(__name__)


class AWSEvidenceCollector:
    """
    AWS Evidence Collector for SOC 2 compliance monitoring

    Collects evidence from AWS services including:
    - S3 bucket encryption status
    - IAM policy analysis for over-privileged access
    """

    def __init__(self, aws_access_key_id: str, aws_secret_access_key: str, region_name: str = 'us-east-1'):
        """
        Initialize AWS Evidence Collector

        Args:
            aws_access_key_id: AWS access key ID
            aws_secret_access_key: AWS secret access key
            region_name: AWS region name (default: us-east-1)

        Raises:
            NoCredentialsError: If AWS credentials are invalid or missing
            PartialCredentialsError: If only partial credentials are provided
        """
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name
            )

            self.iam_client = boto3.client(
                'iam',
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name
            )

            self.region_name = region_name
            logger.info(f"AWS Evidence Collector initialized for region: {region_name}")

        except (NoCredentialsError, PartialCredentialsError) as e:
            logger.error(f"Failed to initialize AWS clients: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error initializing AWS clients: {str(e)}")
            raise NoCredentialsError()

    def collect_s3_encryption_evidence(self) -> Dict[str, Any]:
        """
        Collect S3 encryption evidence for SOC 2 compliance

        Returns:
            Dict containing S3 encryption evidence

        Raises:
            ClientError: If AWS API calls fail
        """
        try:
            # Get all S3 buckets
            response = self.s3_client.list_buckets()
            buckets = response.get('Buckets', [])

            bucket_encryption_status = []
            encrypted_count = 0

            for bucket in buckets:
                bucket_name = bucket['Name']
                creation_date = bucket['CreationDate']

                try:
                    encryption_response = self.s3_client.get_bucket_encryption(Bucket=bucket_name)
                    encryption_config = encryption_response.get('ServerSideEncryptionConfiguration', {})
                    rules = encryption_config.get('Rules', [])

                    if rules:
                        encryption_type = rules[0].get('ApplyServerSideEncryptionByDefault', {}).get('SSEAlgorithm', 'Unknown')
                        bucket_encryption_status.append({
                            'bucket_name': bucket_name,
                            'encryption_enabled': True,
                            'encryption_type': encryption_type,
                            'creation_date': creation_date.isoformat(),
                            'compliance_status': 'compliant'
                        })
                        encrypted_count += 1
                    else:
                        bucket_encryption_status.append({
                            'bucket_name': bucket_name,
                            'encryption_enabled': False,
                            'encryption_type': None,
                            'creation_date': creation_date.isoformat(),
                            'compliance_status': 'non_compliant'
                        })

                except ClientError as e:
                    error_code = e.response['Error']['Code']
                    if error_code == 'ServerSideEncryptionConfigurationNotFoundError':
                        # Bucket has no encryption configured
                        bucket_encryption_status.append({
                            'bucket_name': bucket_name,
                            'encryption_enabled': False,
                            'encryption_type': None,
                            'creation_date': creation_date.isoformat(),
                            'compliance_status': 'non_compliant'
                        })
                    else:
                        # Other AWS API error
                        bucket_encryption_status.append({
                            'bucket_name': bucket_name,
                            'encryption_enabled': False,
                            'encryption_type': None,
                            'creation_date': creation_date.isoformat(),
                            'compliance_status': 'error',
                            'error_message': str(e)
                        })
                        logger.error(f"Error checking encryption for bucket {bucket_name}: {str(e)}")

            # Calculate compliance rate
            total_buckets = len(buckets)
            compliance_rate = (encrypted_count / total_buckets * 100) if total_buckets > 0 else 100.0

            evidence = {
                'evidence_type': 's3_encryption',
                'collection_timestamp': datetime.utcnow().isoformat() + 'Z',
                'total_buckets': total_buckets,
                'encrypted_buckets': encrypted_count,
                'bucket_encryption_status': bucket_encryption_status,
                'encryption_compliance_rate': round(compliance_rate, 2),
                'aws_region': self.region_name,
                'soc2_criteria': [
                    'CC6.1 - Logical and Physical Access Controls',
                    'CC6.7 - Data Transmission and Disposal'
                ]
            }

            logger.info(f"S3 encryption evidence collected: {encrypted_count}/{total_buckets} buckets encrypted")
            return evidence

        except ClientError as e:
            error_msg = f"Failed to collect S3 encryption evidence: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Unexpected error collecting S3 encryption evidence: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)

    def collect_iam_policy_evidence(self) -> Dict[str, Any]:
        """
        Collect IAM policy evidence for SOC 2 compliance

        Analyzes IAM policies to identify over-privileged access patterns

        Returns:
            Dict containing IAM policy evidence

        Raises:
            ClientError: If AWS API calls fail
        """
        try:
            # Get all IAM policies
            paginator = self.iam_client.get_paginator('list_policies')
            page_iterator = paginator.paginate(Scope='Local')

            policies = []
            over_privileged_count = 0

            for page in page_iterator:
                for policy in page.get('Policies', []):
                    policy_name = policy['PolicyName']
                    policy_arn = policy['Arn']
                    default_version = policy['DefaultVersionId']

                    try:
                        # Get policy document
                        version_response = self.iam_client.get_policy_version(
                            PolicyArn=policy_arn,
                            VersionId=default_version
                        )

                        policy_document = version_response['PolicyVersion']['Document']
                        statements = policy_document.get('Statement', [])

                        # Analyze policy for over-privileged access
                        is_over_privileged = False
                        risk_factors = []

                        for statement in statements:
                            if isinstance(statement, dict):
                                effect = statement.get('Effect', '')
                                actions = statement.get('Action', [])
                                resources = statement.get('Resource', [])

                                # Check for wildcard permissions
                                if effect == 'Allow':
                                    if actions == '*' or (isinstance(actions, list) and '*' in actions):
                                        is_over_privileged = True
                                        risk_factors.append('Wildcard action permissions')

                                    if resources == '*' or (isinstance(resources, list) and '*' in resources):
                                        is_over_privileged = True
                                        risk_factors.append('Wildcard resource permissions')

                                    # Check for admin privileges
                                    if isinstance(actions, str) and actions.startswith('*'):
                                        is_over_privileged = True
                                        risk_factors.append('Admin-level permissions')
                                    elif isinstance(actions, list):
                                        for action in actions:
                                            if action == '*' or action.endswith(':*'):
                                                is_over_privileged = True
                                                risk_factors.append('Admin-level permissions')

                        if is_over_privileged:
                            over_privileged_count += 1

                        policy_analysis = {
                            'policy_name': policy_name,
                            'policy_arn': policy_arn,
                            'default_version': default_version,
                            'is_over_privileged': is_over_privileged,
                            'risk_factors': risk_factors,
                            'compliance_status': 'non_compliant' if is_over_privileged else 'compliant'
                        }

                        policies.append(policy_analysis)

                    except ClientError as e:
                        logger.error(f"Error analyzing policy {policy_name}: {str(e)}")
                        policies.append({
                            'policy_name': policy_name,
                            'policy_arn': policy_arn,
                            'default_version': default_version,
                            'is_over_privileged': False,
                            'risk_factors': [],
                            'compliance_status': 'error',
                            'error_message': str(e)
                        })

            # Calculate compliance metrics
            total_policies = len(policies)
            compliance_rate = ((total_policies - over_privileged_count) / total_policies * 100) if total_policies > 0 else 100.0

            evidence = {
                'evidence_type': 'iam_policy',
                'collection_timestamp': datetime.utcnow().isoformat() + 'Z',
                'total_policies': total_policies,
                'over_privileged_policies': over_privileged_count,
                'policy_analysis': policies,
                'compliance_rate': round(compliance_rate, 2),
                'aws_region': self.region_name,
                'soc2_criteria': [
                    'CC6.1 - Logical and Physical Access Controls',
                    'CC6.2 - User Access Management',
                    'CC6.3 - User Access Revocation'
                ]
            }

            logger.info(f"IAM policy evidence collected: {total_policies - over_privileged_count}/{total_policies} policies compliant")
            return evidence

        except ClientError as e:
            error_msg = f"Failed to retrieve IAM policies: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Unexpected error collecting IAM policy evidence: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)