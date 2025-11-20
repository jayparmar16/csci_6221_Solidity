import hashlib
from typing import ByteString


def sha256_bytes(data: ByteString) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()
