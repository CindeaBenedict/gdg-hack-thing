from typing import Dict, List


def extract_entities(pairs: List[Dict]) -> List[Dict]:
    # Minimal placeholder: return lengths and simple stats per pair
    results: List[Dict] = []
    for p in pairs:
        src = p.get("source", "")
        tgt = p.get("target", "")
        results.append(
            {
                "index": p.get("index"),
                "sourceLength": len(src),
                "targetLength": len(tgt),
                "sourceWordCount": len(src.split()),
                "targetWordCount": len(tgt.split()),
            }
        )
    return results


