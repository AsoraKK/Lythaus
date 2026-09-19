"""Lean SAFE-only continuation; exact decoded pixels must match feature run."""
import argparse
import ctypes
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
from PIL import Image
import torch

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"research/wp007m"
SAFE_HASH="b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())


def memory():
    class M(ctypes.Structure):
        _fields_=[("length",ctypes.c_ulong),("load",ctypes.c_ulong)]+[(str(i),ctypes.c_ulonglong) for i in range(7)]
    m=M();m.length=ctypes.sizeof(m)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):raise RuntimeError("NO_TELEMETRY")
    return getattr(m,"1")


def main():
    p=argparse.ArgumentParser();p.add_argument("--media",required=True);p.add_argument("--bulk",required=True);p.add_argument("--safe",required=True);p.add_argument("--sharp",required=True);args=p.parse_args()
    bulk=Path(args.bulk);src=bulk/"heldout-rows.jsonl";dest=bulk/"safe-enrichment.jsonl"
    co=read(OUT/"cohort-freeze.json");meta={r["sampleId"]:r for r in co["rows"] if r["role"]=="HELDOUT"}
    rows=[json.loads(s) for s in src.read_text().splitlines()]
    existing=[json.loads(s) for s in dest.read_text().splitlines()] if dest.exists() else []
    done={(r["sampleId"],r["condition"]) for r in existing}
    checkpoint=Path(args.safe)/"checkpoint/checkpoint-best.pth"
    if sha(checkpoint)!=SAFE_HASH:raise RuntimeError("SAFE_HASH_MISMATCH")
    sys.path.insert(0,args.safe)
    from models.resnet import resnet50
    torch.set_num_threads(2);torch.set_num_interop_threads(1);torch.use_deterministic_algorithms(True)
    model=resnet50(num_classes=2);state=torch.load(checkpoint,map_location="cpu",weights_only=False)
    model.load_state_dict(state.get("model",state),strict=True);model.eval()
    for param in model.parameters():param.requires_grad_(False)
    start=time.time();states=[];new=0
    for sid,m in meta.items():
        todo=[r for r in rows if r["sampleId"]==sid and r["safeScore"] is None and (sid,r["condition"]) not in done]
        if not todo:continue
        available=memory();states.append(available)
        if available<4*1024**3:raise RuntimeError("RAM_SAFETY_STOP_RESUMABLE")
        root=Path(args.media).resolve();path=(root/m["relativePath"]).resolve()
        if not path.is_relative_to(root) or any(s in str(path).lower() for s in ["flux2","flux.2","flux_2","reserve","sealed","future"]):raise RuntimeError("PATH_DENIED")
        if sha(path)!=m["sha256"]:raise RuntimeError("SOURCE_CHANGED")
        with Image.open(path) as im:
            x=round((im.width-256)/2);y=round((im.height-256)/2)
            rgb=np.array(im.crop((x,y,x+256,y+256)).convert("RGB"))
        for row in todo:
            c=row["condition"];im=Image.fromarray(rgb)
            if c.startswith("RESIZE75"):im=im.resize((192,192),Image.Resampling.BICUBIC).resize((256,256),Image.Resampling.BICUBIC)
            buf=io.BytesIO()
            if "JPEG" in c:im.save(buf,format="JPEG",quality=int(c[-2:]),subsampling=2)
            elif c=="SHARP95":
                r=subprocess.run(["node",str(ROOT/"scripts/authenticity/wp007m_sharp.cjs"),args.sharp],input=rgb.tobytes(),capture_output=True,check=True);buf=io.BytesIO(r.stdout)
            else:im.save(buf,format="PNG")
            with Image.open(io.BytesIO(buf.getvalue())) as dec:arr=np.array(dec.convert("RGB"))
            pixel=hashlib.sha256(arr.tobytes()).hexdigest()
            if pixel!=row["codec"]["pixelHash"]:raise RuntimeError("SAFE_FEATURE_PIXEL_MISMATCH")
            t=time.perf_counter()
            with torch.inference_mode():score=float(torch.softmax(model(torch.from_numpy(arr.copy()).permute(2,0,1).float().div(255).unsqueeze(0)),dim=1)[0,1])
            out={"sampleId":sid,"condition":c,"safeScore":score,"safeMs":(time.perf_counter()-t)*1000,"pixelHash":pixel,"sourceSha256":m["sha256"],"safeHash":SAFE_HASH,"cohortHash":co["freezeHash"],"codeHash":sha(__file__)}
            with dest.open("a") as f:f.write(json.dumps(out)+"\n")
            new+=1
        print("SAFE supplemental rows="+str(len(done)+new),flush=True)
    final=[json.loads(s) for s in dest.read_text().splitlines()]
    report={"inputRowsHash":sha(src),"outputRowsHash":sha(dest),"codeHash":sha(__file__),"safeHash":SAFE_HASH,"cohortHash":co["freezeHash"],"rows":len(final),"pixelHashesMatched":len(final),"startUnix":start,"endUnix":time.time(),"minimumObservedAvailableRam":min(states) if states else None,"command":"python scripts/authenticity/wp007m_safe_only.py --media <WP007I_MEDIA> --bulk <EXTERNAL_WP007M> --safe <PINNED_SAFE> --sharp <EXISTING_SHARP>","environment":"Same frozen runtime; Torch2 threads; no SciPy/sklearn imports; no weights/preprocessing/threshold changes","flux2Access":0}
    (OUT/"safe-enrichment-run.json").write_text(json.dumps(report,indent=2)+"\n")


if __name__=="__main__":main()
