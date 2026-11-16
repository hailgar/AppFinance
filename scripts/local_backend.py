"""Run the real backend on a laptop, without shell activation or public bind ports."""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import venv


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ENVIRONMENT = BACKEND / ".venv"
PYTHON = ENVIRONMENT / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

# Run inside the backend environment; never print Settings or credential contents.
PREFLIGHT = """
import sys
from pathlib import Path
from pydantic import ValidationError
from app.core.config import Settings
try:
    config = Settings()
    config.check_runtime()
except ValidationError as exc:
    names = sorted({str(item['loc'][0]).upper() for item in exc.errors()})
    sys.exit('Periksa konfigurasi backend/.env: ' + ', '.join(names))
except Exception:
    sys.exit('Konfigurasi runtime tidak valid. Gunakan satu worker tanpa emulator Firebase.')
for name in ('google_sheets_spreadsheet_id', 'firebase_project_id', 'allowed_firebase_uid'):
    if getattr(config, name).startswith('replace_'):
        sys.exit('Isi ' + name.upper() + ' pada backend/.env terlebih dahulu.')
key = config.google_application_credentials
if not key or not Path(key).is_file():
    sys.exit('GOOGLE_APPLICATION_CREDENTIALS harus menunjuk file credential backend yang tersedia.')
try:
    Path(key).resolve().relative_to(Path.cwd().parent.resolve())
except ValueError:
    pass
else:
    sys.exit('Pindahkan credential backend ke luar folder repository.')
print('Konfigurasi lokal terbaca; akses Firebase/Sheets belum diuji.')
"""


def invoke(arguments, **kwargs):
    subprocess.run([str(item) for item in arguments], cwd=BACKEND, check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("setup", "check", "bootstrap", "run"))
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        parser.exit(1, "Gunakan Python 3.12: py -3.12 scripts/local_backend.py " + args.action + "\n")

    if args.action == "setup":
        if not (BACKEND / ".env").exists():
            # Exclusive creation preserves user configuration on repeated setup.
            with (BACKEND / ".env").open("x", encoding="utf-8") as target:
                target.write((BACKEND / ".env.example").read_text(encoding="utf-8"))
        if not PYTHON.is_file():
            venv.EnvBuilder(with_pip=True).create(ENVIRONMENT)
        invoke([PYTHON, "-c", "import sys; sys.exit(sys.version_info[:2] != (3, 12))"])
        invoke([PYTHON, "-m", "pip", "install", "-r", "requirements.lock"])
        print("Setup selesai. Isi backend/.env; konfigurasi yang sudah ada dipertahankan.")
        return

    if not PYTHON.is_file() or not (BACKEND / ".env").is_file():
        parser.exit(1, "Jalankan setup dahulu.\n")
    # Parent shells must not accidentally enable multiple workers or production mode.
    child_env = dict(os.environ, WEB_CONCURRENCY="1", UVICORN_WORKERS="1", APP_ENV="development")
    invoke([PYTHON, "-c", PREFLIGHT], env=child_env)
    if args.action == "check":
        return
    if args.action == "bootstrap":
        print("Menyiapkan tab/header pada Sheet yang dikonfigurasi. Hentikan API dahulu.")
        invoke([PYTHON, "-m", "scripts.admin", "bootstrap"], env=child_env)
        return
    print("Backend lokal: http://127.0.0.1:8000/api/v1/health/live (Ctrl+C untuk berhenti)", flush=True)
    invoke([PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000",
            "--workers", "1", "--no-access-log"], env=child_env)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
    except KeyboardInterrupt:
        sys.exit(130)
