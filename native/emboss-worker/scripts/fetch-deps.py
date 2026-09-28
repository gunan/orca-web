import concurrent.futures,hashlib,json,pathlib,urllib.request,zipfile,tarfile,shutil,sys
ROOT=pathlib.Path(sys.argv[1]).resolve();spec=pathlib.Path(__file__).resolve().parent.parent/'dependency-manifest.json'
recipes=[r for r in json.loads(spec.read_text()) if r['name']!='cmake']
(ROOT/'downloads').mkdir(parents=True,exist_ok=True);(ROOT/'dependencies').mkdir(exist_ok=True)
def fetch(item):
 name,url,expected=item['name'],item['url'],item['sha256'];file=ROOT/'downloads'/url.rsplit('/',1)[1]
 if not file.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'OrcaWeb-native-worker-build'})
  with urllib.request.urlopen(request,timeout=60) as response,file.open('wb') as output:shutil.copyfileobj(response,output)
 with file.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
 if actual!=expected:raise RuntimeError(f'{name}: hash mismatch {actual}')
 target=ROOT/'dependencies'/name
 if not target.exists():
  target.mkdir()
  if file.suffix=='.zip':
   with zipfile.ZipFile(file) as archive:archive.extractall(target)
  else:
   with tarfile.open(file) as archive:archive.extractall(target,filter='data')
 print(name,'SHA256 verified',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(fetch,recipes))
