"""Keep the backend's SQLite production snapshot synced with the Railway S3 bucket.

The bucket is opt-in through PROD_DB_SOURCE=s3. Startup in S3 mode must download
and validate the bucket snapshot, so a stale bundled DB is never served.
"""

from __future__ import annotations

import logging
from contextlib import closing
import os
import sqlite3
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

LOG = logging.getLogger(__name__)

REQUIRED_S3_ENV = (
    "AWS_ENDPOINT_URL",
    "AWS_S3_BUCKET_NAME",
    "AWS_DEFAULT_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
)

REQUIRED_TABLES = (
    "active_sets",
    "artist_sets",
    "artist_axis_vectors",
    "artist_genre_enrichment",
    "festival_timetable",
    "axis_text_fragments",
    "artist_external_links",
)


class ProdDatabaseSync:
    """Synchronize a validated SQLite snapshot from an S3-compatible bucket."""

    def __init__(self, db_path: str | os.PathLike, *, environ=None, client=None, clock=None):
        env = os.environ if environ is None else environ
        self.path = Path(db_path).expanduser().resolve()
        self.source = env.get("PROD_DB_SOURCE", "local").strip().lower()
        if self.source not in {"local", "s3"}:
            raise ValueError("PROD_DB_SOURCE must be 'local' or 's3'.")

        self.object_key = env.get("PROD_DB_OBJECT_KEY", "prod/saem_prod.db").strip()
        self.refresh_seconds = int(env.get("PROD_DB_REFRESH_SECONDS", "60"))
        if self.refresh_seconds < 10:
            raise ValueError("PROD_DB_REFRESH_SECONDS must be at least 10.")

        self._settings = {}
        if self.source == "s3":
            missing = [name for name in REQUIRED_S3_ENV if not env.get(name)]
            if missing:
                raise RuntimeError("Missing S3 environment variables: " + ", ".join(missing))
            self._settings = {name: env[name] for name in REQUIRED_S3_ENV}
            if not self.object_key:
                raise ValueError("PROD_DB_OBJECT_KEY cannot be empty.")

        self._client = client
        self._clock = clock or time.monotonic
        self._lock = threading.Lock()
        self._remote_version = None
        self._next_check = 0.0
        self._last_loaded_at = None
        self._last_checked_at = None
        self._last_error = None

    def _get_client(self):
        if self._client is None:
            try:
                import boto3
            except ImportError as exc:
                raise RuntimeError("boto3 is required when PROD_DB_SOURCE=s3") from exc
            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings["AWS_ENDPOINT_URL"],
                region_name=self._settings["AWS_DEFAULT_REGION"],
                aws_access_key_id=self._settings["AWS_ACCESS_KEY_ID"],
                aws_secret_access_key=self._settings["AWS_SECRET_ACCESS_KEY"],
            )
        return self._client

    @staticmethod
    def _validate_database(path: Path):
        """Reject corrupt/incompatible snapshots before replacing the serving DB."""
        if path.stat().st_size == 0:
            raise RuntimeError("Downloaded production database is empty.")
        with closing(sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)) as conn:
            quick_check = conn.execute("PRAGMA quick_check").fetchone()
            if not quick_check or quick_check[0] != "ok":
                raise RuntimeError(f"Downloaded SQLite quick_check failed: {quick_check}")
            available = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            missing = sorted(set(REQUIRED_TABLES) - available)
            if missing:
                raise RuntimeError("Downloaded DB missing required tables: " + ", ".join(missing))
            if conn.execute("SELECT COUNT(*) FROM active_sets WHERE is_active = 1").fetchone()[0] == 0:
                raise RuntimeError("Downloaded DB contains no active sets.")
            if conn.execute("SELECT COUNT(*) FROM artist_sets").fetchone()[0] == 0:
                raise RuntimeError("Downloaded DB contains no artist sets.")

    def refresh(self, *, force=False) -> bool:
        """Install a new snapshot if needed; raise on any download/validation error."""
        if self.source == "local":
            return False

        with self._lock:
            now = self._clock()
            if not force and now < self._next_check:
                return False
            self._next_check = now + self.refresh_seconds
            self._last_checked_at = datetime.now(timezone.utc).isoformat()
            incoming = None
            try:
                client = self._get_client()
                bucket = self._settings["AWS_S3_BUCKET_NAME"]
                head = client.head_object(Bucket=bucket, Key=self.object_key)
                remote_version = (
                    head.get("ETag"),
                    str(head.get("LastModified")),
                    head.get("ContentLength"),
                )
                if remote_version == self._remote_version and self.path.is_file():
                    self._last_error = None
                    return False

                self.path.parent.mkdir(parents=True, exist_ok=True)
                fd, filename = tempfile.mkstemp(
                    prefix=self.path.name + ".", suffix=".incoming", dir=self.path.parent
                )
                os.close(fd)
                incoming = Path(filename)
                client.download_file(bucket, self.object_key, str(incoming))
                self._validate_database(incoming)
                os.replace(incoming, self.path)
                incoming = None
                self._remote_version = remote_version
                self._last_loaded_at = datetime.now(timezone.utc).isoformat()
                self._last_error = None
                LOG.info(
                    "Installed verified production database from S3 key %s (ETag %s)",
                    self.object_key,
                    remote_version[0],
                )
                return True
            except Exception as exc:
                self._last_error = f"{type(exc).__name__}: {exc}"
                LOG.exception("Prod DB synchronization failed; keeping previous DB unchanged")
                raise
            finally:
                if incoming is not None:
                    incoming.unlink(missing_ok=True)

    def status(self):
        return {
            "source": self.source,
            "object_key": self.object_key if self.source == "s3" else None,
            "last_checked_at": self._last_checked_at,
            "last_loaded_at": self._last_loaded_at,
            "last_error": self._last_error,
            "etag": self._remote_version[0] if self._remote_version else None,
        }
