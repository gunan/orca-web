#!/usr/bin/env python3
"""Rebuild the brim fixture with unchanged pinned Orca Clipper source.
Requires a C++17 compiler and HTTPS access to the public pinned repository.
Only explicit execution fetches source; normal tests read the committed JSON.
"""
import hashlib,json,pathlib,subprocess,tempfile,urllib.request
repo=pathlib.Path(__file__).resolve().parent.parent
fixtures=repo/'tests/fixtures'
manifest=json.loads((fixtures/'brim-ear-native-source.json').read_text())
with tempfile.TemporaryDirectory(prefix='orca-brim-reference-') as temp:
    root=pathlib.Path(temp)
    (root/'clipper').mkdir()
    for source,sha in manifest['files'].items():
        data=urllib.request.urlopen('https://raw.githubusercontent.com/SoftFever/OrcaSlicer/'+manifest['commit']+'/'+source).read()
        if hashlib.sha256(data).hexdigest()!=sha:raise ValueError('Pinned source digest mismatch: '+source)
        (root/'clipper'/pathlib.Path(source).name).write_bytes(data)
    subprocess.run(['clang++','-std=c++17','-O2','-ffp-contract=off','-I'+str(root),'-I'+str(fixtures/'brim-ear-native-shims'),str(fixtures/'brim-ear-reference.cpp'),str(root/'clipper/clipper.cpp'),'-o',str(root/'reference')],check=True)
    output=subprocess.check_output([str(root/'reference')])
    json.loads(output)
    (fixtures/'brim-ear-reference.json').write_bytes(output)
