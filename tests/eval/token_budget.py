"""Token budget context manager for eval tier runs.

Wrap eval runs with TokenBudget to enforce a hard ceiling on LLM token usage
and emit a warning when approaching the limit.

Usage:
    from tests.eval.token_budget import TokenBudget, TokenBudgetExceeded

    with TokenBudget(ceiling=50_000) as budget:
        for spec in specs:
            tokens = call_ai_enhancement(spec)
            budget.add(tokens)
"""
from __future__ import annotations

import logging
import warnings

logger = logging.getLogger(__name__)


class TokenBudgetExceeded(Exception):
    """Raised when token consumption exceeds the configured ceiling."""

    def __init__(self, consumed: int, ceiling: int) -> None:
        super().__init__(
            f"Token budget exceeded: consumed {consumed:,} tokens "
            f"(ceiling {ceiling:,}). "
            "Reduce MAX_APIS_GURU_SAMPLES or increase TOKEN_COST_CEILING_PER_RUN."
        )
        self.consumed = consumed
        self.ceiling = ceiling


class TokenBudget:
    """Context manager that tracks token consumption and enforces a ceiling.

    Args:
        ceiling:        Hard maximum — raises TokenBudgetExceeded if exceeded.
        warn_threshold: Fraction of ceiling at which to log a warning (default 0.8).
    """

    def __init__(self, ceiling: int, warn_threshold: float = 0.8) -> None:
        if ceiling <= 0:
            raise ValueError(f"ceiling must be positive, got {ceiling}")
        if not (0.0 < warn_threshold < 1.0):
            raise ValueError(f"warn_threshold must be in (0, 1), got {warn_threshold}")
        self._ceiling = ceiling
        self._warn_threshold = warn_threshold
        self._consumed: int = 0
        self._warned: bool = False

    # ── Context manager ────────────────────────────────────────────────────────

    def __enter__(self) -> "TokenBudget":
        self._consumed = 0
        self._warned = False
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:  # type: ignore[override]
        pass  # Don't suppress exceptions; let them propagate normally.

    # ── API ────────────────────────────────────────────────────────────────────

    def add(self, tokens: int) -> None:
        """Record token consumption and enforce limits.

        Args:
            tokens: Number of tokens consumed by the most recent call.

        Raises:
            ValueError:          If tokens is negative.
            TokenBudgetExceeded: If total consumed now exceeds ceiling.
        """
        if tokens < 0:
            raise ValueError(f"tokens must be non-negative, got {tokens}")

        self._consumed += tokens

        warn_at = int(self._ceiling * self._warn_threshold)
        if not self._warned and self._consumed >= warn_at:
            self._warned = True
            logger.warning(
                "Token budget at %.0f%%: %d / %d tokens consumed.",
                100 * self._consumed / self._ceiling,
                self._consumed,
                self._ceiling,
            )
            warnings.warn(
                f"Token budget at {100 * self._consumed / self._ceiling:.0f}%: "
                f"{self._consumed:,} / {self._ceiling:,} tokens consumed.",
                stacklevel=2,
            )

        if self._consumed > self._ceiling:
            raise TokenBudgetExceeded(self._consumed, self._ceiling)

    @property
    def consumed(self) -> int:
        """Total tokens consumed so far."""
        return self._consumed

    @property
    def remaining(self) -> int:
        """Tokens remaining before the ceiling is reached."""
        return max(0, self._ceiling - self._consumed)

    @property
    def fraction_used(self) -> float:
        """Fraction of ceiling consumed (0.0–1.0+)."""
        return self._consumed / self._ceiling
