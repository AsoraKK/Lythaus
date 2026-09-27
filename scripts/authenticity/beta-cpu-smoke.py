"""Attended, no-retry parity runner for an explicitly authorized loopback Container."""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
CHECKPOINT = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
THRESHOLD = 0.5864923000335693


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("REDIRECT_FORBIDDEN")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def close_enough(actual, historical, manifest):
    return math.isfinite(actual) and abs(actual - historical) <= manifest["absoluteTolerance"] + manifest["relativeTolerance"] * abs(historical)


def prepare(manifest, approval):
    for field in ["attendedRuntimeAuthorized", "computePolicySatisfied", "checkpointUseAuthorized", "fixtureUseAuthorized"]:
        if approval.get(field) is not True:
            raise ValueError("APPROVAL_REQUIRED")
    for field in ["rightsEvidenceSha256", "runtimeEvidenceSha256", "preprocessingHash"]:
        if not re.fullmatch(r"[a-f0-9]{64}", approval.get(field, "")):
            raise ValueError("EVIDENCE_REQUIRED")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", approval.get("runtimeDigest", "")):
        raise ValueError("RUNTIME_IDENTITY_REQUIRED")
    if not re.fullmatch(r"[a-f0-9]{40}", approval.get("sourceSha", "")):
        raise ValueError("SOURCE_IDENTITY_REQUIRED")
    if not time.time() < approval.get("expiresAtEpochSeconds", 0) <= time.time() + 86400:
        raise ValueError("APPROVAL_EXPIRED")
    records = []
    for record in manifest["records"]:
        mapping = approval.get("fixtures", {}).get(record["sampleId"], {})
        if mapping.get("nonsealedEngineeringUseAuthorized") is not True or not re.fullmatch(r"[a-f0-9]{64}", mapping.get("rightsEvidenceSha256", "")):
            raise ValueError("FIXTURE_RIGHTS_REQUIRED")
        file = Path(mapping["path"])
        if file.stat().st_size > 10 * 1024 * 1024:
            raise ValueError("FIXTURE_SIZE_LIMIT")
        data = file.read_bytes()
        if sha(data) != record["sha256"]:
            raise ValueError("FIXTURE_CHECKSUM_MISMATCH")
        records.append(({**record, "descendant": False}, data))
    from PIL import Image, __version__
    if __version__ != "12.3.0":
        raise ValueError("FROZEN_PILLOW_VERSION_REQUIRED")
    Image.MAX_IMAGE_PIXELS = 16777216
    parents = [next(item for item in records if item[0]["category"] == "CAMERA"), next(item for item in records if item[0]["groundTruth"] == 1)]
    for record, data in parents:
        with Image.open(io.BytesIO(data)) as original:
            if original.width * original.height > 16777216 or original.mode != "RGB" or getattr(original, "n_frames", 1) != 1:
                raise ValueError("FIXTURE_FORMAT_UNSUPPORTED")
            original.load()
            for operation in ["JPEG_Q95", "JPEG_Q75", "RESIZE_HALF", "JPEG_Q95_THEN_PNG"]:
                buffer = io.BytesIO()
                if operation == "RESIZE_HALF":
                    original.resize((original.width // 2, original.height // 2), Image.Resampling.LANCZOS).save(buffer, format="PNG")
                else:
                    original.save(buffer, format="JPEG", quality=75 if operation == "JPEG_Q75" else 95, subsampling=0, optimize=False, progressive=False)
                    if operation == "JPEG_Q95_THEN_PNG":
                        with Image.open(io.BytesIO(buffer.getvalue())) as jpeg:
                            buffer = io.BytesIO()
                            jpeg.save(buffer, format="PNG")
                records.append(({**record, "sampleId": record["sampleId"] + ":" + operation, "descendant": True, "historicalScore": None}, buffer.getvalue()))
    if len(records) != manifest["maxSafeAttempts"]:
        raise ValueError("FROZEN_ATTEMPT_COUNT_MISMATCH")
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--approval", required=True, type=Path)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise ValueError("INVALID_PORT")
    output = args.receipt.resolve()
    if output.is_relative_to(ROOT) or output.exists():
        raise ValueError("NEW_PRIVATE_RECEIPT_OUTSIDE_REPOSITORY_REQUIRED")
    secret = os.environ.get("AUTHENTICITY_BETA_DISPATCH_SECRET")
    if not secret:
        raise ValueError("DISPATCH_SECRET_REQUIRED")
    manifest = json.loads((ROOT / "docs/models/safe-a-v0.1-smoke.json").read_text())
    raw_approval = args.approval.read_bytes()
    approval = json.loads(raw_approval)
    records = prepare(manifest, approval)
    report = {"schemaVersion": "lythaus-beta-cpu-smoke-v1", "sourceSha": approval["sourceSha"], "runtimeDigest": approval["runtimeDigest"], "approvalSha256": sha(raw_approval), "appAcceptance": False, "adviserCalls": 0, "attempts": [], "rawClassifierCountsHistoricalReuseOnly": {"TP": 0, "FN": 0, "FP": 0, "TN": 0, "unavailable": 0}, "state": "RUNNING"}
    with output.open("x", encoding="utf-8") as handle:
        os.chmod(output, 0o600)
        def save():
            handle.seek(0)
            json.dump(report, handle, allow_nan=False, indent=2)
            handle.truncate()
            handle.flush()
            os.fsync(handle.fileno())
        started = time.monotonic()
        for record, data in records:
            if time.monotonic() - started >= 30 * 60:
                report["state"] = "TIME_BOUND_EXHAUSTED"
                save()
                return 1
            binding = {"caseId": str(uuid.uuid4()), "runId": str(uuid.uuid4()), "inputHash": sha(data), "revision": 1}
            attempt = {"sampleId": record["sampleId"], "descendant": record["descendant"], **binding, "state": "RESERVED_BEFORE_SEND"}
            report["attempts"].append(attempt)
            save()
            request = urllib.request.Request(f"http://127.0.0.1:{args.port}/infer", data=data, headers={"authorization": "Bearer " + secret, "content-type": "image/png" if data.startswith(b"\x89PNG\r\n\x1a\n") else "image/jpeg", "x-beta-binding": json.dumps(binding)}, method="POST")
            sent = time.monotonic()
            try:
                with urllib.request.build_opener(NoRedirect()).open(request, timeout=180) as response:
                    raw = response.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    raise ValueError("RESPONSE_LIMIT")
                result = json.loads(raw)["result"]
                if any(result.get(key) != value for key, value in binding.items()) or result.get("checkpoint") != CHECKPOINT or result.get("runtimeDigest") != approval["runtimeDigest"] or result.get("preprocessingHash") != approval["preprocessingHash"]:
                    raise ValueError("RUNTIME_IDENTITY_MISMATCH")
                score = result.get("score")
                if result["status"] == "OK" and (not isinstance(score, (int, float)) or isinstance(score, bool) or not math.isfinite(score) or not 0 <= score <= 1):
                    raise ValueError("INVALID_SCORE")
                if result["status"] != "OK" and score is not None:
                    raise ValueError("FAILURE_WITH_SCORE")
                parity = None if record["descendant"] else result["status"] == "OK" and close_enough(score, record["historicalScore"], manifest)
                attempt.update(state="COMPLETED", modelStatus=result["status"], rawScore=score, parity=parity, endToEndMs=(time.monotonic() - sent) * 1000, timings=result.get("timings"), measurements=result.get("measurements"), interpretation="ABSTAIN_DEGRADED" if record["descendant"] else "HISTORICAL_REUSE_DIAGNOSTIC_ONLY")
                if not record["descendant"]:
                    key = "unavailable" if score is None else ("TP" if score >= THRESHOLD else "FN") if record["groundTruth"] else ("FP" if score >= THRESHOLD else "TN")
                    report["rawClassifierCountsHistoricalReuseOnly"][key] += 1
                if parity is False:
                    report["state"] = "PARITY_FAILED_STOPPED"
                    save()
                    return 1
            except Exception:
                attempt["state"] = "FAILED_OR_AMBIGUOUS_NO_RETRY"
                report["state"] = "STOPPED"
                save()
                return 1
            save()
        report["state"] = "CPU_SMOKE_COMPLETE_NOT_APP_ACCEPTANCE"
        save()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("BLOCKED: smoke preflight or runtime failed; no private paths or provider bodies are printed.")
        raise SystemExit(1)
