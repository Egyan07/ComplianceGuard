"""
Batch runner for the canonical engine — used by the cross-engine equivalence
harness (electron/processing/canonical-equivalence.test.js).

Reads a JSON list of fixtures from argv (or stdin when piped), scores each
fixture across all four frameworks with the Python canonical engine, and
prints the results as JSON on stdout.

Usage:
    python scripts/canonical_batch.py '{"fixture_name": ["type", ...], ...}'
    (or pipe the JSON via stdin)

The fixtures are passed as the literal fixture list so the harness and this
script never disagree about what was tested.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.canonical_evidence import get_canonical_engine  # noqa: E402

FRAMEWORKS = ["soc2", "iso27001", "hipaa", "gdpr"]


def main() -> None:
    if len(sys.argv) > 1:
        fixtures = json.loads(sys.argv[1])
    else:
        fixtures = json.load(sys.stdin)

    engine = get_canonical_engine()
    results: dict = {}
    for name, types in fixtures.items():
        results[name] = {}
        for fw in FRAMEWORKS:
            ev = engine.evaluate(fw, types)
            results[name][fw] = {
                "overall_score": ev.overall_score,
                "status": ev.status,
                "counts": dict(ev.counts),
                "category_scores": ev.category_scores,
                "control_results": {
                    cid: {
                        "score": r.score,
                        "status": r.status,
                        "required_evidence": r.required_evidence,
                        "available_evidence": r.available_evidence,
                        "gaps": r.gaps,
                    }
                    for cid, r in ev.control_results.items()
                },
            }
    json.dump(results, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
