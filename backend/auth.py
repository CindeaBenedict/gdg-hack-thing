import json
import os
from typing import Any, Dict

import firebase_admin
from fastapi import Depends, HTTPException, Request, status
from firebase_admin import auth as admin_auth
from firebase_admin import credentials, firestore


def _insecure_mode() -> bool:
    return os.getenv("FIREBASE_ALLOW_INSECURE", "").lower() in {"1", "true", "yes"}


def _init_firebase_admin() -> None:
    if firebase_admin._apps:  # already initialized
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        if _insecure_mode():
            return
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT env var not set. Provide service account JSON string."
        )
    try:
        cred = credentials.Certificate(json.loads(service_account_json))
        firebase_admin.initialize_app(cred)
    except Exception as exc:
        if _insecure_mode():
            # Skip initialization in insecure mode
            return
        raise RuntimeError("Invalid FIREBASE_SERVICE_ACCOUNT JSON") from exc


_init_firebase_admin()


def get_db():
    if _insecure_mode():
        return None
    return firestore.client()


async def verify_token(request: Request) -> Dict[str, Any]:
    if _insecure_mode():
        return {"uid": "dev-user"}
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header"
        )
    id_token = auth_header.split(" ", 1)[1]
    try:
        decoded = admin_auth.verify_id_token(id_token)
        return decoded
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )


