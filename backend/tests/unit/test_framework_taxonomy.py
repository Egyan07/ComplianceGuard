"""
Golden taxonomy tests for the canonical framework definitions.

These tests lock the REAL 2017 Trust Services Criteria structure into CI: the
exact control-ID sets, category membership, framework metadata, and the absence
of fabricated IDs. The old taxonomy contained invented controls (A1.4+, A2.x,
A3.x, C1.3+, C2.x, C3.x, PI2.x, PI3.x and an entire "Confidentiality &
Availability (CA)" category) and was missing real criteria (CC1.4, CC1.5,
CC3.4, CC5.3, CC6.4-CC6.8, CC7.2-CC7.5, CC9.2).

Fix on failure: the canonical definition is shared/frameworks/soc2_controls.yaml.
If a legitimate criterion is missing, add it there — do not loosen these
assertions.
"""
import json
import os
import re

import pytest
import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_SHARED_DIR = os.path.join(_REPO_ROOT, "shared", "frameworks")


def _load_soc2():
    with open(os.path.join(_SHARED_DIR, "soc2_controls.yaml"), "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _load_yaml(name):
    with open(os.path.join(_SHARED_DIR, name), "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _soc2_ids_by_category(data):
    ids = {}
    for control in data["controls"]:
        ids.setdefault(control["category"], []).append(control["id"])
    return ids


# The real 2017 TSC (with 2022 revised points of focus). Security (CC) is the
# mandatory core; A/C/PI are category-specific supplemental criteria.
EXPECTED_CC = [f"CC1.{i}" for i in range(1, 6)] + \
              [f"CC2.{i}" for i in range(1, 4)] + \
              [f"CC3.{i}" for i in range(1, 5)] + \
              ["CC4.1", "CC4.2"] + \
              [f"CC5.{i}" for i in range(1, 4)] + \
              [f"CC6.{i}" for i in range(1, 9)] + \
              [f"CC7.{i}" for i in range(1, 6)] + \
              ["CC8.1", "CC9.1", "CC9.2"]
EXPECTED_A = ["A1.1", "A1.2", "A1.3"]
EXPECTED_C = ["C1.1", "C1.2"]
EXPECTED_PI = [f"PI1.{i}" for i in range(1, 6)]


class TestSoc2GoldenTaxonomy:
    def test_framework_metadata(self):
        data = _load_soc2()
        meta = data["framework"]
        assert meta["id"] == "soc2_v2017"
        assert meta["version"] == "2017"

    def test_exact_cc_criteria(self):
        data = _load_soc2()
        assert sorted(_soc2_ids_by_category(data)["CC"]) == sorted(EXPECTED_CC)

    def test_exact_availability_criteria(self):
        data = _load_soc2()
        assert sorted(_soc2_ids_by_category(data)["A"]) == sorted(EXPECTED_A)

    def test_exact_confidentiality_criteria(self):
        data = _load_soc2()
        assert sorted(_soc2_ids_by_category(data)["C"]) == sorted(EXPECTED_C)

    def test_exact_processing_integrity_criteria(self):
        data = _load_soc2()
        assert sorted(_soc2_ids_by_category(data)["PI"]) == sorted(EXPECTED_PI)

    def test_no_fabricated_categories(self):
        data = _load_soc2()
        categories = set(_soc2_ids_by_category(data).keys())
        # "CA" (Confidentiality & Availability) does not exist in the TSC.
        assert categories == {"CC", "A", "C", "PI"}

    def test_no_fabricated_control_ids(self):
        data = _load_soc2()
        ids = {c["id"] for c in data["controls"]}
        for fabricated in ["A1.4", "A1.5", "A2.1", "A2.2", "A3.1", "A3.2",
                           "C1.3", "C2.1", "C3.2", "PI2.1", "PI3.2", "CA1.1"]:
            assert fabricated not in ids, f"fabricated ID {fabricated} must not reappear"

    def test_no_duplicate_ids(self):
        data = _load_soc2()
        ids = [c["id"] for c in data["controls"]]
        assert len(ids) == len(set(ids))

    def test_total_count(self):
        data = _load_soc2()
        assert len(data["controls"]) == 43  # 33 CC + 3 A + 2 C + 5 PI

    def test_required_evidence_uses_canonical_vocabulary(self):
        """Every required_evidence entry must exist in the canonical vocabulary
        (directly or as a legacy alias) — otherwise the scoring engine can
        never satisfy the criterion."""
        with open(os.path.join(_SHARED_DIR, "evidence-vocabulary.json"), "r", encoding="utf-8") as fh:
            vocab = json.load(fh)
        canonical = {t["type"] for t in vocab["canonical_types"]}
        aliases = {a for t in vocab["canonical_types"] for a in t.get("legacy_aliases", [])}
        data = _load_soc2()
        for control in data["controls"]:
            for evidence_type in control.get("required_evidence", []):
                assert evidence_type in canonical | aliases, (
                    f"{control['id']} requires '{evidence_type}', which is not in "
                    f"the canonical evidence vocabulary"
                )

    def test_assessment_mode_vocabulary(self):
        """assessment_mode must be one of the three ratified modes."""
        data = _load_soc2()
        for control in data["controls"]:
            mode = control.get("assessment_mode", "manual_upload")
            assert mode in {"automatable", "hybrid", "manual_upload"}, (
                f"{control['id']} has invalid assessment_mode: {mode}"
            )

    def test_automatable_controls_require_only_collector_produced_types(self):
        """A control marked automatable must be fully satisfiable by
        collector-produced evidence — that is what 'automatable' promises."""
        with open(os.path.join(_SHARED_DIR, "evidence-vocabulary.json"), "r", encoding="utf-8") as fh:
            vocab = json.load(fh)
        collector_types = {
            t["type"] for t in vocab["canonical_types"]
            if any(p.endswith("_collector") for p in t.get("producers", []))
        }
        data = _load_soc2()
        for control in data["controls"]:
            if control.get("assessment_mode") == "automatable":
                assert set(control["required_evidence"]) <= collector_types, (
                    f"{control['id']} is automatable but requires manual-only types: "
                    f"{set(control['required_evidence']) - collector_types}"
                )

    def test_manual_upload_controls_cannot_be_satisfied_by_collector_evidence(self):
        """THE honesty invariant: a manual_upload control must require at least
        one type that no endpoint collector can produce. Endpoint telemetry
        alone must never mark an organizational criterion compliant."""
        with open(os.path.join(_SHARED_DIR, "evidence-vocabulary.json"), "r", encoding="utf-8") as fh:
            vocab = json.load(fh)
        collector_types = {
            t["type"] for t in vocab["canonical_types"]
            if any(p.endswith("_collector") for p in t.get("producers", []))
        }
        data = _load_soc2()
        for control in data["controls"]:
            if control.get("assessment_mode") == "manual_upload":
                required = set(control.get("required_evidence", []))
                assert required, f"{control['id']} manual_upload must have requirements"
                assert not required <= collector_types, (
                    f"{control['id']} is manual_upload but every required type "
                    f"({sorted(required)}) is collector-produced — endpoint "
                    f"evidence alone would mark it compliant"
                )


class TestIsoGoldenTaxonomy:
    """ISO 27001 taxonomy invariants — tightened in the 2022 migration phase."""

    def test_iso_framework_id_is_current(self):
        with open(os.path.join(_SHARED_DIR, "iso27001_controls.yaml"), "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        meta = data["framework"]
        # ISO/IEC 27001:2013 is withdrawn (transition ended 2025-10-31); the
        # canonical definition must target 2022. The 2013 definition survives
        # only as the archived historical file for rendering old evaluations.
        assert meta["id"] == "iso27001_v2022"
        assert meta["version"] == "2022"

    def test_iso_annex_a_structure(self):
        with open(os.path.join(_SHARED_DIR, "iso27001_controls.yaml"), "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        ids = [c["id"] for c in data["controls"]]
        assert len(ids) == 93
        categories = {c["category"] for c in data["controls"]}
        assert categories == {"A.5", "A.6", "A.7", "A.8"}
        # No duplicate IDs.
        assert len(ids) == len(set(ids))


class TestGeneratedCatalogConsistency:
    """The generated frontend catalog must match the canonical YAML exactly."""

    def test_catalog_matches_canonical_soc2(self):
        data = _load_soc2()
        yaml_ids = sorted(c["id"] for c in data["controls"])
        catalog_path = os.path.join(
            _REPO_ROOT, "frontend", "src", "components", "evidenceCatalog.generated.ts"
        )
        with open(catalog_path, "r", encoding="utf-8") as fh:
            text = fh.read()
        # The catalog is generated per framework (SOC 2, ISO, HIPAA, GDPR).
        # Slice out the SOC 2 block (from its const declaration up to the next
        # framework's) so ids from the other frameworks don't pollute the set.
        match = re.search(
            r'export const SOC2_CONTROLS: FrameworkControlOption\[\] = \[(.*?)\n\];',
            text,
            re.DOTALL,
        )
        assert match, "evidenceCatalog.generated.ts is missing the SOC2_CONTROLS block"
        catalog_ids = sorted(re.findall(r'\{ id: "([^"]+)"', match.group(1)))
        assert catalog_ids == yaml_ids, (
            "evidenceCatalog.generated.ts is stale — regenerate with "
            "`npm run generate:evidence`"
        )

    def test_catalog_matches_every_canonical_framework(self):
        """Drift guard for ALL four per-framework catalog blocks, not just SOC 2."""
        catalog_path = os.path.join(
            _REPO_ROOT, "frontend", "src", "components", "evidenceCatalog.generated.ts"
        )
        with open(catalog_path, "r", encoding="utf-8") as fh:
            text = fh.read()
        expected = {
            "SOC2_CONTROLS": sorted(c["id"] for c in _load_soc2()["controls"]),
            "ISO27001_CONTROLS": sorted(
                c["id"] for c in _load_yaml("iso27001_controls.yaml")["controls"]
            ),
            "HIPAA_CONTROLS": sorted(
                c["id"] for c in _load_yaml("hipaa_controls.yaml")["controls"]
            ),
            "GDPR_CONTROLS": sorted(
                c["id"] for c in _load_yaml("gdpr_controls.yaml")["controls"]
            ),
        }
        for const_name, yaml_ids in expected.items():
            match = re.search(
                rf'export const {const_name}: FrameworkControlOption\[\] = \[(.*?)\n\];',
                text,
                re.DOTALL,
            )
            assert match, f"evidenceCatalog.generated.ts is missing the {const_name} block"
            catalog_ids = sorted(re.findall(r'\{ id: "([^"]+)"', match.group(1)))
            assert catalog_ids == yaml_ids, (
                f"{const_name} in evidenceCatalog.generated.ts is stale — "
                "regenerate with `npm run generate:evidence`"
            )
