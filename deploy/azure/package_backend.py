"""Create an allowlisted deployment ZIP; exclude local credentials and data."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def package_backend(root, destination):
    root, destination = Path(root), Path(destination)
    backend = root / "backend"
    files = []
    for folder in ("app", "scripts"):
        if (backend / folder).is_symlink():
            raise ValueError("Deployment source directories must not be symlinks.")
        for source in sorted((backend / folder).rglob("*.py")):
            if not source.is_symlink() and "__pycache__" not in source.parts:
                files.append((source, source.relative_to(backend).as_posix()))
    files.append((backend / "requirements.lock", "requirements.lock"))
    files.append((root / "deploy/azure/startup.py", "_azure_startup.py"))
    if any(source.is_symlink() or not source.is_file() for source, _ in files):
        raise ValueError("Deployment inputs must be regular source files, not symlinks.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents --output from overwriting source or an earlier
    # artifact. A selected destination must never destroy an operator's file.
    with ZipFile(destination, "x", compression=ZIP_DEFLATED) as archive:
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
