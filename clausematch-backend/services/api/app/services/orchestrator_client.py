from ..pipeline import segment, align, rules, semantic, rag_client, ranker, storage, renderer_client, governance

JOBS = {}

def enqueue(job_id, en_text, de_text):
    JOBS[job_id] = {"status": "RUNNING"}
    try:
        en_clauses = segment.segment(en_text, lang="en")
        de_clauses = segment.segment(de_text, lang="de")
        pairs = align.anchor_align(en_clauses, de_clauses)
        if not pairs:
            pairs = semantic.embed_align(en_clauses, de_clauses)

        findings = []
        for key, a_txt, b_txt in pairs:
            fa = rules.extract_facts(a_txt, lang="en")
            fb = rules.extract_facts(b_txt, lang="de")
            diffs = rules.compare_facts(fa, fb)
            sem = semantic.llm_check(a_txt, b_txt, fa, fb)
            contexts = rag_client.topk(a_txt, lang="en", k=3)
            merged = rules.merge_findings(key, diffs, sem, contexts)
            if isinstance(merged, list):
                for f in merged:
                    f.update(ranker.score(f))
                findings.extend(merged)
            else:
                merged.update(ranker.score(merged))
                findings.append(merged)

        summary = rules.summarize(findings)
        storage.put_json(f"{job_id}/findings.json", findings)
        storage.put_json(f"{job_id}/summary.json", summary)
        pdf_url = renderer_client.render_pdf(job_id, findings, summary)
        governance.log_run(job_id, summary, findings)

        JOBS[job_id] = {
            "status": "COMPLETED",
            "summary": summary,
            "findings": findings,
            "artifacts": {"pdf": pdf_url},
        }
    except Exception as exc:
        JOBS[job_id] = {"status": "FAILED", "error": str(exc)}

def status(job_id):
    return JOBS.get(job_id, {"status": "UNKNOWN"})

def findings(job_id):
    return JOBS.get(job_id, {}).get("findings", [])

def pdf(job_id):
    return (JOBS.get(job_id, {}).get("artifacts", {}) or {}).get("pdf")
