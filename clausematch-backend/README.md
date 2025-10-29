# ClauseMatch++ Backend (Multi-Service)

Execution-ready scaffold: API gateway, orchestrator pipeline, and stubs for rules, semantic (watsonx), RAG, ranker, storage, renderer, governance.

## Quickstart (dev)
1) Create `.env` from the outline and fill values.
2) Run: `docker compose up -d --build`
3) Health: `curl http://localhost:8000/health`

## Services
- API: `/v1/analyze`, `/v1/jobs/{id}`, findings stream, PDF link
- Orchestrator: receives jobs, runs pipeline (in-memory for dev)
- Stubs: rules, semantic, rag, ranker, storage, renderer, governance

See the provided outline for full contracts and pipeline.
