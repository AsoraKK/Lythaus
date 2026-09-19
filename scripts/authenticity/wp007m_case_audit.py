"""Independent sensitivity check of every heldout candidate-high case."""
import argparse
import json
import ctypes
from ctypes import wintypes
from pathlib import Path
import numpy as np
from PIL import Image
from wp007m_probe import OUT,ROOT,load,save,filehash,joined,allowed,transform
from wp007m_crosscheck import independent


def main():
    p=argparse.ArgumentParser();p.add_argument("--media",required=True);p.add_argument("--bulk",required=True);p.add_argument("--sharp",required=True);args=p.parse_args()
    rule=load(OUT/"decision-freeze.json")["choices"]["features"]
    rows=joined(args.bulk,"HELDOUT");cases=[]
    for r in rows:
        v=r["features"]["dependencyDecay"]
        if v is None or abs(v)<=rule["threshold"]:continue
        path=allowed(args.media,r["relativePath"],r["sourceFamilyId"])
        with Image.open(path) as im:
            x=round((im.width-256)/2);y=round((im.height-256)/2)
            rgb=np.array(im.crop((x,y,x+256,y+256)).convert("RGB"))
        arr,facts=transform(rgb,r["condition"],args.sharp)
        if facts["pixelHash"]!=r["codec"]["pixelHash"]:raise ValueError("PIXEL_MISMATCH")
        a,b=independent(arr);new=abs(a-b) if a is not None and b is not None else None
        cases.append({"sampleId":r["sampleId"],"condition":r["condition"],"kind":r["kind"],"generatorFamily":r["generatorFamily"],"main":abs(v),"independent":new,"mainHigh":True,"independentHigh":new is not None and new>rule["threshold"]})
    old={r["sampleId"]:r for r in load(ROOT/"research/wp007i/safe-original-scores.json")["records"]}
    supplement={(r["sampleId"],r["condition"]):r for r in map(json.loads,(Path(args.bulk)/"safe-enrichment.jsonl").read_text().splitlines())}
    allrows=joined(args.bulk,"DISCOVERY")+rows
    deltas=[];decision_changes=0
    for r in allrows:
        if r["condition"]=="ORIGINAL" and r["sampleId"] in old:
            s=r["safeScore"] if r["safeScore"] is not None else supplement[(r["sampleId"],r["condition"])]["safeScore"]
            deltas.append(abs(s-old[r["sampleId"]]["rawScore"]))
            decision_changes+=int((s>=.5864923000335693)!=(old[r["sampleId"]]["rawScore"]>=.5864923000335693))
    class PMC(ctypes.Structure):
        _fields_=[("cb",wintypes.DWORD),("faults",wintypes.DWORD)]+[(n,ctypes.c_size_t) for n in ["peakWorkingSet","workingSet","peakPaged","paged","peakNonPaged","nonPaged","pagefile","peakPagefile"]]
    pm=PMC();pm.cb=ctypes.sizeof(pm)
    ctypes.windll.kernel32.GetCurrentProcess.restype=wintypes.HANDLE
    getmem=ctypes.windll.psapi.GetProcessMemoryInfo;getmem.argtypes=[wintypes.HANDLE,ctypes.POINTER(PMC),wintypes.DWORD]
    if not getmem(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(pm),pm.cb):raise RuntimeError("PROCESS_MEMORY_MEASUREMENT_FAILED")
    save(OUT/"positive-case-independent-check.json",{"cases":cases,"decisionDisagreements":sum(x["mainHigh"]!=x["independentHigh"] for x in cases),"safeHistoricalComparison":{"n":len(deltas),"maxAbsoluteScoreDelta":max(deltas),"thresholdDecisionChanges":decision_changes},"processPeakWorkingSetBytes":pm.peakWorkingSet,"memoryScope":"Six real case reproductions including independent PyWavelets/scipy and baseline imports; excludes SAFE torch process and not a full-corpus maximum","codeHash":filehash(__file__),"thresholdUnchanged":True,"hypothesisAdjusted":False})
    print({"cases":len(cases),"disagreements":sum(not x["independentHigh"] for x in cases),"safeN":len(deltas),"safeMaxDelta":max(deltas)})


if __name__=="__main__":main()
