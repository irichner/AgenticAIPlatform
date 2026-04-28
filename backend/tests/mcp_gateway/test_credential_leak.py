"""
T1 — auth_config secrets must never appear in serialized RegistrationOut.
"""
import uuid

import pytest

from app.mcp_gateway.auth.api_key import ApiKeyAuth
from tests.mcp_gateway.conftest import make_reg


def test_api_key_redacted_hides_secret():
    reg = make_reg(
        auth_type="api_key",
        auth_config={"header": "Authorization", "value": "sk-supersecret", "prefix": "Bearer"},
    )
    handler = ApiKeyAuth()
    redacted = handler.redact(reg)
    assert redacted.get("value") == "***"
    assert "sk-supersecret" not in str(redacted)


def test_api_key_headers_contain_real_secret():
    reg = make_reg(
        auth_type="api_key",
        auth_config={"header": "Authorization", "value": "sk-supersecret", "prefix": "Bearer"},
    )
    handler = ApiKeyAuth()
    headers = handler.headers(reg)
    assert headers["Authorization"] == "Bearer sk-supersecret"


def test_redact_none_auth_config_returns_empty():
    reg = make_reg(auth_type="api_key", auth_config=None)
    reg.auth_config = None
    handler = ApiKeyAuth()
    result = handler.redact(reg)
    assert result == {}


def test_redact_does_not_mutate_original():
    reg = make_reg(
        auth_type="api_key",
        auth_config={"header": "X-API-Key", "value": "real-key"},
    )
    handler = ApiKeyAuth()
    handler.redact(reg)
    assert reg.auth_config["value"] == "real-key"


def test_identity_returns_credential_hash():
    reg = make_reg(auth_type="api_key", credential_hash="abc123")
    handler = ApiKeyAuth()
    assert handler.identity(reg) == "abc123"
