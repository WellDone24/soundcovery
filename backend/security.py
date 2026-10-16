"""Bounded, toggleable, one-instance application-layer abuse mitigation.

IP keys are based on the socket peer by default. When behind Railway's edge,
X-Real-IP may be used only by opting into SOUNDCOVERY_TRUST_PROXY=1.
In-memory limits must be replaced with shared storage before scaling replicas.
"""
from collections import defaultdict, deque
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from threading import Lock
import ipaddress
import os
import time

MAX_BODY_BYTES = int(os.getenv("SOUNDCOVERY_MAX_REQUEST_BYTES", "16384"))
ENABLED = os.getenv("SOUNDCOVERY_RATE_LIMIT_ENABLED", "1") == "1"
TRUST_PROXY = os.getenv("SOUNDCOVERY_TRUST_PROXY", "0") == "1"
LIMITS = {
    "/recommend": [(10, 60), (100, 86400)],
    "/festivals": [(60, 60)],
    "/track": [(30, 60)],
    "/health": [(10, 60)],
}
GLOBAL_LIMIT = (600, 60)
MAX_KEYS = 15000


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._events = defaultdict(deque)
        self._lock = Lock()
        self._last_cleanup = time.monotonic()

    def _allow(self, key, count, period, now):
        q = self._events[key]
        while q and q[0] <= now - period:
            q.popleft()
        if len(q) >= count:
            return False
        q.append(now)
        return True

    async def dispatch(self, request, call_next):
        path = request.url.path
        if path not in LIMITS:
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)

        if request.method == "POST":
            try:
                length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return JSONResponse({"error": "Invalid Content-Length"}, status_code=400)
            if length > MAX_BODY_BYTES:
                return JSONResponse({"error": "Request too large"}, status_code=413)
            body = await request.body()
            if len(body) > MAX_BODY_BYTES:
                return JSONResponse({"error": "Request too large"}, status_code=413)

        if ENABLED:
            peer = request.client.host if request.client else "unknown"
            if TRUST_PROXY:
                # Railway public HTTP edge replaces X-Real-IP. Enable this
                # only for edge-only services without private/TCP callers.
                forwarded = request.headers.get("x-real-ip", "").strip()
                if forwarded:
                    try:
                        peer = str(ipaddress.ip_address(forwarded))
                    except ValueError:
                        pass
            now = time.monotonic()
            with self._lock:
                if now - self._last_cleanup > 3600:
                    expired = [key for key, q in self._events.items()
                               if not q or q[-1] < now - 86400]
                    for key in expired:
                        del self._events[key]
                    self._last_cleanup = now
                # Global cap limits spoofed-client traffic even if proxy trust is misconfigured.
                allowed = self._allow(("global", path), *GLOBAL_LIMIT, now)
                if allowed:
                    for count, period in LIMITS[path]:
                        if not self._allow((peer, path, period), count, period, now):
                            allowed = False
                            break
                if len(self._events) > MAX_KEYS:
                    # Evict oldest idle client buckets; never reset global counts.
                    candidates = [(q[-1] if q else float('-inf'), key)
                                  for key, q in self._events.items()
                                  if key[0] != 'global']
                    candidates.sort(key=lambda item: item[0])
                    for _, key in candidates[:len(self._events) - MAX_KEYS]:
                        self._events.pop(key, None)
            if not allowed:
                return JSONResponse(
                    {"error": "Too many requests"}, status_code=429,
                    headers={"Retry-After": "60"},
                )
        return await call_next(request)
