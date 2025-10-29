from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from uuid import uuid4
from .services import orchestrator_client

app = FastAPI(title="ClauseMatch++ API")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/v1/analyze")
async def analyze(en: UploadFile = File(...), de: UploadFile = File(...)):
    en_text = (await en.read()).decode("utf-8", "ignore")
    de_text = (await de.read()).decode("utf-8", "ignore")
    job_id = str(uuid4())
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
