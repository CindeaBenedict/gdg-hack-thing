import json
import re
from typing import Any, Dict, List, Tuple


money_re = re.compile(r"(?i)(€|eur|euro[s]?)\s*([\d\s.,]+)")
date_re = re.compile(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")
num_re = re.compile(r"\b\d[\d\s.,]*\b")


def _to_minor(amount_str: str) -> int:
    cleaned = amount_str.replace(" ", "").replace(",", "")
    if "." in cleaned:
        major, minor = cleaned.split(".", 1)
        minor = (minor + "00")[:2]
        return int(major or 0) * 100 + int(minor or 0)
    return int(cleaned) * 100


def extract_facts(text: str, lang: str) -> Dict[str, Any]:
    facts: Dict[str, Any] = {"money": [], "dates": [], "numbers": []}
    for m in money_re.finditer(text):
        ccy, amt = m.group(1).upper(), m.group(2)
        facts["money"].append({"currency": "EUR" if ccy.startswith("€") or ccy.startswith("EU") else ccy, "amount_minor": _to_minor(amt)})
    for d in date_re.finditer(text):
        y, mo, da = d.groups()
        facts["dates"].append(f"{int(y):04d}-{int(mo):02d}-{int(da):02d}")
    for n in num_re.finditer(text):
        val = n.group(0).replace(" ", "").replace(",", "")
        facts["numbers"].append(val)
    return facts


def compare_facts(a: Dict[str, Any], b: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    # money
    if a["money"] or b["money"]:
        a_sum = sum(x["amount_minor"] for x in a["money"]) if a["money"] else None
        b_sum = sum(x["amount_minor"] for x in b["money"]) if b["money"] else None
        if a_sum is None or b_sum is None:
            findings.append({"field": "money", "status": "REVIEW", "rationale": "missing on one side"})
        elif a_sum != b_sum:
            findings.append({"field": "money", "status": "MISMATCH", "rationale": f"{a_sum} != {b_sum}"})
        else:
            findings.append({"field": "money", "status": "OK", "rationale": "equal"})
    # dates (compare sets)
    if a["dates"] or b["dates"]:
        if set(a["dates"]) != set(b["dates"]):
            findings.append({"field": "date", "status": "MISMATCH", "rationale": "dates differ"})
        else:
            findings.append({"field": "date", "status": "OK", "rationale": "equal"})
    return findings


def merge_findings(key: str, diffs: List[Dict[str, Any]], sem: List[Dict[str, Any]], contexts: List[Dict[str, Any]]):
    if not diffs and not sem:
        return {"clause_key": key, "status": "OK", "confidence": 0.9, "semantic_score": 0.9, "rationale": "no diffs", "rules_triggered": [], "contexts": contexts}
    # combine
    items = []
    for d in diffs or []:
        items.append({"clause_key": key, **d, "semantic_score": 0.0, "contexts": contexts, "rules_triggered": [d.get("field", "rule")], "confidence": 0.7})
    for s in sem or []:
        items.append({"clause_key": key, **s, "contexts": contexts, "rules_triggered": ["LLM"]})
    return items


def summarize(findings: List[Dict[str, Any]]) -> Dict[str, int]:
    summary = {"ok": 0, "review": 0, "mismatch": 0}
    for f in findings:
        st = (f.get("status") or "").upper()
        if st == "OK":
            summary["ok"] += 1
        elif st == "MISMATCH":
            summary["mismatch"] += 1
        else:
            summary["review"] += 1
    return summary


