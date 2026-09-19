"""Fail-closed execution admission independent of detector decisions."""
import ctypes
import json
import math
import os
import time
import msvcrt
from pathlib import Path
import numpy as np
from wp007n_core import REPO, OUT, RUNTIME, file_hash, digest, array_hash, save_json, guard


def load(path):
    return json.loads(Path(path).read_text())


def execution_signature():
    frozen=load(OUT/"execution-code-freeze.json")
    for relative,expected in frozen["files"].items():
        if file_hash(REPO/relative)!=expected:
            raise ValueError("EXECUTABLE_CHANGED:"+relative)
    return digest(frozen["files"])


def validate_head_schema(name,head,cal):
    if name in ("A1","A2"):
        if head is not None or cal["headHash"] is not None:
            raise ValueError("RESPONSE_HEAD_PROHIBITED")
        return
    backbone=None if name.startswith("NUISANCE") else name[0]
    dimension=len(head["mean"]) if backbone is None else 1024
    if backbone is None and dimension!=11:
        raise ValueError("NUISANCE_DIMENSION")
    if head["backbone"]!=backbone or head["featureKey"]!=("nuisance" if backbone is None else "feature") or head["classes"]!=[0,1] or head["permutation"]!=name.endswith("_PERMUTED"):
        raise ValueError("HEAD_SEMANTICS")
    for key in ("mean","scale","coefficient"):
        values=np.asarray(head[key])
        if values.shape!=(dimension,) or not np.isfinite(values).all():
            raise ValueError("HEAD_DIMENSION_OR_FINITE")
    if np.any(np.asarray(head["scale"])<=0) or not math.isfinite(head["intercept"]):
        raise ValueError("HEAD_SCALE_OR_INTERCEPT")


def validate_calibrations(co,protocol_hash):
    from wp007n_analysis import load_candidate
    ids={r["sampleId"] for r in co["rows"] if r["role"]=="CALIBRATION"}
    for name in ("A0","A1","A2","B0","B1","NUISANCE","A0_PERMUTED","B0_PERMUTED","B1_PERMUTED","NUISANCE_PERMUTED"):
        head,cal=load_candidate(name)
        validate_head_schema(name,head,cal)
        if cal.get("schemaVersion")!="wp007n-calibration-v1" or cal["candidate"]!=name or cal["comparison"]!="STRICT_GREATER":
            raise ValueError("CALIBRATION_SCHEMA")
        if cal["protocolHash"]!=protocol_hash or cal["cohortHash"]!=co["freezeHash"] or set(cal["sourceWorstScores"])!=ids or cal["sourceCount"]!=len(ids):
            raise ValueError("STALE_CALIBRATION:"+name)
        if not all(math.isfinite(cal[k]) for k in ("originalThreshold","worstThreshold")):
            raise ValueError("NONFINITE_THRESHOLD")
        if not all(math.isfinite(v) for v in cal["sourceWorstScores"].values()) or cal["worstThreshold"]!=max(cal["sourceWorstScores"].values()) or cal["originalThreshold"]>cal["worstThreshold"]:
            raise ValueError("CALIBRATION_RANK_INVARIANT")
        if head and (head["cohortHash"]!=co["freezeHash"] or head["protocolHash"]!=protocol_hash):
            raise ValueError("STALE_HEAD")
        if head:
            for key,role in (("trainingIds","FIT"),("devIds","DEV")):
                if set(head[key])!={r["sampleId"] for r in co["rows"] if r["role"]==role}:
                    raise ValueError("HEAD_TRAINING_MEMBERSHIP")
            if head["backbone"] and head["checkpointHash"]!=load(OUT/"checkpoint-freeze.json")[head["backbone"]]["sha256"]:
                raise ValueError("HEAD_BACKBONE_MISMATCH")


def expected_requests(parent,arm,co):
    conditions=parent["conditions"]
    if arm=="A" and parent["role"] in ("FIT","DEV"):
        conditions=["original"]
    result=[(c,"reference") for c in conditions]
    for group in ("PHOTO_CSAFE","PHOTO_UNSPLASH","Seedream-4","SD-3.5-Large"):
        eligible=[r for r in co["rows"] if r["role"] in ("EVAL_N","HISTORICAL_CHALLENGE") and (r["kind"]==group or r["generatorFamily"]==group)]
        chosen=min(eligible,key=lambda r:digest(["WP007N_SCORE_BLIND",r["sampleId"]]))
        if parent["sampleId"]==chosen["sampleId"]:
            result.extend([(c,"matched256") for c in ("original","jpeg75")])
    return result


def derived_admission(extra=0):
    roots=[RUNTIME/"features",OUT]
    total=sum(p.stat().st_size for root in roots if root.exists() for p in root.rglob("*") if p.is_file())
    if total+extra>100000000:
        raise RuntimeError("DERIVED_STORAGE_LIMIT")
    return total


def validate_cache(path,parent,wanted,signature,allow_unverified_legacy=False):
    item=load(path)
    transition_path=OUT/"admission-transition.json"
    transition=load(transition_path) if transition_path.exists() else {}
    receipt=transition.get("cacheReceipts",{}).get(str(path.parent.name)+"/"+path.name)
    transitioned=(transition.get("executionSignature")==signature and transition.get("cohortHash")==load(OUT/"cohort-freeze.json")["freezeHash"] and receipt==file_hash(path) and parent["role"] in ("FIT","DEV","CALIBRATION"))
    if item.get("executionSignature")!=signature and not transitioned:
        certificate=load(OUT/"legacy-cache-certificate.json")
        if not allow_unverified_legacy and (certificate.get("schemaVersion")!="wp007n-legacy-certificate-v1" or certificate.get("executionSignature")!=signature or certificate.get("cohortHash")!=load(OUT/"cohort-freeze.json")["freezeHash"] or len(certificate.get("replayResults",[]))!=4 or any(r["cleanMaxAbs"]>1e-6 or r["responseMaxAbs"]>1e-6 for r in certificate["replayResults"])):
            raise ValueError("LEGACY_CERTIFICATE_TARGET_MISMATCH")
        if not certificate.get("replayValidated") and not allow_unverified_legacy:
            raise ValueError("LEGACY_REPLAY_REQUIRED")
        if parent["role"] not in ("FIT","DEV","CALIBRATION") or parent["sampleId"] not in certificate["parents"]:
            raise ValueError("LEGACY_ROLE_PROHIBITED")
        receipt=certificate["parents"][parent["sampleId"]]
        if path.name!=receipt["metadataFile"] or file_hash(path)!=receipt["metadataSha256"]:
            raise ValueError("LEGACY_CACHE_CHANGED")
        if item["coreCodeHash"]!=certificate["coreCodeHash"] or item["extractCodeHash"]!=certificate["extractCodeHash"]:
            raise ValueError("LEGACY_EXECUTABLE_MISMATCH")
    arrays=path.parent/item["arrayFile"]
    if file_hash(arrays)!=item["arraySha256"] or item["sourceHash"]!=parent["sha256"]:
        raise ValueError("CACHE_CONTENT_MISMATCH")
    records=item["records"]
    if sorted((r["condition"],r["view"]) for r in records)!=sorted(wanted):
        raise ValueError("CACHE_REQUEST_MISMATCH")
    with np.load(arrays,allow_pickle=False) as data:
        features=data["features"]
        if features.shape!=(len(wanted),1024) or features.dtype!=np.float32 or not np.isfinite(features).all():
            raise ValueError("CACHE_FEATURE_INVALID")
        for i,r in enumerate(records):
            for field in ("sampleId","sourceFamilyId","role","label","kind","generatorFamily"):
                if r[field]!=parent[field]:
                    raise ValueError("CACHE_RECORD_IDENTITY")
            if r["sourceSha256"]!=parent["sha256"] or r["featureIndex"]!=i or r["featureSha256"]!=array_hash(features[i]):
                raise ValueError("CACHE_FEATURE_IDENTITY")
            if r["responses"] and (len(r["responses"])!=3 or not all(math.isfinite(x["response"]) and math.isfinite(x["similarity"]) for x in r["responses"])):
                raise ValueError("CACHE_RESPONSE_INVALID")
    return item


class ForwardBudget:
    def __init__(self,arm,protocol,clock=time.time):
        self.arm=arm;self.clock=clock;self.path=RUNTIME/("budget-"+arm+".json")
        self.lock=open(RUNTIME/("budget-"+arm+".lock"),"a+b")
        self.lock.seek(0)
        try:
            msvcrt.locking(self.lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:
            self.lock.close()
            raise RuntimeError("ARM_EXCLUSIVE_LOCK_UNAVAILABLE")
        self.data=load(self.path) if self.path.exists() else {"seconds":0.,"forwards":0,"runs":[]}
        if self.data.get("active"):
            active=self.data["active"]
            ctypes.windll.kernel32.OpenProcess.restype=ctypes.c_void_p
            ctypes.windll.kernel32.GetExitCodeProcess.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]
            ctypes.windll.kernel32.CloseHandle.argtypes=[ctypes.c_void_p]
            process=ctypes.windll.kernel32.OpenProcess(0x1000,False,active["pid"])
            if process:
                code=ctypes.c_ulong()
                ctypes.windll.kernel32.GetExitCodeProcess(process,ctypes.byref(code))
                ctypes.windll.kernel32.CloseHandle(process)
                if code.value==259:
                    raise RuntimeError("ARM_ALREADY_RUNNING")
            self.data["seconds"]=max(self.data["seconds"],active["baseSeconds"]+clock()-active["start"])
            self.data.setdefault("recoveredInterruptions",[]).append({"chargedElapsedIncludingUnknownIdle":self.data["seconds"],"pendingForwardCountRetained":self.data["forwards"]})
            self.data.pop("active")
        self.base=self.data["seconds"];self.start=clock();self.initial_forwards=self.data["forwards"]
        self.maximum=protocol["scientificLimits"][arm+"ForwardPasses"]
        if self.base>=2700 or self.data["forwards"]>=self.maximum:
            raise RuntimeError("ARM_BUDGET_EXHAUSTED")
        self.data["active"]={"pid":os.getpid(),"start":self.start,"baseSeconds":self.base,"pendingForward":False}
        self.persist()

    def persist(self):
        self.data["seconds"]=self.base+self.clock()-self.start
        save_json(self.path,self.data)

    def before_forward(self):
        guard()
        if self.base+self.clock()-self.start+30>2700 or self.data["forwards"]+1>self.maximum:
            raise RuntimeError("ARM_BUDGET_REACHED_RESUMABLE")
        self.data["forwards"]+=1
        self.data["active"]["pendingForward"]=True
        self.persist()

    def after_forward(self):
        self.data["active"]["pendingForward"]=False
        self.persist()
        if self.data["seconds"]>2700:
            raise RuntimeError("ARM_RUNTIME_OVERRUN")

    def wrap(self,model):
        budget=self
        class Wrapped:
            def __call__(self,tensor):
                budget.before_forward()
                output=model(tensor)
                budget.after_forward()
                return output
        return Wrapped()

    def finish(self,record):
        self.persist()
        record.update(seconds=self.clock()-self.start,forwards=self.data["forwards"]-self.initial_forwards,ambiguousForwardCharged=self.data["active"]["pendingForward"])
        self.data["runs"].append(record)
        self.data.pop("active")
        save_json(self.path,self.data)
        save_json(OUT/("run-"+self.arm+".json"),self.data)
        self.lock.seek(0)
        msvcrt.locking(self.lock.fileno(),msvcrt.LK_UNLCK,1)
        self.lock.close()
