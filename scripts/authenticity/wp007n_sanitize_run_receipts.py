"""Keep raw runtime diagnostics external; publish path-sanitized error receipts."""
from wp007n_analysis import OUT,RUNTIME,read,save


def sanitize(value):
    if isinstance(value,str):
        return value.replace(str(RUNTIME).replace('\\','\\\\'),'external/wp007n').replace(str(RUNTIME),'external/wp007n').replace(str(RUNTIME).replace('\\','/'),'external/wp007n')
    if isinstance(value,list):return [sanitize(x) for x in value]
    if isinstance(value,dict):return {k:sanitize(v) for k,v in value.items()}
    return value


if __name__=='__main__':
    for name in ('run-A.json','run-B.json','runtime-benchmark.json'):
        path=OUT/name
        if path.exists():save(path,sanitize(read(path)))
    print('SANITIZED_PUBLISHED_RUNTIME_ERRORS_RAW_LEDGERS_RETAINED_EXTERNALLY')
