const {test}=require('node:test'),assert=require('node:assert/strict');
const {LipMotion,SoftIdle,capturePose,planSpeech,MOUTHS}=require('../src/motion.cjs');
const fixture=require('./fixture.cjs'),{GLTFLoader,VRMLoaderPlugin,VRMUtils}=require('./bundle-runtime.cjs');
async function model(version='1'){
 const raw=JSON.parse(Buffer.from(fixture(version)).toString());
 if(version==='1')for(const key of MOUTHS)raw.extensions.VRMC_vrm.expressions.preset[key]={isBinary:false,morphTargetBinds:[]};
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));return (await loader.parseAsync(JSON.stringify(raw),'' )).userData.vrm;
}
test('speech plan handles Japanese vowels, punctuation, empty and long messages',()=>{
 const p=planSpeech('アイウエオ。');assert.deepEqual(p.segments.slice(0,5).map(x=>x.vowel),MOUTHS);assert.equal(p.segments[5].vowel,null);assert.equal(planSpeech('').duration,0);assert.ok(planSpeech('あ'.repeat(10000)).duration<=28);
});
test('lip motion uses available VRM vowel presets and returns to a closed mouth',async()=>{
 const vrm=await model(),lips=new LipMotion();lips.play('あいうえお、よろしくね。',10);let peak=0;
 for(let i=0;i<200;i++){lips.update(vrm,10+i/60,1/60,true);vrm.update(1/60);for(const key of MOUTHS){const value=vrm.expressionManager.getValue(key);assert.ok(value>=0&&value<=1);peak=Math.max(peak,value);}}
 assert.ok(peak>.2);for(let i=0;i<90;i++)lips.update(vrm,20+i/60,1/60,true);for(const key of MOUTHS)assert.equal(vrm.expressionManager.getValue(key),0);
 lips.play('こんにちは',30);lips.update(vrm,30.1,.05,false);assert.equal(lips.active(30.1),false);for(const key of MOUTHS)assert.equal(vrm.expressionManager.getValue(key),0);VRMUtils.deepDispose(vrm.scene);
});
test('lip motion tolerates models without mouth expressions and falls back to a single vowel',()=>{
 const values={},manager={getExpression:k=>k==='aa'?{}:null,setValue:(k,v)=>{values[k]=v;}};const lips=new LipMotion();lips.play('いいううええおお',0);
 for(let i=0;i<60;i++)lips.update({expressionManager:manager},i/60,1/60);assert.deepEqual(Object.keys(values),['aa']);assert.doesNotThrow(()=>lips.update({expressionManager:{getExpression:()=>null}},.4,.016));
});
test('soft idle stays bounded, restores rest pose when disabled, and works with VRM 0.x/1.0',async()=>{
 for(const version of ['0','1']){
  const vrm=await model(version),pose=capturePose(vrm),idle=new SoftIdle();
  for(let i=0;i<600;i++){idle.update(vrm,pose,i/60,1/60,{strength:.65});vrm.update(1/60);for(const [key,base]of pose){const b=vrm.humanoid.getNormalizedBoneNode(key);for(const axis of ['x','y','z'])assert.ok(Math.abs(b.rotation[axis]-base.rotation[axis])<.15);}}
  assert.ok(Math.abs(vrm.humanoid.getNormalizedBoneNode('head').rotation.z-pose.get('head').rotation.z)>.001);
  for(let i=0;i<200;i++)idle.update(vrm,pose,10+i/60,1/60,{enabled:false});
  for(const [key,base]of pose){const b=vrm.humanoid.getNormalizedBoneNode(key);assert.ok(Math.abs(b.rotation.z-base.rotation.z)<.0001);assert.deepEqual(b.position.toArray(),base.position.toArray());}
  VRMUtils.deepDispose(vrm.scene);
 }
});

test('reactions animate without facial presets and restore bones after completion',async()=>{
 const {ReactionMotion}=require('../src/motion.cjs');
 for(const version of ['0','1']){
  const vrm=await model(version),pose=capturePose(vrm),idle=new SoftIdle(),motion=new ReactionMotion();
  for(const emotion of ['shy','surprised','angry']){
   motion.trigger(emotion,0);idle.update(vrm,pose,0,.016,{enabled:false});motion.update(vrm,.4);assert.ok(Math.abs(vrm.humanoid.getNormalizedBoneNode('head').rotation.x-pose.get('head').rotation.x)>.01);
   for(let i=0;i<300;i++){idle.update(vrm,pose,i/60,.016,{enabled:false});motion.update(vrm,i/60);vrm.update(.016);}
   assert.ok(Math.abs(vrm.humanoid.getNormalizedBoneNode('head').rotation.x-pose.get('head').rotation.x)<.001);
  }
  VRMUtils.deepDispose(vrm.scene);
 }
});


test('audio-driven lip motion uses actual silence and progress beyond pseudo speech duration',()=>{
 const values={},vrm={expressionManager:{getExpression:()=>({}),setValue:(k,v)=>values[k]=v}},lips=new LipMotion();lips.play('あいうえお',0);
 for(let i=0;i<12;i++)lips.update(vrm,100,.05,true,{active:true,progress:.1,level:.12});assert.ok(values.aa>.5);for(let i=0;i<20;i++)lips.update(vrm,101,.05,true,{active:true,progress:.6,level:0});assert.ok(Object.values(values).every(v=>v<.001));
 for(let i=0;i<12;i++)lips.update(vrm,102,.05,true,{active:true,progress:.5,level:.12});assert.ok(values.ou>.5);lips.update(vrm,103,.05,false,{active:true,progress:.5,level:.12});assert.ok(Object.values(values).every(v=>v===0));
});
