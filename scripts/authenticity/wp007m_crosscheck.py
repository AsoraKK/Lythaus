"""Independent real-media recomputation using PyWavelets and scipy spearmanr."""
import argparse
import hashlib
import time
from pathlib import Path
import numpy as np
import pywt
from PIL import Image
from scipy.stats import spearmanr
from wp007m_probe import OUT,load,save,joined,allowed,filehash,measure,digest
from wp007k_codec_specialist import measure as old_baseline
from wp007jr1_phase_dct_real import measure as light_baseline


def independent(rgb):
    a=np.dot(rgb.astype(float)/255,[.299,.587,.114]);bands=[]
    for i in range(3):
        a,(h,v,d)=pywt.dwt2(a,"haar",mode="periodization");bands.append([v,h,d])
    out=[]
    for fine,coarse in zip(bands,bands[1:]):
        rs=[]
        for f,c in zip(fine,coarse):
            p=np.repeat(np.repeat(abs(c),2,0),2,1)
            r=spearmanr(abs(f).ravel(),p.ravel()).statistic
            if np.isfinite(r):rs.append(r)
        out.append(float(np.mean(rs)) if rs else None)
    return out


def main():
    p=argparse.ArgumentParser();p.add_argument("--media",required=True);p.add_argument("--bulk",required=True);args=p.parse_args()
    rows=[r for r in joined(args.bulk,"DISCOVERY") if r["condition"]=="ORIGINAL"]
    chosen=[]
    for kind in ["PHOTO","HARD","SYNTHETIC"]:chosen += [r for r in rows if r["kind"]==kind][:8]
    results=[]
    for r in chosen:
        path=allowed(args.media,r["relativePath"],r["sourceFamilyId"])
        with Image.open(path) as im:
            x=round((im.width-256)/2);y=round((im.height-256)/2)
            first=np.array(im.crop((x,y,x+256,y+256)).convert("RGB"))
            second=np.array(im.convert("RGB").crop((x,y,x+256,y+256)))
        if not np.array_equal(first,second):raise ValueError("PREPROCESS_PIXEL_CHANGE")
        if hashlib.sha256(first.tobytes()).hexdigest()!=r["codec"]["pixelHash"]:raise ValueError("RECORDED_PIXEL_MISMATCH")
        feat,null,base=measure(first);ref=independent(first)
        gray=np.dot(first/255,[.299,.587,.114]);a,b=old_baseline(gray),light_baseline(gray)
        bdelta=max(abs(a[k]-b[k]) for k in a)
        if any((feat[k] is None)!=(r["features"][k] is None) for k in feat):raise ValueError("MISSINGNESS_CHANGED")
        fdelta=max([abs(feat[k]-r["features"][k]) for k in feat if feat[k] is not None] or [0])
        delta=max([abs(ref[i]-feat[k]) for i,k in enumerate(["dependency12","dependency23"]) if ref[i] is not None] or [0])
        results.append({"sampleId":r["sampleId"],"kind":r["kind"],"pixelEqual":True,"baselineDelta":bdelta,"repeatFeatureDelta":fdelta,"pywaveletsScipyDelta":delta})
    save(OUT/"real-media-crosscheck.json",{"rows":results,"n":len(results),"maxBaselineDelta":max(r["baselineDelta"] for r in results),"maxRepeatFeatureDelta":max(r["repeatFeatureDelta"] for r in results),"maxIndependentDelta":max(r["pywaveletsScipyDelta"] for r in results),"note":"PyWavelets floating operation order can perturb near-tie ranks; report discrepancy, not fabricated exact agreement.","codeHash":filehash(__file__),"measurementCodeHash":filehash(Path(__file__).with_name("wp007m_probe.py")),"inputRowsHash":filehash(Path(args.bulk)/"discovery-rows.jsonl"),"completedUnix":time.time()})
    print(digest(results))


if __name__=="__main__":main()
