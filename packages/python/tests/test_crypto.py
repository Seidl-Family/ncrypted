import json
from pathlib import Path

import pytest

from ncrypted import decrypt, encrypt, parse_link

VECTORS = json.loads((Path(__file__).parents[2] / "sdk" / "test" / "vectors.json").read_text())


def test_decrypts_typescript_vectors():
    v = VECTORS["plain"]
    assert decrypt(v["payload"], v["key"]) == v["plaintext"]
    v = VECTORS["pass"]
    assert decrypt(v["payload"], v["key"], v["passphrase"]) == v["plaintext"]


def test_round_trip_and_failures():
    payload, key = encrypt("hunter2 🔐", "pw")
    assert decrypt(payload, key, "pw") == "hunter2 🔐"
    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt(payload, key, "wrong")
    with pytest.raises(ValueError, match="passphrase"):
        decrypt(payload, key)
    _, other = encrypt("x")
    with pytest.raises(ValueError, match="Decryption failed"):
        decrypt(payload, other, "pw")


def test_rejects_empty_and_oversized():
    with pytest.raises(ValueError, match="empty"):
        encrypt("")
    with pytest.raises(ValueError, match="exceeds"):
        encrypt("a" * (64 * 1024 + 1))


def test_parse_link():
    p = parse_link("https://ncrypted.ai/s/abcdefghijklmnopqrstuv#KEY_1")
    assert (p.origin, p.id, p.key) == ("https://ncrypted.ai", "abcdefghijklmnopqrstuv", "KEY_1")
    with pytest.raises(ValueError):
        parse_link("https://ncrypted.ai/s/abcdefghijklmnopqrstuv")
