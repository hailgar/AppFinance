import json
import os
import tempfile
from pathlib import Path

from app.core.errors import IntegrityError, StorageUnavailable
from app.services.reducer import rows_digest


class Checkpoint:
    """Persistent append-prefix anchor; mount this directory durably with the single replica."""

    def __init__(self, path, spreadsheet_id):
        self.path = Path(path)
        self.spreadsheet_id = spreadsheet_id

    def verify(self, rows):
        if not self.path.exists():
            return
        try:
            anchor = json.loads(self.path.read_text())
            count = anchor["row_count"]
            if (anchor["spreadsheet_id"] != self.spreadsheet_id or type(count) is not int or count < 1
                    or count > len(rows) or rows_digest(rows[:count]) != anchor["sha256"]):
                raise IntegrityError()
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise IntegrityError() from exc

    def save(self, rows):
        try:
            self._save(rows)
        except OSError as exc:
            raise StorageUnavailable() from exc

    def _save(self, rows):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"spreadsheet_id": self.spreadsheet_id, "row_count": len(rows), "sha256": rows_digest(rows)}
        fd, name = tempfile.mkstemp(dir=self.path.parent, prefix=".checkpoint-")
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(payload, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path)
        finally:
            if os.path.exists(name):
                os.unlink(name)


class ProcessLease:
    """Prevent two writers on the same host/path. Does not replace the one-replica rule."""

    def __init__(self, checkpoint_path):
        path = Path(str(checkpoint_path) + ".lock")
        path.parent.mkdir(parents=True, exist_ok=True)
        self.stream = path.open("a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self.stream.seek(0)
                self.stream.write(b"0")
                self.stream.flush()
                self.stream.seek(0)
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.stream.close()
            raise RuntimeError("Another backend/admin process owns the ledger lease.") from exc

    def close(self):
        self.stream.close()
