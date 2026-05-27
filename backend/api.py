import os
import json
from urllib.parse import urlparse

import pymysql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    time_filter: str = "upcoming"
    selected_date: str | None = None
    now: str | None = None


class TrackRequest(BaseModel):
    session_id: str | None = None
    event_type: str
    payload: dict = Field(default_factory=dict)


def get_tracking_connection():
    database_url = os.environ.get("Tracking_Database_URL")

    if not database_url:
        raise RuntimeError("Tracking_Database_URL missing")

    parsed = urlparse(database_url)

    return pymysql.connect(
        host=parsed.hostname,
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password,
        database=parsed.path.lstrip("/"),
        autocommit=True,
    )


def ensure_events_table():
    conn = get_tracking_connection()

    try:
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
    finally:
        conn.close()


def write_event(session_id, event_type, payload):
    ensure_events_table()

    conn = get_tracking_connection()

    try:
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
    finally:
        conn.close()


@app.get("/health")
def health():
    try:
        conn = get_tracking_connection()
        conn.close()

        return {
            "ok": True,
            "tracking": "db connected",
        }

    except Exception as e:
        return {
            "ok": False,
            "tracking_error": str(e),
        }


@app.post("/recommend")
def recommend(request: RecommendRequest):
    band = request.band.strip()

    if not band:
        return {
            "error": "Band is required.",
            "recommendations": [],
            "recommendation_groups": [],
            "time_filter": request.time_filter,
            "selected_date": request.selected_date,
        }

    try:
        return get_recommendations(
            raw_input=band,
            time_filter=request.time_filter,
            selected_date=request.selected_date,
            now=request.now,
        )

    except Exception as e:
        return {
            "error": str(e),
            "recommendations": [],
            "recommendation_groups": [],
            "time_filter": request.time_filter,
            "selected_date": request.selected_date,
        }


@app.post("/track")
def track(request: TrackRequest):
    try:
        write_event(
            session_id=request.session_id,
            event_type=request.event_type,
            payload=request.payload,
        )

        return {
            "ok": True,
        }

    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
        }