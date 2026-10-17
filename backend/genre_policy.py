"""Versioned genre eligibility and compatibility policy for Soundcovery recommendations.

Contract aligned with the local v0.6.7 Artist-vs-Set report.
Model-reported confidence is an uncalibrated quality heuristic.
"""
import json
import math

POLICY_VERSION = "genre_gate_v0_2_v3_conf70"
REQUIRED_MODEL = "gpt-5.4-mini"
REQUIRED_PROMPT = "genre_prompt_v3"
REQUIRED_TAXONOMY = "taxonomy_v1"
MIN_CONFIDENCE = 0.70

FAMILY_ADJACENCY = frozenset({
    frozenset(("rock", "metal")), frozenset(("rock", "pop")),
    frozenset(("pop", "electronic")), frozenset(("rock", "punk")),
    frozenset(("metal", "punk")), frozenset(("jazz", "soul")),
    frozenset(("soul", "rnb")), frozenset(("pop", "rnb")),
})
ADJUSTMENT_FACTORS = {"genre_aligned": 1.00, "genre_adjacent": 1.15, "cross_genre": 1.60}
GUITAR_FAMILIES = frozenset({"rock", "metal", "punk", "alternative"})
ELECTRONIC_FAMILIES = frozenset({"electronic"})
EXPLICIT_BRIDGES = frozenset({"industrial_rock", "industrial_metal", "industrial_ebm_rock"})

def eligible(primary, confidence, *, prompt_version, taxonomy_version, model_name, status, is_active):
    """False for missing, old, inactive, incomplete or low-confidence genres."""
    if (prompt_version != REQUIRED_PROMPT or taxonomy_version != REQUIRED_TAXONOMY
            or model_name != REQUIRED_MODEL or status != "success" or is_active != 1):
        return False
    if primary is None or not str(primary).strip() or str(primary).strip().lower() == "unknown":
        return False
    try:
        value = float(confidence)
    except (TypeError, ValueError):
        return False
    return math.isfinite(value) and value >= MIN_CONFIDENCE

def family(primary):
    value = str(primary or "").strip().lower()
    return value.split("_", 1)[0] if value and value != "unknown" else None

def genres(primary, secondary):
    tags = {str(primary).strip()} if primary and str(primary).strip() != "unknown" else set()
    if isinstance(secondary, str):
        try:
            secondary = json.loads(secondary)
        except (ValueError, TypeError):
            secondary = []
    if isinstance(secondary, list):
        tags.update(str(item).strip() for item in secondary if item)
    return tags

def relationship(ref_primary, ref_secondary, cand_primary, cand_secondary):
    if not family(ref_primary) or not family(cand_primary):
        return "cross_genre"
    if ref_primary == cand_primary:
        return "genre_aligned"
    if ref_primary in genres(cand_primary, cand_secondary) or cand_primary in genres(ref_primary, ref_secondary):
        return "genre_adjacent"
    pair = frozenset((family(ref_primary), family(cand_primary)))
    if family(ref_primary) == family(cand_primary) or pair in FAMILY_ADJACENCY:
        return "genre_adjacent"
    return "cross_genre"

def compatibility(ref_primary, ref_secondary, cand_primary, cand_secondary):
    """Return (allowed, reason); no uncertain genre is silently accepted."""
    left, right = family(ref_primary), family(cand_primary)
    if left is None or right is None:
        return False, "missing_primary_genre"
    opposite = ((left in GUITAR_FAMILIES and right in ELECTRONIC_FAMILIES)
                or (right in GUITAR_FAMILIES and left in ELECTRONIC_FAMILIES))
    if not opposite:
        return True, "no_hard_conflict"
    if (genres(ref_primary, ref_secondary) | genres(cand_primary, cand_secondary)) & EXPLICIT_BRIDGES:
        return True, "explicit_industrial_bridge"
    return False, "guitar_vs_electronic_no_bridge"
