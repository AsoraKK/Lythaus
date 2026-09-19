"""Read-only Windows process telemetry; no model loading or policy changes."""
import ctypes
import json
import os
import sys
import tempfile
import time
from pathlib import Path


class Counters(ctypes.Structure):
    _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage')]


def main(arm):
    runtime=Path(tempfile.gettempdir())/'lythaus-wp007n-runtime'
    out=Path(__file__).resolve().parents[2]/'research/wp007n'/('process-memory-'+arm+'.json')
    kernel=ctypes.windll.kernel32;kernel.OpenProcess.restype=ctypes.c_void_p;kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.POINTER(Counters),ctypes.c_ulong]
    rows=json.loads(out.read_text()).get('observations',[]) if out.exists() else []
    start=time.time()
    active={'pid':int(sys.argv[2])} if len(sys.argv)>2 else json.loads((runtime/('budget-'+arm+'.json')).read_text()).get('active')
    if not active:return
    while time.time()-start<2700:
        handle=kernel.OpenProcess(0x1000|0x10,False,active['pid'])
        if not handle:break
        counters=Counters();counters.cb=ctypes.sizeof(counters)
        ok=ctypes.windll.psapi.GetProcessMemoryInfo(handle,ctypes.byref(counters),counters.cb)
        kernel.CloseHandle(handle)
        if ok:rows.append({'timeUnix':time.time(),'workingSetBytes':counters.WorkingSetSize,'processPeakWorkingSetBytes':counters.PeakWorkingSetSize,'processPeakCommitBytes':counters.PeakPagefileUsage})
        value={'arm':arm,'observations':rows,'scope':'OS process high-water marks include initialization; observer started after process launch; system-free guard separately recorded','peakWorkingSetBytes':max([r['processPeakWorkingSetBytes'] for r in rows],default=None),'peakCommitBytes':max([r['processPeakCommitBytes'] for r in rows],default=None)}
        tmp=out.with_suffix('.partial');tmp.write_text(json.dumps(value,indent=2)+'\n');os.replace(tmp,out)
        time.sleep(10)
    print(json.dumps({'arm':arm,'observations':len(rows)}))


if __name__=='__main__':main(sys.argv[1])
