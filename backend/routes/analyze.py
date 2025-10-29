import os
import time
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from firebase_admin import firestore as fb_firestore

from backend.auth import get_db, verify_token
from backend.clausematch import align, compare, extract, report, segment


router = APIRouter(tags=["analyze"])
INSECURE_MODE = os.getenv("FIREBASE_ALLOW_INSECURE", "").lower() in {"1", "true", "yes"}
_INMEM_REPORTS: Dict[str, Dict[str, Any]] = {}


@router.post("/analyze")
async def analyze_endpoint(
    source: UploadFile = File(...),
    target: UploadFile = File(...),
    user: Dict[str, Any] = Depends(verify_token),
):
    src_bytes = await source.read()
    tgt_bytes = await target.read()
    src_text = src_bytes.decode("utf-8", errors="ignore")
    tgt_text = tgt_bytes.decode("utf-8", errors="ignore")

    src_segments = segment.segment_text(src_text)
    tgt_segments = segment.segment_text(tgt_text)
    pairs = align.align_segments(src_segments, tgt_segments)
    entities = extract.extract_entities(pairs)
    comparisons = compare.compare_pairs(pairs, entities)
    summary = report.summarize(comparisons)

    project_id = str(uuid.uuid4())
    created_at = int(time.time())

    result = {
        "projectId": project_id,
        "userId": user.get("uid"),
        "createdAt": created_at,
        "filenames": {"source": source.filename, "target": target.filename},
        "summary": summary,
        "pairs": comparisons,
    }

    if INSECURE_MODE:
        _INMEM_REPORTS[project_id] = {
            "userId": result["userId"],
            "createdAt": created_at,
            "filenames": result["filenames"],
            "summary": summary,
            "pairs": comparisons,
        }
    else:
        db = get_db()
        db.collection("reports").document(project_id).set(
            {
                "userId": result["userId"],
                "createdAt": created_at,
                "filenames": result["filenames"],
                "summary": summary,
            }
        )

    return result


@router.get("/results/{project_id}")
def get_results(project_id: str, user: Dict[str, Any] = Depends(verify_token)):
    if INSECURE_MODE:
        data = _INMEM_REPORTS.get(project_id)
        if not data:
            raise HTTPException(status_code=404, detail="Report not found")
        return {"projectId": project_id, **data}
    else:
        db = get_db()
        doc = db.collection("reports").document(project_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Report not found")
        data = doc.to_dict()
        if data.get("userId") != user.get("uid"):
            raise HTTPException(status_code=403, detail="Forbidden")
        return {"projectId": project_id, **data}


@router.get("/reports")
def list_reports(user: Dict[str, Any] = Depends(verify_token)):
    if INSECURE_MODE:
        # Return latest 25 by createdAt
        items = sorted(
            (
                {"projectId": pid, **data}
                for pid, data in _INMEM_REPORTS.items()
            ),
            key=lambda x: x.get("createdAt", 0),
            reverse=True,
        )[:25]
        return {"items": items}
    else:
        db = get_db()
        query = (
            db.collection("reports")
            .where("userId", "==", user.get("uid"))
            .order_by("createdAt", direction=fb_firestore.Query.DESCENDING)
            .limit(25)
        )
        items: List[Dict[str, Any]] = []
        for doc in query.stream():
            items.append({"projectId": doc.id, **doc.to_dict()})
        return {"items": items}


