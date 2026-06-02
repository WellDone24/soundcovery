import sqlite3
from typing import Any


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def has_timetable(
    conn: sqlite3.Connection,
    set_name: str,
    set_version: str,
) -> bool:
    row = conn.execute("""
        SELECT COUNT(*) AS n
        FROM festival_timetable
        WHERE set_name = ?
          AND set_version = ?
    """, (set_name, set_version)).fetchone()

    if row is None:
        return False

    return int(row["n"]) > 0


def load_active_festivals(
    conn: sqlite3.Connection,
) -> list[dict[str, Any]]:
    rows = conn.execute("""
        SELECT
            festival_slug,
            display_name,
            set_name,
            set_version,
            is_default,
            sort_order,
            starts_on,
            ends_on
        FROM active_sets
        WHERE is_active = 1
        ORDER BY sort_order, display_name
    """).fetchall()

    festivals: list[dict[str, Any]] = []

    for row in rows:
        item = row_to_dict(row)

        item["is_default"] = bool(item["is_default"])
        item["sort_order"] = int(item["sort_order"])
        item["has_timetable"] = has_timetable(
            conn=conn,
            set_name=item["set_name"],
            set_version=item["set_version"],
        )

        festivals.append(item)

    return festivals


def get_default_festival(
    conn: sqlite3.Connection,
) -> dict[str, Any]:
    festivals = load_active_festivals(conn)

    if not festivals:
        raise ValueError("No active festivals found in active_sets.")

    defaults = [
        festival
        for festival in festivals
        if festival["is_default"]
    ]

    if len(defaults) == 1:
        return defaults[0]

    if len(defaults) > 1:
        raise ValueError(
            "More than one active festival is marked as default in active_sets."
        )

    # Defensive fallback.
    # Your build script should normally ensure exactly one default.
    return festivals[0]


def resolve_festival_context(
    conn: sqlite3.Connection,
    festival_slug: str | None = None,
) -> dict[str, Any]:
    """
    Resolves a public festival_slug to the internal set_name/set_version pair.

    If festival_slug is None or empty, the default active festival is returned.
    """

    if festival_slug is None or not festival_slug.strip():
        return get_default_festival(conn)

    normalized_slug = festival_slug.strip()

    row = conn.execute("""
        SELECT
            festival_slug,
            display_name,
            set_name,
            set_version,
            is_default,
            sort_order,
            starts_on,
            ends_on
        FROM active_sets
        WHERE festival_slug = ?
          AND is_active = 1
        LIMIT 1
    """, (normalized_slug,)).fetchone()

    if row is None:
        raise ValueError(f"Unknown or inactive festival: {normalized_slug}")

    item = row_to_dict(row)

    item["is_default"] = bool(item["is_default"])
    item["sort_order"] = int(item["sort_order"])
    item["has_timetable"] = has_timetable(
        conn=conn,
        set_name=item["set_name"],
        set_version=item["set_version"],
    )

    return item


def build_festivals_response(
    conn: sqlite3.Connection,
) -> dict[str, Any]:
    """
    Convenience helper for an /api/festivals endpoint.
    """

    festivals = load_active_festivals(conn)

    if not festivals:
        return {
            "festivals": [],
            "default_festival_slug": None,
        }

    defaults = [
        festival
        for festival in festivals
        if festival["is_default"]
    ]

    if len(defaults) > 1:
        raise ValueError(
            "More than one active festival is marked as default in active_sets."
        )

    default_festival = defaults[0] if defaults else festivals[0]

    return {
        "festivals": festivals,
        "default_festival_slug": default_festival["festival_slug"],
    }