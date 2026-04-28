"""
T2 — ManifestCache keys must be scoped to org_id so cross-tenant leakage is impossible.
"""
import pytest

from app.mcp_gateway.cache import _cache_key


def test_different_orgs_produce_different_cache_keys():
    k1 = _cache_key("org-A", "reg-1", "hash-x")
    k2 = _cache_key("org-B", "reg-1", "hash-x")
    assert k1 != k2


def test_different_reg_ids_produce_different_keys():
    k1 = _cache_key("org-A", "reg-1", "hash-x")
    k2 = _cache_key("org-A", "reg-2", "hash-x")
    assert k1 != k2


def test_different_cred_hashes_produce_different_keys():
    k1 = _cache_key("org-A", "reg-1", "hash-x")
    k2 = _cache_key("org-A", "reg-1", "hash-y")
    assert k1 != k2


def test_cache_key_format_contains_all_parts():
    k = _cache_key("my-org", "my-reg", "my-hash")
    assert "my-org" in k
    assert "my-reg" in k
    assert "my-hash" in k
    assert k.startswith("mcp:manifest:")
