const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('all release archives include both TTS wrappers and their helper in the runnable root',()=>{
 const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tts-packaging-')),python=process.platform==='win32'?'python':'python3';
 try{
  const runtime=path.join(temp,'runtime'),output=path.join(temp,'out');fs.mkdirSync(runtime);fs.writeFileSync(path.join(runtime,'VRM-Desktop-Companion.exe'),'packaging fixture only');
  execFileSync(python,[path.join(root,'scripts/package_release.py'),'--runtime',runtime,'--output',output],{cwd:root,stdio:'pipe'});
  const report=execFileSync(python,['-c',`import pathlib,sys,zipfile,json,runpy
notes=pathlib.Path(sys.argv[1],'notes.md').read_text(encoding='utf-8')
assert '## 今回の変更点' in notes and '## 更新方法' in notes
release_notes=runpy.run_path(str(pathlib.Path(sys.argv[2],'scripts/release_notes.py')))['release_notes']
sample=release_notes('9.8.7','## 未リリース\\n\\n未公開の変更\\n\\n## 9.8.7\\n\\n今回だけの変更\\n\\n## 9.8.6\\n\\n過去の変更\\n')
assert '今回だけの変更' in sample and '過去の変更' not in sample and '未公開の変更' not in sample
try:
 release_notes('9.8.70','## 9.8.7\\n\\n別の版\\n')
except ValueError:
 pass
else:
 raise AssertionError('Missing version must fail rather than publish unrelated notes')
report=[]
for file in pathlib.Path(sys.argv[1]).glob('*.zip'):
 with zipfile.ZipFile(file) as z:
  prefix='' if file.name.endswith('-Update.zip') else 'VRM-Desktop-Companion/'
  for name in ['install_irodori_tts.bat','start_irodori_tts.bat','tts-tools/irodori_server.ps1','install_ollama.bat','llm-tools/ollama_setup.ps1','install_llama_server.bat','llm-tools/llama_setup.ps1']:
   data=z.read(prefix+name)
   assert (b'ollama_setup.ps1' if name == 'install_ollama.bat' else b'llama_setup.ps1' if name == 'install_llama_server.bat' else b'irodori_server.ps1') in data if name.endswith('.bat') else data.startswith(b'\\xef\\xbb\\xbf')
   if name.endswith('.bat'): assert b'\\r\\n' in data and b'\\n' not in data.replace(b'\\r\\n',b'')
  docs=prefix+('update-files/resources/app/' if file.name.endswith('-Update.zip') else '')
  for name in ['README.md','USAGE.md','UPDATE.md','TTS_SETUP.md','OLLAMA_SETUP.md','LLAMA_SERVER_SETUP.md','MEMORY.md']:
   assert z.read(docs+name).decode('utf-8').strip()
  app=prefix+('update-files/resources/app/' if file.name.endswith('-Update.zip') else 'resources/app/' if file.name.endswith('-Windows-x64.zip') else '')
  assert z.read(app+'src/tts.cjs') == pathlib.Path(sys.argv[2],'src/tts.cjs').read_bytes()
  assert '192.168.1.101:8088' in z.read(app+'src/index.html').decode('utf-8')
  for name in ['restartConversationOnStartup','restartConversation','memoryAvailability','mergeRelationship','archiveRelationship','restoreRelationship','renameRelationship','deleteRelationship','deleteArchivedRelationship']:
   assert 'id="'+name+'"' in z.read(app+'src/index.html').decode('utf-8')
  for name in ['memory.cjs','relationship.cjs','main.cjs','backend.cjs','reply-text.cjs','preload.cjs','renderer.js','style.css']:
   assert z.read(app+'src/'+name) == pathlib.Path(sys.argv[2],'src',name).read_bytes()
  if file.name.endswith('-Update.zip'): assert b'update-files' in z.read('apply_update.bat')
  assert not any('Irodori-TTS-Server/.venv' in n or '/tts-logs/' in n or '/llama-server/' in n or '.llama-setup-' in n for n in z.namelist())
  report.append(file.name)
print(json.dumps(report))`,output,root],{encoding:'utf8'});
  assert.equal(JSON.parse(report).length,3);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});


