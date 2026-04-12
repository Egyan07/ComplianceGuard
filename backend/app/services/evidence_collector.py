"""
Evidence Collection Service

Orchestrates evidence collection from multiple sources for SOC 2 compliance monitoring.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import logging
from app.integrations.aws import AWSEvidenceCollector

logger = logging.getLogger(__name__)


class EvidenceCollectionService:
    """
    Service for collecting compliance evidence from various sources

    Coordinates evidence collection from:
    - AWS services (S3, IAM)
    - Other cloud providers (future)
    - Internal systems (future)
    """

    def __init__(self):
        """Initialize the Evidence Collection Service"""
        self.collection_timestamp = datetime.now(timezone.utc)
        logger.info("Evidence Collection Service initialized")

    def collect_all_evidence(self,
                            aws_access_key_id: Optional[str] = None,
                            aws_secret_access_key: Optional[str] = None,
                            region_name: str = 'us-east-1') -> Dict[str, Any]:
        """
        Collect evidence from all configured sources

        Args:
            aws_access_key_id: AWS access key ID for evidence collection
            aws_secret_access_key: AWS secret access key for evidence collection
            region_name: AWS region for evidence collection

        Returns:
            Dict containing collected evidence from all sources

        Raises:
            Exception: If all evidence collection attempts fail
        """
        evidence_items = []
        failed_collections = []

        # Collect AWS evidence if credentials provided
        if aws_access_key_id and aws_secret_access_key:
            aws_evidence = self._collect_aws_evidence(
                aws_access_key_id, aws_secret_access_key, region_name
            )
            evidence_items.extend(aws_evidence['successful_collections'])
            failed_collections.extend(aws_evidence['failed_collections'])

        # Determine overall collection status
        if not evidence_items and failed_collections:
            error_msg = f"All evidence collection failed: {failed_collections}"
            logger.error(error_msg)
            raise Exception(f"All evidence collection failed: {len(failed_collections)} sources failed")

        collection_status = 'success' if not failed_collections else (
            'partial_failure' if evidence_items else 'failed'
        )

        evidence_bundle = {
            'collection_id': f"evidence_{self.collection_timestamp.strftime('%Y%m%d_%H%M%S')}",
            'collection_timestamp': self.collection_timestamp.isoformat() + 'Z',
            'collection_status': collection_status,
            'evidence_count': len(evidence_items),
            'evidence_items': evidence_items,
            'failed_collections': failed_collections,
            'summary': {
                'total_sources': len(evidence_items) + len(failed_collections),
                'successful_collections': len(evidence_items),
                'failed_collections': len(failed_collections)
            }
        }

        logger.info(f"Evidence collection completed: {collection_status}, "
                   f"{len(evidence_items)} successful, {len(failed_collections)} failed")

        return evidence_bundle

    def _collect_aws_evidence(self,
                            aws_access_key_id: str,
                            aws_secret_access_key: str,
                            region_name: str) -> Dict[str, List]:
        """
        Collect evidence from AWS services

        Args:
            aws_access_key_id: AWS access key ID
            aws_secret_access_key: AWS secret access key
            region_name: AWS region

        Returns:
            Dict containing successful and failed AWS evidence collections
        """
        successful_collections = []
        failed_collections = []

        try:
            # Initialize AWS collector
            aws_collector = AWSEvidenceCollector(
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                region_name=region_name
            )

            # Collect S3 encryption evidence
            try:
                s3_evidence = aws_collector.collect_s3_encryption_evidence()
                successful_collections.append(s3_evidence)
                logger.info("S3 encryption evidence collected successfully")
            except Exception as e:
                failed_collections.append({
                    'evidence_type': 's3_encryption',
                    'error': str(e),
                    'source': 'aws'
                })
                logger.error(f"Failed to collect S3 encryption evidence: {str(e)}")

            # Collect IAM policy evidence
            try:
                iam_evidence = aws_collector.collect_iam_policy_evidence()
                successful_collections.append(iam_evidence)
                logger.info("IAM policy evidence collected successfully")
            except Exception as e:
                failed_collections.append({
                    'evidence_type': 'iam_policy',
                    'error': str(e),
                    'source': 'aws'
                })
                logger.error(f"Failed to collect IAM policy evidence: {str(e)}")

        except Exception as e:
            # AWS client initialization failed
            failed_collections.extend([
                {
                    'evidence_type': 's3_encryption',
                    'error': f"AWS client initialization failed: {str(e)}",
                    'source': 'aws'
                },
                {
                    'evidence_type': 'iam_policy',
                    'error': f"AWS client initialization failed: {str(e)}",
                    'source': 'aws'
                }
            ])
            logger.error(f"Failed to initialize AWS evidence collector: {str(e)}")

        return {
            'successful_collections': successful_collections,
            'failed_collections': failed_collections
        }

    def get_evidence_summary(self, evidence_bundle: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate summary statistics for collected evidence

        Args:
            evidence_bundle: Evidence bundle from collect_all_evidence

        Returns:
            Dict containing evidence summary statistics
        """
        summary = {
            'total_evidence_items': len(evidence_bundle['evidence_items']),
            'evidence_types': {},
            'compliance_metrics': {},
            'collection_period': {
                'start_time': evidence_bundle['collection_timestamp'],
                'status': evidence_bundle['collection_status']
            }
        }

        # Analyze evidence types and compliance metrics
        for evidence in evidence_bundle['evidence_items']:
            evidence_type = evidence.get('evidence_type', 'unknown')

            # Count evidence types
            if evidence_type not in summary['evidence_types']:
                summary['evidence_types'][evidence_type] = 0
            summary['evidence_types'][evidence_type] += 1

            # Extract compliance metrics
            if evidence_type == 's3_encryption':
                summary['compliance_metrics']['s3_encryption_compliance_rate'] = (
                    evidence.get('encryption_compliance_rate', 0)
                )
                summary['compliance_metrics']['total_s3_buckets'] = (
                    evidence.get('total_buckets', 0)
                )
            elif evidence_type == 'iam_policy':
                summary['compliance_metrics']['iam_compliance_rate'] = (
                    evidence.get('compliance_rate', 0)
                )
                summary['compliance_metrics']['total_iam_policies'] = (
                    evidence.get('total_policies', 0)
                )
                summary['compliance_metrics']['over_privileged_policies'] = (
                    evidence.get('over_privileged_policies', 0)
                )

        return summary

    def validate_evidence_completeness(self, evidence_bundle: Dict[str, Any],
                                     required_types: List[str]) -> Dict[str, Any]:
        """
        Validate that required evidence types are present

        Args:
            evidence_bundle: Evidence bundle from collect_all_evidence
            required_types: List of required evidence types

        Returns:
            Dict containing validation results
        """
        present_types = []
        missing_types = []

        for evidence in evidence_bundle['evidence_items']:
            evidence_type = evidence.get('evidence_type')
            if evidence_type in required_types:
                present_types.append(evidence_type)

        for required_type in required_types:
            if required_type not in present_types:
                missing_types.append(required_type)

        validation_result = {
            'is_complete': len(missing_types) == 0,
            'present_types': list(set(present_types)),
            'missing_types': missing_types,
            'required_types': required_types
        }

        return validation_result