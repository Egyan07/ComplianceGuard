"""
Unit tests for evidence and evaluation models.

Covers EvidenceCollection, EvidenceItem, ComplianceEvaluationRecord,
and ControlAssessmentRecord model creation, relationships, and defaults.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.user import User
from app.models.evidence import EvidenceCollection, EvidenceItem
from app.models.evaluation import ComplianceEvaluationRecord, ControlAssessmentRecord
from app.core.auth import get_password_hash


# ─── DB setup ────────────────────────────────────────────────────────────────

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    session = TestSession()
    yield session
    session.close()


@pytest.fixture
def test_user(db):
    user = User(
        email="model@test.com",
        hashed_password=get_password_hash("Valid@pass1"),
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ─── EvidenceCollection ──────────────────────────────────────────────────────

class TestEvidenceCollection:

    def test_create_collection(self, db, test_user):
        col = EvidenceCollection(
            collection_id="col-001",
            user_id=test_user.id,
            status="success",
            evidence_count=5,
            failed_count=0,
        )
        db.add(col)
        db.commit()
        db.refresh(col)
        assert col.id is not None
        assert col.collection_id == "col-001"

    def test_default_status_is_in_progress(self, db, test_user):
        col = EvidenceCollection(
            collection_id="col-002",
            user_id=test_user.id,
        )
        db.add(col)
        db.commit()
        db.refresh(col)
        assert col.status == "in_progress"

    def test_collection_id_is_unique(self, db, test_user):
        col1 = EvidenceCollection(collection_id="col-dup", user_id=test_user.id)
        col2 = EvidenceCollection(collection_id="col-dup", user_id=test_user.id)
        db.add(col1)
        db.commit()
        db.add(col2)
        with pytest.raises(Exception):
            db.commit()

    def test_created_at_is_set(self, db, test_user):
        col = EvidenceCollection(collection_id="col-003", user_id=test_user.id)
        db.add(col)
        db.commit()
        db.refresh(col)
        assert col.created_at is not None

    def test_summary_json_stored(self, db, test_user):
        col = EvidenceCollection(
            collection_id="col-004",
            user_id=test_user.id,
            summary={"total": 10, "passed": 8}
        )
        db.add(col)
        db.commit()
        db.refresh(col)
        assert col.summary["total"] == 10


# ─── EvidenceItem ────────────────────────────────────────────────────────────

class TestEvidenceItem:

    @pytest.fixture
    def collection(self, db, test_user):
        col = EvidenceCollection(collection_id="col-items", user_id=test_user.id)
        db.add(col)
        db.commit()
        db.refresh(col)
        return col

    def test_create_item(self, db, collection):
        item = EvidenceItem(
            collection_id=collection.id,
            evidence_type="s3_encryption",
            source="aws",
            status="compliant",
            data={"bucket": "my-bucket", "encrypted": True}
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        assert item.id is not None
        assert item.evidence_type == "s3_encryption"

    def test_default_status_is_compliant(self, db, collection):
        item = EvidenceItem(
            collection_id=collection.id,
            evidence_type="event_logs",
            source="system",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        assert item.status == "compliant"

    def test_default_source_is_manual(self, db, collection):
        item = EvidenceItem(
            collection_id=collection.id,
            evidence_type="policy_doc",
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        assert item.source == "manual"

    def test_item_data_json_stored(self, db, collection):
        item = EvidenceItem(
            collection_id=collection.id,
            evidence_type="iam_policy",
            source="aws",
            data={"policy_count": 5, "compliant": True}
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        assert item.data["policy_count"] == 5

    def test_cascade_delete_items_with_collection(self, db, test_user):
        col = EvidenceCollection(collection_id="col-cascade", user_id=test_user.id)
        db.add(col)
        db.commit()
        db.refresh(col)

        item = EvidenceItem(
            collection_id=col.id,
            evidence_type="firewall",
            source="system",
        )
        db.add(item)
        db.commit()
        item_id = item.id

        db.delete(col)
        db.commit()

        assert db.query(EvidenceItem).filter(EvidenceItem.id == item_id).first() is None

    def test_multiple_items_per_collection(self, db, collection):
        for i in range(5):
            db.add(EvidenceItem(
                collection_id=collection.id,
                evidence_type=f"type_{i}",
                source="system",
            ))
        db.commit()
        db.refresh(collection)
        assert len(collection.items) == 5


# ─── ComplianceEvaluationRecord ──────────────────────────────────────────────

class TestComplianceEvaluationRecord:

    def test_create_evaluation_record(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-001",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.85,
            compliance_status="compliant",
            compliance_level="good",
            evaluated_by="test",
            control_count=29,
            compliant_controls=25,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        assert record.id is not None
        assert record.overall_score == 0.85

    def test_evaluation_id_is_unique(self, db, test_user):
        r1 = ComplianceEvaluationRecord(
            evaluation_id="eval-dup",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.5,
            compliance_status="non_compliant",
            compliance_level="partial",
            evaluated_by="test",
        )
        r2 = ComplianceEvaluationRecord(
            evaluation_id="eval-dup",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.6,
            compliance_status="partially_compliant",
            compliance_level="adequate",
            evaluated_by="test",
        )
        db.add(r1)
        db.commit()
        db.add(r2)
        with pytest.raises(Exception):
            db.commit()

    def test_scope_stored_as_json(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-scope",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.7,
            compliance_status="partially_compliant",
            compliance_level="adequate",
            evaluated_by="test",
            scope=["CC", "A", "C"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        assert "CC" in record.scope

    def test_recommendations_stored_as_json(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-recs",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.5,
            compliance_status="non_compliant",
            compliance_level="partial",
            evaluated_by="test",
            recommendations=["Fix CC6.1", "Add MFA"],
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        assert "Fix CC6.1" in record.recommendations

    def test_created_at_is_set(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-ts",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.9,
            compliance_status="compliant",
            compliance_level="excellent",
            evaluated_by="test",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        assert record.created_at is not None


# ─── ControlAssessmentRecord ─────────────────────────────────────────────────

class TestControlAssessmentRecord:

    @pytest.fixture
    def eval_record(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-ctrl",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.8,
            compliance_status="compliant",
            compliance_level="good",
            evaluated_by="test",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    def test_create_control_assessment(self, db, eval_record):
        assessment = ControlAssessmentRecord(
            evaluation_id=eval_record.id,
            control_id="CC6.1",
            status="compliant",
            score=0.95,
            evidence_provided=["e1", "e2"],
            gaps=[],
            recommendations=[],
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        assert assessment.id is not None
        assert assessment.control_id == "CC6.1"

    def test_default_status_is_not_evaluated(self, db, eval_record):
        assessment = ControlAssessmentRecord(
            evaluation_id=eval_record.id,
            control_id="CC6.2",
            score=0.0,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        assert assessment.status == "not_evaluated"

    def test_gaps_stored_as_json(self, db, eval_record):
        assessment = ControlAssessmentRecord(
            evaluation_id=eval_record.id,
            control_id="CC6.3",
            status="non_compliant",
            score=0.2,
            gaps=["Missing MFA policy", "No audit logs"],
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        assert "Missing MFA policy" in assessment.gaps

    def test_cascade_delete_assessments_with_evaluation(self, db, test_user):
        record = ComplianceEvaluationRecord(
            evaluation_id="eval-del",
            framework_id="soc2_v2017",
            user_id=test_user.id,
            overall_score=0.5,
            compliance_status="non_compliant",
            compliance_level="partial",
            evaluated_by="test",
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        assessment = ControlAssessmentRecord(
            evaluation_id=record.id,
            control_id="CC1.1",
            status="compliant",
            score=1.0,
        )
        db.add(assessment)
        db.commit()
        assessment_id = assessment.id

        db.delete(record)
        db.commit()

        assert db.query(ControlAssessmentRecord).filter(
            ControlAssessmentRecord.id == assessment_id
        ).first() is None

    def test_multiple_assessments_per_evaluation(self, db, eval_record):
        for control_id in ["CC1.1", "CC1.2", "CC2.1", "A1.1", "C1.1"]:
            db.add(ControlAssessmentRecord(
                evaluation_id=eval_record.id,
                control_id=control_id,
                status="compliant",
                score=0.9,
            ))
        db.commit()
        db.refresh(eval_record)
        assert len(eval_record.assessments) == 5
