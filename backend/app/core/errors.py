class AppError(Exception):
    def __init__(self, status, code, message, fields=None, headers=None):
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.headers = headers or {}
        super().__init__(code)


def invalid(field, message="Periksa data yang diisi."):
    return AppError(422, "VALIDATION_ERROR", message, {field: message})


class IntegrityError(AppError):
    def __init__(self):
        super().__init__(503, "STORAGE_INTEGRITY_ERROR", "Integritas data perlu diperiksa administrator.")


class StorageUnavailable(AppError):
    def __init__(self, busy=False):
        super().__init__(503, "STORAGE_BUSY" if busy else "STORAGE_UNAVAILABLE",
                         "Penyimpanan belum tersedia. Coba lagi.", headers={"Retry-After": "3"})


class WriteUnknown(Exception):
    """An append may already have reached Google. Never report definite failure."""
