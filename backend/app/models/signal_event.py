# Backwards-compat shim — import from the canonical modules instead.
from app.models.signals import Signal as SignalEvent  # noqa: F401
from app.models.integration_config import IntegrationConfig  # noqa: F401

__all__ = ["SignalEvent", "IntegrationConfig"]
