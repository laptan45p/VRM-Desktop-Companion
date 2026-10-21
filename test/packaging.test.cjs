const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('all release archives include both TTS wrappers and their helper in the runnable root',()=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tts-packaging-')),python=process.platform==='win32'?'python':'python3';
 try{
  const runtime=path.join(temp,'runtime'),output=path.join(temp,'out');fs.mkdirSync(runtime);fs.writeFileSync(path.join(runtime,'VRM-Desktop-Companion.exe'),'packaging fixture only');
  execFileSync(python,[path.join(root,'scripts/package_release.py'),'--runtime',runtime,'--output',output],{cwd:root,stdio:'pipe'});
  const report=execFileSync(python,['-c',`import pathlib,sys,zipfile,json
report=[]
for file in pathlib.Path(sys.argv[1]).glob('*.zip'):
 with zipfile.ZipFile(file) as z:
  prefix='' if file.name.endswith('-Update.zip') else 'VRM-Desktop-Companion/'
  for name in ['install_irodori_tts.bat','start_irodori_tts.bat','tts-tools/irodori_server.ps1']:
   data=z.read(prefix+name)
   assert b'irodori_server.ps1' in data if name.endswith('.bat') else data.startswith(b'\\xef\\xbb\\xbf')
   if name.endswith('.bat'): assert b'\\r\\n' in data and b'\\n' not in data.replace(b'\\r\\n',b'')
  docs=prefix+('update-files/resources/app/' if file.name.endswith('-Update.zip') else '')
  for name in ['README.md','USAGE.md','UPDATE.md','TTS_SETUP.md']:
   assert z.read(docs+name).decode('utf-8').strip()
  assert not any('Irodori-TTS-Server/.venv' in n or '/tts-logs/' in n for n in z.namelist())
  report.append(file.name)
print(json.dumps(report))`,output],{encoding:'utf8'});
  assert.equal(JSON.parse(report).length,3);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
