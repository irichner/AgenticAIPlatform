"""Root conftest for the OpenAPI detection test harness.

Adds backend/ to sys.path so tests can import app.services.openapi_detector
without installing the backend as a package.

Session-scoped fixtures:
    petstore_container   — Docker container running the Petstore API
    mock_discovery_server — Local FastAPI mock for discovery path probing

Function-scoped fixtures:
    detector             — OpenAPIDetector instance (stateless, cheap to recreate)
"""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path
from typing import Generator

import pytest

# ── Path bootstrap ─────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.services.openapi_detector import OpenAPIDetector  # noqa: E402

FIXTURES = REPO_ROOT / "tests" / "fixtures"
SPECS_DIR = FIXTURES / "specs"
BASELINES_DIR = FIXTURES / "baselines"


# ── Path helpers (shared by unit tests) ───────────────────────────────────────

def spec_path(name: str) -> Path:
    return SPECS_DIR / name


def baseline_path(name: str) -> Path:
    return BASELINES_DIR / f"{name}.baseline.json"


def load_spec(name: str) -> dict:
    p = spec_path(name)
    if not p.exists():
        pytest.skip(
            f"Spec fixture not found: {p.relative_to(REPO_ROOT)}. "
            "Run scripts/refresh_fixtures.py to download upstream specs."
        )
    with p.open(encoding="utf-8") as f:
        return json.load(f)


def load_baseline(name: str) -> dict:
    p = baseline_path(name)
    if not p.exists():
        pytest.skip(
            f"Baseline not found: {p.relative_to(REPO_ROOT)}. "
            "Run scripts/refresh_fixtures.py to generate baselines."
        )
    with p.open(encoding="utf-8") as f:
        return json.load(f)


# ── Detector fixture ───────────────────────────────────────────────────────────

@pytest.fixture()
def detector() -> OpenAPIDetector:
    """Fresh OpenAPIDetector for each test (stateless, no backend URL injected)."""
    return OpenAPIDetector()


# ── Discovery mock server fixture ─────────────────────────────────────────────

@pytest.fixture(scope="session")
def mock_discovery_server() -> Generator[str, None, None]:
    """Start the FastAPI mock discovery server on a random port.

    Yields the base URL, e.g. 'http://127.0.0.1:54321'.
    Requires: pip install uvicorn fastapi httpx
    """
    try:
        import uvicorn  # type: ignore
    except ImportError:
        pytest.skip("uvicorn not installed — skipping mock discovery server fixture")

    sys.path.insert(0, str(FIXTURES / "discovery"))
    from mock_server import app  # type: ignore  # noqa: PLC0415

    import socket

    # Bind to OS-assigned port
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # Wait for server to become ready
    for _ in range(30):
        try:
            import httpx
            with httpx.Client(timeout=1.0) as client:
                resp = client.get(f"http://127.0.0.1:{port}/healthz")
                if resp.status_code == 200:
                    break
        except Exception:
            pass
        time.sleep(0.1)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=5.0)


# ── Petstore Docker container fixture ─────────────────────────────────────────

@pytest.fixture(scope="session")
def petstore_container() -> Generator[str, None, None]:
    """Start the official Petstore Docker container on a random port.

    Yields the base URL, e.g. 'http://localhost:49152'.
    Requires: pip install testcontainers
    Skipped if Docker is unavailable or testcontainers is not installed.
    """
    try:
        from testcontainers.core.container import DockerContainer  # type: ignore
        from testcontainers.core.waiting_utils import wait_for_logs  # type: ignore
    except ImportError:
        pytest.skip("testcontainers not installed — skipping petstore_container fixture")

    from tests.config import PETSTORE_IMAGE  # noqa: PLC0415

    try:
        container = DockerContainer(PETSTORE_IMAGE)
        container.with_exposed_ports(8080)
        container.start()
        wait_for_logs(container, "Started", timeout=30)
        port = container.get_exposed_port(8080)
        base_url = f"http://localhost:{port}"
        yield base_url
    except Exception as exc:
        pytest.skip(f"Docker unavailable or container start failed: {exc}")
    finally:
        try:
            container.stop()
        except Exception:
            pass
