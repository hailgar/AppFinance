"""Non-destructive setup and explicit maintenance. Run: python -m scripts.admin --help."""
import argparse
import json
import logging
from pathlib import Path
from urllib.parse import quote

from app.core.config import Settings
from app.core.errors import AppError, IntegrityError, WriteUnknown
from app.repositories.checkpoint import Checkpoint, ProcessLease
from app.repositories.sheets import SheetsRepository
from app.services.domain import canonical, stamp, utc_now
from app.services.projections import rebuild
from app.services.reducer import HEADERS, replay, rows_digest, strict_json


def backup_payload(rows, spreadsheet_id):
    replay(rows)
    return {"format_version": 1, "source_spreadsheet_id": spreadsheet_id, "exported_at": stamp(utc_now()),
            "sha256": rows_digest(rows), "rows": rows}


def read_backup(path):
    try:
        backup = strict_json(Path(path).read_text(encoding="utf-8"))
        if backup["format_version"] != 1 or rows_digest(backup["rows"]) != backup["sha256"]:
            raise IntegrityError()
        replay(backup["rows"])
        return backup
    except (KeyError, ValueError, TypeError) as exc:
        raise IntegrityError() from exc


def restore_empty(repository, backup):
    if repository.spreadsheet_id == backup["source_spreadsheet_id"]:
        raise RuntimeError("Restore must target a new, separate spreadsheet.")
    repository.bootstrap()
    if repository.read_rows() != [HEADERS]:
        raise RuntimeError("Restore target must contain no ledger events.")
    rows = backup["rows"]
    # Whole ledger in one bounded RAW request keeps original order. No automatic append retry.
    if len(canonical(rows).encode()) > 1_500_000:
        raise RuntimeError("Backup exceeds 1.5 MB restore limit; use a reviewed chunked migration.")
    if len(rows) > 1:
        repository.request("POST", "/values/" + quote("'LedgerEvents'!A:K", safe="") + ":append", append=True,
                           params={"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"},
                           json={"majorDimension": "ROWS", "values": rows[1:]})
    restored = repository.read_rows()
    replay(restored)
    if rows_digest(restored) != backup["sha256"]:
        raise IntegrityError()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("bootstrap", help="Create only missing tabs/headers; preserve existing data.")
    commands.add_parser("validate", help="Replay ledger and verify durable prefix checkpoint.")
    commands.add_parser("rebuild-views", help="Rebuild derived views only; never change ledger.")
    export = commands.add_parser("export", help="Export ordered, validated ledger to a new JSON file.")
    export.add_argument("--output", required=True)
    verify = commands.add_parser("verify-backup", help="Validate JSON backup offline.")
    verify.add_argument("--input", required=True)
    restore = commands.add_parser("restore", help="Restore only to an explicitly named separate empty test sheet.")
    restore.add_argument("--input", required=True)
    restore.add_argument("--target-spreadsheet-id", required=True)
    restore.add_argument("--confirm-empty-test-target", action="store_true", required=True)
    args = parser.parse_args()
    if args.command == "verify-backup":
        backup = read_backup(args.input)
        print(f"Backup valid: {len(backup['rows']) - 1} event rows.")
        return
    config = Settings()
    config.check_runtime()
    # All live maintenance needs the same local lease as API; stop API first.
    lease = ProcessLease(config.ledger_checkpoint_path)
    target = args.target_spreadsheet_id if args.command == "restore" else config.google_sheets_spreadsheet_id
    repo = None
    try:
        repo = SheetsRepository(target, config.upstream_timeout_seconds, credentials_path=config.google_application_credentials)
        checkpoint = Checkpoint(config.ledger_checkpoint_path, config.google_sheets_spreadsheet_id)
        if args.command == "restore":
            if target == config.google_sheets_spreadsheet_id:
                raise RuntimeError("Do not restore over the configured source spreadsheet.")
            restore_empty(repo, read_backup(args.input))
            print("Restore validated on the separate target. Source and source checkpoint unchanged.")
            return
        if args.command == "bootstrap":
            repo.bootstrap()
        rows = repo.read_rows()
        checkpoint.verify(rows)
        state = replay(rows)
        checkpoint.save(rows)
        if args.command == "rebuild-views":
            rebuild(repo, state, config.allowed_firebase_uid, stamp(utc_now()))
        elif args.command == "export":
            with Path(args.output).open("x", encoding="utf-8") as stream:
                json.dump(backup_payload(rows, target), stream, ensure_ascii=False, indent=2, allow_nan=False)
        print(f"{args.command} complete: {state.rows_processed} validated event rows.")
    finally:
        if repo:
            repo.close()
        lease.close()


if __name__ == "__main__":
    try:
        main()
    except WriteUnknown:
        raise SystemExit("Restore outcome UNKNOWN. Inspect/validate target before any retry; never blindly append again.")
    except AppError as exc:
        raise SystemExit(f"Maintenance failed: {exc.code}. Source was not reset; inspect and retry maintenance.")
