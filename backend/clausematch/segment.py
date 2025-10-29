from typing import List


def segment_text(text: str) -> List[str]:
    if not text:
        return []
    # Simple heuristic: split by newlines and periods
    raw_parts = []
    for line in text.splitlines():
        parts = [p.strip() for p in line.replace("?", ".").replace("!", ".").split(".")]
        raw_parts.extend([p for p in parts if p])
    segments = [s for s in raw_parts if s]
    return segments


