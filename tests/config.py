"""Test harness configuration for the OpenAPI detection pipeline.

Every magic number must have a provenance comment:
    # Provenance: <how derived>, <date>, <fixture or method>

Constants that require a measurement run to derive use _PendingMeasurement.
Accessing such a constant raises NotImplementedError with a clear instruction.
"""
from __future__ import annotations


# ── Sentinel for un-measured thresholds ───────────────────────────────────────

class _PendingMeasurement:
    """Raises NotImplementedError on any use until replaced with a real value.

    Assign this to a constant that cannot be determined without running
    scripts/refresh_fixtures.py or an eval measurement pass.
    """

    def __init__(self, name: str, how_to_measure: str) -> None:
        self._name = name
        self._msg = (
            f"{name} has not been measured yet.\n"
            f"To fix: {how_to_measure}"
        )

    def _raise(self) -> None:
        raise NotImplementedError(self._msg)

    def __repr__(self) -> str:  # noqa: D105
        self._raise()

    def __eq__(self, other: object) -> bool:  # noqa: D105
        self._raise()

    def __lt__(self, other: object) -> bool:  # noqa: D105
        self._raise()

    def __gt__(self, other: object) -> bool:  # noqa: D105
        self._raise()

    def __le__(self, other: object) -> bool:  # noqa: D105
        self._raise()

    def __ge__(self, other: object) -> bool:  # noqa: D105
        self._raise()

    def __float__(self) -> float:  # noqa: D105
        self._raise()

    def __int__(self) -> int:  # noqa: D105
        self._raise()

    def __bool__(self) -> bool:  # noqa: D105
        self._raise()

    def __hash__(self) -> int:  # noqa: D105
        self._raise()


# ── Baseline-derived constants ─────────────────────────────────────────────────
# These must be populated from tests/fixtures/baselines/petstore-v3.json.baseline.json
# after running scripts/refresh_fixtures.py for the first time.

# Provenance: scripts/refresh_fixtures.py, 2026-05-01, petstore-v3.json from petstore3.swagger.io
EXPECTED_PETSTORE_V3_TOOLS: int = 19

# Provenance: scripts/refresh_fixtures.py, 2026-05-01, petstore-v3.json from petstore3.swagger.io
EXPECTED_PETSTORE_V3_OPERATION_IDS: set[str] = {
    "add_pet",
    "create_user",
    "create_users_with_list_input",
    "delete_order",
    "delete_pet",
    "delete_user",
    "find_pets_by_status",
    "find_pets_by_tags",
    "get_inventory",
    "get_order_by_id",
    "get_pet_by_id",
    "get_user_by_name",
    "login_user",
    "logout_user",
    "place_order",
    "update_pet",
    "update_pet_with_form",
    "update_user",
    "upload_file",
}

# ── Tolerance constants ────────────────────────────────────────────────────────

# Provenance: chosen policy — allows one operation added/removed by upstream without
#             forcing a fixture refresh on every minor API update.
PARSING_TOOL_COUNT_TOLERANCE: int = 1

# Provenance: chosen policy — allows small parameter count churn per category.
#             Set conservatively to avoid masking real regressions.
PARAM_BREAKDOWN_TOLERANCE: dict[str, int] = {
    "path": 2,
    "query": 5,
    "header": 2,
    "cookie": 1,
    "body": 3,
}

# ── Eval thresholds (require a measurement run) ────────────────────────────────

# Provenance: NOT YET MEASURED — run tests/eval/test_semantic_collision.py once,
#             record the cosine distance distribution, and set the floor here.
MIN_COSINE_DISTANCE_POST_ENHANCEMENT: float | _PendingMeasurement = _PendingMeasurement(
    "MIN_COSINE_DISTANCE_POST_ENHANCEMENT",
    "Run tests/eval/test_semantic_collision.py and note the minimum cosine distance "
    "between distinct tool embeddings post-enhancement. Set this constant to that value.",
)

# Provenance: NOT YET MEASURED — calibrate recall@1 on petstore + github/stripe fixtures
#             first, then set a floor that's clearly below a working system.
RECALL_AT_1_THRESHOLD: float | _PendingMeasurement = _PendingMeasurement(
    "RECALL_AT_1_THRESHOLD",
    "Run tests/eval/test_semantic_collision.py with the github-api and stripe-api "
    "fixtures, record recall@1, and set this to 0.8× that value as the floor.",
)

# Provenance: NOT YET MEASURED — same calibration run as RECALL_AT_1_THRESHOLD.
RECALL_AT_5_THRESHOLD: float | _PendingMeasurement = _PendingMeasurement(
    "RECALL_AT_5_THRESHOLD",
    "Run tests/eval/test_semantic_collision.py with the github-api and stripe-api "
    "fixtures, record recall@5, and set this to 0.9× that value as the floor.",
)

# ── Held-out spec scoping ──────────────────────────────────────────────────────

# Provenance: design decision — one held-out spec for v1 to avoid overfitting the
#             harness to memorised training examples.
HELD_OUT_SPECS: list[str] = ["linode-api.json"]

# ── APIs-Guru sampling cap ─────────────────────────────────────────────────────

# Provenance: chosen policy — keeps eval runs under TOKEN_COST_CEILING_PER_RUN
#             while still exercising a broad distribution of real-world specs.
MAX_APIS_GURU_SAMPLES: int = 20

# ── Token budget ───────────────────────────────────────────────────────────────

# Provenance: chosen policy — $0.10 equivalent at typical Claude pricing;
#             enough for 20 specs × ~2 500 token description enhancement.
TOKEN_COST_CEILING_PER_RUN: int = 50_000

# ── Docker image pins ──────────────────────────────────────────────────────────

# Provenance: pinned 2026-05-01; do NOT change to 'latest' — unpinned images
#             cause non-deterministic invocation test failures.
PETSTORE_IMAGE: str = "swaggerapi/petstore3:unstable"

# Provenance: design decision — each integration test gets a fresh container to
#             prevent leaked state between idempotency-sensitive tests.
DOCKER_RESET_BETWEEN_TESTS: bool = True

# ── AI enhancement determinism ─────────────────────────────────────────────────

# Provenance: design decision — temperature 0 + fixed seed makes eval runs
#             reproducible across consecutive runs on the same model version.
AI_ENHANCEMENT_TEMPERATURE: float = 0.0
AI_ENHANCEMENT_SEED: int = 42
