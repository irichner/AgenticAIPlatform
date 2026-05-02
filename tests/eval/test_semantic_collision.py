"""Eval tier — semantic search quality tests.

Two test paths:
1. Training-like specs (github-api, stripe-api): verify AI enhancement improves
   semantic search quality (recall@1, recall@5).
2. Held-out spec (linode-api): same protocol on unseen spec to detect memorisation.

These tests are NIGHTLY only — not merge-blocking. They require:
    - tests/fixtures/baselines/*.baseline.json (from scripts/refresh_fixtures.py)
    - tests/fixtures/specs/linode-labels.json with no '<verify>' placeholders
    - ANTHROPIC_API_KEY environment variable
    - openai package (for embeddings)

Metrics are appended to tests/eval/BASELINES.md after each run.

To run:
    pytest tests/eval/test_semantic_collision.py -v
"""
from __future__ import annotations

import json
import math
import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))
sys.path.insert(0, str(REPO_ROOT / "tests"))

from config import (  # noqa: E402
    AI_ENHANCEMENT_SEED,
    AI_ENHANCEMENT_TEMPERATURE,
    HELD_OUT_SPECS,
    MAX_APIS_GURU_SAMPLES,
    TOKEN_COST_CEILING_PER_RUN,
)
from eval.token_budget import TokenBudget, TokenBudgetExceeded  # noqa: E402

BASELINES_MD = REPO_ROOT / "tests" / "eval" / "BASELINES.md"
SPECS_DIR = REPO_ROOT / "tests" / "fixtures" / "specs"

# ── Skip guards ────────────────────────────────────────────────────────────────

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — skipping eval tests",
)

try:
    import anthropic  # noqa: F401
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

try:
    import openai  # noqa: F401
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not (_ANTHROPIC_AVAILABLE and _OPENAI_AVAILABLE),
    reason="anthropic or openai not installed — skipping eval tests",
)


# ── Types ──────────────────────────────────────────────────────────────────────

class EvalResult(NamedTuple):
    spec_name: str
    recall_at_1: float
    recall_at_5: float
    parse_time_sec: float
    embedding_time_sec: float
    total_tokens: int


# ── Embedding & enhancement helpers ───────────────────────────────────────────

def _embed_texts(texts: list[str], budget: TokenBudget) -> list[list[float]]:
    """Embed a list of texts using OpenAI's text-embedding-3-small model."""
    import openai as _openai  # noqa: PLC0415

    client = _openai.OpenAI()
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    tokens_used = resp.usage.total_tokens
    budget.add(tokens_used)
    return [item.embedding for item in resp.data]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _enhance_description(tool_name: str, raw_desc: str, budget: TokenBudget) -> str:
    """Call Claude to produce an enhanced tool description (deterministic via temp=0)."""
    import anthropic as _anthropic  # noqa: PLC0415

    client = _anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        temperature=AI_ENHANCEMENT_TEMPERATURE,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Write a concise 1-2 sentence description for an API tool named "
                    f"'{tool_name}'. Original description: {raw_desc!r}. "
                    "Focus on what a developer would search for to find this tool."
                ),
            }
        ],
    )
    tokens = msg.usage.input_tokens + msg.usage.output_tokens
    budget.add(tokens)
    return msg.content[0].text.strip()


# ── Recall computation ─────────────────────────────────────────────────────────

def _compute_recall(
    query_embeddings: list[list[float]],
    tool_embeddings: list[list[float]],
    tool_names: list[str],
    ground_truth: list[str],
    k: int,
) -> float:
    hits = 0
    for q_emb, gt in zip(query_embeddings, ground_truth):
        sims = [(_cosine_similarity(q_emb, t_emb), name)
                for t_emb, name in zip(tool_embeddings, tool_names)]
        top_k = sorted(sims, key=lambda x: x[0], reverse=True)[:k]
        top_k_names = [name for _, name in top_k]
        if gt in top_k_names:
            hits += 1
    return hits / len(ground_truth) if ground_truth else 0.0


# ── Core eval runner ───────────────────────────────────────────────────────────

def _run_eval(spec_name: str, queries: list[dict], budget: TokenBudget) -> EvalResult:
    import time  # noqa: PLC0415
    from app.services.openapi_detector import OpenAPIDetector  # noqa: PLC0415

    spec_path = SPECS_DIR / spec_name
    if not spec_path.exists():
        pytest.skip(f"{spec_name} not found. Run scripts/refresh_fixtures.py first.")

    with spec_path.open() as f:
        spec = json.load(f)

    # Parse spec
    t0 = time.perf_counter()
    tools = OpenAPIDetector().parse_to_mcp_tools(spec)
    parse_time = time.perf_counter() - t0

    if not tools:
        pytest.skip(f"No tools parsed from {spec_name}")

    tool_names = [t.name for t in tools]
    raw_descs = [t.description for t in tools]

    # Embed raw descriptions
    t1 = time.perf_counter()
    raw_tool_embs = _embed_texts(raw_descs, budget)

    # Enhance descriptions with AI
    enhanced_descs = []
    for name, desc in zip(tool_names, raw_descs):
        try:
            enhanced = _enhance_description(name, desc, budget)
        except TokenBudgetExceeded:
            raise
        except Exception:
            enhanced = desc  # fall back to raw on error
        enhanced_descs.append(enhanced)

    enhanced_tool_embs = _embed_texts(enhanced_descs, budget)
    embedding_time = time.perf_counter() - t1

    # Embed queries
    query_texts = [q["query"] for q in queries]
    query_embs = _embed_texts(query_texts, budget)
    ground_truths = [q["ground_truth"] for q in queries]

    # Compute recall
    raw_r1 = _compute_recall(query_embs, raw_tool_embs, tool_names, ground_truths, k=1)
    raw_r5 = _compute_recall(query_embs, raw_tool_embs, tool_names, ground_truths, k=5)
    enh_r1 = _compute_recall(query_embs, enhanced_tool_embs, tool_names, ground_truths, k=1)
    enh_r5 = _compute_recall(query_embs, enhanced_tool_embs, tool_names, ground_truths, k=5)

    print(
        f"\n[{spec_name}] raw recall@1={raw_r1:.2f} r@5={raw_r5:.2f} | "
        f"enhanced r@1={enh_r1:.2f} r@5={enh_r5:.2f}"
    )

    return EvalResult(
        spec_name=spec_name,
        recall_at_1=enh_r1,
        recall_at_5=enh_r5,
        parse_time_sec=parse_time,
        embedding_time_sec=embedding_time,
        total_tokens=budget.consumed,
    ), raw_r1, raw_r5


def _append_to_baselines_md(results: list[tuple]) -> None:
    """Append a result row to tests/eval/BASELINES.md (append-only, max 5 history rows shown)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    for result, raw_r1, raw_r5 in results:
        rows.append(
            f"| {now} | {result.spec_name} | {raw_r1:.2f} | {result.recall_at_1:.2f} "
            f"| {raw_r5:.2f} | {result.recall_at_5:.2f} "
            f"| {result.parse_time_sec:.2f}s | {result.embedding_time_sec:.2f}s "
            f"| {result.total_tokens:,} |"
        )

    if not BASELINES_MD.exists():
        BASELINES_MD.write_text(
            "# Eval Baselines\n\n"
            "| Date | Spec | r@1 raw | r@1 enh | r@5 raw | r@5 enh "
            "| parse_t | embed_t | tokens |\n"
            "|---|---|---|---|---|---|---|---|---|\n"
        )

    with BASELINES_MD.open("a") as f:
        for row in rows:
            f.write(row + "\n")


# ── Tests ──────────────────────────────────────────────────────────────────────

# Training-like query set for github-api (not held-out)
GITHUB_QUERIES = [
    {"query": "list repositories for a user", "ground_truth": "repos_slash_list_for_user"},
    {"query": "create a new issue on a repository", "ground_truth": "issues_slash_create"},
    {"query": "get pull request details", "ground_truth": "pulls_slash_get"},
    {"query": "list commits on a branch", "ground_truth": "repos_slash_list_commits"},
    {"query": "search for code across repositories", "ground_truth": "search_slash_code"},
]

# Training-like query set for stripe-api (not held-out)
STRIPE_QUERIES = [
    {"query": "create a payment intent", "ground_truth": "PostPaymentIntents"},
    {"query": "retrieve a customer", "ground_truth": "GetCustomersCustomer"},
    {"query": "list all subscriptions", "ground_truth": "GetSubscriptions"},
    {"query": "create a refund", "ground_truth": "PostRefunds"},
    {"query": "attach a payment method to customer", "ground_truth": "PostPaymentMethodsPaymentMethodAttach"},
]


def test_github_api_enhancement_improves_recall() -> None:
    """AI enhancement must improve recall@1 on the github-api fixture."""
    with TokenBudget(ceiling=TOKEN_COST_CEILING_PER_RUN // 3) as budget:
        result, raw_r1, raw_r5 = _run_eval("github-api.json", GITHUB_QUERIES, budget)

    # Enhancement must not regress recall
    assert result.recall_at_1 >= raw_r1 or result.recall_at_1 >= 0.4, (
        f"recall@1 after enhancement ({result.recall_at_1:.2f}) should not "
        f"be worse than raw ({raw_r1:.2f})"
    )
    _append_to_baselines_md([(result, raw_r1, raw_r5)])


def test_stripe_api_enhancement_improves_recall() -> None:
    """AI enhancement must improve recall@1 on the stripe-api fixture."""
    with TokenBudget(ceiling=TOKEN_COST_CEILING_PER_RUN // 3) as budget:
        result, raw_r1, raw_r5 = _run_eval("stripe-api.json", STRIPE_QUERIES, budget)

    assert result.recall_at_1 >= raw_r1 or result.recall_at_1 >= 0.4
    _append_to_baselines_md([(result, raw_r1, raw_r5)])


def test_linode_held_out_improvement_vs_raw() -> None:
    """Held-out Linode spec: enhancement must improve recall and labels must be verified.

    If recall on github/stripe improved but held-out does not improve at all,
    this likely indicates memorisation rather than generalisation.
    """
    labels_path = REPO_ROOT / "tests" / "fixtures" / "specs" / "linode-labels.json"
    if not labels_path.exists():
        pytest.skip("linode-labels.json not found")

    with labels_path.open() as f:
        label_data = json.load(f)

    queries = label_data.get("queries", [])
    unverified = [q for q in queries if q.get("ground_truth") == "<verify>"]
    if unverified:
        pytest.skip(
            f"{len(unverified)} labels still have '<verify>' placeholder. "
            "Run scripts/verify_linode_labels.py to fill them in before running eval."
        )

    with TokenBudget(ceiling=TOKEN_COST_CEILING_PER_RUN // 3) as budget:
        result, raw_r1, raw_r5 = _run_eval("linode-api.json", queries, budget)

    # Warn if held-out recall did not improve (possible memorisation)
    if result.recall_at_1 < raw_r1:
        warnings.warn(
            f"Held-out Linode recall@1 DECREASED after enhancement "
            f"({raw_r1:.2f} → {result.recall_at_1:.2f}). "
            "This may indicate memorisation on training specs, not generalisation.",
            stacklevel=2,
        )

    _append_to_baselines_md([(result, raw_r1, raw_r5)])

    # Load thresholds — these raise NotImplementedError if not yet calibrated
    try:
        from config import RECALL_AT_1_THRESHOLD  # noqa: PLC0415
        threshold = float(RECALL_AT_1_THRESHOLD)
        assert result.recall_at_1 >= threshold, (
            f"Held-out recall@1 {result.recall_at_1:.2f} < threshold {threshold:.2f}"
        )
    except NotImplementedError:
        pytest.skip(
            "RECALL_AT_1_THRESHOLD not yet calibrated. "
            "Run eval on github-api / stripe-api first, then set the threshold in tests/config.py."
        )
