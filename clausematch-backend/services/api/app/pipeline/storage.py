import json
import os
from typing import Any


ARTIFACT_ROOT = os.path.join(os.path.dirname(__file__), "..", "artifacts")
ARTIFACT_ROOT = os.path.abspath(ARTIFACT_ROOT)
os.makedirs(ARTIFACT_ROOT, exist_ok=True)


def put_json(path: str, data: Any) -> str:
    full = os.path.join(ARTIFACT_ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return full


def url_for(path: str) -> str:
    # served at /artifacts
    return f"/artifacts/{path}"


