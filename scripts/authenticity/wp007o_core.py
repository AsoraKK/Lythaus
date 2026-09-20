"""Frozen B0 calibration-transfer primitives; no fitting or public verdict."""
import ctypes
import json
import math
import msvcrt
import os
import tempfile
import time
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps
from wp007n_core import REPO, RUNTIME as N_RUNTIME, array_hash, canonical, digest, file_hash, save_json, guard, preprocessing_contract
from wp007n_analysis import infer, fixed_metrics, wilson
from wp007n_freeze import ROOTS, safe_path

RUNTIME=Path(tempfile.gettempdir())/'lythaus-wp007o-methodology-runtime'
OUT=RUNTIME/'evidence'
PUBLIC=REPO/'research/wp007o'
PARENT='6ffef36b45b7d2c16a26758e3e5618b10ac45a6d'
N_HEAD='86c8cb25af6485c1be84b258793c4d179de95a3f'
HEAD_HASH='898ad9cb29da6ecba5081ed5c8db941d6a0fa59f82d6dc1660fcf5e3d0a92713'
HEAD_FILE_HASH='bb3a6edf032431b86a5888ea684052ba46a97b6444f4951b2714b4c3d493bb58'
MODEL_HASH='0a5c220aa083488e0fc9221f766dced8a576b7074662d9b9da923da1e8844fce'
CONDITIONS=('original','jpeg95','jpeg75','resize75','resize75_jpeg95')
ROLES=('CALIBRATION_NEGATIVES','EVAL_NEGATIVES','EVAL_SYNTHETICS','HISTORICAL_DIAGNOSTIC')


def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sealed(path):
    value=read(path);bare=dict(value);expected=bare.pop('freezeHash')
    if digest(bare)!=expected:raise ValueError('FREEZE_CHANGED:'+Path(path).name)
    return value


def freeze(path,value):
    if Path(path).exists():raise ValueError('FROZEN_ARTIFACT_EXISTS:'+Path(path).name)
    value=dict(value);value['freezeHash']=digest(value);save_json(path,value);return value


def candidate():
    if file_hash(N_RUNTIME/'heads/B0-head.json')!=HEAD_FILE_HASH:raise ValueError('B0_HEAD_BYTES_CHANGED')
    head=read(N_RUNTIME/'heads/B0-head.json')
    if head['headHash']!=HEAD_HASH or head['checkpointHash']!=MODEL_HASH or head['C']!=.01:raise ValueError('B0_IDENTITY_CHANGED')
    return head,None


def validate_rows(rows):
    ids=set();hashes=set();groups={};decoded={}
    for r in rows:
        if r.get('role') not in ROLES or type(r.get('label')) is not int or r['label'] not in (0,1):raise ValueError('ROLE_OR_LABEL')
        if r['sampleId'] in ids or r['sha256'] in hashes:raise ValueError('DUPLICATE_PARENT')
        ids.add(r['sampleId']);hashes.add(r['sha256'])
        safe_path(r)
        if r.get('sealed') or r.get('finalSealedControl'):raise ValueError('RESERVE_PROHIBITED')
        if not r.get('rights',{}).get('evaluationAllowed'):raise ValueError('EVALUATION_RIGHTS')
        if not r.get('splitGroups') or r.get('rights',{}).get('headFittingAllowed') is not False:raise ValueError('LINEAGE_OR_FITTING_BOUNDARY')
        if r['role']=='CALIBRATION_NEGATIVES' and (r['label']!=0 or not r['rights'].get('calibrationAllowed')):raise ValueError('CALIBRATION_RIGHTS_OR_LABEL')
        if r['role']=='EVAL_NEGATIVES' and r['label']!=0:raise ValueError('NEGATIVE_LABEL')
        if r['role']=='EVAL_SYNTHETICS' and r['label']!=1:raise ValueError('SYNTHETIC_LABEL')
        if r['role']!='HISTORICAL_DIAGNOSTIC':
            for g in r['splitGroups']:
                if g in groups and groups[g]!=r['role']:raise ValueError('GROUP_CROSSES_ROLES')
                groups[g]=r['role']
            rgb=r.get('decodedRgbSha256')
            if rgb and rgb in decoded:raise ValueError('DUPLICATE_DECODED_PARENT')
            if rgb:decoded[rgb]=r['role']


def signature():
    files=['wp007o_core.py','wp007o_run.py','wp007o_results.py']
    return {name:file_hash(REPO/'scripts/authenticity'/name) for name in files}


def admission(require_threshold=False):
    co=sealed(OUT/'cohort-freeze.json');p=sealed(OUT/'protocol.json');c=sealed(OUT/'candidate-freeze.json')
    if p['cohortHash']!=co['freezeHash'] or p['candidateHash']!=c['freezeHash'] or p['codeHashes']!=signature():raise ValueError('EXECUTION_FREEZE_CHANGED')
    validate_rows(co['rows']);candidate()
    if c['preprocessing']!=preprocessing_contract('B'):raise ValueError('PREPROCESSING_CHANGED')
    if require_threshold:
        th=sealed(OUT/'threshold-freeze.json')
        if th['cohortHash']!=co['freezeHash'] or th['protocolHash']!=p['freezeHash'] or th['headHash']!=HEAD_HASH:raise ValueError('THRESHOLD_IDENTITY')
    return co,p,c


def decode(row):
    guard();path=safe_path(row)
    if file_hash(path)!=row['sha256']:raise ValueError('SOURCE_BYTES_CHANGED:'+row['sampleId'])
    with Image.open(path) as im:
        if im.width*im.height>50000000:raise ValueError('SOURCE_PIXEL_BUDGET')
        rgb=ImageOps.exif_transpose(im).convert('RGB')
    if array_hash(np.asarray(rgb))!=row['decodedRgbSha256']:raise ValueError('DECODE_CHANGED:'+row['sampleId'])
    return rgb


def threshold_from(rows,epsilon):
    if not math.isfinite(epsilon) or epsilon<=0:raise ValueError('EPSILON')
    if not rows or any(r['role']!='CALIBRATION_NEGATIVES' or r['label']!=0 for r in rows):raise ValueError('CALIBRATION_ONLY')
    by={}
    for r in rows:
        score=r['score']
        if score is None or not math.isfinite(score) or not 0<=score<=1:raise ValueError('CALIBRATION_MISSING')
        by.setdefault(r['sampleId'],{})
        if r['condition'] in by[r['sampleId']]:raise ValueError('DUPLICATE_CONDITION')
        by[r['sampleId']][r['condition']]=score
    if any(set(v)!=set(CONDITIONS) for v in by.values()):raise ValueError('INCOMPLETE_CALIBRATION')
    worst={k:max(v.values()) for k,v in by.items()};maximum=max(worst.values())
    threshold=maximum+epsilon
    if not math.isfinite(threshold) or threshold<=maximum:raise ValueError('EPSILON_DOES_NOT_INCREASE_THRESHOLD')
    return threshold,worst


def memory_process():
    class Counters(ctypes.Structure):
        _fields_=[('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong)]+[(n,ctypes.c_size_t) for n in ('PeakWorkingSetSize','WorkingSetSize','QuotaPeakPagedPoolUsage','QuotaPagedPoolUsage','QuotaPeakNonPagedPoolUsage','QuotaNonPagedPoolUsage','PagefileUsage','PeakPagefileUsage','PrivateUsage')]
    c=Counters();c.cb=ctypes.sizeof(c)
    ctypes.windll.kernel32.GetCurrentProcess.restype=ctypes.c_void_p
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulong]
    if not ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(c),c.cb):raise RuntimeError('PROCESS_TELEMETRY')
    return {'peakWorkingSetBytes':c.PeakWorkingSetSize,'peakCommitBytes':c.PeakPagefileUsage,'privateBytes':c.PrivateUsage}


class Budget:
    def __init__(self,arm,limits):
        RUNTIME.mkdir(exist_ok=True);self.path=RUNTIME/('budget-'+arm+'.json');self.lock=open(RUNTIME/('budget-'+arm+'.lock'),'a+b');self.lock.seek(0)
        try:msvcrt.locking(self.lock.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:self.lock.close();raise RuntimeError('EXTRACTION_LOCKED')
        self.data=read(self.path) if self.path.exists() else {'forwards':0,'seconds':0.,'runs':[]}
        if self.data.get('active'):
            a=self.data.pop('active');self.data['seconds']=max(self.data['seconds'],a['baseSeconds']+time.time()-a['start'])
            self.data.setdefault('interruptionCharges',[]).append({'elapsedIncludingUnknownIdle':self.data['seconds'],'forwardReservationsRetained':self.data['forwards']})
        self.start=time.time();self.base=self.data['seconds'];self.initial=self.data['forwards'];self.limits=limits;self.arm=arm
        if self.base>=limits['seconds'] or self.initial>=limits['forwards']:raise RuntimeError('BUDGET_EXHAUSTED')
        self.data['active']={'start':self.start,'baseSeconds':self.base,'pid':os.getpid()};self.persist()

    def persist(self):
        self.data['seconds']=self.base+time.time()-self.start;save_json(self.path,self.data)

    def before(self):
        guard()
        if self.base+time.time()-self.start+30>self.limits['seconds'] or self.data['forwards']>=self.limits['forwards']:raise RuntimeError('BUDGET_REACHED_RESUMABLE')
        self.data['forwards']+=1;self.persist()

    def finish(self,record):
        self.persist();record.update(seconds=time.time()-self.start,chargedForwards=self.data['forwards']-self.initial)
        self.data['runs'].append(record);self.data.pop('active');save_json(self.path,self.data);save_json(OUT/('run-'+self.arm+'.json'),self.data)
        self.lock.seek(0);msvcrt.locking(self.lock.fileno(),msvcrt.LK_UNLCK,1);self.lock.close()
