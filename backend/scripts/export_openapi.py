import json
from pathlib import Path

from app.core.config import Settings
from app.main import create_app


def main():
    # Schema export does not start the app, initialize credentials, or read/write a spreadsheet.
    config = Settings(google_sheets_spreadsheet_id="schema-export", firebase_project_id="schema-export",
                      allowed_firebase_uid="schema-export", _env_file=None)
    app = create_app(config)
    path = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
    path.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(path)


if __name__ == "__main__":
    main()
