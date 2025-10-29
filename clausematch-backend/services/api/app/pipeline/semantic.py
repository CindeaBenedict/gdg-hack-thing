from typing import Iterable, List, Tuple, Dict, Any
import json
import os
import time

import requests


def embed_align(en: Iterable[str], de: Iterable[str]) -> List[Tuple[str, str, str]]:
    # Fallback: empty alignment
    return []


_TOKEN_CACHE: Dict[str, Any] = {"value": None, "exp": 0}


def _get_iam_token() -> str:
    api_key = os.getenv("WML_API_KEY")
    if not api_key:
        return ""
    now = int(time.time())
    if _TOKEN_CACHE["value"] and _TOKEN_CACHE["exp"] > now + 30:
        return _TOKEN_CACHE["value"]
    resp = requests.post(
        "https://iam.cloud.ibm.com/identity/token",
        data={
            "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
            "apikey": api_key,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get("access_token", "")
    _TOKEN_CACHE["value"] = token
    _TOKEN_CACHE["exp"] = now + int(data.get("expires_in", 3600))
    return token


def llm_check(a_txt: str, b_txt: str, fa, fb) -> List[dict]:
    # If no credentials, skip
    project_id = os.getenv("WML_PROJECT_ID")
    model_id = os.getenv("WML_MODEL_ID", "ibm/granite-3-2-8b-instruct")
    base_url = os.getenv("WML_API_URL", "https://us-south.ml.cloud.ibm.com")
    token = _get_iam_token()
    if not (project_id and token):
        return []

    prompt = (
        "You are an AI consistency auditor. Compare multiple multilingual or multi-format documents for factual consistency.\n"
        "Detect mismatches in numbers, dates, monetary amounts, or entities. If most versions agree and one differs, mark it as suspect.\n"
        "Output only a valid JSON object using this schema:\n"
        "{\n  \"status\": \"MATCH|MISMATCH|REVIEW\",\n  \"confidence\": 0.0-1.0,\n  \"issues\": [\n    {\n      \"type\": \"number|date|monetary|entity\",\n      \"comment\": \"brief reason\"\n    }\n  ]\n}\n"
        "No extra text. JSON only.\n\n"
        f"Input: EN: {a_txt}\nDE: {b_txt}\n\nOutput:"
    )

    body = {
        "input": prompt,
        "parameters": {
            "decoding_method": "greedy",
            "max_new_tokens": 200,
            "min_new_tokens": 0,
            "repetition_penalty": 1,
        },
        "model_id": model_id,
        "project_id": project_id,
    }

    try:
        resp = requests.post(
            f"{base_url}/ml/v1/text/generation?version=2023-05-29",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            json=body,
            timeout=60,
        )
        if resp.status_code != 200:
            return []
        out = resp.json()
        # Expect results[0].generated_text -> JSON string
        text = out.get("results", [{}])[0].get("generated_text", "{}")
        parsed = json.loads(text)
        issues = parsed.get("issues", []) or []
        status = (parsed.get("status") or "").upper()
        conf = float(parsed.get("confidence", 0.0) or 0.0)
        mapped: List[Dict[str, Any]] = []
        for it in issues:
            field = (it.get("type") or "entity").lower()
            mapped.append({
                "field": field if field in {"date", "money", "monetary", "number", "id", "entity"} else "entity",
                "status": "MISMATCH" if status == "MISMATCH" else ("REVIEW" if status == "REVIEW" else "OK"),
                "rationale": it.get("comment") or "semantic check",
                "semantic_score": conf,
            })
        return mapped
    except Exception:
        return []


