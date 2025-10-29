from typing import Dict, List


def _similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    # Cheap proxy: ratio of min/avg length penalizes big mismatches
    min_len = min(len(a), len(b))
    avg_len = (len(a) + len(b)) / 2.0
    base = min_len / avg_len
    # Token overlap proxy
    sa, sb = set(a.lower().split()), set(b.lower().split())
    overlap = len(sa & sb) / max(1, len(sa | sb))
    return max(0.0, min(1.0, 0.5 * base + 0.5 * overlap))


def compare_pairs(pairs: List[Dict], features: List[Dict]) -> List[Dict]:
    results: List[Dict] = []
    for p, f in zip(pairs, features):
        sim = _similarity(p.get("source", ""), p.get("target", ""))
        results.append(
            {
                "index": p.get("index"),
                "source": p.get("source", ""),
                "target": p.get("target", ""),
                "similarity": round(sim, 3),
                "isMismatch": sim < 0.6,
                "metrics": f,
            }
        )
    return results


