"""
Location of the canonical shared framework definitions.

shared/frameworks/ is the single source of truth for all framework control
definitions and the evidence vocabulary. The engines, the browse loaders, and
the generated evidence catalog all read from it.

Deployment layouts (there is no fixed number of parent hops between this
package and the repository root):
  - host/repository checkout:  <root>/backend/app/core/  -> <root>/shared/frameworks/
  - Docker image / bind mount: /app/app/core/            -> /app/shared/frameworks/

So instead of walking a fixed depth, search upward from this directory until a
candidate parent contains shared/frameworks/evidence-vocabulary.json (a file
present only in the real canonical directory, not in any test fixture).
"""

import os

_FRAMEWORKS_DIR_NAME = os.path.join("shared", "frameworks")
# Marker inside shared/frameworks/: present in the canonical directory itself,
# so a candidate is only accepted if the real data is there.
_MARKER_FILE = "evidence-vocabulary.json"


def find_shared_frameworks_dir(start_dir: str = None) -> str:
    """Return the absolute path of the canonical shared/frameworks directory.

    Walks upward from ``start_dir`` (default: this package's directory) and
    accepts the first ancestor containing shared/frameworks/ with the marker
    file. Works unchanged for the repository checkout, the Docker image layout
    (/app/app/core -> /app/shared), and future re-arrangements of either.

    Raises FileNotFoundError with an actionable message if no ancestor
    qualifies — callers surface this at startup instead of crashing later on
    a missing YAML.
    """
    current = os.path.abspath(start_dir or os.path.dirname(__file__))
    while True:
        candidate = os.path.join(current, _FRAMEWORKS_DIR_NAME)
        if os.path.isfile(os.path.join(candidate, _MARKER_FILE)):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:  # reached the filesystem root without a match
            break
        current = parent
    raise FileNotFoundError(
        f"Canonical framework definitions not found: searched upward from "
        f"{os.path.abspath(start_dir or os.path.dirname(__file__))} for a "
        f"directory containing {_FRAMEWORKS_DIR_NAME}/{_MARKER_FILE}. The "
        f"shared/frameworks/ source of truth must ship with the application."
    )


# Resolved once at import time; every consumer imports from here.
SHARED_FRAMEWORKS_DIR = find_shared_frameworks_dir()
