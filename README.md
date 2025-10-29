# ClauseMatch++ Demo Platform

End-to-end hackathon-ready demo: React + FastAPI with Firebase Auth + Firestore. Upload two documents, run ClauseMatch++ analysis, view multilingual mismatch analytics and a simple dashboard.

## Stack
- Frontend: React + Vite + MUI
- Backend: FastAPI (Python)
- Auth/DB: Firebase Authentication + Firestore

## Prerequisites
- Node 18+
- Python 3.10+
- Firebase project with Authentication (Email/Password + Google) and Firestore enabled
- Firebase service account JSON for Admin SDK

## Local Setup

1) Clone and install frontend
```bash
cd frontend
npm install
# copy env and fill values from Firebase console
cat > .env <<'ENV'
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx
ENV
```

2) Create Python venv and install backend deps
```bash
cd ../backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3) Configure Firebase Admin credentials for backend

Export your service account JSON as an env variable (single line JSON string). In another shell or before running the server:
```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account", ... }'
```

4) Run servers
```bash
# backend (from backend/)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# frontend (from frontend/)
npm run dev
```

Open http://localhost:5173 and sign in.

### Architecture
- See `docs/architecture.md` for the integrated leverage points and backend blueprint.

## API
- POST `/api/analyze` multipart form: `source`, `target`
- GET `/api/reports` list user reports
- GET `/api/results/{projectId}` fetch one

All requests require `Authorization: Bearer <Firebase ID token>` header.

## Deploy (optional)
- Frontend: `firebase deploy --only hosting` (build output in `frontend/dist`)
- Backend: Render.com, Fly.io, or similar free tier (set `FIREBASE_SERVICE_ACCOUNT` env var)

## Repo Setup
```bash
git init
git add .
git commit -m "Initial scaffold: backend+frontend MVP"
git branch -M main
git remote add origin git@github.com:CindeaBenedict/gdg-hack-thing.git
git push -u origin main
```

