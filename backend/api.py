import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from urllib.parse import urlparse

import pymysql

from recommender import get_recommendations


app = FastAPI(title="Soundcovery Recommender API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Origins später anpassen, wenn Frontend deployed ist

class RecommendRequest(BaseModel):
    band: str


# @app.get("/health")
# def health():
#    return {"ok": True}

@app.get("/health")
def health():
    database_url = os.environ.get("Tracking_Database_URL")

    if not database_url:
        return {
            "ok": False,
            "tracking": "missing env"
        }

    try:
        parsed = urlparse(database_url)

        conn = pymysql.connect(
            host=parsed.hostname,
            port=parsed.port or 3306,
            user=parsed.username,
            password=parsed.password,
            database=parsed.path.lstrip("/"),
        )

        conn.close()

        return {
            "ok": True,
            "tracking": "db connected"
        }

    except Exception as e:
        return {
            "ok": False,
            "tracking_error": str(e)
        }


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