"""Independent N row/feature audit; --run writes reports, --self-test reads no data.

Uses only stdlib, serialized linear heads and approved N feature caches. Never
imports detector code, loads backbone/SAFE weights, opens media, trains, or reads
result summaries. Run after candidate-score-rows.json and safe-reference-rows.json
are complete. All tolerances are absolute and fixed before inspecting scores.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import math
import os
import re
import struct
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "research/wp007n"
RUNTIME = Path(tempfile.gettempdir()) / "lythaus-wp007n-runtime"
NAMES = ("A0", "A1", "A2", "B0", "B1", "NUISANCE", "A0_PERMUTED",
         "B0_PERMUTED", "B1_PERMUTED", "NUISANCE_PERMUTED")
PRINCIPAL = ("A0", "A1", "A2", "B0", "B1")
EVAL_ROLES = {"EVAL_N", "HISTORICAL_CHALLENGE"}
PRE_EVAL = {"FIT", "DEV", "CALIBRATION"}
CONDITIONS = {"original", "jpeg95", "jpeg75", "resize75", "resize75_jpeg95", "png_roundtrip"}
COHORT_HASH = "1560ebc45f5a385c8007993542a9a10545b72beef70741622b004dd15eb087cb"
PROTOCOL_HASH = "6ff6c6baddce03c0bf6c2f1f0fb0003e750f7ee3951db1fe1969d2dbbcf10620"
SAFE_HASH = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_THRESHOLD = 0.5864923000335693
SEED = 2026091907
SCORE_ATOL = 1e-10
RESPONSE_ATOL = 1e-12
MAX_INPUT_BYTES = 20_000_000
IDENTITY = ("sampleId", "sourceFamilyId", "role", "kind", "label", "generatorFamily")
VIEW_IDENTITY = ("sourceSha256", "scientificViewRgbHash", "tensorSha256")
SEALED_SOURCES = {"scripts/authenticity/wp007n_" + name + ".py"
                  for name in ("core", "freeze", "extract", "guards", "analysis")}
REPO_INPUTS = {"cohort-freeze.json", "protocol.json", "protocol-hash.json",
               "execution-code-freeze.json", "checkpoint-freeze.json",
               "admission-transition.json", "legacy-cache-certificate.json",
               "candidate-score-rows.json", "safe-reference-rows.json"}
REPO_INPUTS.update(name + "-calibration.json" for name in NAMES)
LIMITATIONS = [
    "N=48: 28 negative parents and 20 historical synthetic parents; synthetic=1.",
    "Actual human-created digital controls are absent; procedural supplements are not substitutes.",
    "Eight CSAFE calibration parents give 1/8 rank resolution, not demonstrated 1% population FPR.",
    "Source-worst coverage is unequal: original/JPEG75 for all, six conditions for the frozen 12-parent panel.",
    "Historical exposure, unknown pretraining membership, scene/device/template dependence and single-family fitting remain.",
    "SAFE is an unqualified raw experimental reference; exact-input rescues do not authorize production use.",
    "Feature lineage is checked against receipts; pixels, backbone forwards and SAFE forwards are not independently regenerated.",
    "Unselected parents receive row/decoded-view lineage checks, not independent feature-array inference checks.",
    "Negative results are bounded to this frozen cohort and transforms; no new-programme or broad detector confirmation.",
]


class AuditError(ValueError):
    pass


def require(ok, code):
    if not ok:
        raise AuditError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def close(actual, expected, code, tolerance=SCORE_ATOL):
    require(finite(actual) and finite(expected) and abs(actual - expected) <= tolerance, code)
    return abs(actual - expected)


def valid_hash(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "DUPLICATE_JSON_KEY:" + key)
        result[key] = value
    return result


def decode_json(raw):
    def invalid_constant(value):
        raise AuditError("NONFINITE_JSON:" + value)
    return json.loads(raw, object_pairs_hook=unique_pairs, parse_constant=invalid_constant)


def contained(root, path):
    resolved = path.resolve()
    require(resolved.is_relative_to(root.absolute()), "PATH_OUTSIDE_APPROVED_N_SCOPE")
    return resolved


class Inputs:
    def __init__(self):
        self.hashes = {}
        self.paths = {}

    def bytes(self, root, path, logical):
        path = contained(root, path)
        require(path.is_file(), "MISSING_INPUT:" + logical)
        require(path.stat().st_size <= MAX_INPUT_BYTES, "INPUT_SIZE_LIMIT:" + logical)
        raw = path.read_bytes()
        require(len(raw) <= MAX_INPUT_BYTES, "INPUT_SIZE_LIMIT:" + logical)
        h = hashlib.sha256(raw).hexdigest()
        require(logical not in self.hashes or self.hashes[logical] == h, "INPUT_CHANGED:" + logical)
        self.hashes[logical], self.paths[logical] = h, path
        return raw

    def repo_json(self, name):
        require(name in REPO_INPUTS, "REPO_INPUT_NOT_ALLOWLISTED")
        return decode_json(self.bytes(OUT, OUT / name, "research/wp007n/" + name))

    def code_hash(self, relative):
        require(relative in SEALED_SOURCES or relative in {
            "scripts/authenticity/wp007n_safe_reference.py",
            "scripts/authenticity/wp007n_independent_audit.py"}, "CODE_INPUT_NOT_ALLOWLISTED")
        return hashlib.sha256(self.bytes(REPO, REPO / relative, relative)).hexdigest()

    def runtime_bytes(self, category, name):
        require(category in ("features/A", "features/B", "heads"), "RUNTIME_CATEGORY_PROHIBITED")
        if category == "heads":
            require(name in {n + "-head.json" for n in NAMES if n not in ("A1", "A2")}, "HEAD_PATH_PROHIBITED")
        else:
            require(re.fullmatch(r"[0-9a-f]{64}\.(json|npz)", name) is not None, "CACHE_PATH_PROHIBITED")
        return self.bytes(RUNTIME, RUNTIME / category / name, "runtime/" + category + "/" + name)

    def unchanged(self):
        for logical, path in self.paths.items():
            require(path.stat().st_size <= MAX_INPUT_BYTES, "INPUT_CHANGED:" + logical)
            require(hashlib.sha256(path.read_bytes()).hexdigest() == self.hashes[logical], "INPUT_CHANGED:" + logical)


def row_key(row):
    return row["sampleId"], row["condition"], row["view"]


def index_rows(rows, expected, label):
    result = {}
    for row in rows:
        key = row_key(row)
        require(key not in result, "DUPLICATE_ROW:" + label + ":" + repr(key))
        result[key] = row
    require(set(result) == set(expected), "ROW_COVERAGE:" + label)
    return result


def matched_parents(parents):
    chosen = set()
    for group in ("PHOTO_CSAFE", "PHOTO_UNSPLASH", "Seedream-4", "SD-3.5-Large"):
        eligible = [r for r in parents.values() if r["role"] in EVAL_ROLES
                    and (r["kind"] == group or r["generatorFamily"] == group)]
        require(bool(eligible), "MATCHED_PANEL_GROUP_MISSING:" + group)
        chosen.add(min(eligible, key=lambda r: digest(["WP007N_SCORE_BLIND", r["sampleId"]]))["sampleId"])
    return chosen


def requests(parent, arm, matched):
    conditions = ["original"] if arm == "A" and parent["role"] in {"FIT", "DEV"} else parent["conditions"]
    result = {(parent["sampleId"], c, "reference") for c in conditions}
    if parent["sampleId"] in matched:
        result.update((parent["sampleId"], c, "matched256") for c in ("original", "jpeg75"))
    return result


def lineage(row, parent):
    require(type(row["label"]) is int and row["label"] in (0, 1), "ROW_LABEL_TYPE")
    require(all(row[k] == parent[k] for k in IDENTITY), "ROW_COHORT_IDENTITY:" + parent["sampleId"])
    require(row["sourceSha256"] == parent["sha256"], "ROW_SOURCE_HASH:" + parent["sampleId"])
    require(all(valid_hash(row[k]) for k in VIEW_IDENTITY), "INVALID_VIEW_HASH")
    if row["condition"] in ("original", "png_roundtrip") and row["view"] == "reference":
        require(row["scientificViewRgbHash"] == parent["decodedRgbSha256"], "ROW_DECODED_SOURCE_HASH")


def exact_view(left, right, same_tensor=False):
    keys = IDENTITY + ("condition", "view", "sourceSha256", "scientificViewRgbHash")
    if same_tensor:
        keys += ("tensorSha256",)
    require(all(left[k] == right[k] for k in keys), "EXACT_INPUT_JOIN_MISMATCH:" + repr(row_key(left)))


def rank_metrics(labels, scores):
    require(len(labels) == len(scores) and len(labels) > 0, "METRIC_LENGTH")
    require(all(type(y) is int and y in (0, 1) for y in labels) and all(finite(s) for s in scores), "METRIC_DOMAIN")
    positives = [s for y, s in zip(labels, scores) if y == 1]
    negatives = [s for y, s in zip(labels, scores) if y == 0]
    auc = (math.fsum((p > n) + .5 * (p == n) for p in positives for n in negatives)
           / (len(positives) * len(negatives))) if positives and negatives else None
    groups = defaultdict(list)
    for y, s in zip(labels, scores):
        groups[s].append(y)
    seen = tp = 0
    contributions = []
    for score in sorted(groups, reverse=True):
        ys = groups[score]
        seen += len(ys)
        new_tp = sum(ys)
        tp += new_tp
        contributions.append(new_tp * tp / seen)
    ap = math.fsum(contributions) / len(positives) if positives else None
    return {"AUROC": auc, "averagePrecision": ap}


def metrics(rows, threshold, inclusive=False):
    require(finite(threshold), "NONFINITE_METRIC_THRESHOLD")
    labels, scores = [r["label"] for r in rows], [r["score"] for r in rows]
    ranks = rank_metrics(labels, scores)
    decisions = [s >= threshold if inclusive else s > threshold for s in scores]
    tp = sum(p and y == 1 for p, y in zip(decisions, labels))
    fp = sum(p and y == 0 for p, y in zip(decisions, labels))
    positive_n = sum(labels)
    negative_n = len(labels) - positive_n
    return {"TP": tp, "FN": positive_n - tp, "FP": fp, "TN": negative_n - fp,
            "positiveN": positive_n, "negativeN": negative_n, "N": len(labels),
            "FPR": fp / negative_n if negative_n else None,
            "recall": tp / positive_n if positive_n else None, **ranks,
            "syntheticPositiveLabel": 1, "largerSupportsSynthetic": True,
            "APDefinition": "Non-interpolated AP; recall increments at tied score groups, not trapezoidal PR area",
            "oppositeDirectionDiagnosticOnly": rank_metrics(labels, [-s for s in scores]),
            "threshold": threshold, "thresholdTies": sum(s == threshold for s in scores),
            "comparison": "GREATER_OR_EQUAL" if inclusive else "STRICT_GREATER"}


def parse_features(blob, count):
    require(1 <= count <= 8, "FEATURE_ROW_LIMIT")
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        require(archive.namelist() == ["features.npy"], "NPZ_MEMBERS")
        info = archive.getinfo("features.npy")
        require(info.file_size <= 40_000, "NPZ_UNCOMPRESSED_LIMIT")
        data = archive.read(info)
    require(data[:6] == b"\x93NUMPY", "NPY_MAGIC")
    version = tuple(data[6:8])
    require(version in ((1, 0), (2, 0), (3, 0)), "NPY_VERSION")
    size_bytes = 2 if version == (1, 0) else 4
    size = int.from_bytes(data[8:8 + size_bytes], "little")
    start = 8 + size_bytes + size
    require(size <= 4096 and start <= len(data), "NPY_HEADER_LIMIT")
    header = ast.literal_eval(data[8 + size_bytes:start].decode("utf-8" if version == (3, 0) else "latin1"))
    require(header == {"descr": "<f4", "fortran_order": False, "shape": (count, 1024)}, "NPY_LAYOUT")
    require(len(data) - start == count * 4096, "NPY_PAYLOAD_SIZE")
    result = []
    for i in range(count):
        raw = data[start + i * 4096:start + (i + 1) * 4096]
        values = struct.unpack("<1024f", raw)
        require(all(math.isfinite(v) for v in values), "NONFINITE_FEATURE")
        result.append((values, hashlib.sha256(canonical(["float32", [1024]]) + raw).hexdigest()))
    return result


def head_score(head, values):
    require(len(values) == len(head["mean"]) and all(finite(x) for x in values), "INFERENCE_INPUT")
    norm = max(math.sqrt(math.fsum(x * x for x in values)), 1e-12)
    logit = math.fsum(((x / norm - m) / s) * c for x, m, s, c in
                      zip(values, head["mean"], head["scale"], head["coefficient"])) + head["intercept"]
    require(finite(logit), "NONFINITE_LOGIT")
    if logit >= 0:
        return 1. / (1. + math.exp(-logit))
    e = math.exp(logit)
    return e / (1. + e)


def response_scores(record):
    draws = record["responses"]
    require(len(draws) == 3 and [r["draw"] for r in draws] == [0, 1, 2], "RESPONSE_DRAWS")
    values = []
    for i, draw in enumerate(draws):
        seed = int.from_bytes(hashlib.sha256(canonical([SEED, record["tensorSha256"], i])).digest()[:8], "big") % (2**63 - 1)
        require(draw["seed"] == seed and finite(draw["similarity"]), "RESPONSE_SEED_OR_FINITE")
        require(abs(draw["similarity"]) <= 1.000001, "COSINE_RANGE")
        response = 1. - draw["similarity"]
        close(response, draw["response"], "RESPONSE_ORIENTATION", RESPONSE_ATOL)
        values.append(response)
    a1, a2 = values[0], math.fsum(values) / 3
    close(a1, record["A1"], "A1_RECOMPUTATION", RESPONSE_ATOL)
    close(a2, record["A2"], "A2_RECOMPUTATION", RESPONSE_ATOL)
    close(max(values) - min(values), record["responseSpread"], "RESPONSE_SPREAD", RESPONSE_ATOL)
    return a1, a2


def validate_head(name, head, parents, checkpoint):
    backbone = None if name.startswith("NUISANCE") else name[0]
    dimension = 11 if backbone is None else 1024
    require(head["backbone"] == backbone and head["classes"] == [0, 1]
            and type(head["permutation"]) is bool and head["permutation"] == name.endswith("_PERMUTED"), "HEAD_SEMANTICS:" + name)
    require(head["featureKey"] == ("nuisance" if backbone is None else "feature")
            and head["inputNormalization"] == "L2_then_FIT_ONLY_STANDARDIZATION", "HEAD_INPUT_RECIPE:" + name)
    for field in ("mean", "scale", "coefficient"):
        require(len(head[field]) == dimension and all(finite(v) for v in head[field]), "HEAD_DIMENSION_FINITE:" + name)
    require(all(v > 0 for v in head["scale"]) and finite(head["intercept"]), "HEAD_SCALE_INTERCEPT:" + name)
    require(head["cohortHash"] == COHORT_HASH and head["protocolHash"] == PROTOCOL_HASH, "HEAD_POPULATION:" + name)
    require(head["checkpointHash"] == (checkpoint[backbone]["sha256"] if backbone else None), "HEAD_CHECKPOINT:" + name)
    for key, role in (("trainingIds", "FIT"), ("devIds", "DEV")):
        ids = head[key]
        require(len(ids) == len(set(ids)) and set(ids) == {sid for sid, p in parents.items() if p["role"] == role}, "HEAD_ROLE_MEMBERSHIP:" + name)
    require(head["headHash"] == digest({k: v for k, v in head.items() if k not in ("headHash", "fitSeconds")}), "HEAD_DIGEST:" + name)


def negative_panel(parents):
    grouped = defaultdict(list)
    for sid, parent in parents.items():
        if parent["role"] in EVAL_ROLES and parent["label"] == 0:
            grouped[parent["kind"]].append(sid)
    require(set(grouped) == {"PHOTO_CSAFE", "PHOTO_UNSPLASH", "PROCEDURAL_SUPPLEMENT"}, "NEGATIVE_PANEL_KINDS")
    return {kind: sorted(ids, key=lambda sid: (digest(["WP007N_INDEPENDENT_NEGATIVE_PANEL_V1", SEED, kind, sid]), sid))[:4]
            for kind, ids in sorted(grouped.items()) if len(ids) >= 4}


def partitions(rows, safe, cal):
    result = {}
    for scope in ("original", "jpeg75", "ALL_DECLARED_WORST"):
        selected = [r for r in rows if r["view"] == "reference" and (scope == "ALL_DECLARED_WORST" or r["condition"] == scope)]
        threshold = cal["originalThreshold"] if scope == "original" else cal["worstThreshold"]
        grouped = defaultdict(list)
        for row in selected:
            grouped[row["sampleId"]].append(row)
        exact, candidate_only, new_fp, examples = set(), set(), set(), []
        for sid, rs in grouped.items():
            cp = any(r["score"] > threshold for r in rs)
            sp = any(safe[row_key(r)]["score"] >= SAFE_THRESHOLD for r in rs)
            hits = [r for r in rs if r["score"] > threshold and safe[row_key(r)]["score"] < SAFE_THRESHOLD]
            if rs[0]["label"] == 1:
                if cp and not sp:
                    candidate_only.add(sid)
                if hits:
                    exact.add(sid)
                    examples.extend({"sampleId": sid, "condition": r["condition"], "view": r["view"],
                                     "scientificViewRgbHash": r["scientificViewRgbHash"], "candidateScore": r["score"],
                                     "candidateThreshold": threshold, "safeScore": safe[row_key(r)]["score"]} for r in hits)
            elif cp and not sp:
                new_fp.add(sid)
        families = sorted({rs[0]["generatorFamily"] for sid, rs in grouped.items() if sid in exact})
        result[scope] = {"uniqueExactInputRescueParents": len(exact), "exactInputRescueParentIds": sorted(exact),
                         "exactInputRescueSourceFamilyIds": sorted({grouped[s][0]["sourceFamilyId"] for s in exact}),
                         "generatorFamilies": families, "candidateOnlyParentIds": sorted(candidate_only),
                         "newNegativeParentIdsVsAnySafePositive": sorted(new_fp), "exactInputEvidence": examples,
                         "denominator": {"negative": sum(rs[0]["label"] == 0 for rs in grouped.values()),
                                         "synthetic": sum(rs[0]["label"] == 1 for rs in grouped.values())},
                         "interpretation": "An exact-view rescue may coexist with a SAFE positive on another view of that parent."}
    return result


def source_worst(rows, threshold):
    grouped = defaultdict(list)
    for row in rows:
        if row["label"] == 0 and row["view"] == "reference":
            grouped[row["sampleId"]].append(row)
    maxima = {sid: max(r["score"] for r in rs) for sid, rs in grouped.items()}
    fp = sorted(sid for sid, value in maxima.items() if value > threshold)
    subgroups = {}
    for kind in sorted({rs[0]["kind"] for rs in grouped.values()}):
        ids = {sid for sid, rs in grouped.items() if rs[0]["kind"] == kind}
        positives = sorted(ids.intersection(fp))
        subgroups[kind] = {"N": len(ids), "FP": len(positives), "FPR": len(positives) / len(ids), "parentIds": positives}
    require(len(grouped) == 28, "SOURCE_WORST_DENOMINATOR")
    return {"N": 28, "FP": len(fp), "FPR": len(fp) / 28, "positiveParentIds": fp,
            "sourceMaxima": maxima, "subgroups": subgroups, "threshold": threshold,
            "comparison": "STRICT_GREATER", "scope": "ALL_DECLARED_REFERENCE_CONDITIONS_UNEQUAL_COVERAGE"}


class Audit:
    def __init__(self):
        self.inputs = Inputs()
        self.cache = {"A": {}, "B": {}}
        self.feature_rows = {"A": {}, "B": {}}
        self.heads, self.cals = {}, {}

    def freeze(self):
        rd = self.inputs.repo_json
        co, protocol, seal = rd("cohort-freeze.json"), rd("protocol.json"), rd("protocol-hash.json")
        require(digest({k: v for k, v in co.items() if k != "freezeHash"}) == co["freezeHash"] == COHORT_HASH, "COHORT_SEAL")
        require(digest(protocol) == seal["canonicalProtocolHash"] == PROTOCOL_HASH
                and protocol["cohortHash"] == seal["cohortHash"] == COHORT_HASH, "PROTOCOL_SEAL")
        parents = {p["sampleId"]: p for p in co["rows"]}
        require(len(parents) == len(co["rows"]) == 92, "COHORT_PARENT_COUNT")
        require(Counter(p["role"] for p in parents.values()) == Counter(FIT=24, DEV=12, CALIBRATION=8, EVAL_N=28, HISTORICAL_CHALLENGE=20), "COHORT_ROLE_COUNTS")
        for p in parents.values():
            require(p["sealed"] is False and not p.get("finalSealedControl", False), "SEALED_PARENT_PROHIBITED")
            require(type(p["label"]) is int and p["label"] in (0, 1), "COHORT_LABEL")
        self.parents = parents
        self.eval_ids = {sid for sid, p in parents.items() if p["role"] in EVAL_ROLES}
        require(len(self.eval_ids) == 48 and sum(parents[s]["label"] for s in self.eval_ids) == 20 and co["actualHumanDigitalWorks"] == 0, "N_POPULATION_CHANGED")
        require(len({parents[s]["sourceFamilyId"] for s in self.eval_ids}) == 48, "EVAL_PARENT_SOURCE_FAMILY_COLLISION")
        self.matched = matched_parents(parents)
        self.expected = set().union(*(requests(parents[s], "A", self.matched) for s in self.eval_ids))
        self.execution, self.transition, self.checkpoint = rd("execution-code-freeze.json"), rd("admission-transition.json"), rd("checkpoint-freeze.json")
        require(set(self.execution["files"]) == SEALED_SOURCES, "EXECUTION_SOURCE_SET")
        require(digest(self.execution["files"]) == self.execution["signature"], "EXECUTION_SIGNATURE")
        for path, expected in self.execution["files"].items():
            require(self.inputs.code_hash(path) == expected, "EXECUTION_SOURCE_CHANGED:" + path)
        self.signature = self.execution["signature"]
        t = self.transition
        require(t["validated"] is True and t["executionSignature"] == self.signature and t["cohortHash"] == COHORT_HASH
                and t["analysisCodeHash"] == self.execution["files"]["scripts/authenticity/wp007n_analysis.py"], "TRANSITION_BINDING")
        require(digest(t["previousExecutionFiles"]) == t["previousExecutionSignature"], "TRANSITION_PREVIOUS_SIGNATURE")
        self.inputs.repo_json("legacy-cache-certificate.json")
        require(self.inputs.hashes["research/wp007n/legacy-cache-certificate.json"] == t["legacyReplayReceiptHash"], "TRANSITION_REPLAY_RECEIPT")

    def load_heads(self):
        for name in NAMES:
            cal = self.inputs.repo_json(name + "-calibration.json")
            require(self.inputs.hashes["research/wp007n/" + name + "-calibration.json"] == self.transition["calibrationHashes"][name], "CALIBRATION_FILE_RECEIPT:" + name)
            require(digest({k: v for k, v in cal.items() if k != "freezeHash"}) == cal["freezeHash"], "CALIBRATION_DIGEST:" + name)
            require(cal["candidate"] == name and cal["schemaVersion"] == "wp007n-calibration-v1"
                    and cal["comparison"] == "STRICT_GREATER" and cal["protocolHash"] == PROTOCOL_HASH
                    and cal["cohortHash"] == COHORT_HASH and cal["sourceCount"] == 8
                    and cal["roles"] == ["CALIBRATION"] and cal["frozenBeforeEvaluation"] is True, "CALIBRATION_SCHEMA:" + name)
            require(set(cal["sourceWorstScores"]) == {s for s, p in self.parents.items() if p["role"] == "CALIBRATION"}, "CALIBRATION_MEMBERSHIP:" + name)
            require(all(finite(v) for v in cal["sourceWorstScores"].values())
                    and finite(cal["originalThreshold"]) and finite(cal["worstThreshold"])
                    and cal["worstThreshold"] == max(cal["sourceWorstScores"].values())
                    and cal["originalThreshold"] <= cal["worstThreshold"], "CALIBRATION_MAXIMA:" + name)
            head = None
            if name not in ("A1", "A2"):
                raw = self.inputs.runtime_bytes("heads", name + "-head.json")
                require(hashlib.sha256(raw).hexdigest() == self.transition["headFileHashes"][name], "HEAD_FILE_RECEIPT:" + name)
                head = decode_json(raw)
                validate_head(name, head, self.parents, self.checkpoint)
            require(cal["headHash"] == (head["headHash"] if head else None), "CALIBRATION_HEAD_LINK:" + name)
            self.heads[name], self.cals[name] = head, cal

    def load_cache_metadata(self):
        for arm in ("A", "B"):
            folder = contained(RUNTIME, RUNTIME / "features" / arm)
            require(folder.is_dir(), "MISSING_INPUT:N_CACHE_" + arm)
            for path in sorted(folder.glob("*.json")):
                item = decode_json(self.inputs.runtime_bytes("features/" + arm, path.name))
                sid = item["sampleId"]
                require(sid in self.parents and sid not in self.cache[arm], "UNKNOWN_OR_DUPLICATE_CACHE_PARENT")
                p = self.parents[sid]
                require(item["arm"] == arm and item["cohortHash"] == COHORT_HASH and item["protocolHash"] == PROTOCOL_HASH
                        and item["sourceHash"] == p["sha256"], "CACHE_POPULATION:" + sid)
                require(item["identity"]["checkpointSha256"] == self.checkpoint[arm]["sha256"], "CACHE_CHECKPOINT:" + sid)
                receipt = self.transition["cacheReceipts"].get(arm + "/" + path.name)
                if item.get("executionSignature") != self.signature:
                    require(p["role"] in PRE_EVAL and receipt == self.inputs.hashes["runtime/features/" + arm + "/" + path.name], "UNRECEIPTED_LEGACY_OR_EVAL_CACHE:" + sid)
                else:
                    require(item["coreCodeHash"] == self.execution["files"]["scripts/authenticity/wp007n_core.py"]
                            and item["extractCodeHash"] == self.execution["files"]["scripts/authenticity/wp007n_extract.py"], "CACHE_CODE_IDENTITY:" + sid)
                    expected_key = digest({"cohort": COHORT_HASH, "model": item["identity"]["checkpointSha256"],
                                           "preprocess": item["identity"]["preprocessing"], "input": p["sha256"],
                                           "requests": [(r["condition"], r["view"]) for r in item["records"]],
                                           "protocol": PROTOCOL_HASH, "executionSignature": self.signature})
                    require(item["cacheKey"] == expected_key, "CACHE_KEY_RECOMPUTATION:" + sid)
                require(item["cacheKey"] == path.stem and item["arrayFile"] == path.stem + ".npz" and valid_hash(item["arraySha256"]), "CACHE_FILENAMES:" + sid)
                records = index_rows(item["records"], requests(p, arm, self.matched), "cache/" + arm + "/" + sid)
                for i, row in enumerate(item["records"]):
                    lineage(row, p)
                    require(type(row["featureIndex"]) is int and row["featureIndex"] == i and valid_hash(row["featureSha256"]), "FEATURE_INDEX_HASH:" + sid)
                    require(row["failureState"] is None and row["missingness"] is None and row["productionAuthority"] is False, "CACHE_FAILED_ROW:" + sid)
                    if row["view"] == "reference":
                        require(row["facts"]["decodedRgbSha256"] == row["scientificViewRgbHash"], "CACHE_FACTS_DECODE:" + sid)
                    if arm == "A" and p["role"] not in ("FIT", "DEV"):
                        response_scores(row)
                    else:
                        require(row["responses"] == [], "UNEXPECTED_RESPONSE_DATA")
                self.cache[arm][sid] = (item, records)
            require(self.eval_ids <= set(self.cache[arm]), "INCOMPLETE_EVAL_CACHE:" + arm)
            require({s for s, p in self.parents.items() if p["role"] == "CALIBRATION"} <= set(self.cache[arm]), "INCOMPLETE_CAL_CACHE:" + arm)

    def score_rows(self):
        doc, safe_doc = self.inputs.repo_json("candidate-score-rows.json"), self.inputs.repo_json("safe-reference-rows.json")
        require(doc["cohortHash"] == safe_doc["cohortHash"] == COHORT_HASH, "SCORE_FILE_COHORT")
        require(doc["codeHash"] == self.execution["files"]["scripts/authenticity/wp007n_analysis.py"], "SCORE_CODE_IDENTITY")
        require(safe_doc["checkpointHash"] == SAFE_HASH and safe_doc["codeHash"] == self.inputs.code_hash("scripts/authenticity/wp007n_safe_reference.py"), "SAFE_FILE_IDENTITY")
        require(doc["count"] == len(doc["rows"]) and {r["candidate"] for r in doc["rows"]} == set(NAMES), "CANDIDATE_COVERAGE")
        self.safe = index_rows(safe_doc["rows"], self.expected, "SAFE")
        for row in self.safe.values():
            lineage(row, self.parents[row["sampleId"]])
            require(finite(row["score"]) and 0 <= row["score"] <= 1 and row["threshold"] == SAFE_THRESHOLD
                    and row["comparison"] == "GREATER_OR_EQUAL_FROZEN_HISTORICAL" and row["missingness"] is None
                    and type(row["thresholdPass"]) is bool and row["thresholdPass"] == (row["score"] >= SAFE_THRESHOLD), "SAFE_THRESHOLD_OR_SCORE")
        self.scores = {}
        for name in NAMES:
            rows = [r for r in doc["rows"] if r["candidate"] == name]
            indexed = index_rows(rows, self.expected, name)
            arm, cal = ("A" if name.startswith("A") else "B"), self.cals[name]
            for key, row in indexed.items():
                sid = row["sampleId"]
                lineage(row, self.parents[sid])
                require(finite(row["score"]) and row["originalThreshold"] == cal["originalThreshold"]
                        and row["worstThreshold"] == cal["worstThreshold"] and row["calibrationHash"] == cal["freezeHash"]
                        and row["headHash"] == cal["headHash"] and row["researchOnly"] is True, "SCORE_CALIBRATION_LINK:" + name)
                exact_view(row, self.cache[arm][sid][1][key], same_tensor=True)
                exact_view(row, self.safe[key])
                exact_view(self.cache["A"][sid][1][key], self.cache["B"][sid][1][key])
            self.scores[name] = indexed

    def materialize(self, arm, sid):
        if sid not in self.feature_rows[arm]:
            item, rows = self.cache[arm][sid]
            raw = self.inputs.runtime_bytes("features/" + arm, item["arrayFile"])
            require(hashlib.sha256(raw).hexdigest() == item["arraySha256"], "NPZ_FILE_HASH:" + arm + "/" + sid)
            features = parse_features(raw, len(rows))
            result = {}
            for key, row in rows.items():
                values, h = features[row["featureIndex"]]
                require(h == row["featureSha256"], "FEATURE_ROW_HASH:" + arm + "/" + sid)
                result[key] = values
            self.feature_rows[arm][sid] = result
        return self.feature_rows[arm][sid]

    def infer_row(self, name, key):
        arm = "A" if name.startswith("A") else "B"
        row = self.cache[arm][key[0]][1][key]
        feature = self.materialize(arm, key[0])[key]
        if name in ("A1", "A2"):
            return response_scores(row)[0 if name == "A1" else 1]
        head = self.heads[name]
        return head_score(head, row["nuisance"] if head["featureKey"] == "nuisance" else feature)

    def calibration_check(self, name):
        cal, maxima, original = self.cals[name], {}, []
        maximum_delta = 0.
        for sid, parent in self.parents.items():
            if parent["role"] != "CALIBRATION":
                continue
            require(parent["label"] == 0 and set(parent["conditions"]) == CONDITIONS, "CALIBRATION_POPULATION")
            scores = {c: self.infer_row(name, (sid, c, "reference")) for c in sorted(CONDITIONS)}
            maxima[sid] = max(scores.values())
            original.append(scores["original"])
            maximum_delta = max(maximum_delta, close(maxima[sid], cal["sourceWorstScores"][sid], "CAL_SOURCE_RECOMPUTATION:" + name))
        maximum_delta = max(maximum_delta, close(max(original), cal["originalThreshold"], "CAL_ORIGINAL_RECOMPUTATION:" + name),
                            close(max(maxima.values()), cal["worstThreshold"], "CAL_WORST_RECOMPUTATION:" + name))
        return {"parents": 8, "rows": 48, "maxAbsDifference": maximum_delta, "sourceMaxima": maxima,
                "recomputedOriginalThreshold": max(original), "recomputedWorstThreshold": max(maxima.values()),
                "frozenThresholdsRetained": True, "noRetuning": True}

    def candidate_check(self, name, panel_ids):
        rows, cal = list(self.scores[name].values()), self.cals[name]
        positives = {r["sampleId"] for r in rows if r["score"] > (cal["originalThreshold"] if r["condition"] == "original" else cal["worstThreshold"])}
        selected = positives | panel_ids
        details, max_delta = [], 0.
        for row in sorted(rows, key=row_key):
            if row["sampleId"] not in selected:
                continue
            key = row_key(row)
            actual = self.infer_row(name, key)
            delta = close(actual, row["score"], "SCORE_RECOMPUTATION:" + name + ":" + repr(key))
            for threshold in (cal["originalThreshold"], cal["worstThreshold"]):
                require((actual > threshold) == (row["score"] > threshold), "STRICT_DECISION_DISAGREEMENT:" + name + ":" + repr(key))
            max_delta = max(max_delta, delta)
            arm = "A" if name.startswith("A") else "B"
            cached = self.cache[arm][key[0]][1][key]
            details.append({"sampleId": key[0], "condition": key[1], "view": key[2], "recordHash": digest(cached),
                            "featureSha256": cached["featureSha256"], "scientificViewRgbHash": cached["scientificViewRgbHash"],
                            "reportedScore": row["score"], "recomputedScore": actual, "absDifference": delta})
        principal = {}
        for condition in ("original", "jpeg75"):
            subset = [r for r in rows if r["view"] == "reference" and r["condition"] == condition]
            require(len(subset) == 48 and sum(r["label"] for r in subset) == 20, "PRINCIPAL_DENOMINATOR:" + name)
            principal[condition] = metrics(subset, cal["originalThreshold"] if condition == "original" else cal["worstThreshold"])
        return {"principal": principal, "sourceWorst": source_worst(rows, cal["worstThreshold"]),
                "safeRescues": partitions(rows, self.safe, cal), "calibration": self.calibration_check(name),
                "selectedInferenceAudit": {"candidatePositiveParentIds": sorted(positives), "checkedParentIds": sorted(selected),
                                           "checkedRows": len(details), "maxAbsDifference": max_delta, "rows": details}}

    def run(self):
        for name in ("candidate-score-rows.json", "safe-reference-rows.json"):
            require(contained(OUT, OUT / name).is_file(), "MISSING_INPUT:research/wp007n/" + name)
        self.freeze()
        self.load_heads()
        self.load_cache_metadata()
        self.score_rows()
        panel = negative_panel(self.parents)
        require(len(panel) == 3 and all(len(ids) == 4 for ids in panel.values()), "NEGATIVE_PANEL_COVERAGE")
        panel_ids = set().union(*(set(ids) for ids in panel.values()))
        candidates = {name: self.candidate_check(name, panel_ids) for name in NAMES}
        safe_metrics = {condition: metrics([r for r in self.safe.values() if r["view"] == "reference" and r["condition"] == condition], SAFE_THRESHOLD, True)
                        for condition in ("original", "jpeg75")}
        self.inputs.code_hash("scripts/authenticity/wp007n_independent_audit.py")
        self.inputs.unchanged()
        return {"status": "PASS_WITH_BOUNDED_LIMITATIONS", "population": {"N": 48, "negative": 28, "synthetic": 20, "actualHumanDigital": 0},
                "cohortHash": COHORT_HASH, "protocolHash": PROTOCOL_HASH, "executionSignature": self.signature,
                "principalCandidates": list(PRINCIPAL), "candidates": candidates, "SAFE": safe_metrics,
                "negativePanel": {"parentsByKind": panel, "selection": "First four by SHA256 canonical [WP007N_INDEPENDENT_NEGATIVE_PANEL_V1,2026091907,kind,sampleId], then sampleId; score blind"},
                "coverage": {"decodedViewKeys": len(self.expected), "candidateRowsJoined": len(self.expected) * len(NAMES),
                             "safeRowsJoined": len(self.safe), "arrayCheckedParentsByArm": {a: sorted(self.feature_rows[a]) for a in ("A", "B")}},
                "numerics": {"scoreAbsoluteTolerance": SCORE_ATOL, "responseAbsoluteTolerance": RESPONSE_ATOL,
                             "decisionTolerance": 0, "engine": "stdlib float64 arithmetic, math.fsum, stable logistic; no production helper imports",
                             "AUROC": "Synthetic-positive pairwise wins, half credit for ties; never flip based on EVAL",
                             "SAFEcomparison": ">=", "candidateComparison": ">"}}


def render(report):
    lines = ["# WP007N independent results audit", "", "Status: **" + report["status"] + "**", ""]
    if "error" in report:
        lines.extend(["Audit blocked: `" + report["error"] + "`.", "No scientific counts are certified by this failed run.", ""])
    else:
        lines.extend(["Recomputed from candidate/SAFE row files, not summaries. N=48: 28 negatives / 20 synthetics; actual human digital controls absent.",
                      "Candidates use strict `>`; SAFE uses `>=`. AP is non-interpolated, synthetic-positive; orientation is never selected on EVAL.", "",
                      "| Candidate | View | TP | FN | FP | TN | AP | AUROC |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"])
        for name, result in report["candidates"].items():
            for condition, m in result["principal"].items():
                lines.append(f"| {name} | reference/{condition} | {m['TP']} | {m['FN']} | {m['FP']} | {m['TN']} | {m['averagePrecision']:.8g} | {m['AUROC']:.8g} |")
        lines.extend(["", "| Candidate | Source-worst FP/N | Exact-input rescue parents: original / JPEG75 / all declared | Checked parents | Max score difference |",
                      "| --- | ---: | --- | ---: | ---: |"])
        for name, result in report["candidates"].items():
            worst, check = result["sourceWorst"], result["selectedInferenceAudit"]
            counts = " / ".join(str(result["safeRescues"][s]["uniqueExactInputRescueParents"]) for s in ("original", "jpeg75", "ALL_DECLARED_WORST"))
            lines.append(f"| {name} | {worst['FP']}/{worst['N']} | {counts} | {len(check['checkedParentIds'])} | {check['maxAbsDifference']:.3g} |")
        lines.extend(["", "Every candidate-positive parent and the same score-blind four-negative-per-kind panel receive cached-feature/head-inference checks; all eight calibration parents are recomputed for every candidate. No backbone or SAFE forwards are replayed.",
                      "Source IDs, exact-input rescue evidence, per-row hashes/deltas, calibration maxima, SAFE metrics and input SHA-256 receipts are in [the JSON audit](independent-results-audit.json).", ""])
    lines.extend(["## Limitations", ""] + ["- " + item for item in report["limitations"]])
    return "\n".join(lines) + "\n"


def self_test():
    checks = 0
    def expect_failure(fn):
        nonlocal checks
        try:
            fn()
        except AuditError:
            checks += 1
        else:
            raise AssertionError("Expected an audit failure")
    def equal(a, b):
        nonlocal checks
        assert a == b, (a, b)
        checks += 1
    equal(rank_metrics([0, 1], [.1, .9]), {"AUROC": 1., "averagePrecision": 1.})
    equal(rank_metrics([0, 1], [.9, .1]), {"AUROC": 0., "averagePrecision": .5})
    equal(rank_metrics([0, 1], [.5, .5]), {"AUROC": .5, "averagePrecision": .5})
    close(rank_metrics([1, 0, 1, 0], [.9, .8, .8, .1])["averagePrecision"], 5 / 6, "AP_TIED_TEST")
    equal(rank_metrics([0, 0], [0., 1.]), {"AUROC": None, "averagePrecision": None})
    tied = [{"label": 0, "score": SAFE_THRESHOLD}, {"label": 1, "score": SAFE_THRESHOLD}]
    equal((metrics(tied, SAFE_THRESHOLD)["TP"], metrics(tied, SAFE_THRESHOLD)["FP"]), (0, 0))
    equal((metrics(tied, SAFE_THRESHOLD, True)["TP"], metrics(tied, SAFE_THRESHOLD, True)["FP"]), (1, 1))
    expect_failure(lambda: decode_json('{"x":1,"x":2}'))
    expect_failure(lambda: decode_json('{"x":NaN}'))
    expect_failure(lambda: rank_metrics([True], [.5]))
    expect_failure(lambda: rank_metrics([1], [float("inf")]))
    expect_failure(lambda: contained(OUT, OUT / "../outside.json"))
    row = {"sampleId": "x", "condition": "original", "view": "reference"}
    expect_failure(lambda: index_rows([row, row], {row_key(row)}, "duplicate"))
    expect_failure(lambda: index_rows([], {row_key(row)}, "missing"))
    head = {"mean": [0., 0.], "scale": [1., 1.], "coefficient": [0., 0.], "intercept": 0.}
    equal(head_score(head, [3., 4.]), .5)
    equal(head_score(head, [0., 0.]), .5)
    head["intercept"] = -1000.
    equal(head_score(head, [0., 0.]), 0.)
    scaled = {"mean": [.1, .2], "scale": [.5, 2.], "coefficient": [2., -1.], "intercept": .25}
    close(head_score(scaled, [3., 4.]), 1 / (1 + math.exp(-1.95)), "STANDARDIZATION_TEST")
    equal(head_score(scaled, [3., 4.]), head_score(scaled, [30., 40.]))
    joined = {"sampleId": "x", "sourceFamilyId": "family-x", "role": "HISTORICAL_CHALLENGE",
              "kind": "SYNTHETIC", "label": 1, "generatorFamily": "test-family", "condition": "original",
              "view": "reference", "sourceSha256": "0" * 64, "scientificViewRgbHash": "1" * 64, "tensorSha256": "2" * 64}
    right = dict(joined, tensorSha256="3" * 64)
    exact_view(joined, right)
    expect_failure(lambda: exact_view(joined, right, same_tensor=True))
    expect_failure(lambda: exact_view(joined, dict(right, scientificViewRgbHash="4" * 64)))
    expect_failure(lambda: exact_view(joined, dict(right, role="FIT")))
    rs = [dict(joined, score=.8), dict(joined, condition="jpeg75", score=.8)]
    safe = {row_key(rs[0]): dict(rs[0], score=.9), row_key(rs[1]): dict(rs[1], score=.1)}
    cal = {"originalThreshold": .5, "worstThreshold": .5}
    rescue = partitions(rs, safe, cal)["ALL_DECLARED_WORST"]
    equal(rescue["uniqueExactInputRescueParents"], 1)
    equal(rescue["candidateOnlyParentIds"], [])
    safe[row_key(rs[0])]["score"] = .1
    rescue = partitions(rs, safe, cal)["ALL_DECLARED_WORST"]
    equal(rescue["uniqueExactInputRescueParents"], 1)
    equal(len(rescue["exactInputEvidence"]), 2)
    equal(rescue["candidateOnlyParentIds"], ["x"])
    safe[row_key(rs[0])]["score"] = SAFE_THRESHOLD
    equal(partitions(rs, safe, cal)["original"]["uniqueExactInputRescueParents"], 0)
    rs[1]["score"] = cal["worstThreshold"]
    equal(partitions(rs, safe, cal)["jpeg75"]["uniqueExactInputRescueParents"], 0)
    parents = {kind + str(i): {"role": "EVAL_N", "label": 0, "kind": kind}
               for kind in ("PHOTO_CSAFE", "PHOTO_UNSPLASH", "PROCEDURAL_SUPPLEMENT") for i in range(6)}
    panel = negative_panel(parents)
    equal(panel, negative_panel(dict(reversed(list(parents.items())))))
    equal([len(v) for v in panel.values()], [4, 4, 4])
    record = {"tensorSha256": "0" * 64, "responses": [], "A1": .25, "A2": .25, "responseSpread": 0.}
    for draw in range(3):
        seed = int.from_bytes(hashlib.sha256(canonical([SEED, record["tensorSha256"], draw])).digest()[:8], "big") % (2**63 - 1)
        record["responses"].append({"draw": draw, "seed": seed, "similarity": .75, "response": .25})
    equal(response_scores(record), (.25, .25))
    record["responses"][0]["response"] = -.25
    expect_failure(lambda: response_scores(record))
    payload = struct.pack("<1024f", *([.5] * 1024))
    header = repr({"descr": "<f4", "fortran_order": False, "shape": (1, 1024)}).encode() + b"\n"
    npy = b"\x93NUMPY\x01\x00" + struct.pack("<H", len(header)) + header + payload
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("features.npy", npy)
    features = parse_features(buffer.getvalue(), 1)
    equal(features[0][0], tuple([.5] * 1024))
    equal(features[0][1], hashlib.sha256(canonical(["float32", [1024]]) + payload).hexdigest())
    expect_failure(lambda: parse_features(buffer.getvalue(), 2))
    extra = io.BytesIO()
    with zipfile.ZipFile(extra, "w") as archive:
        archive.writestr("features.npy", npy)
        archive.writestr("unexpected.npy", npy)
    expect_failure(lambda: parse_features(extra.getvalue(), 1))
    invalid = io.BytesIO()
    with zipfile.ZipFile(invalid, "w") as archive:
        archive.writestr("features.npy", npy[:-4] + struct.pack("<f", float("nan")))
    expect_failure(lambda: parse_features(invalid.getvalue(), 1))
    print(json.dumps({"selfTest": "PASS", "checks": checks, "scientificInputsRead": 0, "filesWritten": 0}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--run", action="store_true", help="Audit completed N score/cache files and write only independent-results-audit.json/.md")
    group.add_argument("--self-test", action="store_true", help="Run synthetic in-memory checks only; no report files")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    audit = Audit()
    report = {"schemaVersion": "wp007n-independent-results-audit-v1", "startedUtc": datetime.now(timezone.utc).isoformat(), "limitations": LIMITATIONS}
    status = 0
    try:
        report.update(audit.run())
    except Exception as exc:
        error = str(exc)
        report.update(status="BLOCKED_MISSING_INPUT" if error.startswith("MISSING_INPUT:") else "FAILED_VALIDATION", error=type(exc).__name__ + ":" + error)
        status = 2
    report["inputHashes"] = audit.inputs.hashes
    report["completedUtc"] = datetime.now(timezone.utc).isoformat()
    for suffix, body in ((".json", json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n"), (".md", render(report))):
        target = contained(OUT, OUT / ("independent-results-audit" + suffix))
        temporary = target.with_suffix(suffix + ".partial")
        temporary.write_text(body, encoding="utf-8", newline="\n")
        os.replace(temporary, target)
    print(json.dumps({"status": report["status"], "outputs": ["research/wp007n/independent-results-audit.json", "research/wp007n/independent-results-audit.md"]}))
    return status


if __name__ == "__main__":
    sys.exit(main())
