"""Smoke tests of actual FastAPI app; never uses production credentials."""
import os
import pathlib
import sys

os.environ["PROD_DB_SOURCE"] = "local"
os.environ.pop("Tracking_Database_URL", None)
os.environ["SOUNDCOVERY_RATE_LIMIT_ENABLED"] = "1"
os.environ["SOUNDCOVERY_TRUST_PROXY"] = "0"
os.environ["SOUNDCOVERY_ALLOWED_ORIGINS"] = "https://soundcovery.com,https://www.soundcovery.com"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from api import app


def test_real_api_smoke_and_cors():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["saem_db"]["connected"] is True

        r = client.get("/festivals", headers={"Origin": "https://soundcovery.com"})
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "https://soundcovery.com"
        assert r.json()["festivals"]

        r = client.get("/festivals", headers={"Origin": "https://evil.example"})
        assert r.status_code == 200
        assert "access-control-allow-origin" not in r.headers

        r = client.options("/recommend", headers={
            "Origin": "https://soundcovery.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "https://soundcovery.com"

        r = client.post("/recommend", json={"band": "Radiohead", "time_filter": "all"})
        assert r.status_code == 200
        assert "recommendations" in r.json()

        r = client.post("/recommend", json={"band": "x" * 301})
        assert r.status_code == 422

        r = client.post("/track", json={"event_type": "security_smoke", "payload": {}})
        assert r.status_code == 200
        assert r.json()["ok"] is False
        assert r.json()["error"] == "Tracking temporarily unavailable"

        assert client.get("/openapi.json").status_code == 404
