"""Freeze reproducibility metadata; never read dataset images or secrets."""
import importlib.metadata as md
import json
import platform
import subprocess
import time
from pathlib import Path
from wp007n_core import REPO,OUT,RUNTIME,DINO_CODE,file_hash,digest,save_json,resources


def main():
    execution=["wp007n_core.py","wp007n_freeze.py","wp007n_extract.py","wp007n_guards.py"]
    files={"scripts/authenticity/"+name:file_hash(REPO/"scripts/authenticity"/name) for name in execution}
    save_json(OUT/"execution-code-freeze.json",{"files":files,"signature":digest(files),"protocolUnchanged":True,"hardeningBeforeEvaluation":True})
    packages=[]
    for name in ("torch","torchvision","numpy","Pillow","scipy","scikit-learn","timm","einops","huggingface-hub","ftfy","regex"):
        d=md.distribution(name)
        licenses=[]
        for file in d.files or []:
            if "dist-info" in str(file) and any(v in str(file).lower() for v in ("license","notice","record")):
                path=d.locate_file(file)
                if path.is_file():licenses.append({"relative":str(file),"sha256":file_hash(path)})
        packages.append({"name":name,"version":d.version,"license":(d.metadata.get("License-Expression") or d.metadata.get("License") or "SEE_PINNED_LICENSE_FILES")[:500],"files":licenses})
    sources={str(p.relative_to(RUNTIME/"pe")):file_hash(p) for p in (RUNTIME/"pe").rglob("*.py")}
    state={"python":platform.python_version(),"platform":platform.platform(),"resources":resources(),"packages":packages,"DINOCodeCommit":subprocess.check_output(["git","-C",str(DINO_CODE),"rev-parse","HEAD"],text=True).strip(),"PECodeCommit":"3e352cca660658d4b5c90f42a7808b11469e4c66","PESourceFiles":sources,"modelHashes":json.loads((OUT/"checkpoint-freeze.json").read_text()),"rootLocations":"Environment-local approved Temp and dataset roots; private paths omitted","sourceDownloads":"Two public approved artifacts; no images sent to any service","workerCount":1,"torchThreads":2,"environmentScope":"N isolated dependency overlay then existing approved E site-packages; no full environment reinstallation","timeUnix":time.time()}
    state["environmentHash"]=digest({k:v for k,v in state.items() if k not in ("resources","timeUnix")})
    save_json(OUT/"runtime-freeze.json",state)


if __name__=="__main__":main()
