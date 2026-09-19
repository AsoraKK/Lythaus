"""Move generated tiny model state to external artifacts; retain audit manifests."""
from wp007n_analysis import OUT,RUNTIME,read,save,head_manifest,model_digest


for name in ("A0","A0_PERMUTED","B0","B0_PERMUTED","B1","B1_PERMUTED","NUISANCE","NUISANCE_PERMUTED"):
    source=OUT/(name+"-head.json")
    head=read(source)
    if "coefficient" not in head:
        continue
    if model_digest(head)!=head["headHash"]:
        raise ValueError("HEAD_CHANGED")
    save(RUNTIME/"heads"/source.name,head)
    save(source,head_manifest(name,head))
