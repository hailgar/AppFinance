from unittest.mock import patch

import pytest
from firebase_admin import auth, exceptions

from app.core.auth import FirebaseVerifier
from app.core.errors import AppError


def test_verifier_delegates_signature_expiry_audience_and_revocation_to_sdk():
    verifier = FirebaseVerifier.__new__(FirebaseVerifier)
    verifier.app = object()
    with patch("app.core.auth.auth.verify_id_token", return_value={"uid": "owner"}) as sdk:
        assert verifier.verify("firebase-id-token") == {"uid": "owner"}
    sdk.assert_called_once_with("firebase-id-token", app=verifier.app, check_revoked=True)


@pytest.mark.parametrize("failure,status", [(auth.InvalidIdTokenError("invalid"), 401),
                                         (auth.RevokedIdTokenError("revoked"), 401),
                                         (auth.UserDisabledError("disabled"), 401),
                                         (auth.CertificateFetchError("unavailable", None), 503),
                                         (exceptions.UnavailableError("unavailable"), 503)])
def test_verifier_normalizes_sdk_errors(failure, status):
    verifier = FirebaseVerifier.__new__(FirebaseVerifier)
    verifier.app = object()
    with patch("app.core.auth.auth.verify_id_token", side_effect=failure):
        with pytest.raises(AppError) as exc:
            verifier.verify("token")
    assert exc.value.status == status
