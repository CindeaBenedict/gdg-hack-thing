from typing import List


def segment(text: str, lang: str) -> List[str]:
    if not text:
        return []
    lines: List[str] = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        # naive sentence-ish split
        parts = raw.replace("?", ".").replace("!", ".").split(".")
        for p in parts:
            p = p.strip()
            if p:
                lines.append(p)
    return lines


