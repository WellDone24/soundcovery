import os
import json
import logging
import sqlite3
import threading
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import pymysql
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from security import SecurityMiddleware

from recommender import get_recommendations, DB_PATH
from festival_loader import build_festivals_response
from prod_db_sync import ProdDatabaseSync


logger = logging.getLogger(__name__)
prod_db_sync = ProdDatabaseSync(DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed on startup in S3 mode; do not accidentally serve a stale bundled DB.
    prod_db_sync.refresh(force=True)
    yield


app = FastAPI(title="Soundcovery Recommender API", lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SecurityMiddleware)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        x.strip() for x in os.getenv(
            "SOUNDCOVERY_ALLOWED_ORIGINS",
            "https://soundcovery.com,https://www.soundcovery.com"
        ).split(",") if x.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
# Origins später anpassen, wenn Frontend deployed ist


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    band: str = Field(min_length=1, max_length=300)
    festival: str | None = Field(default=None, max_length=120)
    time_filter: str = Field(default="upcoming", pattern="^(upcoming|all|today|date)$")
    selected_date: str | None = Field(default=None, max_length=35)
    now: str | None = Field(default=None, max_length=40)


class TrackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str | None = Field(default=None, max_length=128)
    event_type: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z][a-zA-Z0-9_:-]*$")
    payload: dict = Field(default_factory=dict)


def check_for_database_update():
    """Check for newer snapshots while retaining the previous verified DB on error."""
    try:
        prod_db_sync.refresh()
    except Exception:
        logger.warning("Serving last verified DB; bucket refresh failed", exc_info=True)


def get_saem_connection():
    check_for_database_update()
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


_events_initialized = False
_events_lock = threading.Lock()


def ensure_events_table():
    global _events_initialized
    if _events_initialized:
        return
    with _events_lock:
        if _events_initialized:
            return
        _create_events_table()
        _events_initialized = True


def _create_events_table():
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
    except Exception:
        result["ok"] = False
        result["tracking"] = "unavailable"

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
    except Exception:
        result["ok"] = False
        result["saem_db"] = "unavailable"

    sync = prod_db_sync.status()
    if sync["last_error"] is not None:
        result["ok"] = False
    result["prod_db_sync"] = {"source": sync["source"], "healthy": sync["last_error"] is None}

    return result


@app.get("/festivals")
def festivals():
    try:
        conn = get_saem_connection()

        try:
            return build_festivals_response(conn)
        finally:
            conn.close()

    except Exception:
        logger.exception("Failed to fetch festivals")
        return {
            "error": "Service temporarily unavailable",
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
        # The recommender opens its own connections; refresh before invoking it.
        check_for_database_update()
        return get_recommendations(
            raw_input=band,
            festival_slug=request.festival,
            time_filter=request.time_filter,
            selected_date=request.selected_date,
            now=request.now,
        )

    except Exception:
        logger.exception("Recommendation request failed")
        return {
            "error": "Recommendation temporarily unavailable",
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

    except Exception:
        logger.exception("Tracking request failed")
        return {
            "ok": False,
            "error": "Tracking temporarily unavailable",
        }