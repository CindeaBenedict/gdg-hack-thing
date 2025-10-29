from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from uuid import uuid4
from .services import orchestrator_client
from .pipeline.ingestion import parse_document

app = FastAPI(title="ClauseMatch++ API")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/v1/analyze")
async def analyze(en: UploadFile = File(...), de: UploadFile = File(...)):
    # Persist temp files to support multi-format parsing
    job_id = str(uuid4())
    tmp_dir = Path("/tmp")
    en_path = tmp_dir / f"{job_id}_en_{en.filename}"
    de_path = tmp_dir / f"{job_id}_de_{de.filename}"
    en_bytes = await en.read()
    de_bytes = await de.read()
    en_path.write_bytes(en_bytes)
    de_path.write_bytes(de_bytes)
    # Parse to text
    en_text = parse_document(en_path, "en")
    de_text = parse_document(de_path, "de")
    orchestrator_client.enqueue(job_id, en_text, de_text)
    return {"job_id": job_id}

@app.get("/v1/jobs/{job_id}")
def job_status(job_id: str):
    return orchestrator_client.status(job_id)

@app.get("/v1/jobs/{job_id}/findings")
def findings(job_id: str):
    return orchestrator_client.findings(job_id)

@app.get("/v1/jobs/{job_id}/report.pdf")
def report(job_id: str):
    return orchestrator_client.pdf(job_id)

# Serve artifacts directory for dev
app.mount("/artifacts", StaticFiles(directory="app/artifacts"), name="artifacts")
