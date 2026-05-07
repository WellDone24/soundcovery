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
GENRE_TABLE = "artist_genre_enrichment"
AXIS_TEXT_TABLE = "axis_text_fragments"
EXTERNAL_LINKS_TABLE = "artist_external_links"

CANDIDATE_SET_NAME = "rock_for_people_2026"
CANDIDATE_SET_VERSION = "V1"

PARSE_STATUS_OK = "OK"

MAX_CLUSTERS = 3
RECS_PER_CLUSTER = 5

GENRE_STEERING_PERCENT = 50
UNKNOWN_GENRE = "unknown"

TEXT_AXIS_PRIORITY = [
    "light_dark_mood",
    "raw_refined_aesthetic",
    "calm_aggressive_intensity",
    "subdued_overwhelming_impact",
    "driving_relaxed_energy",
    "dense_sparse_texture",
    "ordered_chaotic_structure",
    "warm_cold_aesthetic",
    "minimal_complex_density",
    "direct_stylized_presentation",
    "serious_ironic_tone",
    "authentic_scene_positioning",
]


def split_input_artists(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(";") if x.strip()]


def load_artist_matrix(conn: sqlite3.Connection) -> pd.DataFrame:
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

    return (
        df.pivot(index=["mbid", "name"], columns="axis_name", values="value")
        .dropna()
        .reset_index()
    )


def load_candidate_set(conn: sqlite3.Connection) -> pd.DataFrame:
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


def load_genres(conn: sqlite3.Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        f"""
        SELECT
            TRIM(mbid) AS mbid,
            TRIM(primary_genre_id) AS primary_genre,
            confidence,
            enriched_at
        FROM {GENRE_TABLE}
        WHERE mbid IS NOT NULL
          AND primary_genre_id IS NOT NULL
          AND is_active = 1
        """,
        conn,
    )

    if df.empty:
        return pd.DataFrame(columns=["mbid", "primary_genre"])

    df["primary_genre"] = (
        df["primary_genre"]
        .fillna(UNKNOWN_GENRE)
        .astype(str)
        .str.strip()
        .replace("", UNKNOWN_GENRE)
    )

    df["confidence"] = pd.to_numeric(df["confidence"], errors="coerce").fillna(0.0)
    df["enriched_at_dt"] = pd.to_datetime(df["enriched_at"], errors="coerce")

    df = (
        df.sort_values(
            ["mbid", "confidence", "enriched_at_dt"],
            ascending=[True, False, False],
        )
        .drop_duplicates(subset=["mbid"], keep="first")
    )

    return df[["mbid", "primary_genre"]].copy()


def load_external_links(conn: sqlite3.Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        f"""
        SELECT
            TRIM(mbid) AS mbid,
            TRIM(spotify_url) AS spotify_url
        FROM {EXTERNAL_LINKS_TABLE}
        WHERE mbid IS NOT NULL
          AND spotify_url IS NOT NULL
          AND TRIM(spotify_url) != ''
        """,
        conn,
    )

    if df.empty:
        return pd.DataFrame(columns=["mbid", "spotify_url"])

    return df.drop_duplicates(subset=["mbid"]).copy()


def load_axis_text_fragments(conn: sqlite3.Connection) -> dict[tuple[str, str, str], str]:
    rows = conn.execute(
        f"""
        SELECT fragment_type, axis_key, relation, text
        FROM {AXIS_TEXT_TABLE}
        WHERE active = 1
        """
    ).fetchall()

    return {
        (fragment_type, axis_key, relation): text
        for fragment_type, axis_key, relation, text in rows
    }


def get_feature_cols(df: pd.DataFrame) -> list[str]:
    non_features = {
        "mbid",
        "name",
        "candidate_name",
        "primary_genre",
        "spotify_url",
    }
    return [c for c in df.columns if c not in non_features]


def bucket(value: float) -> str:
    value = float(value)

    if value < 35:
        return "low"
    if value > 65:
        return "high"
    return "mid"


def relation(selected: float, recommended: float) -> str:
    diff = float(recommended) - float(selected)

    if abs(diff) < 10:
        return "similar"
    if 10 <= diff < 25:
        return "slightly_more"
    if diff >= 25:
        return "much_more"
    if -25 < diff <= -10:
        return "slightly_less"
    return "much_less"


def get_fragment(
    fragments: dict[tuple[str, str, str], str],
    fragment_type: str,
    axis_key: str,
    rel: str,
) -> str | None:
    return fragments.get((fragment_type, axis_key, rel))


def join_naturally(parts: list[str]) -> str:
    parts = [p for p in parts if p]

    if not parts:
        return ""

    if len(parts) == 1:
        return parts[0]

    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"

    return ", ".join(parts[:-1]) + f", and {parts[-1]}"


def build_reason(
    fragments: dict[tuple[str, str, str], str],
    cluster_center: pd.Series,
    recommendation_row: pd.Series,
    feature_cols: list[str],
    support_artist: str,
) -> str:
    shared = []
    contrasts = []

    for axis in TEXT_AXIS_PRIORITY:
        if axis not in feature_cols:
            continue

        selected_value = float(cluster_center[axis])
        recommended_value = float(recommendation_row[axis])

        rel = relation(selected_value, recommended_value)
        selected_bucket = bucket(selected_value)

        if rel == "similar" and selected_bucket != "mid":
            text = get_fragment(
                fragments,
                "shared_trait",
                axis,
                f"similar_{selected_bucket}",
            )
            if text:
                strength = abs(selected_value - 50)
                shared.append((strength, text))

        elif rel != "similar":
            text = get_fragment(fragments, "contrast_trait", axis, rel)
            if text:
                diff_strength = abs(recommended_value - selected_value)
                contrasts.append((diff_strength, text))

    shared_texts = [text for _, text in sorted(shared, reverse=True)[:2]]
    contrast_texts = [text for _, text in sorted(contrasts, reverse=True)[:1]]

    # Quick cleanup because some shared DB fragments may still start with verb phrases.
    shared_texts = [
        t.replace("keeps the same ", "the same ")
        .replace("keeps ", "")
        .strip()
        for t in shared_texts
    ]

    if shared_texts and contrast_texts:
        return (
            f"Strong fit if you like {support_artist}: "
            f"{join_naturally(shared_texts)}. "
            f"Compared with that reference, it {contrast_texts[0]}."
        )

    if shared_texts:
        return (
            f"Strong fit if you like {support_artist}: "
            f"{join_naturally(shared_texts)}."
        )

    if contrast_texts:
        return (
            f"A nearby pick from the {support_artist} side of your taste. "
            f"It {contrast_texts[0]}."
        )

    return f"A close match to the {support_artist} side of your taste."


def resolve_input_artists(matrix: pd.DataFrame, artist_names: list[str]) -> pd.DataFrame:
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
    n_clusters = min(MAX_CLUSTERS, len(profile))
    X = profile[feature_cols].astype(float).to_numpy()

    profile = profile.copy()

    if n_clusters == 1:
        profile["taste_cluster"] = 0
        center = pd.DataFrame([{**{"taste_cluster": 0}, **dict(zip(feature_cols, X[0]))}])
        return profile, center

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=20)
    profile["taste_cluster"] = kmeans.fit_predict(X)

    centers = []
    for cluster_id in sorted(profile["taste_cluster"].unique()):
        members = profile[profile["taste_cluster"] == cluster_id]
        center_values = members[feature_cols].astype(float).mean(axis=0).to_dict()
        centers.append({"taste_cluster": int(cluster_id), **center_values})

    return profile, pd.DataFrame(centers)


def cluster_main_genres(profile: pd.DataFrame) -> dict[int, str]:
    result = {}

    for cluster_id, group in profile.groupby("taste_cluster"):
        genres = (
            group["primary_genre"]
            .fillna(UNKNOWN_GENRE)
            .replace("", UNKNOWN_GENRE)
        )

        main_genre = genres.value_counts().index[0]

        if main_genre == UNKNOWN_GENRE:
            continue

        result[int(cluster_id)] = main_genre

    return result


def score_candidates(
    candidates: pd.DataFrame,
    profile: pd.DataFrame,
    centers: pd.DataFrame,
    feature_cols: list[str],
) -> pd.DataFrame:
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


def pick_top_per_cluster(scored: pd.DataFrame, profile: pd.DataFrame, n_clusters: int) -> pd.DataFrame:
    genre_ratio = max(0, min(100, GENRE_STEERING_PERCENT)) / 100
    strict_n = round(RECS_PER_CLUSTER * genre_ratio)
    open_n = RECS_PER_CLUSTER - strict_n

    main_genres = cluster_main_genres(profile)
    picks = []

    for cluster_id in range(n_clusters):
        cluster_pool = scored[scored["best_cluster"] == cluster_id].copy()

        if cluster_pool.empty:
            continue

        main_genre = main_genres.get(cluster_id)

        if not main_genre or strict_n == 0:
            picks.append(cluster_pool.head(RECS_PER_CLUSTER))
            continue

        strict_pool = cluster_pool[cluster_pool["primary_genre"] == main_genre].copy()
        strict_pick = strict_pool.head(strict_n)

        already = set(strict_pick["mbid"])
        open_pick = cluster_pool[~cluster_pool["mbid"].isin(already)].head(open_n)

        picked = pd.concat([strict_pick, open_pick], ignore_index=True)

        if len(picked) < RECS_PER_CLUSTER:
            already = set(picked["mbid"])
            filler = cluster_pool[~cluster_pool["mbid"].isin(already)].head(
                RECS_PER_CLUSTER - len(picked)
            )
            picked = pd.concat([picked, filler], ignore_index=True)

        picks.append(picked)

    if not picks:
        return pd.DataFrame()

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
        genres = load_genres(conn)
        external_links = load_external_links(conn)
        axis_fragments = load_axis_text_fragments(conn)

    matrix = matrix.merge(genres, on="mbid", how="left")
    matrix = matrix.merge(external_links, on="mbid", how="left")

    matrix["primary_genre"] = (
        matrix["primary_genre"]
        .fillna(UNKNOWN_GENRE)
        .astype(str)
        .str.strip()
        .replace("", UNKNOWN_GENRE)
    )

    feature_cols = get_feature_cols(matrix)

    profile = resolve_input_artists(matrix, input_artists)
    profile_mbids = set(profile["mbid"])

    profile, centers = build_clusters(profile, feature_cols)

    candidates = matrix.merge(candidate_set, on="mbid", how="inner")
    candidates = candidates[~candidates["mbid"].isin(profile_mbids)].copy()

    if candidates.empty:
        raise ValueError("No candidates with SAEM vectors found.")

    scored = score_candidates(candidates, profile, centers, feature_cols)

    picked = pick_top_per_cluster(
        scored=scored,
        profile=profile,
        n_clusters=len(centers),
    )

    recommendations = []

    for _, row in picked.iterrows():
        name = row.get("candidate_name") or row["name"]
        support = row["support_artist"]
        genre = row.get("primary_genre", UNKNOWN_GENRE)
        spotify_url = row.get("spotify_url")
        cluster_id = int(row["best_cluster"])

        cluster_center = centers[centers["taste_cluster"] == cluster_id].iloc[0]

        reason = build_reason(
            fragments=axis_fragments,
            cluster_center=cluster_center,
            recommendation_row=row,
            feature_cols=feature_cols,
            support_artist=support,
        )

        recommendations.append({
            "name": name,
            "reason": reason,
            "score": round(float(row["final_score"]), 4),
            "cluster": cluster_id,
            "support_artist": support,
            "primary_genre": genre,
            "spotify_url": spotify_url if pd.notna(spotify_url) else None,
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