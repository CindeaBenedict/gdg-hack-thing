from pathlib import Path
import json


def parse_json(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return json.dumps(data, indent=2, ensure_ascii=False)


