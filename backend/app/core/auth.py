import logging
from uuid import uuid4

import firebase_admin
from firebase_admin import auth, credentials, exceptions
from google.auth.exceptions import GoogleAuthError
from requests.exceptions import RequestException

from app.core.errors import AppError

log = logging.getLogger(__name__)


class FirebaseVerifier:
    def __init__(self, project_id, credentials_path=None):
        credential = credentials.Certificate(credentials_path) if credentials_path else credentials.ApplicationDefault()
        self.app = firebase_admin.initialize_app(credential, options={"projectId": project_id, "httpTimeout": 10},
                                                 name="catat-harian-" + str(uuid4()))

    def verify(self, token):
        try:
            claims = auth.verify_id_token(token, app=self.app, check_revoked=True)
        except auth.CertificateFetchError as exc:
            raise AppError(503, "AUTH_UNAVAILABLE", "Layanan login belum tersedia.", headers={"Retry-After": "3"}) from exc
        except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError, auth.RevokedIdTokenError,
                auth.UserDisabledError, auth.UserNotFoundError, ValueError) as exc:
            raise AppError(401, "UNAUTHENTICATED", "Silakan masuk kembali.", headers={"WWW-Authenticate": "Bearer"}) from exc
        except (exceptions.FirebaseError, GoogleAuthError, RequestException) as exc:
            raise AppError(503, "AUTH_UNAVAILABLE", "Layanan login belum tersedia.", headers={"Retry-After": "3"}) from exc
        if not isinstance(claims.get("uid"), str) or not claims["uid"]:
            raise AppError(401, "UNAUTHENTICATED", "Silakan masuk kembali.")
        return claims

    def close(self):
        firebase_admin.delete_app(self.app)
