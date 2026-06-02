import os
import json
import sqlite3
from urllib.parse import urlparse

import pymysql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from recommender import get_recommendations, DB_PATH
from festival_loader import build_festivals_response


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
    festival: str | None = None
    time_filter: str = "upcoming"
    selected_date: str | None = None
    now: str | None = None


class TrackRequest(BaseModel):
    session_id: str | None = None
    event_type: str
    payload: dict = Field(default_factory=dict)


def get_saem_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
    result = {
        "ok": True,
        "tracking": None,
        "saem_db": None,
    }

    try:
        conn = get_tracking_connection()
        conn.close()
        result["tracking"] = "db connected"
    except Exception as e:
        result["ok"] = False
        result["tracking_error"] = str(e)

    try:
        conn = get_saem_connection()
        try:
            row = conn.execute("SELECT COUNT(*) AS n FROM active_sets").fetchone()
            result["saem_db"] = {
                "connected": True,
                "active_sets": int(row["n"]),
            }
        finally:
            conn.close()
    except Exception as e:
        result["ok"] = False
        result["saem_db_error"] = str(e)

    return result


@app.get("/festivals")
def festivals():
    try:
        conn = get_saem_connection()

        try:
            return build_festivals_response(conn)
        finally:
            conn.close()

    except Exception as e:
        return {
            "error": str(e),
            "festivals": [],
            "default_festival_slug": None,
        }


@app.post("/recommend")
def recommend(request: RecommendRequest):
    band = request.band.strip()

    if not band:
        return {
            "error": "Band is required.",
            "recommendations": [],
            "recommendation_groups": [],
            "festival": request.festival,
            "time_filter": request.time_filter,
            "selected_date": request.selected_date,
        }

    try:
        return get_recommendations(
            raw_input=band,
            festival_slug=request.festival,
            time_filter=request.time_filter,
            selected_date=request.selected_date,
            now=request.now,
        )

    except Exception as e:
        return {
            "error": str(e),
            "recommendations": [],
            "recommendation_groups": [],
            "festival": request.festival,
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