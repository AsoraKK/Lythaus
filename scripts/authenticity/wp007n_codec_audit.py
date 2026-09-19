"""Engineering-only codec equivalence; wrapper names are not independence."""
import io
import json
import hashlib
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image,features
from wp007n_analysis import OUT,REPO,save,sha


def main():
    rows=[]
    for seed in (91001,91002,91003):
        array=np.random.default_rng(seed).integers(0,256,(256,256,3),dtype=np.uint8)
        if seed==91002:array=np.asarray(Image.fromarray(array).resize((24,24)).resize((256,256)))
        if seed==91003:array[:]=127
        buf=io.BytesIO();Image.fromarray(array).save(buf,format='JPEG',quality=95,subsampling=2,optimize=False,progressive=False)
        sharp=subprocess.run(['node','scripts/authenticity/wp007m_sharp.cjs',str(REPO/'node_modules/sharp')],input=array.tobytes(),capture_output=True,check=True).stdout
        p=Image.open(io.BytesIO(buf.getvalue()));s=Image.open(io.BytesIO(sharp))
        pa=np.asarray(p.convert('RGB'));sa=np.asarray(s.convert('RGB'))
        rows.append({'fixtureSeed':seed,'engineeringOnly':True,'PillowByteHash':hashlib.sha256(buf.getvalue()).hexdigest(),'SharpByteHash':hashlib.sha256(sharp).hexdigest(),'PillowDecodedHash':hashlib.sha256(pa.tobytes()).hexdigest(),'SharpDecodedHash':hashlib.sha256(sa.tobytes()).hexdigest(),'decodedEqual':bool(np.array_equal(pa,sa)),'maxPixelDifference':int(np.max(np.abs(pa.astype(int)-sa.astype(int)))),'DQTEqual':p.quantization==s.quantization,'PillowDQT':p.quantization,'SharpDQT':s.quantization})
    versions=json.loads(subprocess.check_output(['node','-e','process.stdout.write(JSON.stringify(require("sharp").versions))'],cwd=REPO,text=True))
    save(OUT/'codec-equivalence-audit.json',{'fixtures':rows,'PillowJpegVersion':features.version_codec('jpg'),'PillowLibjpegTurbo':features.check_feature('libjpeg_turbo'),'PillowTurboVersion':features.version_feature('libjpeg_turbo'),'SharpVersions':versions,'interpretation':'Engineering equivalence only. Both paths use libjpeg-turbo lineage; no independent held-out codec-family experiment. Pixel differences, if any, do not establish backend independence. Scientific screen uses one declared Pillow path.','codeHash':sha(__file__)})


if __name__=='__main__':main()
