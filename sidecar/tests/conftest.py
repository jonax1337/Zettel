import json
from pathlib import Path

import pytest

PAYLOAD_DIR = Path(__file__).parent.parent / "test-payloads"


@pytest.fixture
def payloads():
    def _load(name: str) -> dict:
        with open(PAYLOAD_DIR / name, encoding="utf-8") as f:
            return json.load(f)["payload"]
    return _load
