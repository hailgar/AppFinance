import importlib.util
import json
import stat
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy/azure" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


startup, packaging = load("startup"), load("package_backend")


class AzureSetupTests(unittest.TestCase):
    def environment(self):
        return {"FIREBASE_PROJECT_ID": "test-project",
                "LEDGER_CHECKPOINT_PATH": "/home/catat-data/test-checkpoint.json",
                "GOOGLE_SERVICE_ACCOUNT_JSON": json.dumps({"type": "service_account",
                    "project_id": "test-project", "private_key": "TEST_FIXTURE_ONLY",
                    "client_email": "fixture@example.invalid"})}

    def test_credential_file_is_private(self):
        env = self.environment()
        path = startup.prepare_credentials(env)
        try:
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(path.read_text(), env["GOOGLE_SERVICE_ACCOUNT_JSON"])
            self.assertEqual(env["GOOGLE_APPLICATION_CREDENTIALS"], str(path))
        finally:
            path.unlink()

    def test_malformed_secret_never_appears_in_error(self):
        env = self.environment()
        env["GOOGLE_SERVICE_ACCOUNT_JSON"] = "PRIVATE_TEST_SENTINEL"
        with self.assertRaises(RuntimeError) as error:
            startup.prepare_credentials(env)
        self.assertNotIn("PRIVATE_TEST_SENTINEL", str(error.exception))

    def test_mismatched_firebase_identity_fails_closed(self):
        env = self.environment()
        env["FIREBASE_PROJECT_ID"] = "different-project"
        with self.assertRaisesRegex(RuntimeError, "must match"):
            startup.prepare_credentials(env)

    def test_checkpoint_requires_durable_home_path(self):
        for path in ("", "data/checkpoint.json", "/tmp/checkpoint.json", "/home/catat-data/../../tmp/key"):
            env = self.environment()
            env["LEDGER_CHECKPOINT_PATH"] = path
            with self.subTest(path=path), self.assertRaises(RuntimeError):
                startup.prepare_credentials(env)

    def test_zip_excludes_secrets_data_and_symlinked_python(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for folder in ("backend/app", "backend/scripts", "deploy/azure", "backend/data"):
                (root / folder).mkdir(parents=True)
            for name in ("backend/app/main.py", "backend/scripts/admin.py", "deploy/azure/startup.py"):
                (root / name).write_text("# source\n")
            (root / "backend/requirements.lock").write_text("uvicorn==0.52.1\n")
            (root / "backend/.env").write_text("PRIVATE_TEST_SENTINEL")
            secret = root / "backend/data/private.py"
            secret.write_text("PRIVATE_TEST_SENTINEL")
            (root / "backend/app/linked.py").symlink_to(secret)
            archive = packaging.package_backend(root, root / "result.zip")
            with ZipFile(archive) as bundle:
                self.assertEqual(set(bundle.namelist()), {"app/main.py", "scripts/admin.py",
                    "_azure_startup.py", "requirements.lock", "requirements.txt"})
                self.assertEqual(bundle.read("requirements.txt"), b"-r requirements.lock\n")
                self.assertNotIn(b"PRIVATE_TEST_SENTINEL", b"".join(bundle.read(n) for n in bundle.namelist()))

    def test_template_contains_only_free_plan_and_no_secret_output(self):
        template = json.loads((ROOT / "deploy/azure/main.json").read_text())
        self.assertEqual([r["type"] for r in template["resources"]],
                         ["Microsoft.Web/serverfarms", "Microsoft.Web/sites"])
        self.assertEqual(template["resources"][0]["sku"]["name"], "F1")
        for key in ("allowedFirebaseUid", "spreadsheetId", "googleServiceAccountJson"):
            self.assertEqual(template["parameters"][key]["type"], "securestring")
        self.assertEqual(list(template["outputs"]), ["appName"])


if __name__ == "__main__":
    unittest.main()
