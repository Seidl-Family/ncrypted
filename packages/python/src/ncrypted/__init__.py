"""ncrypted: one-time, end-to-end encrypted secrets for AI agents. https://ncrypted.ai"""

from .client import CreatedSecret, Ncrypted, NcryptedError, NcryptedSync, __version__, wallet_path
from .crypto import MAX_PLAINTEXT_BYTES, decrypt, encrypt, parse_link

__all__ = [
    "Ncrypted",
    "NcryptedSync",
    "NcryptedError",
    "CreatedSecret",
    "encrypt",
    "decrypt",
    "parse_link",
    "wallet_path",
    "MAX_PLAINTEXT_BYTES",
    "__version__",
]
