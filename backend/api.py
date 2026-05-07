import json
import os
from urllib.parse import urlparse

import pymysql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from recommender import get_recommendations


app = FastAPI(title="Soundcovery Recommender API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Origins später anpassen, wenn Frontend deployed ist


class RecommendRequest(BaseModel):
    band: str


class TrackRequest(BaseModel):
    session_id: str | None = None
    event_type: str
    payload: dict = {}


def get_tracking_connection():
    database_url = os.environ.get("TRACKING_DATABASE_URL")

    if not database_url:
        raise RuntimeError("TRACKING_DATABASE_URL is not set")

    parsed = urlparse(database_url)

    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=parsed.path.lstrip("/"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


def init_tracking_db():
    with get_tracking_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    session_id VARCHAR(128),
                    event_type VARCHAR(100) NOT NULL,
                    payload JSON
                );
            """)


def write_tracking_event(session_id, event_type, payload):
    with get_tracking_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (session_id, event_type, payload)
                VALUES (%s, %s, %s)
                """,
                (
                    session_id,
                    event_type,
                    json.dumps(payload),
                ),
            )


@app.on_event("startup")
def startup():
    # Tracking DB nur initialisieren, wenn die Env Var gesetzt ist.
    # Dadurch crasht lokale Entwicklung ohne Tracking-DB nicht sofort.
    if os.environ.get("TRACKING_DATABASE_URL"):
        init_tracking_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/recommend")
def recommend(request: RecommendRequest):
    band = request.band.strip()

    if not band:
        return {
            "error": "Band is required.",
            "recommendations": [],
            "recommendation_groups": [],
        }

    try:
        return get_recommendations(band)
    except Exception as e:
        return {
            "error": str(e),
            "recommendations": [],
            "recommendation_groups": [],
        }


@app.post("/track")
def track(request: TrackRequest):
    try:
        write_tracking_event(
            session_id=request.session_id,
            event_type=request.event_type,
            payload=request.payload,
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}