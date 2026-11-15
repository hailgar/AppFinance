"""Create an allowlisted deployment ZIP; exclude local credentials and data."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def package_backend(root, destination):
    root, destination = Path(root), Path(destination)
    backend = root / "backend"
    files = []
    for folder in ("app", "scripts"):
        for source in sorted((backend / folder).rglob("*.py")):
            if not source.is_symlink() and "__pycache__" not in source.parts:
                files.append((source, source.relative_to(backend).as_posix()))
    files.append((backend / "requirements.lock", "requirements.lock"))
    files.append((root / "deploy/azure/startup.py", "_azure_startup.py"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
        for source, name in files:
            archive.write(source, name)
        # Oryx recognizes requirements.txt and installs the pinned lock file.
        archive.writestr("requirements.txt", "-r requirements.lock\n")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = package_backend(Path(__file__).resolve().parents[2], args.output)
    print("Backend ZIP created:", result)
