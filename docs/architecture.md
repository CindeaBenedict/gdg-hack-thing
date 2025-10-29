## ClauseMatch++ — AI-Driven Multilingual Consistency Engine

IBM x GDG KUL AI Accelerate 2025 • Backend Architecture (Presentation-Ready)

### System-Level Leverage Points

| Strategic Lever | Intervention | Expected Impact |
| --- | --- | --- |
| Data Flow Optimization | Preprocess multilingual documents into structured entities (dates, amounts, numbers) before AI inference. | Reduces token load, boosts accuracy and latency. |
| Hybrid Verification Architecture | Combine deterministic rule validation with LLM-based semantic analysis for factual parity. | Lowers false positives while maintaining semantic sensitivity. |
| Confidence Scoring & Governance | Integrate watsonx Governance to track model confidence, version lineage, and escalate only high-risk discrepancies. | Increases trust, auditability, and explainability. |
| Continuous Learning Loop | Feed proofreader corrections back into the model via feedback dataset ingestion during the hackathon. | Positive improvement cycle: fewer false alerts → faster publication → higher trust. |

### Solution Blueprint (Backend-Focused)

1) Multi-Layer Pipeline

| Layer | Function | Description | IBM Stack |
| --- | --- | --- | --- |
| Layer 1 — Entity Extraction | Rule + LLM parsing | Detect and normalize structured entities (dates, monetary values, numeric identifiers) before semantic comparison. | watsonx.ai Embedding / Granite LLM or regex-based extractor |
| Layer 2 — Semantic Consistency Check | Factual equivalence via LLM | Ensure aligned clauses share identical factual values despite language differences. | watsonx.ai Runtime (Granite 13B Chat V2) |
| Layer 3 — Confidence & Prioritization | Hybrid scoring | Merge rule confidence + semantic alignment + model uncertainty into risk tier (OK / Review / Mismatch). | FastAPI Ranker service + watsonx Governance |
| Layer 4 — Governance & Feedback | Audit + Retraining loop | Feed human proofreader corrections into Eval Sets and RAG knowledge base for incremental learning. | watsonx Governance + RAG Server |

2) Feedback Loop

Proofreader decisions → Governance Eval Set Update → Retrain/Fine-tune or Threshold Tuning → Improved Accuracy → Higher Trust

3) System Metrics & Success Criteria

| Metric | Baseline | Target | Measurement |
| --- | --- | --- | --- |
| False Positive Rate | > 40% (regex only) | < 10% (rule + LLM) | Governance Eval Set |
| Processing Time/doc | ~120 s | < 30 s with preprocessing | Runtime latency logs |
| Proofreader Review Time | 100% manual | < 50% manual | User survey |
| Trust Index | Low | High (> 0.8) | Governance confidence |

---

## Current MVP Layout (Repo Mapping)

- FastAPI App: `backend/main.py`
- Auth & DB: `backend/auth.py` (Firebase Admin, Firestore client)
- API Routes: `backend/routes/analyze.py`
  - POST `/api/analyze`: upload two docs, run ClauseMatch++ stub pipeline, store summary in Firestore.
  - GET `/api/reports`: list latest user reports.
  - GET `/api/results/{projectId}`: fetch single report metadata.
- Pipeline Stubs: `backend/clausematch/`
  - `segment.py`, `align.py`, `extract.py`, `compare.py`, `report.py`

The MVP demonstrates end-to-end flow and UI integration. The following subsystems extend it to the production-grade blueprint.

---

## Backend Subsystems (Integrated with Blueprint)

| Subsystem | Function | Leverage Link | Implementation Plan |
| --- | --- | --- | --- |
| FastAPI Gateway | Job control + upload API | Data Flow Optimization | Extend `/api/analyze` to call preprocess → rule engine → LLM validator → ranker → governance logger. |
| Preprocessing | Normalize entities | Data Flow Optimization | Add `services/preprocess.py` using regex, `dateparser`, `babel`, numeric normalization. |
| Rule Engine | Deterministic validation | Hybrid Verification | Add `services/rules.py` (currency/date/number parity, ranges, required fields). |
| LLM Validator | Semantic factual check | Hybrid Verification | Add `services/watsonx.py` client to Granite 13B Chat V2; prompt templates + retries/timeouts. |
| Ranker | Risk/confidence scoring | Confidence Scoring | Add `services/ranker.py` combining similarity, rule agreement, model confidence → `OK/REVIEW/MISMATCH`. |
| RAG Server (optional) | Retrieve evidence | Continuous Learning | `services/rag.py` with vector store (FAISS/pgvector) seeded by approved reference clauses. |
| Governance Connector | Lineage + eval logging | Governance | `services/governance.py`: record `model_id`, `prompt_id`, `deployment_id`, `confidence`, `risk`, input/output hashes. |
| Renderer | PDF reports | Transparency | `services/reporting.py` using `weasyprint`/`wkhtmltopdf` for auditor-friendly exports. |

Recommended module structure (to be added):

```
backend/services/
  __init__.py
  preprocess.py
  rules.py
  watsonx.py
  ranker.py
  governance.py
  rag.py
  reporting.py
```

---

## Orchestrated Analyze Flow (Server-Side)

1) Receive multipart files (`source`, `target`).
2) Segment each doc → `segment.segment_text`.
3) Align segments → `align.align_segments`.
4) Preprocess entities per pair → `services.preprocess.normalize_entities`.
5) Rule engine → label obvious mismatches + rule confidence.
6) LLM validator (watsonx) → semantic equivalence + model confidence.
7) Ranker → combine similarities + rule/LLM confidences → `OK/REVIEW/MISMATCH`.
8) Governance → record lineage, confidence, risk; store Firestore metadata.
9) Return payload: summary, risk tiers, per-pair findings.

Key data fields per pair:

```
{
  index: number,
  source: string,
  target: string,
  entities: { dates: [...], amounts: [...], numbers: [...] },
  ruleFindings: [...],
  semantic: { similarity: float, equivalent: boolean, modelConfidence: float },
  risk: { score: float, tier: 'OK'|'REVIEW'|'MISMATCH' }
}
```

---

## Governance Integration Pipeline

1) Model Registration → Store Granite deployment metadata (model_id, deployment_id).
2) Prompt Versioning → UUID per template; tracked in repo and Governance.
3) Inference Trace → input/output hashes, latency, confidence, user id, project id.
4) Eval Set Updates → capture proofreader decisions as labeled examples.
5) Periodic Re-Evaluation → precision/recall trend via Governance dashboards.

Example record:

```json
{
  "job_id": "J-2025-1031-001",
  "model_id": "ibm/granite-13b-chat-v2",
  "prompt_id": "PROMPT-V3",
  "deployment_id": "D-4512",
  "confidence": 0.91,
  "risk": "HIGH",
  "findings": 22,
  "timestamp": "2025-10-29T11:12:00Z",
  "eval_reference": "EVAL-SET-5"
}
```

---

## API Contracts (Expanded)

- POST `/api/analyze`
  - Request: multipart form-data `{ source: file, target: file }`
  - Response: `{ projectId, summary, pairs: [...], filenames, createdAt }`

- GET `/api/reports`
  - Response: `{ items: [{ projectId, createdAt, filenames, summary }] }`

- GET `/api/results/{projectId}`
  - Response: `{ projectId, createdAt, filenames, summary, pairs? }` (pairs fetched on-demand in future)

Auth: Firebase ID token `Authorization: Bearer <token>` header.

---

## Non-Functional Requirements

- Security: JWT verification (Firebase), input size limits, timeouts, rate limiting (future).
- Observability: request/latency logs; governance confidence and lineage logs.
- Performance: preprocessing reduces tokens (~40%), targets <30s end-to-end per doc.
- Cost: minimize LLM calls via rule gating and batching; cache segment alignments.

---

## Local and Deployment

Local Dev:
- Backend: `uvicorn backend.main:app --reload --port 8000` (run from repo root, or `uvicorn main:app` from `backend/`)
- Frontend: `npm run dev` in `frontend/` (env in `.env`)

Cloud (Prod) Targets:
- Frontend: Firebase Hosting (`frontend/dist`)
- Backend: Render.com/Fly.io or Kubernetes (IBM Code Engine/OpenShift)
- Secrets: env vars for Firebase and watsonx
- Monitoring: Prometheus/Grafana; watsonx Governance dashboards

---

## Implementation Roadmap (Backend)

1) Add `services/*` modules (preprocess, rules, watsonx, ranker, governance, rag)
2) Upgrade `/api/analyze` orchestration to call services in order
3) Add governance logging and confidence fields to Firestore
4) Add `/api/results/{id}/pairs` for on-demand pair pagination
5) Optional: PDF export endpoint using `reporting.py`

This document is aligned with the hackathon MVP and ready for executive-facing reviews.


