const {test}=require('node:test'),assert=require('node:assert/strict');
const {Vector3,GLTFLoader,VRMLoaderPlugin,VRMUtils,Group}=require('./bundle-runtime.cjs'),{HandDrag}=require('../src/hand.cjs'),{SoftIdle,capturePose}=require('../src/motion.cjs'),fixture=require('./fixture.cjs');
async function setup(version='1',side='left',rotation=0){
 const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));const vrm=(await loader.parseAsync(Buffer.from(fixture(version)).toString(),'')).userData.vrm;VRMUtils.rotateVRM0(vrm);vrm.scene.rotation.y=rotation;
 vrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation.z=1.12;vrm.humanoid.getNormalizedBoneNode('rightUpperArm').rotation.z=-1.12;vrm.update(0);vrm.scene.updateMatrixWorld(true);
 const hand=vrm.humanoid.getRawBoneNode(side+'Hand'),norm=vrm.humanoid.getNormalizedBoneNode(side+'Hand'),attr=v=>Object.fromEntries(['X','Y','Z','W'].map((a,i)=>['get'+a,()=>v[i]]));
 const hit={object:{isSkinnedMesh:true,skeleton:{bones:[hand]},geometry:{attributes:{skinIndex:attr([0,0,0,0]),skinWeight:attr([1,0,0,0])}}},face:{a:0,b:1,c:2},point:hand.getWorldPosition(new Vector3())};
 const hands=new HandDrag(vrm,Vector3),idle=new SoftIdle(),pose=capturePose(vrm);
 let time=0;function frame(){hands.restore();idle.update(vrm,pose,time+=1/60,1/60,{enabled:false});hands.update(1/60);vrm.update(1/60);vrm.scene.updateMatrixWorld(true);}
 return {vrm,hands,hit,hand,norm,frame,pose};
}
test('left/right hands track reachable targets through VRM 0.x/1.0 and return to idle after release',async()=>{
 for(const version of ['0','1'])for(const side of ['left','right']){
  const {vrm,hands,hit,hand,norm,frame}=await setup(version,side,.6),before=hand.getWorldPosition(new Vector3()),normalized=norm.getWorldPosition(new Vector3());assert.ok(hands.begin(hit));assert.equal(hands.arm.side,side);
  const shoulder=hands.position(hands.arm.upper),target=normalized.clone().sub(shoulder).multiplyScalar(.65).add(shoulder).add(new Vector3(0,0,.06)),delta=target.clone().sub(normalized);hands.move(delta);for(let i=0;i<100;i++)frame();assert.ok(norm.getWorldPosition(new Vector3()).distanceTo(target)<.01,JSON.stringify({version,side,before:normalized.toArray(),target:target.toArray(),actual:norm.getWorldPosition(new Vector3()).toArray(),shoulder:hands.position(hands.arm.upper).toArray(),a:hands.a,b:hands.b}));assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(before)>.08);
  hands.release();for(let i=0;i<120;i++)frame();assert.equal(hands.arm,null);assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(before)<1e-4);VRMUtils.deepDispose(vrm.scene);
 }
});
test('hand dragging clamps unreachable targets without changing arm lengths and resets on cancellation',async()=>{
 const {vrm,hands,hit,frame}=await setup();assert.ok(hands.begin(hit));const arm=hands.arm,a=hands.a,b=hands.b;
 for(const delta of [new Vector3(100,100,100),new Vector3(0,0,0).sub(hands.start).add(hands.position(arm.upper))]){
  hands.move(delta);for(let i=0;i<100;i++)frame();const s=hands.position(arm.upper),e=hands.position(arm.lower),h=hands.position(arm.hand);assert.ok(Math.abs(s.distanceTo(e)-a)<1e-5);assert.ok(Math.abs(e.distanceTo(h)-b)<1e-5);assert.ok(s.distanceTo(h)<=a+b+1e-6);for(const p of [s,e,h])assert.ok(Number.isFinite(p.x+p.y+p.z));
 }
 hands.reset();assert.equal(hands.held,false);assert.equal(hands.arm,null);assert.equal(hands.applied.length,0);VRMUtils.deepDispose(vrm.scene);
});
test('hand picking requires skin influence near the hand; missing arms safely ignore interaction',async()=>{
 const {vrm,hands,hit}=await setup();assert.equal(hands.pick({...hit,point:new Vector3(100,100,100)}),null);hit.object.geometry.attributes.skinWeight.getX=()=>0;assert.equal(hands.begin(hit),false);const missing=new HandDrag({scene:new Group()},Vector3);assert.equal(missing.begin(hit),false);assert.doesNotThrow(()=>{missing.move(new Vector3());missing.update(.016);missing.release();missing.reset();});VRMUtils.deepDispose(vrm.scene);
});
