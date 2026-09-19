"""Score-blind selection exclusively from explicitly consumed manifests."""
import json
import os
import tempfile
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
from scipy.fft import dctn
from wp007n_core import REPO, OUT, RUNTIME, CONDITIONS, digest, file_hash, array_hash, save_json

ROOTS = {
    "CSAFE": Path(os.environ.get("WP007N_DATA_ROOT",str(Path.home()/"OneDrive/Desktop/Lythaus_AI_Datasets"))) / "wp006e-csafe-cache-4e8c0d40f2c7",
    "DDB": Path(os.environ.get("WP007N_DATA_ROOT",str(Path.home()/"OneDrive/Desktop/Lythaus_AI_Datasets"))) / "90_RESEARCH_ONLY/wp007a-diffusiondb-cache",
    "I": Path(tempfile.gettempdir()) / "lythaus-wp007i-media",
    "FLUX1": Path(tempfile.gettempdir()) / "lythaus-wp007ahr4-flux1-35000395251/wp007ah-cloudflare/FLUX_1_SCHNELL",
}


def read(relative):
    return json.loads((REPO / relative).read_text(encoding="utf-8-sig"))


def rank(rows):
    return sorted(rows, key=lambda r: digest(["WP007N_SCORE_BLIND", r["sampleId"]]))


def safe_path(row):
    if row.get("sealed") or "flux_2" in json.dumps(row).lower() or "flux2" in json.dumps(row).lower():
        raise ValueError("RESERVE_PROHIBITED")
    root = ROOTS[row["rootKey"]].resolve()
    path = (root / row["relativePath"]).resolve()
    if not path.is_relative_to(root) or ".." in Path(row["relativePath"]).parts:
        raise ValueError("PATH_ESCAPE")
    if row["rootKey"] == "CSAFE" and not row["relativePath"].startswith(("historical/", "new/")):
        raise ValueError("CAMERA_RESERVE_PATH")
    return path


def validate_roles(rows):
    seen, groups, hashes = {}, {}, {}
    for row in rows:
        if row.get("role") not in ("FIT","DEV","CALIBRATION","EVAL_N","HISTORICAL_CHALLENGE") or type(row.get("label")) is not int or row["label"] not in (0,1):
            raise ValueError("ROLE_LABEL_SCHEMA")
        if not all(row.get(k) for k in ("sourceFamilyId","splitGroup","rights","sha256")):
            raise ValueError("REQUIRED_LINEAGE_MISSING")
        if row["role"]=="CALIBRATION" and (row["label"]!=0 or row["rootKey"]!="CSAFE"):
            raise ValueError("CALIBRATION_POPULATION")
        if row.get("finalSealedControl") or row.get("sealed"):
            raise ValueError("RESERVE_PROHIBITED")
        if row["sampleId"] in seen:
            raise ValueError("DUPLICATE_PARENT")
        seen[row["sampleId"]] = row
        for key in ("splitGroup", "promptGroup"):
            group = row.get(key)
            if not group:
                continue
            if group in groups and groups[group] != row["role"]:
                raise ValueError("SOURCE_GROUP_CROSSES_ROLES")
            groups[group] = row["role"]
        if row["sha256"] in hashes:
            raise ValueError("DUPLICATE_BYTES")
        hashes[row["sha256"]] = row["role"]
        if row["role"] in ("FIT", "DEV", "CALIBRATION") and not row["trainingAllowed"]:
            raise ValueError("TRAINING_OR_CALIBRATION_RIGHTS")
        if row["role"] in ("FIT","DEV","CALIBRATION") and (row["rootKey"],row["rights"]) not in (("CSAFE","CC_BY_4.0_WITH_ATTRIBUTION"),("DDB","CC0_1.0_CONSTRAINED")):
            raise ValueError("RIGHTS_RECEIPT_MISMATCH")
        if row["label"] and row["role"] in ("FIT", "DEV") and row["generatorFamily"] != "STABLE_DIFFUSION_1X_DIFFUSIONDB":
            raise ValueError("GENERATOR_HELDOUT_LEAKAGE")
        safe_path(row)


def main():
    if (OUT / "cohort-freeze.json").exists():
        raise RuntimeError("COHORT_ALREADY_FROZEN")
    e = read("research/wp007e/data-role-freeze.json")
    pool = [r for role in e["roles"].values() for r in role["records"]]
    cameras = {r["sampleId"]:r for r in pool if r["sourceRootKey"] == "CSAFE_WP006E_CACHE" and not r.get("finalSealedControl") and not r.get("sealed")}
    devices = sorted({r["cameraDeviceFamily"] for r in cameras.values()}, key=lambda x:digest(["WP007N_DEVICES",x]))
    device_roles = {d:role for ds,role in ((devices[:3],"FIT"),(devices[3:5],"DEV"),(devices[5:8],"CALIBRATION"),(devices[8:],"EVAL_N")) for d in ds}
    rows = []
    for role,n in (("FIT",12),("DEV",6),("CALIBRATION",8),("EVAL_N",12)):
        eligible = rank([r for r in cameras.values() if device_roles[r["cameraDeviceFamily"]] == role])
        selected = []
        for k in range(8):
            for device in [d for d in devices if device_roles[d] == role]:
                group = [r for r in eligible if r["cameraDeviceFamily"] == device]
                if k < len(group):
                    selected.append(group[k])
            if len(selected) >= n:
                break
        if len(selected) < n:
            raise ValueError("CAMERA_COUNT_UNAVAILABLE")
        for r in selected[:n]:
            rows.append(dict(sampleId=r["sampleId"],sourceFamilyId=r["sourceFamilyId"],splitGroup="device:"+r["cameraDeviceFamily"],physicalDevice=r["cameraDeviceFamily"],rootKey="CSAFE",relativePath=r["sourceRelativePath"],sha256=r["sourceSha256"],role=role,label=0,kind="PHOTO_CSAFE",generatorFamily=None,trainingAllowed=True,rights="CC_BY_4.0_WITH_ATTRIBUTION",programmeExposure="CONSUMED_E_AND_LATER",sceneIdentity="UNKNOWN_CROSS_DEVICE_SCENE_LINKAGE_NOT_PROVEN"))
    a = read("research/wp007a/ef3-synthetic-manifest.json")["records"]
    approved_ddb = {r["sampleId"]:r for r in pool if r["sourceRootKey"] == "WP007A_DIFFUSIONDB_CACHE" and not r.get("finalSealedControl") and not r.get("sealed")}
    ddb = rank([r for r in a if r["sampleId"] in approved_ddb and r["rights"]["trainingEligibility"] == "TRAINING_ALLOWED_WITH_CONSTRAINTS"])
    used_prompts=set()
    selected=[]
    for r in ddb:
        p=r["provenance"]["promptId"]
        if p not in used_prompts:
            selected.append(r);used_prompts.add(p)
        if len(selected)==18:
            break
    for i,r in enumerate(selected):
        rows.append(dict(sampleId=r["sampleId"],sourceFamilyId=r["sourceFamilyId"],splitGroup=r["sourceFamilyId"],promptGroup=r["provenance"]["promptId"],rootKey="DDB",relativePath="selected/"+r["sampleId"]+".png",sha256=r["file"]["sha256"],role="FIT" if i<12 else "DEV",label=1,kind="SYNTHETIC",generatorFamily="STABLE_DIFFUSION_1X_DIFFUSIONDB",trainingAllowed=True,rights="CC0_1.0_CONSTRAINED",programmeExposure="CONSUMED_A_E",sceneIdentity="PROMPT_HASH_GROUPED"))
    negatives=read("research/wp007i/negative-data-freeze.json")["records"]
    prior_hashes={r["sampleId"]:r["sha256"] for r in read("research/wp007j-r1/representation-cohort-freeze.json")["records"]}
    for kind,n in (("PHOTO_UNSPLASH",8),("PROCEDURAL_SUPPLEMENT",8)):
        eligible=[r for r in negatives if ("unsplash" in r.get("localRelativePath","").lower()) == (kind=="PHOTO_UNSPLASH")]
        for r in rank(eligible)[:n]:
            rows.append(dict(sampleId=r["sampleId"],sourceFamilyId=r["sourceFamilyId"],splitGroup=r["sourceFamilyId"],rootKey="I",relativePath=r["localRelativePath"],sha256=prior_hashes[r["sampleId"]],role="EVAL_N",label=0,kind=kind,generatorFamily=None,trainingAllowed=False,rights="EVALUATION_ONLY_IN_N",programmeExposure="CONSUMED_I_AND_LATER",sceneIdentity="UNKNOWN_PHOTOGRAPHER_OR_TEMPLATE_CLUSTER",originCaution="PROCEDURAL_NOT_REPRESENTATIVE_HUMAN_ART" if kind=="PROCEDURAL_SUPPLEMENT" else "PHOTOGRAPH_UNKNOWN_PROCESSING_NOT_NATIVE_CAMERA"))
    synthetics=read("research/wp007i/fresh-synthetic-freeze.json")["records"]
    for family in ("Seedream-4","imagen-4","SD-3.5-Large"):
        candidates=rank([r for r in synthetics if r["generatorFamily"].lower()==family.lower()])
        if len(candidates)<5:
            raise ValueError("GENERATOR_UNAVAILABLE:"+family)
        for r in candidates[:5]:
            prompt=Path(r["relativePath"]).stem
            rows.append(dict(sampleId=r["sampleId"],sourceFamilyId=r["sourceFamilyId"],splitGroup=r["sourceFamilyId"],promptGroup="T2I:"+prompt,rootKey="I",relativePath=r["localRelativePath"],sha256=r["lfsSha256"],role="HISTORICAL_CHALLENGE",label=1,kind="SYNTHETIC",generatorFamily=r["generatorFamily"],trainingAllowed=False,rights=r["rightsClass"],programmeExposure="CONSUMED_I_JR1_K_M",sceneIdentity="PROMPT_KEY_GROUPED_ACROSS_GENERATORS"))
    diagnostics=read("research/wp007m/diagnostic-cohort-freeze.json")["rows"]
    for r in rank([r for r in diagnostics if r["group"]=="CLOUDFLARE_FLUX1_CONSUMED"])[:5]:
        rows.append(dict(sampleId=r["sampleId"],sourceFamilyId=r["sampleId"],splitGroup=r["sampleId"],promptGroup="CF:"+r["sampleId"].split("PROMPT_")[-1],rootKey="FLUX1",relativePath=r["relativePath"],sha256=r["sha256"],role="HISTORICAL_CHALLENGE",label=1,kind="SYNTHETIC",generatorFamily="CLOUDFLARE_FLUX1_CONSUMED",trainingAllowed=False,rights=r["rights"],programmeExposure="CONSUMED_G_H_I_JR1_K_M",sceneIdentity="KNOWN_PROVIDER_PROMPT_ID"))
    screen=[r for r in rows if r["role"] in ("EVAL_N","HISTORICAL_CHALLENGE")]
    panel=[]
    for kind,n in (("PHOTO_CSAFE",2),("PHOTO_UNSPLASH",2),("PROCEDURAL_SUPPLEMENT",4)):
        panel += rank([r for r in screen if r["kind"]==kind])[:n]
    for family in sorted({r["generatorFamily"] for r in screen if r["label"]}):
        panel += rank([r for r in screen if r["generatorFamily"]==family])[:1]
    panel_ids={r["sampleId"] for r in panel}
    for r in rows:
        r["conditions"] = list(CONDITIONS) if r["role"]=="CALIBRATION" or r["sampleId"] in panel_ids else (["original","jpeg75"] if r in screen else ["original","jpeg95","jpeg75"])
        r["sealed"]=False
    validate_roles(rows)
    phashes={}; inventory=[]
    for r in rows:
        path=safe_path(r)
        if not path.is_file():
            raise RuntimeError("APPROVED_FILE_UNAVAILABLE:"+r["sampleId"])
        if file_hash(path)!=r["sha256"]:
            raise RuntimeError("SOURCE_HASH_MISMATCH:"+r["sampleId"])
        with Image.open(path) as image:
            r["sourceFormat"]=image.format
            rgb=ImageOps.exif_transpose(image).convert("RGB")
            r["dimensions"]=list(rgb.size)
            r["decodedRgbSha256"]=array_hash(np.asarray(rgb))
            low=np.asarray(rgb.convert("L").resize((32,32)),dtype=float)
            values=dctn(low,type=2,norm="ortho")[:8,:8].flatten()[1:]
            bits=values>np.median(values)
            phashes[r["sampleId"]]=bits
            r["nearDuplicateHash"]=hex(sum(int(v)<<k for k,v in enumerate(bits)))
        inventory.append({"sampleId":r["sampleId"],"bytes":path.stat().st_size})
    candidates=[]
    for i,a in enumerate(rows):
        for b in rows[i+1:]:
            distance=int(np.count_nonzero(phashes[a["sampleId"]]!=phashes[b["sampleId"]]))
            if distance<=6:
                candidates.append({"a":a["sampleId"],"b":b["sampleId"],"distance":distance,"crossRole":a["role"]!=b["role"]})
    if any(r["crossRole"] for r in candidates):
        save_json(OUT/"duplicate-admission-block.json",candidates)
        raise RuntimeError("POTENTIAL_NEAR_DUPLICATE_ROLE_LEAKAGE")
    freeze={"schemaVersion":"wp007n-cohort-v1","scoreBlind":True,"rows":rows,"counts":dict(Counter(r["role"] for r in rows)),"screenParents":len(screen),"fullMatrixScreenParents":len(panel_ids),"actualHumanDigitalWorks":0,"screenScope":"PHOTOGRAPH_VS_SYNTHETIC_SCREEN_ONLY_WITH_PROCEDURAL_SUPPLEMENT","physicalDeviceRoles":device_roles,"nearDuplicateCandidates":candidates,"nearDuplicateLimit":"Perceptual hash is not exhaustive scene deduplication. Cross-device scenes and unknown Unsplash photographer links remain uncertain; intervals are nominal parent intervals.","newProgrammeConfirmation":False,"sourceBytes":sum(r["bytes"] for r in inventory),"codeHash":file_hash(__file__),"manifestReferences":["research/wp007e/data-role-freeze.json","research/wp007a/ef3-synthetic-manifest.json","research/wp007i/negative-data-freeze.json","research/wp007i/fresh-synthetic-freeze.json","research/wp007m/diagnostic-cohort-freeze.json"]}
    freeze["freezeHash"]=digest(freeze)
    save_json(OUT/"cohort-freeze.json",freeze)
    print(json.dumps({k:freeze[k] for k in ("counts","screenParents","fullMatrixScreenParents","sourceBytes","freezeHash")}))


if __name__=="__main__":
    main()
