#!/usr/bin/env python3
"""Hash deterministic original-C++ RGBA/LOD output from stdin.
Optional first argument is the same oracle compiled with default FP contraction;
retain its exact sparse byte differences rather than hiding platform rounding.
"""
import hashlib,json,sys
cases=json.load(sys.stdin)
contracted=json.load(open(sys.argv[1])) if len(sys.argv)>1 else None
for index,case in enumerate(cases):
    raw=bytes.fromhex(case.pop('hex'))
    split=case['width']*case['height']*4
    case['dataHash']=hashlib.sha256(raw[:split]).hexdigest()
    case['lodHash']=hashlib.sha256(raw[split:]).hexdigest()
    if contracted:
        native=bytes.fromhex(contracted[index]['hex'])
        case['contractedHash']=hashlib.sha256(native).hexdigest()
        case['contractedDifferences']=[[i,b]for i,(a,b)in enumerate(zip(raw,native))if a!=b]
json.dump(cases,sys.stdout,indent=2)
print()
