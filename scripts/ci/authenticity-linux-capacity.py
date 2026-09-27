"""Sanitized code-only runner capacity; never detector sizing."""
import json
import os
from pathlib import Path
import shutil
import subprocess

memory = {}
for line in Path('/proc/meminfo').read_text().splitlines():
    name, value = line.split(':', 1)
    if name in ('MemTotal', 'MemAvailable'):
        memory[name] = int(value.strip().split()[0]) * 1024
print(json.dumps({
    'schemaVersion': 'lythaus-beta-linux-capacity-v1',
    'sourceSha': os.environ['GITHUB_SHA'],
    'runner': 'GitHub-hosted ubuntu-24.04 standard public runner',
    'cpuCount': os.cpu_count(), 'memoryBytes': memory,
    'workspaceDiskFreeBytes': shutil.disk_usage('.').free,
    'dockerVersion': subprocess.check_output(['docker', 'version', '--format', '{{.Server.Version}}'], text=True).strip(),
    'privateMediaLoaded': False, 'checkpointLoaded': False,
    'realSafeCalls': 0, 'realAdviserCalls': 0,
    'detectorSizing': False,
}))
