import importlib.util
import json
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("android_config", Path(__file__).resolve().parents[1] / "android_config.py")
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


@pytest.fixture
def build(tmp_path):
    # Validator inputs only; never used to compile an APK or contact Firebase.
    data = {"project_info": {"project_id": "config-validation-only"}, "client": [{
        "client_info": {"android_client_info": {"package_name": "id.catatharian.app"}},
        "oauth_client": [
            {"client_id": "test.apps.googleusercontent.com", "client_type": 3},
            {"client_type": 1, "android_info": {"package_name": "id.catatharian.app", "certificate_hash": "A" * 40}},
        ],
    }]}
    (tmp_path / "google-services.json").write_text(json.dumps(data))
    return tmp_path, data, {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.example/api/v1",
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "test.apps.googleusercontent.com",
        "ANDROID_SIGNING_SHA1": "A" * 40,
    }


def test_accepts_matching_android_oauth_and_signing(build):
    root, _, env = build
    config.validate_configuration(env, root)


@pytest.mark.parametrize("field,value", [
    ("EXPO_PUBLIC_API_BASE_URL", "http://api.example/api/v1"),
    ("EXPO_PUBLIC_API_BASE_URL", "https://user:pass@api.example/api/v1"),
    ("EXPO_PUBLIC_API_BASE_URL", "https://api.example/api/v1?token=x"),
    ("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", "wrong.apps.googleusercontent.com"),
    ("ANDROID_APPLICATION_ID", "id.other.app"),
    ("ANDROID_SIGNING_SHA1", "B" * 40),
])
def test_rejects_wrong_backend_identity_or_certificate(build, field, value):
    root, _, env = build
    with pytest.raises(ValueError):
        config.validate_configuration({**env, field: value}, root)


def test_backend_credential_cannot_be_used_as_mobile_config(build):
    root, _, env = build
    (root / "google-services.json").write_text(json.dumps({"type": "service_account", "private_key": "not-a-real-key"}))
    with pytest.raises(ValueError, match="never backend credentials"):
        config.validate_configuration(env, root)
