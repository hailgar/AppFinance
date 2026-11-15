"""Run the mobile HTTP suite against a fresh, disposable backend fixture.

Use the Python environment with backend requirements installed:
python scripts/test_backend_contract.py backend
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/test_backend_contract.py BACKEND_DIRECTORY")
    backend = Path(sys.argv[1]).resolve()
    if not (backend / "tests/serve_mobile_contract.py").is_file():
        raise SystemExit("Backend directory must contain tests/serve_mobile_contract.py")
    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        raise SystemExit("Node/npm are required. Run npm ci inside mobile/ first.")
    root = Path(__file__).resolve().parents[1]
    if not (root / "mobile/node_modules/vitest/package.json").is_file():
        raise SystemExit("Run npm ci inside mobile/ before starting the contract suite.")
    health = "http://127.0.0.1:8765/api/v1/health/live"
    try:
        with urllib.request.urlopen(health, timeout=1):
            raise SystemExit("Port 8765 is already occupied. Stop the old fixture first.")
    except OSError:
        pass
    fixture_env = {**os.environ, "WEB_CONCURRENCY": "1", "UVICORN_WORKERS": "1"}
    server = subprocess.Popen([sys.executable, "-m", "tests.serve_mobile_contract"], cwd=backend, env=fixture_env)
    try:
        for _ in range(100):
            if server.poll() is not None:
                raise SystemExit("Backend fixture exited before becoming ready.")
            try:
                with urllib.request.urlopen(health, timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit("Backend fixture did not become ready.")
        result = subprocess.run(
            [npx, "vitest", "run", "src/__tests__/backend.integration.test.ts"],
            cwd=root / "mobile",
            env={**os.environ, "CATAT_INTEGRATION_BASE_URL": "http://127.0.0.1:8765/api/v1"},
        )
        return result.returncode
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == "__main__":
    raise SystemExit(main())
