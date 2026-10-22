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

test('body reaction can wait for a poke rebound, while other triggers remain immediate',async()=>{
 const {ReactionMotion}=require('../src/motion.cjs'),vrm=await model('1'),pose=capturePose(vrm),idle=new SoftIdle(),motion=new ReactionMotion(),head=vrm.humanoid.getNormalizedBoneNode('head');
 motion.trigger('angry',0,{delay:.9});idle.update(vrm,pose,.5,.016,{enabled:false});motion.update(vrm,.5,{expressions:false});assert.ok(head.quaternion.angleTo(head.quaternion.clone().identity())<1e-6);
 motion.update(vrm,1.2,{expressions:false});assert.ok(Math.abs(head.rotation.x-pose.get('head').rotation.x)>.01);
 motion.stop();idle.update(vrm,pose,1.3,.016,{enabled:false});motion.update(vrm,1.3,{expressions:false});assert.ok(head.quaternion.angleTo(head.quaternion.clone().identity())<1e-6);
 motion.trigger('surprised',2);motion.update(vrm,2.2,{expressions:false});assert.ok(Math.abs(head.rotation.x-pose.get('head').rotation.x)>.01);VRMUtils.deepDispose(vrm.scene);
});


test('touch posture continuously blends a bent pose into the base pose without freezing or snapping',async()=>{
 const {TouchPoseBlend}=require('../src/motion.cjs'),vrm=await model('1'),blend=new TouchPoseBlend(),hips=vrm.humanoid.getNormalizedBoneNode('hips'),arm=vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
 const baseHip=hips.position.clone(),baseArm=arm.quaternion.clone();hips.position.y-=.25;arm.rotation.z=1.1;const posedHip=hips.position.clone(),posedArm=arm.quaternion.clone();blend.begin(vrm,0);
 let lastAngle=Infinity;for(const t of [0,.1,.2,.4,.6,.79,.8]){hips.position.copy(baseHip);arm.quaternion.copy(baseArm);blend.update(vrm,t);const angle=arm.quaternion.angleTo(baseArm);assert.ok(angle<=lastAngle+1e-6);lastAngle=angle;if(t===0){assert.ok(hips.position.distanceTo(posedHip)<1e-8);assert.ok(arm.quaternion.angleTo(posedArm)<1e-6);}if(t===.1)assert.ok(angle<1.1&&angle>1);if(t===.4)assert.ok(Math.abs(angle-.55)<1e-6);}
 assert.equal(blend.active(.8),false);assert.ok(lastAngle<1e-6);VRMUtils.deepDispose(vrm.scene);
});
test('repeated chest touches restart the blend from the visible pose without jumping back',async()=>{
 const {TouchPoseBlend}=require('../src/motion.cjs'),vrm=await model('1'),blend=new TouchPoseBlend(),arm=vrm.humanoid.getNormalizedBoneNode('leftUpperArm'),base=arm.quaternion.clone();arm.rotation.z=1.1;blend.begin(vrm,0);arm.quaternion.copy(base);blend.update(vrm,.4);const halfway=arm.quaternion.clone();blend.begin(vrm,.4);arm.quaternion.copy(base);blend.update(vrm,.4);assert.ok(arm.quaternion.angleTo(halfway)<1e-6);
 blend.update({},.5);assert.equal(blend.pose.length,0);assert.equal(blend.active(.5),false);VRMUtils.deepDispose(vrm.scene);
});
