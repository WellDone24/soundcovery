"""Regression checks for the standard genre recommendation policy."""
import sqlite3
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from genre_policy import (
    POLICY_VERSION, ADJUSTMENT_FACTORS, eligible, compatibility, relationship,
)
from recommender import load_genres, classify_genre_relationship, score_candidates, pick_top_per_cluster

def test_quality_threshold_and_version():
    common = dict(prompt_version="genre_prompt_v3", taxonomy_version="taxonomy_v1",
                  model_name="gpt-5.4-mini", status="success", is_active=1)
    assert eligible("rock", 0.70, **common)
    assert not eligible("rock", 0.6999, **common)
    assert not eligible("rock", float("nan"), **common)
    assert not eligible("rock", None, **common)
    assert not eligible("", 0.99, **common)
    assert not eligible("rock", 0.99, **{**common, "prompt_version": "genre_prompt_v2"})

def test_compatibility_and_relation():
    assert compatibility("metal_melodic_death", "[]", "electronic_trance", "[]")[0] is False
    assert compatibility("rock_indie", "[]", "electronic_house", '["industrial_metal"]')[0] is True
    assert compatibility("metal_melodic_death", "[]", "metal_power", "[]")[0] is True
    assert relationship("alternative_shoegaze", '["rock_indie"]', "rock_indie", "[]") == "genre_adjacent"
    assert ADJUSTMENT_FACTORS["cross_genre"] == 1.60

def test_v2_never_selected_even_with_higher_confidence():
    with sqlite3.connect(":memory:") as conn:
        conn.execute("""CREATE TABLE artist_genre_enrichment (
            mbid TEXT, primary_genre_id TEXT, secondary_genre_ids_json TEXT,
            confidence REAL, enriched_at TEXT, model_name TEXT,
            prompt_version TEXT, taxonomy_version TEXT, status TEXT, is_active INTEGER
        )""")
        rows = [
            ("a", "rock", "[]", .99, "2026-10-01", "gpt-5.4-mini", "genre_prompt_v2", "taxonomy_v1", "success", 1),
            ("a", "electronic_trance", "[]", .90, "2026-10-02", "gpt-5.4-mini", "genre_prompt_v3", "taxonomy_v1", "success", 1),
            ("b", "metal_melodic_death", "[]", .69, "2026-10-02", "gpt-5.4-mini", "genre_prompt_v3", "taxonomy_v1", "success", 1),
            ("c", "metal_power", "[]", .70, "2026-10-03", "gpt-5.4-mini", "genre_prompt_v3", "taxonomy_v1", "success", 1),
        ]
        conn.executemany("INSERT INTO artist_genre_enrichment VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
        df = load_genres(conn)
        assert dict(zip(df.mbid,df.primary_genre)) == {"a": "electronic_trance", "c": "metal_power"}

def test_relationship_classification():
    a = pd.Series({"primary_genre": "metal_melodic_death", "secondary_genre_ids_json": "[]"})
    b = pd.Series({"primary_genre": "electronic_trance", "secondary_genre_ids_json": "[]"})
    assert classify_genre_relationship(a,b) == "cross_genre"

def test_score_rejects_cross_family_after_scoring():
    # Weighted 12D score can favor a genre-incompatible artist; gate overrides it.
    from recommender import AXIS_WEIGHTS
    cols = list(AXIS_WEIGHTS)
    metal = {c: 50.0 for c in cols}
    ref = pd.DataFrame([{**metal, "name":"Aephanemer","mbid":"r",
                         "primary_genre":"metal_melodic_death","secondary_genre_ids_json":"[]",
                         "taste_cluster":0}])
    candidates = pd.DataFrame([
      {**metal, "mbid":"x", "name":"Astrix", "primary_genre":"electronic_trance",
       "secondary_genre_ids_json":"[]"},
      {**{c:52.0 for c in cols}, "mbid":"y", "name":"Metal Fit",
       "primary_genre":"metal_power", "secondary_genre_ids_json":"[]"}
    ])
    centers=pd.DataFrame([{**metal, "taste_cluster":0}])
    scored=score_candidates(candidates,ref,centers,cols)
    assert scored.loc[scored.mbid=="x","genre_gate_allowed"].iloc[0] == False
    eligible_pool=scored[scored["genre_gate_allowed"]]
    assert pick_top_per_cluster(eligible_pool,1).iloc[0]["name"]=="Metal Fit"
