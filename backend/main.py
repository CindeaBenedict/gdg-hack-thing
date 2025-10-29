from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Routers will be imported after app creation to avoid circular imports

app = FastAPI(title="ClauseMatch++ API", version="0.1.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


# Import routers after app is created
from backend.routes import analyze  # noqa: E402

app.include_router(analyze.router, prefix="/api")


