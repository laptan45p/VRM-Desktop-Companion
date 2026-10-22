const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('./bundle-runtime.cjs'),{ChestPoke}=require('../src/motion.cjs');
function fixture(scale=1,rotation=0){
 const scene=new T.Group(),torso=new T.Group();scene.add(torso);scene.scale.setScalar(scale);scene.rotation.set(.2,rotation,.1);torso.isBone=true;torso.name='chest';torso.position.y=1.2;
 const bone=(name,x)=>{const b=new T.Group();b.isBone=true;b.name=name;b.position.set(x,.05,.06);torso.add(b);const tip=new T.Group();tip.isBone=true;tip.name=name+'_tip';tip.position.z=.08;b.add(tip);return b;};
 const left=bone('胸.L',.08),right=bone('J_Sec_R_Bust1',-.08),ribbon=bone('胸リボン',0);scene.updateMatrixWorld(true);
 const h={getRawBoneNode:k=>k==='chest'?torso:null,getNormalizedBoneNode:k=>k==='chest'?torso:null},vrm={scene,humanoid:h},effect=new ChestPoke(vrm,T.Vector3);effect.height=1.7*scale;
 const attr=v=>Object.fromEntries(['X','Y','Z','W'].map((a,i)=>['get'+a,()=>v[i]]));
 const mesh={isSkinnedMesh:true,skeleton:{bones:[left,right,ribbon,torso]},geometry:{attributes:{skinIndex:attr([0,0,0,0]),skinWeight:attr([1,0,0,0])}}};
 const hit={object:mesh,face:{a:0,b:1,c:2},point:left.localToWorld(new T.Vector3(.015,0,.08))},direction=new T.Vector3(0,0,-1).transformDirection(scene.matrixWorld);
 return {scene,torso,left,right,ribbon,vrm,effect,mesh,hit,direction,attr};
}
test('breast roots are discovered without torso, accessory or nested tip bones',()=>{
 const f=fixture();assert.deepEqual(f.effect.parts.map(p=>p.bone),[f.left,f.right]);assert.equal(f.effect.pick(f.hit).bone,f.left);
 f.mesh.geometry.attributes.skinIndex=f.attr([1,0,0,0]);f.hit.point=f.right.localToWorld(new T.Vector3(0,0,.08));assert.equal(f.effect.pick(f.hit).bone,f.right);
 f.mesh.geometry.attributes.skinIndex=f.attr([2,0,0,0]);assert.equal(f.effect.pick(f.hit),null);assert.equal(new ChestPoke({scene:new T.Group()},T.Vector3).poke(f.hit,f.direction),false);
});
test('a poke visibly presses the touched side and rebounds without moving the other side or torso',()=>{
 const f=fixture(),base=f.left.position.clone(),other=f.right.position.clone(),body=f.torso.quaternion.clone();assert.ok(f.effect.poke(f.hit,f.direction));
 let pressed=false,rebounded=false;for(let i=0;i<100;i++){f.effect.restore();f.effect.update(1/60);const delta=f.left.position.clone().sub(base);pressed ||=delta.z<-.01;rebounded ||=delta.z>.003;assert.ok(delta.length()<f.effect.height*.019);}
 assert.ok(pressed);assert.ok(rebounded);assert.equal(f.effect.active.size,0);f.effect.restore();assert.ok(f.left.position.distanceTo(base)<1e-12);assert.ok(f.right.position.distanceTo(other)<1e-12);assert.ok(f.torso.quaternion.angleTo(body)<1e-8);
});
test('consecutive pokes stay bounded and restore the current simulated pose, not an old rest pose',()=>{
 const f=fixture(),base=f.left.position.clone();for(let i=0;i<100;i++){f.effect.restore();f.left.position.copy(base);f.left.rotation.z=.07;const pose=f.left.quaternion.clone();assert.ok(f.effect.poke(f.hit,f.direction));f.effect.update(.05);assert.ok(f.left.position.distanceTo(base)<.04);f.effect.restore();assert.ok(f.left.quaternion.angleTo(pose)<1e-7);}
 f.effect.reset();assert.equal(f.effect.active.size,0);assert.equal(f.effect.applied.length,0);assert.ok(f.left.position.distanceTo(base)<1e-12);
});
test('movement follows scaled and rotated models and invalid hits/directions have no effect',()=>{
 for(const scale of [.01,1,10])for(const rotation of [0,Math.PI/2,Math.PI]){
  const f=fixture(scale,rotation),base=f.left.getWorldPosition(new T.Vector3());assert.ok(f.effect.poke(f.hit,f.direction));f.effect.update(.05);
  const delta=f.left.getWorldPosition(new T.Vector3()).sub(base);assert.ok(delta.dot(f.direction)>.006*scale);assert.ok(delta.length()<.04*scale);f.effect.reset();assert.ok(f.left.getWorldPosition(new T.Vector3()).distanceTo(base)<1e-8);
  assert.equal(f.effect.poke({},f.direction),false);assert.equal(f.effect.poke(f.hit,new T.Vector3()),false);assert.equal(f.effect.poke(f.hit,new T.Vector3(NaN,0,0)),false);
 }
});
test('spring-controlled bone matrices move skinned vertices and reset cleanly',()=>{
 const f=fixture(),child=f.left.children[0],spring=new T.VRMSpringBoneManager();spring.addJoint(new T.VRMSpringBoneJoint(f.left,child));spring.setInitState();
 const point=child.getWorldPosition(new T.Vector3()),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array([point.x,point.y,point.z]),3));g.setAttribute('skinIndex',new T.BufferAttribute(new Uint16Array([0,0,0,0]),4));g.setAttribute('skinWeight',new T.BufferAttribute(new Float32Array([1,0,0,0]),4));
 const mesh=new T.SkinnedMesh(g);f.scene.add(mesh);mesh.bind(new T.Skeleton([f.left]));f.scene.updateMatrixWorld(true);mesh.skeleton.update();const base=mesh.getVertexPosition(0,new T.Vector3()),mat=mesh.skeleton.boneMatrices.slice();
 f.effect.poke(f.hit,f.direction);f.effect.restore();spring.update(1/60);f.effect.update(.05);mesh.skeleton.update();assert.ok(mesh.getVertexPosition(0,new T.Vector3()).distanceTo(base)>.005);assert.ok(mesh.skeleton.boneMatrices.some((v,i)=>Math.abs(v-mat[i])>.005));assert.equal(f.left.matrixAutoUpdate,false);
 f.effect.reset();spring.reset();mesh.skeleton.update();assert.ok(mesh.getVertexPosition(0,new T.Vector3()).distanceTo(base)<1e-6);mesh.skeleton.dispose();g.dispose();
});

test('body delay covers only the remaining poke response and never extends on duplicate notifications',()=>{
 const f=fixture();assert.equal(f.effect.reactionDelay(),0);f.effect.poke(f.hit,f.direction);assert.equal(f.effect.reactionDelay(),.9);
 for(let i=0;i<5;i++){f.effect.restore();f.effect.update(.1);}const delay=f.effect.reactionDelay();assert.ok(Math.abs(delay-.4)<1e-9);assert.equal(f.effect.reactionDelay(),delay);
 for(let i=0;i<5;i++){f.effect.restore();f.effect.update(.1);}assert.equal(f.effect.reactionDelay(),0);f.effect.reset();assert.equal(f.effect.reactionDelay(),0);
});
