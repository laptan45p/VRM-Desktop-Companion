const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const voices=require('../src/voice-bindings.cjs'),{Store,DEFAULTS}=require('../src/backend.cjs');
test('legacy current VRM/embedding migrates and per-model voices persist across restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'model-voices-'));try{
  const s=new Store(dir);fs.writeFileSync(s.file,JSON.stringify({settings:{...DEFAULTS,modelPath:'C:/avatars/A.vrm',speakerPath:'C:/voices/A.speaker.safetensors'},history:[]}));s.load();assert.equal(voices.lookup(s.data,'c:\\AVATARS\\a.vrm'),'C:/voices/A.speaker.safetensors');assert.equal(voices.lookup(s.data,'C:/avatars/B.vrm'),'');
  voices.bind(s.data,'C:/avatars/B.vrm','C:/voices/B.speaker.safetensors');s.data.settings.modelPath='C:/avatars/B.vrm';s.data.settings.speakerPath=voices.lookup(s.data,s.data.settings.modelPath);s.save();
  const next=new Store(dir);next.load();assert.equal(next.data.settings.speakerPath,'C:/voices/B.speaker.safetensors');assert.equal(voices.lookup(next.data,'C:/avatars/A.vrm'),'C:/voices/A.speaker.safetensors');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('voice bindings validate paths, normalize Windows case and replace only the selected model',()=>{
 const data={settings:{modelPath:'A.vrm',speakerPath:''},voiceBindings:[null,{modelPath:'bad',speakerPath:'not-an-embedding'},{modelPath:'C:/A.vrm',speakerPath:'old.speaker.safetensors'},{modelPath:'c:\\a.vrm',speakerPath:'new.speaker.safetensors'}]};voices.initialize(data);assert.equal(data.voiceBindings.length,1);assert.equal(voices.lookup(data,'C:/A.vrm'),'new.speaker.safetensors');
 voices.bind(data,'B.vrm','B.speaker.safetensors');voices.bind(data,'C:/a.vrm','replacement.speaker.safetensors');assert.equal(data.voiceBindings.length,2);assert.equal(voices.lookup(data,'B.vrm'),'B.speaker.safetensors');assert.throws(()=>voices.bind(data,'B.vrm','bad.txt'));
 const demo={settings:{modelPath:'',speakerPath:'demo.speaker.safetensors'}};voices.initialize(demo);assert.equal(voices.lookup(demo,''),'demo.speaker.safetensors');assert.equal(voices.lookup(demo,'real.vrm'),'');const invalid={settings:{modelPath:'A.vrm',speakerPath:'bad.txt'}};voices.initialize(invalid);assert.equal(invalid.settings.speakerPath,'');
});
