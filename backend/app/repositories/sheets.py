import random
import time
from urllib.parse import quote

import google.auth
import requests
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import AuthorizedSession

from app.core.errors import IntegrityError, StorageUnavailable, WriteUnknown
from app.services.reducer import HEADERS

VIEW_HEADERS = {
    "TransactionsView": ["id", "date", "type", "amount", "category_label", "note", "revision", "updated_at"],
    "BudgetsView": ["entity_type", "date/effective_from", "amount", "revision", "updated_at"],
    "PreferencesView": ["jenis_reminder", "enabled", "time", "revision"],
    "Metadata": ["schema_version", "projection_built_at", "source_rows_processed", "projection_status"],
}
ALL_HEADERS = {"LedgerEvents": HEADERS, **VIEW_HEADERS}


class SheetsRepository:
    def __init__(self, spreadsheet_id, timeout=10, session=None, credentials_path=None):
        self.spreadsheet_id = spreadsheet_id
        self.timeout = timeout
        if session is None:
            scopes = ["https://www.googleapis.com/auth/spreadsheets"]
            creds, _ = (google.auth.load_credentials_from_file(credentials_path, scopes=scopes)
                        if credentials_path else google.auth.default(scopes=scopes))
            session = AuthorizedSession(creds, max_refresh_attempts=1, refresh_timeout=timeout)
        self.session = session
        self.base = "https://sheets.googleapis.com/v4/spreadsheets/" + quote(spreadsheet_id, safe="")

    def request(self, method, suffix="", *, append=False, retry_read=False, **kwargs):
        for attempt in range(3 if retry_read else 1):
            try:
                response = self.session.request(method, self.base + suffix, timeout=self.timeout, **kwargs)
            except (requests.RequestException, GoogleAuthError) as exc:
                if append:
                    raise WriteUnknown() from exc
                if retry_read and attempt < 2:
                    time.sleep(min(2 ** attempt + random.random(), 3))
                    continue
                raise StorageUnavailable() from exc
            if response.status_code == 429 or response.status_code >= 500:
                if append and response.status_code >= 500:
                    raise WriteUnknown()
                if retry_read and attempt < 2:
                    time.sleep(min(2 ** attempt + random.random(), 3))
                    continue
                raise StorageUnavailable(busy=response.status_code == 429)
            if response.status_code >= 400:
                raise StorageUnavailable()
            try:
                return response.json()
            except ValueError as exc:
                if append:
                    raise WriteUnknown() from exc
                raise StorageUnavailable() from exc
        raise StorageUnavailable()

    def read_tab(self, title):
        # FORMULA exposes tampered formula cells to strict schema validation, rather than trusting a computed value.
        result = self.request("GET", "/values/" + quote("'" + title + "'", safe=""), retry_read=True,
                              params={"valueRenderOption": "FORMULA", "dateTimeRenderOption": "SERIAL_NUMBER"})
        return result.get("values", [])

    def read_rows(self):
        return self.read_tab("LedgerEvents")

    def append(self, row):
        self.request("POST", "/values/" + quote("'LedgerEvents'!A:K", safe="") + ":append", append=True,
                     params={"valueInputOption": "RAW", "insertDataOption": "INSERT_ROWS"},
                     json={"majorDimension": "ROWS", "values": [row]})

    def bootstrap(self):
        metadata = self.request("GET", retry_read=True, params={"fields": "sheets.properties"})
        existing = {sheet["properties"]["title"] for sheet in metadata.get("sheets", [])}
        # Validate every existing tab before changing anything.
        empty = []
        for title, header in ALL_HEADERS.items():
            if title in existing:
                rows = self.read_tab(title)
                if rows and rows[0] != header:
                    raise IntegrityError()
                if not rows:
                    empty.append(title)
        missing = [title for title in ALL_HEADERS if title not in existing]
        if missing:
            self.request("POST", ":batchUpdate", json={"requests": [
                {"addSheet": {"properties": {"title": title, "gridProperties": {"frozenRowCount": 1}}}}
                for title in missing]})
        for title in missing + empty:
            self.request("PUT", "/values/" + quote("'" + title + "'!A1", safe=""),
                         params={"valueInputOption": "RAW"}, json={"values": [ALL_HEADERS[title]]})

    def replace_views(self, tables):
        """One atomic batch, touching only derived cells, and never LedgerEvents."""
        meta = self.request("GET", retry_read=True, params={"fields": "sheets.properties"})
        props = {s["properties"]["title"]: s["properties"] for s in meta["sheets"]}
        commands = []
        for title, values in tables.items():
            if title not in VIEW_HEADERS or title not in props:
                raise IntegrityError()
            properties = props[title]
            if self.read_tab(title)[:1] != [VIEW_HEADERS[title]]:
                raise IntegrityError()
            if len(values) > properties["gridProperties"]["rowCount"]:
                commands.append({"appendDimension": {"sheetId": properties["sheetId"], "dimension": "ROWS",
                                                      "length": len(values) - properties["gridProperties"]["rowCount"]}})
            # Missing cells in updateCells range are cleared; range is this derived tab only.
            commands.append({"updateCells": {"range": {"sheetId": properties["sheetId"]},
                "rows": [{"values": [self.cell(value) for value in row]} for row in values],
                "fields": "userEnteredValue"}})
        self.request("POST", ":batchUpdate", json={"requests": commands})

    @staticmethod
    def cell(value):
        if value is None:
            return {}
        if type(value) is bool:
            return {"userEnteredValue": {"boolValue": value}}
        if type(value) in (int, float):
            return {"userEnteredValue": {"numberValue": value}}
        return {"userEnteredValue": {"stringValue": str(value)}}

    def close(self):
        self.session.close()
