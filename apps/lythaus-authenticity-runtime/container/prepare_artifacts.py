"""Build-time artifact verification; never downloads a checkpoint."""
import hashlib
import json
from pathlib import Path
import shutil
from urllib.request import urlopen

COMMIT = "4e998724651b227def64f5be0cd60c0aa1552c35"
HASHES = {"models/resnet.py": "57eb62f43283daffc1828bfa8b01a783c3f0b14e11cda09994fd7c22a531f3ac",
          "LICENSE": "1eb85fc97224598dad1852b5d6483bbcf0aa8608790dcc657a5a2a761ae9c8c6"}
approval = json.loads(Path('/run/secrets/safe_rights').read_text())
if approval.get('checkpointSha256') != 'b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e' or approval.get('restrictedBetaHosting') is not True or not approval.get('decisionOwner') or not approval.get('evidenceReference'):
    raise RuntimeError('BLOCKED_RIGHTS')
root = Path('/opt/safe')
for name, expected in HASHES.items():
    with urlopen(f'https://raw.githubusercontent.com/Ouxiang-Li/SAFE/{COMMIT}/{name}', timeout=30) as response:
        data = response.read(100000)
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('SOURCE_CHECKSUM_MISMATCH')
    target = root / name
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
checkpoint = Path('/run/secrets/safe_checkpoint')
if checkpoint.stat().st_size != 5840638 or hashlib.sha256(checkpoint.read_bytes()).hexdigest() != approval['checkpointSha256']:
    raise RuntimeError('CHECKPOINT_CHECKSUM_MISMATCH')
shutil.copyfile(checkpoint,root/'checkpoint.pth')
