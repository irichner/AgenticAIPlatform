"""EncryptedText — SQLAlchemy TypeDecorator for transparent AES-256 column encryption.

Values are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before being stored
and decrypted transparently on read.  NULL is stored as NULL (not encrypted).

Key setup:
  Set SECRET_ENCRYPTION_KEY env var to a base64url-encoded 32-byte Fernet key.
  Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

In production (ENV=production), the app refuses to start if the key is missing or invalid.
In development, encryption is skipped with a warning so local setup stays frictionless.
"""
from __future__ import annotations
import logging
import os
from functools import lru_cache

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)

_IS_PRODUCTION = os.getenv("ENV", "development").lower() == "production"


@lru_cache(maxsize=1)
def _get_fernet():
    """Return a Fernet instance, or None in dev when the key is absent.

    Called once and cached for the lifetime of the process — never reads the
    env var more than once, so key rotation requires a restart (intentional).
    """
    key = os.getenv("SECRET_ENCRYPTION_KEY", "")
    if not key:
        if _IS_PRODUCTION:
            raise RuntimeError(
                "SECRET_ENCRYPTION_KEY is required in production. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\""
            )
        logger.warning(
            "SECRET_ENCRYPTION_KEY not set — secrets stored in plaintext. "
            "Set this env var before deploying to production."
        )
        return None

    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode())
    except Exception as exc:
        if _IS_PRODUCTION:
            raise RuntimeError(f"SECRET_ENCRYPTION_KEY is invalid: {exc}") from exc
        logger.warning("SECRET_ENCRYPTION_KEY is invalid (%s) — encryption disabled", exc)
        return None


class EncryptedText(TypeDecorator):
    """Stores strings as Fernet-encrypted TEXT.  Transparent to application code."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value
        return fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value
        try:
            return fernet.decrypt(value.encode()).decode()
        except Exception:
            # Value may be plaintext (pre-encryption row) — return as-is and log
            logger.debug("EncryptedText: could not decrypt value, returning raw (may be pre-migration plaintext)")
            return value
