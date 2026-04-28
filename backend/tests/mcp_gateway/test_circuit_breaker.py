"""
T8 — CircuitBreaker transitions: CLOSED → OPEN after threshold failures → HALF_OPEN → CLOSED.
"""
import time

import pytest

from app.mcp_gateway.client import CircuitBreaker


def test_circuit_starts_closed():
    cb = CircuitBreaker(threshold=3, reset_seconds=10)
    assert cb.state == CircuitBreaker.CLOSED
    assert cb.allow_request()


def test_circuit_opens_after_threshold_failures():
    cb = CircuitBreaker(threshold=3, reset_seconds=10)
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitBreaker.OPEN
    assert not cb.allow_request()


def test_circuit_half_opens_after_reset_window(monkeypatch):
    cb = CircuitBreaker(threshold=3, reset_seconds=1)
    for _ in range(3):
        cb.record_failure()

    # Simulate time passing
    monkeypatch.setattr(cb, "_opened_at", time.monotonic() - 2)
    assert cb.allow_request()
    assert cb.state == CircuitBreaker.HALF_OPEN


def test_circuit_closes_on_success_after_half_open(monkeypatch):
    cb = CircuitBreaker(threshold=3, reset_seconds=1)
    for _ in range(3):
        cb.record_failure()
    monkeypatch.setattr(cb, "_opened_at", time.monotonic() - 2)
    cb.allow_request()  # → HALF_OPEN

    cb.record_success()
    assert cb.state == CircuitBreaker.CLOSED
    assert cb.allow_request()


def test_circuit_does_not_open_before_threshold():
    cb = CircuitBreaker(threshold=5, reset_seconds=10)
    for _ in range(4):
        cb.record_failure()
    assert cb.state == CircuitBreaker.CLOSED
