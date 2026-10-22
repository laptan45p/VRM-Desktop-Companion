const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const characters=require('../src/character-bindings.cjs'),{Store,DEFAULTS}=require('../src/backend.cjs');
test('legacy active persona migrates once and separate VRMs restore all four character fields',()=>{
 const original={name:'先輩',persona:'丁寧な口調',selfPronoun:'私',userAddress:'あなた'},data={settings:{...DEFAULTS,modelPath:'C:\\Models\\A.vrm',temperature:1.1,...original}};
 characters.initialize(data);assert.equal(data.characterBindings.length,1);
 characters.activate(data,'C:\\Models\\B.vrm',DEFAULTS);assert.equal(data.settings.name,'B');assert.equal(data.settings.persona,DEFAULTS.persona);assert.equal(data.settings.selfPronoun,'');assert.equal(data.settings.userAddress,'');assert.equal(data.settings.temperature,1.1);
 Object.assign(data.settings,{name:'別の子',persona:'元気な口調',selfPronoun:'あたし',userAddress:'相棒'});
 characters.activate(data,'c:/models/a.vrm',DEFAULTS);for(const [k,v]of Object.entries(original))assert.equal(data.settings[k],v);
 characters.activate(data,'c:/models/b.vrm',DEFAULTS);assert.equal(data.settings.name,'別の子');assert.equal(data.settings.selfPronoun,'あたし');assert.equal(data.settings.userAddress,'相棒');
 characters.initialize(data);assert.equal(data.characterBindings.length,2);
});
test('demo persona and empty optional addressing survive model switches',()=>{
 const data={settings:{...DEFAULTS,name:'デモの子',persona:'デモ設定'}};characters.initialize(data);characters.activate(data,'/models/A.vrm',DEFAULTS);characters.activate(data,'',DEFAULTS);
 assert.equal(data.settings.name,'デモの子');assert.equal(data.settings.persona,'デモ設定');assert.equal(data.settings.selfPronoun,'');assert.equal(data.settings.userAddress,'');
});
test('character settings persist through real Store save/load and legacy files migrate without losing persona',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'character-store-'));
 try{
  const file=path.join(dir,'companion.json');fs.writeFileSync(file,JSON.stringify({settings:{modelPath:'/A.vrm',name:'既存の名前',persona:'既存の性格'}}));
  const s=new Store(dir);s.load();assert.equal(s.data.settings.name,'既存の名前');assert.equal(s.data.settings.persona,'既存の性格');assert.equal(s.data.characterBindings.length,1);
  Object.assign(s.data.settings,{selfPronoun:'僕',userAddress:'先輩'});s.save();characters.activate(s.data,'/B.vrm',DEFAULTS);Object.assign(s.data.settings,{name:'Bの名前',persona:'Bの性格'});s.save();
  const next=new Store(dir);next.load();assert.equal(next.data.settings.name,'Bの名前');characters.activate(next.data,'/A.vrm',DEFAULTS);assert.equal(next.data.settings.name,'既存の名前');assert.equal(next.data.settings.selfPronoun,'僕');assert.equal(next.data.settings.userAddress,'先輩');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid character bindings are discarded, duplicates normalize and fields are bounded',()=>{
 const raw=[null,{}, {modelPath:'C:\\A.vrm',name:'old',persona:'old'}, {modelPath:'c:/a.vrm',name:'new',persona:'x'.repeat(13000),selfPronoun:'p'.repeat(150),userAddress:42}];
 const entries=characters.clean(raw);assert.equal(entries.length,1);assert.equal(entries[0].name,'new');assert.equal(entries[0].persona.length,12000);assert.equal(entries[0].selfPronoun.length,100);assert.equal(entries[0].userAddress,'');
});
