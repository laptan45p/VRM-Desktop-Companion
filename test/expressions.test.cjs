const {test}=require('node:test'),assert=require('node:assert/strict');
const {FaceExpressions}=require('../src/expressions.cjs');
const {GLTFLoader,VRMLoaderPlugin,VRMUtils}=require('./bundle-runtime.cjs');
const fixture=require('./fixture.cjs');
async function model(version='0'){
 const raw=JSON.parse(Buffer.from(fixture(version)).toString());
 raw.meshes[0].primitives[0].targets=[{POSITION:0}];raw.meshes[0].extras={targetNames:['test-morph']};
 if(version==='0')raw.extensions.VRM.blendShapeMaster.blendShapeGroups=[
  ...['joy','angry','blink','a'].map(name=>({name,presetName:name,binds:[],materialValues:[],isBinary:false})),
  ...['赤面','びっくり','ハート','涙'].map(name=>({name,presetName:'unknown',binds:[{mesh:0,index:0,weight:100}],materialValues:[],isBinary:false}))];
 else Object.assign(raw.extensions.VRMC_vrm.expressions,{custom:{'赤面':{morphTargetBinds:[{node:raw.nodes.length-1,index:0,weight:1}]},'ハート':{morphTargetBinds:[{node:raw.nodes.length-1,index:0,weight:1}]}}});
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));return (await loader.parseAsync(JSON.stringify(raw),'')).userData.vrm;
}
test('VRM0 emotion aliases and Japanese custom expressions work in the shipped loader',async()=>{
 const vrm=await model(),faces=new FaceExpressions();faces.bind(vrm);const m=vrm.expressionManager;
 assert.ok(faces.names.includes('happy'));assert.ok(faces.names.includes('赤面'));
 faces.trigger('happy',0);faces.update(.5,.1);assert.ok(m.getValue('happy')>.3);
 faces.trigger('shy',1);for(let i=0;i<15;i++)faces.update(1+i*.05,.05);
 assert.ok(m.getValue('赤面')>.5);assert.ok(m.getValue('happy')<.001);
 faces.trigger('surprised',2);faces.update(2.2,.1);assert.ok(m.getValue('びっくり')>.5);
 for(let i=0;i<30;i++)faces.update(10+i*.05,.05);
 assert.equal(m.getValue('赤面'),0);assert.equal(m.getValue('びっくり'),0);VRMUtils.deepDispose(vrm.scene);
});
test('previews isolate custom expressions and reset automatically without overwriting resumed lip-sync',async()=>{
 const vrm=await model(),faces=new FaceExpressions();faces.bind(vrm);const m=vrm.expressionManager;
 faces.trigger('happy',0);faces.update(.2,.1);
 m.setValue('aa',.8);m.setValue('blink',1);faces.show('ハート',.7,.3);faces.update(.5,.1,{talking:true,blink:1});
 assert.equal(m.getValue('ハート'),.7);vrm.update(0);let influence;vrm.scene.traverse(o=>{if(o.morphTargetInfluences)influence=o.morphTargetInfluences[0];});assert.ok(Math.abs(influence-.7)<.0001);assert.equal(m.getValue('happy'),0);assert.equal(m.getValue('aa'),0);assert.equal(m.getValue('blink'),0);
 faces.show('aa',1,1);faces.update(1.1,.1);assert.equal(m.getValue('aa'),1);
 m.setValue('aa',.4);faces.update(6.1,.1,{talking:true});assert.equal(m.getValue('aa'),.4);
 for(let i=0;i<30;i++)faces.update(10+i*.1,.1);assert.equal(m.getValue('ハート'),0);
 assert.throws(()=>faces.show('missing',1,0));assert.throws(()=>faces.show('涙',NaN,0));VRMUtils.deepDispose(vrm.scene);
});
test('automatic emotions attenuate during speech and blink; model rebinding clears old values',async()=>{
 const vrm=await model(),faces=new FaceExpressions();faces.bind(vrm);const m=vrm.expressionManager;
 faces.trigger('angry',0);for(let i=0;i<20;i++)faces.update(i*.05,.05);const resting=m.getValue('angry');
 faces.update(1,.05,{talking:true});assert.ok(m.getValue('angry')<resting*.4);
 faces.update(1.1,.05,{blink:1});assert.equal(m.getValue('angry'),0);
 faces.show('涙',1,2);faces.update(2.1,.1);assert.equal(m.getValue('涙'),1);
 faces.bind(null);assert.equal(m.getValue('涙'),0);assert.deepEqual(faces.names,[]);assert.doesNotThrow(()=>faces.update(3,.1));VRMUtils.deepDispose(vrm.scene);
});
test('VRM1 supports custom previews and safely falls back when emotion expressions are missing',async()=>{
 const vrm=await model('1'),faces=new FaceExpressions();faces.bind(vrm);
 faces.trigger('shy',0);faces.update(.2,.1);assert.ok(vrm.expressionManager.getValue('赤面')>0);
 faces.trigger('surprised',1);faces.update(1.2,.1);assert.doesNotThrow(()=>faces.update(1.4,.1));
 faces.show('ハート',.6,2);faces.update(2.1,.1);assert.equal(vrm.expressionManager.getValue('ハート'),.6);
 faces.show('',0,2.2);for(let i=0;i<25;i++)faces.update(6+i*.1,.1);assert.equal(vrm.expressionManager.getValue('ハート'),0);VRMUtils.deepDispose(vrm.scene);
});

test('speech expressions wait through long generation and remain for long audio until completion',()=>{
 const {SpeechExpressions}=require('../src/expressions.cjs');
 const values={},faces=new FaceExpressions();faces.bind({expressionManager:{expressions:[{expressionName:'happy'}],setValue:(name,v)=>values[name]=v}});
 const speech=new SpeechExpressions(faces);speech.setMood('happy',0);speech.begin(10,0,{pending:true});
 for(let i=0;i<100;i++)faces.update(i,.1);assert.equal(values.happy||0,0);
 speech.start(10,100);for(let i=0;i<30;i++)faces.update(100+i,.1);assert.ok(values.happy>.49);
 speech.end(10,130);faces.update(130.5,.1);assert.ok(values.happy>.49);
 for(let i=0;i<30;i++)faces.update(131+i*.1,.1);assert.equal(values.happy,0);
});
test('stopped and replaced speech ignores stale playback callbacks',()=>{
 const {SpeechExpressions}=require('../src/expressions.cjs');
 const values={},faces=new FaceExpressions();faces.bind({expressionManager:{expressions:[{expressionName:'happy'}],setValue:(n,v)=>values[n]=v}});
 const speech=new SpeechExpressions(faces);speech.begin(1,0,{pending:true});speech.start(1,1);faces.update(1,.1);assert.ok(values.happy>0);
 speech.cancel(2);speech.start(1,3);for(let i=0;i<20;i++)faces.update(3+i,.1);assert.equal(values.happy,0);
 speech.begin(2,30,{pending:true});speech.end(1,31);speech.start(1,32);faces.update(32,.1);assert.equal(values.happy,0);
 speech.start(2,33);faces.update(33,.1);assert.ok(values.happy>0);
});
test('text-only and failed audio expressions expire with text duration and respect previews',()=>{
 const {SpeechExpressions}=require('../src/expressions.cjs');
 const values={},faces=new FaceExpressions();faces.bind({expressionManager:{expressions:[{expressionName:'happy'},{expressionName:'ハート'}],setValue:(n,v)=>values[n]=v}});
 const speech=new SpeechExpressions(faces);speech.begin(1,0,{pending:true});speech.fallback(1,20,8);faces.update(25,.1);assert.ok(values.happy>0);
 faces.show('ハート',.8,25);faces.update(25,.1);assert.equal(values['ハート'],.8);assert.equal(values.happy,0);
 for(let i=0;i<40;i++)faces.update(31+i*.1,.1);assert.equal(values.happy,0);assert.equal(values['ハート'],0);
 speech.begin(2,40,{duration:10});faces.update(45,.1);assert.ok(values.happy>0);
 for(let i=0;i<25;i++)faces.update(51+i*.1,.1);assert.equal(values.happy,0);
});
test('mood changes before or after speech messages retain pending/playback timing',()=>{
 const {SpeechExpressions}=require('../src/expressions.cjs');
 const values={},faces=new FaceExpressions();faces.bind({expressionManager:{expressions:[{expressionName:'happy'},{expressionName:'angry'}],setValue:(n,v)=>values[n]=v}});
 const speech=new SpeechExpressions(faces);speech.begin(1,0,{pending:true});speech.setMood('angry',10);faces.update(10,.1);assert.equal(values.angry||0,0);
 speech.start(1,20);faces.update(20,.1);assert.ok(values.angry>0);
 speech.setMood('calm',25);for(let i=0;i<20;i++)faces.update(25+i*.1,.1);assert.ok(values.happy>.49);assert.equal(values.angry,0);
 speech.end(1,28);for(let i=0;i<20;i++)faces.update(30+i*.1,.1);assert.equal(values.happy,0);
});
