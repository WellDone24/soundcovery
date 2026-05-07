import sys
import json
import sqlite3

import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist
from sklearn.cluster import KMeans


DB_PATH = r"C:\Python\SAEM\SAEM\data\saem_pool.db"

SAEM_TABLE = "saem_run"
ARTIST_SET_TABLE = "artist_sets"

CANDIDATE_SET_NAME = "rock_for_people_2026"
CANDIDATE_SET_VERSION = "V1"

PARSE_STATUS_OK = "OK"
MAX_CLUSTERS = 3
RECS_PER_CLUSTER = 5


def split_input_artists(raw: str) -> list[str]:
    """Semikolon-Input: 'YONAKA;Architects' -> ['YONAKA', 'Architects']"""
    return [x.strip() for x in raw.split(";") if x.strip()]


def load_artist_matrix(conn: sqlite3.Connection) -> pd.DataFrame:
    """Lädt SAEM-Achsen und baut daraus eine Artist-x-Achsen-Matrix."""
    df = pd.read_sql_query(
        f"""
        SELECT
            TRIM(mbid) AS mbid,
            TRIM(name) AS name,
            TRIM(axis_name) AS axis_name,
            AVG(parsed_value) AS value
        FROM {SAEM_TABLE}
        WHERE parse_status = ?
          AND mbid IS NOT NULL
          AND name IS NOT NULL
          AND axis_name IS NOT NULL
          AND parsed_value IS NOT NULL
        GROUP BY TRIM(mbid), TRIM(name), TRIM(axis_name)
        """,
        conn,
        params=[PARSE_STATUS_OK],
    )

    if df.empty:
        raise ValueError("No SAEM data found.")

    matrix = (
        df.pivot(index=["mbid", "name"], columns="axis_name", values="value")
        .dropna()
        .reset_index()
    )

    return matrix


def load_candidate_set(conn: sqlite3.Connection) -> pd.DataFrame:
    """Lädt Festival-Kandidaten, aktuell fix Rock for People 2026."""
    return pd.read_sql_query(
        f"""
        SELECT DISTINCT
            TRIM(mbid) AS mbid,
            TRIM(name) AS candidate_name
        FROM {ARTIST_SET_TABLE}
        WHERE set_name = ?
          AND set_version = ?
          AND mbid IS NOT NULL
        """,
        conn,
        params=[CANDIDATE_SET_NAME, CANDIDATE_SET_VERSION],
    )


def get_feature_cols(df: pd.DataFrame) -> list[str]:
    """Alle Spalten außer Identität sind SAEM-Achsen."""
    return [c for c in df.columns if c not in {"mbid", "name", "candidate_name"}]


def resolve_input_artists(matrix: pd.DataFrame, artist_names: list[str]) -> pd.DataFrame:
    """Findet Input-Artists exakt per Name, case-insensitive."""
    rows = []

    for name in artist_names:
        match = matrix[matrix["name"].str.lower() == name.lower()].copy()

        if match.empty:
            raise ValueError(f"Input artist not found in SAEM data: {name}")

        if len(match) > 1:
            raise ValueError(f"Input artist is ambiguous, use MBID later: {name}")

        rows.append(match.iloc[0])

    return pd.DataFrame(rows).drop_duplicates(subset=["mbid"]).reset_index(drop=True)


def build_clusters(profile: pd.DataFrame, feature_cols: list[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Baut 1–3 Geschmackscluster.
    1 Artist -> 1 Cluster, 2 Artists -> 2 Cluster, 3+ -> max 3 Cluster.
    """
    n_clusters = min(MAX_CLUSTERS, len(profile))

    X = profile[feature_cols].astype(float).to_numpy()

    if n_clusters == 1:
        profile = profile.copy()
        profile["taste_cluster"] = 0
        center = pd.DataFrame([{**{"taste_cluster": 0}, **dict(zip(feature_cols, X[0]))}])
        return profile, center

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=20)
    profile = profile.copy()
    profile["taste_cluster"] = kmeans.fit_predict(X)

    centers = []
    for cluster_id in sorted(profile["taste_cluster"].unique()):
        members = profile[profile["taste_cluster"] == cluster_id]
        center_values = members[feature_cols].astype(float).mean(axis=0).to_dict()
        centers.append({"taste_cluster": int(cluster_id), **center_values})

    return profile, pd.DataFrame(centers)


def score_candidates(
    candidates: pd.DataFrame,
    profile: pd.DataFrame,
    centers: pd.DataFrame,
    feature_cols: list[str],
) -> pd.DataFrame:
    """Berechnet Distanz zu bestem Cluster und nächstem Profilartist."""
    candidate_arr = candidates[feature_cols].astype(float).to_numpy()
    center_arr = centers[feature_cols].astype(float).to_numpy()
    profile_arr = profile[feature_cols].astype(float).to_numpy()

    cluster_dists = cdist(candidate_arr, center_arr, metric="euclidean")
    profile_dists = cdist(candidate_arr, profile_arr, metric="euclidean")

    out = candidates.copy()
    out["best_cluster"] = cluster_dists.argmin(axis=1)
    out["final_score"] = cluster_dists.min(axis=1)
    out["nearest_profile_distance"] = profile_dists.min(axis=1)

    support_artists = []
    for _, row in out.iterrows():
        cluster_id = int(row["best_cluster"])
        members = profile[profile["taste_cluster"] == cluster_id]
        member_arr = members[feature_cols].astype(float).to_numpy()
        candidate_vec = row[feature_cols].astype(float).to_numpy().reshape(1, -1)

        dists = cdist(candidate_vec, member_arr, metric="euclidean").ravel()
        nearest_idx = int(np.argmin(dists))
        support_artists.append(members.iloc[nearest_idx]["name"])

    out["support_artist"] = support_artists

    return out.sort_values(["final_score", "nearest_profile_distance"]).reset_index(drop=True)


def pick_top_per_cluster(scored: pd.DataFrame, n_clusters: int) -> pd.DataFrame:
    """Nimmt pro Cluster Top 5 und sortiert danach global nach Fit."""
    picks = []

    for cluster_id in range(n_clusters):
        picks.append(
            scored[scored["best_cluster"] == cluster_id].head(RECS_PER_CLUSTER)
        )

    picked = pd.concat(picks, ignore_index=True)
    picked = picked.drop_duplicates(subset=["mbid"])
    picked = picked.sort_values("final_score").reset_index(drop=True)

    return picked


def get_recommendations(raw_input: str) -> list[dict]:
    input_artists = split_input_artists(raw_input)

    if not input_artists:
        raise ValueError("No input artists provided.")

    with sqlite3.connect(DB_PATH) as conn:
        matrix = load_artist_matrix(conn)
        candidate_set = load_candidate_set(conn)

    feature_cols = get_feature_cols(matrix)

    profile = resolve_input_artists(matrix, input_artists)
    profile_mbids = set(profile["mbid"])

    profile, centers = build_clusters(profile, feature_cols)

    # Kandidaten auf Festival-Set beschränken und Input-Artists ausschließen.
    candidates = matrix.merge(candidate_set, on="mbid", how="inner")
    candidates = candidates[~candidates["mbid"].isin(profile_mbids)].copy()

    if candidates.empty:
        raise ValueError("No candidates with SAEM vectors found.")

    scored = score_candidates(candidates, profile, centers, feature_cols)
    picked = pick_top_per_cluster(scored, n_clusters=len(centers))

    recommendations = []
    for _, row in picked.iterrows():
        name = row.get("candidate_name") or row["name"]
        support = row["support_artist"]

        recommendations.append({
            "name": name,
            "reason": f"Closest fit to your taste cluster around {support}.",
            "score": round(float(row["final_score"]), 4),
            "cluster": int(row["best_cluster"]),
            "support_artist": support,
        })

    return recommendations


def main():
    try:
        raw_input = sys.argv[1] if len(sys.argv) > 1 else ""
        recs = get_recommendations(raw_input)
        print(json.dumps({"recommendations": recs}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()