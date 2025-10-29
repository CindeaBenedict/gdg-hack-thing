JOBS = {}

def enqueue(job_id, en_text, de_text):
    # Minimal inline pipeline: just echo summary
    JOBS[job_id] = {"status": "RUNNING"}
    findings = []
    summary = {"ok": 0, "review": 0, "mismatch": 0}
    JOBS[job_id] = {"status": "COMPLETED", "summary": summary, "findings": findings, "artifacts": {}}

def status(job_id):
    return JOBS.get(job_id, {"status": "UNKNOWN"})

def findings(job_id):
    return JOBS.get(job_id, {}).get("findings", [])

def pdf(job_id):
    return (JOBS.get(job_id, {}).get("artifacts", {}) or {}).get("pdf")
