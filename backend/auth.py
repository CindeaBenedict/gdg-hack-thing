import json
import os
from typing import Any, Dict

import firebase_admin
from fastapi import Depends, HTTPException, Request, status
from firebase_admin import auth as admin_auth
from firebase_admin import credentials, firestore


def _init_firebase_admin() -> None:
    if firebase_admin._apps:  # already initialized
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT env var not set. Provide service account JSON string."
        )
    try:
        cred = credentials.Certificate(json.loads(service_account_json))
    except Exception as exc:
        raise RuntimeError("Invalid FIREBASE_SERVICE_ACCOUNT JSON") from exc
    firebase_admin.initialize_app(cred)


_init_firebase_admin()


def get_db():
    return firestore.client()


async def verify_token(request: Request) -> Dict[str, Any]:
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


