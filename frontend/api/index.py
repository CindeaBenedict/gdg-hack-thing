from fastapi import FastAPI, UploadFile, File, HTTPException
from typing import Dict, Any, List, Tuple
import os, json, time
import requests
import uuid
import time

app = FastAPI(title="ClauseMatch++ Serverless API")


# In-memory store (serverless: per-instance; OK for demo)
REPORTS: Dict[str, Dict[str, Any]] = {}


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Minimal ClauseMatch++ stubs (duplicated for serverless) ---
def segment(text: str) -> List[str]:
    if not text:
        return []
    parts: List[str] = []
    for line in text.splitlines():
        for p in line.replace("?", ".").replace("!", ".").split("."):
            p = p.strip()
            if p:
                parts.append(p)
    return parts


def align(en: List[str], de: List[str]) -> List[Tuple[int, str, str]]:
    m = max(len(en), len(de))
    out: List[Tuple[int, str, str]] = []
    for i in range(m):
        out.append((i, en[i] if i < len(en) else "", de[i] if i < len(de) else ""))
    return out


def similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    sa, sb = set(a.lower().split()), set(b.lower().split())
    overlap = len(sa & sb) / max(1, len(sa | sb))
    min_len = min(len(a), len(b))
    avg_len = (len(a) + len(b)) / 2 or 1
    shape = min_len / avg_len
    return max(0.0, min(1.0, 0.5 * overlap + 0.5 * shape))


def summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(rows)
    mismatches = sum(1 for r in rows if r.get("isMismatch"))
    avg = sum(r.get("similarity", 0.0) for r in rows) / total if total else 0.0
    return {"total": total, "mismatches": mismatches, "avgSimilarity": round(avg, 3)}


def _iam_token() -> str:
    api_key = os.getenv("WML_API_KEY")
    if not api_key:
        return ""
    r = requests.post(
        "https://iam.cloud.ibm.com/identity/token",
        data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": api_key},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("access_token", "")


def watsonx_check(a_txt: str, b_txt: str) -> Dict[str, Any]:
    project_id = os.getenv("WML_PROJECT_ID")
    base_url = os.getenv("WML_API_URL", "https://us-south.ml.cloud.ibm.com")
    model_id = os.getenv("WML_MODEL_ID", "ibm/granite-3-2-8b-instruct")
    token = _iam_token()
    if not (project_id and token):
        return {"status": "REVIEW", "confidence": 0.0, "issues": []}
    prompt = (
        "You are an AI consistency auditor. Compare multiple multilingual or multi-format documents for factual consistency.\n"
        "Detect mismatches in numbers, dates, monetary amounts, or entities. If most versions agree and one differs, mark it as suspect.\n"
        "Output only a valid JSON object using this schema:\n"
        "{\\\"status\\\": \\\"MATCH|MISMATCH|REVIEW\\\", \\\"confidence\\\": 0.0-1.0, \\\"issues\\\":[{\\\"type\\\":\\\"number|date|monetary|entity\\\", \\\"comment\\\": \\\"brief reason\\\"}]}\n"
        f"Input: EN: {a_txt}\nDE: {b_txt}\n\nOutput:"
    )
    body = {
        "input": prompt,
        "parameters": {"decoding_method": "greedy", "max_new_tokens": 200, "min_new_tokens": 0, "repetition_penalty": 1},
        "model_id": model_id,
        "project_id": project_id,
    }
    r = requests.post(
        f"{base_url}/ml/v1/text/generation?version=2023-05-29",
        headers={"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        json=body,
        timeout=60,
    )
    if r.status_code != 200:
        return {"status": "REVIEW", "confidence": 0.0, "issues": []}
    out = r.json()
    text = out.get("results", [{}])[0].get("generated_text", "{}")
    try:
        return json.loads(text)
    except Exception:
        return {"status": "REVIEW", "confidence": 0.0, "issues": []}


@app.post("/analyze")
async def analyze(source: UploadFile = File(...), target: UploadFile = File(...)):
    src = (await source.read()).decode("utf-8", "ignore")
    tgt = (await target.read()).decode("utf-8", "ignore")
    s_segs, t_segs = segment(src), segment(tgt)
    pairs = align(s_segs, t_segs)
    rows: List[Dict[str, Any]] = []
    for i, s, t in pairs:
        sim = round(similarity(s, t), 3)
        verdict = watsonx_check(s, t) if os.getenv("WML_API_KEY") else {"issues": []}
        ai_mismatch = bool(verdict.get("issues"))
        rows.append({"index": i, "source": s, "target": t, "similarity": sim, "isMismatch": ai_mismatch or sim < 0.6, "ai": verdict})
    project_id = str(uuid.uuid4())
    data = {
        "projectId": project_id,
        "createdAt": int(time.time()),
        "filenames": {"source": source.filename, "target": target.filename},
        "summary": summarize(rows),
        "pairs": rows,
    }
    REPORTS[project_id] = data
    return data


@app.get("/results/{project_id}")
def get_results(project_id: str):
    data = REPORTS.get(project_id)
    if not data:
        raise HTTPException(status_code=404, detail="Report not found")
    return data


@app.get("/reports")
def list_reports():
    items = sorted(REPORTS.values(), key=lambda x: x.get("createdAt", 0), reverse=True)[:25]
    return {"items": [{"projectId": x["projectId"], "createdAt": x["createdAt"], "filenames": x["filenames"], "summary": x["summary"]} for x in items]}


