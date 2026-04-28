from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from recommender import get_recommendations


app = FastAPI(title="Soundcovery Recommender API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://soundcovery.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    band: str


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