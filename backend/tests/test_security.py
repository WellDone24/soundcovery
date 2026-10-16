import importlib
import pathlib
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import security


def client():
    app = FastAPI()
    app.add_middleware(security.SecurityMiddleware)

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/recommend")
    def recommend():
        return {"recommendations": []}

    @app.post("/track")
    def track():
        return {"ok": True}
    return TestClient(app)


def test_health_limit():
    with client() as c:
        for _ in range(10):
            assert c.get("/health").status_code == 200
        assert c.get("/health").status_code == 429


def test_recommend_limit():
    with client() as c:
        for _ in range(10):
            assert c.post("/recommend", json={"band": "Test"}).status_code == 200
        r = c.post("/recommend", json={"band": "Test"})
        assert r.status_code == 429
        assert r.headers["retry-after"] == "60"


def test_track_limit():
    with client() as c:
        for _ in range(30):
            assert c.post("/track", json={"event_type": "test"}).status_code == 200
        assert c.post("/track", json={"event_type": "test"}).status_code == 429


def test_reject_oversize_and_malformed_length():
    with client() as c:
        r = c.post("/track", content="x" * (security.MAX_BODY_BYTES + 1))
        assert r.status_code == 413
        r = c.post("/track", content="{}", headers={"content-length": "invalid"})
        assert r.status_code in (200, 400)


def test_no_trust_of_forged_ip_by_default():
    assert security.TRUST_PROXY is False
    with client() as c:
        for i in range(10):
            assert c.get("/health", headers={"x-real-ip": f"192.0.2.{i+1}"}).status_code == 200
        assert c.get("/health", headers={"x-real-ip": "198.51.100.2"}).status_code == 429


def test_proxy_trust_opt_in_distinguishes_visitors(monkeypatch):
    monkeypatch.setattr(security, "TRUST_PROXY", True)
    with client() as c:
        for i in range(11):
            assert c.get("/health", headers={"x-real-ip": f"192.0.2.{i+1}"}).status_code == 200
        for i in range(9):
            assert c.get("/health", headers={"x-real-ip": "192.0.2.1"}).status_code == 200
        assert c.get("/health", headers={"x-real-ip": "192.0.2.1"}).status_code == 429


def test_key_pressure_cannot_reset_global_rate_limit(monkeypatch):
    monkeypatch.setattr(security, "MAX_KEYS", 3)
    monkeypatch.setattr(security, "TRUST_PROXY", True)
    monkeypatch.setattr(security, "GLOBAL_LIMIT", (5, 60))
    with client() as c:
        for i in range(5):
            assert c.get("/health", headers={"x-real-ip": f"192.0.2.{i + 1}"}).status_code == 200
        assert c.get("/health", headers={"x-real-ip": "198.51.100.2"}).status_code == 429
