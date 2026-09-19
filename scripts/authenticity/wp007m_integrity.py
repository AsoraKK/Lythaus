"""Fail-closed validation of external research rows against frozen membership."""
import math
from wp007m_probe import CONDITIONS,SAFE_HASH,SAFE_THRESHOLD,digest,load,filehash,OUT

COMPATIBLE_CODE_HASHES={"94e0277b30f1d5059ec5d50f94a78b58ba2b3a4388dee07112d36e3c7cff970d","dc0b7099131b1bb7f6aca5f08ab530cd6ada7429ba4f4b21b6a53955addb34b6"}


def validate_matrix(cohort,raw,role):
    frozen=dict(cohort);h=frozen.pop("freezeHash")
    if digest(frozen)!=h:raise ValueError("COHORT_MUTATED")
    meta={r["sampleId"]:r for r in cohort["rows"] if r["role"]==role}
    expected={(sid,c) for sid in meta for c in CONDITIONS};seen=set()
    for r in raw:
        key=(r["sampleId"],r["condition"])
        if key not in expected or key in seen:raise ValueError("MATRIX_MEMBERSHIP_OR_DUPLICATE")
        seen.add(key)
        if any(k in r for k in ["role","label","kind","sourceFamilyId","splitGroup","rights","generatorFamily","subtype","rootKey","relativePath","sourceDataset"]):raise ValueError("METADATA_OVERRIDE")
        if r.get("runnerCodeHash") and r["runnerCodeHash"]!=filehash(OUT.parents[1]/"scripts/authenticity/wp007m_low_memory.py"):raise ValueError("RUNNER_HASH_MISMATCH")
        if r["cohortHash"]!=h or r["inputSha256"]!=meta[r["sampleId"]]["sha256"]:raise ValueError("ROW_LINEAGE_MISMATCH")
        if r["codeHash"] not in COMPATIBLE_CODE_HASHES:raise ValueError("UNVALIDATED_CODE_VERSION")
        if r["safeHash"]!=SAFE_HASH or r["safeThreshold"]!=SAFE_THRESHOLD:raise ValueError("SAFE_MUTATED")
        if r["safeScore"] is None:
            if r.get("safeStatus")!="UNAVAILABLE_RESOURCE_GUARD_NOT_NEGATIVE":raise ValueError("MISSING_SAFE_REASON")
        elif not math.isfinite(r["safeScore"]) or not 0<=r["safeScore"]<=1:raise ValueError("INVALID_SAFE")
        if r["productionAuthorization"]!="NO":raise ValueError("PRODUCTION_AUTHORITY_FORBIDDEN")
        for v in r["features"].values():
            if v is not None and not math.isfinite(v):raise ValueError("INVALID_FEATURE")
    if seen!=expected:raise ValueError("MATRIX_INCOMPLETE")
    return [{**meta[r["sampleId"]],**r} for r in raw]


def validate_reference(bulk):
    rule=load(OUT/"decision-freeze.json");h=rule.pop("freezeHash")
    if digest(rule)!=h:raise ValueError("RULE_MUTATED")
    if rule["cohortHash"]!=load(OUT/"cohort-freeze.json")["freezeHash"]:raise ValueError("RULE_COHORT_MISMATCH")
    if filehash(bulk/"discovery-rows.jsonl")!=rule["discoveryRowsHash"]:raise ValueError("DISCOVERY_MUTATED_AFTER_FREEZE")
    return rule


def enrich_safe(rows,supplement):
    by={(r["sampleId"],r["condition"]):r for r in rows};seen=set()
    for s in supplement:
        if not {"codeHash","sampleId","condition","pixelHash","sourceSha256","cohortHash","safeHash","safeScore","safeMs"}.issubset(s):raise ValueError("SUPPLEMENT_SCHEMA_INCOMPLETE")
        if s["codeHash"]!=filehash(OUT.parents[1]/"scripts/authenticity/wp007m_safe_only.py"):raise ValueError("SUPPLEMENT_CODE_MISMATCH")
        key=(s["sampleId"],s["condition"])
        if key in seen or key not in by:raise ValueError("SUPPLEMENT_MEMBERSHIP")
        seen.add(key);r=by[key]
        if r["safeScore"] is not None:raise ValueError("SUPPLEMENT_OVERWRITES_SCORE")
        if s["pixelHash"]!=r["codec"]["pixelHash"] or s["sourceSha256"]!=r["inputSha256"] or s["cohortHash"]!=r["cohortHash"] or s["safeHash"]!=SAFE_HASH:raise ValueError("SUPPLEMENT_HASH_MISMATCH")
        if not math.isfinite(s["safeScore"]) or not 0<=s["safeScore"]<=1:raise ValueError("SUPPLEMENT_SCORE_INVALID")
        r["safeScore"]=s["safeScore"];r["safeMs"]=s["safeMs"];r["totalMs"]+=s["safeMs"]
        r["safeStatus"]="SUPPLEMENTED_EXACT_PIXEL_HASH_MATCH"
    if any(r["safeScore"] is None for r in rows):raise ValueError("SAFE_COMPARISON_INCOMPLETE")
    return rows
