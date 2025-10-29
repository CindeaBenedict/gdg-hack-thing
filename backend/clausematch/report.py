from typing import Dict, List


def summarize(comparisons: List[Dict]) -> Dict:
    total = len(comparisons)
    if total == 0:
        return {"total": 0, "mismatches": 0, "avgSimilarity": 0.0}
    mismatches = sum(1 for c in comparisons if c.get("isMismatch"))
    avg_sim = sum(float(c.get("similarity", 0.0)) for c in comparisons) / total
    return {
        "total": total,
        "mismatches": mismatches,
        "avgSimilarity": round(avg_sim, 3),
    }


