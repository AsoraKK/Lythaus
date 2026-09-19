"""Separate internal evidence contracts; no public authenticity decision."""
import math


def representation_response_evidence(backbone,source_hash,similarities,applicability="UNQUALIFIED_RESEARCH"):
    if similarities is None:
        return {"type":"RepresentationResponseEvidence","backbone":backbone,"sourceHash":source_hash,"responses":None,"missingness":"UNAVAILABLE","publicAuthority":False,"applicability":applicability}
    if len(similarities)!=3 or not all(math.isfinite(v) for v in similarities):
        raise ValueError("INVALID_RESPONSE_EVIDENCE")
    return {"type":"RepresentationResponseEvidence","backbone":backbone,"sourceHash":source_hash,"responses":[1-v for v in similarities],"missingness":None,"publicAuthority":False,"applicability":applicability}


def frozen_feature_origin_evidence(backbone,head_hash,calibration_hash,source_hash,score,applicability="UNQUALIFIED_RESEARCH"):
    if not head_hash or not calibration_hash:
        raise ValueError("HEAD_AND_CALIBRATION_REQUIRED")
    if score is not None and (not math.isfinite(score) or not 0<=score<=1):
        raise ValueError("INVALID_FITTED_OUTPUT")
    return {"type":"FrozenFeatureOriginEvidence","backbone":backbone,"headHash":head_hash,"calibrationHash":calibration_hash,"sourceHash":source_hash,"internalScore":score,"missingness":"UNAVAILABLE" if score is None else None,"publicAuthority":False,"applicability":applicability,"originVerdict":None}
