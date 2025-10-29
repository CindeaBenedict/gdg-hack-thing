from typing import Dict


def score(finding: Dict) -> Dict:
    status = (finding.get("status") or "").upper()
    entity_weight = 1.0 if finding.get("field") in {"money", "date", "id"} else 0.3
    semantic_conf = float(finding.get("semantic_score", 0.5))
    rule_agreement = 1.0 if status == "OK" else 0.0
    score_val = (1.0 * (status == "MISMATCH")) + 0.6 * entity_weight + 0.3 * semantic_conf + 0.2 * rule_agreement
    if score_val > 1.2:
        risk = "HIGH"
    elif score_val > 0.7:
        risk = "MEDIUM"
    else:
        risk = "LOW"
    conf = max(0.0, min(1.0, 0.5 * semantic_conf + 0.5 * (1.0 if status == "OK" else 0.6)))
    return {"risk": risk, "confidence": round(conf, 2)}


