const {test}=require('node:test'),assert=require('node:assert/strict');
const {Group,Vector3}=require('./bundle-runtime.cjs'),{ClothDrag,discoverChains}=require('../src/cloth.cjs');
function fixture(count=8,segments=4,english=false,scale=1,rotation=0){
 const scene=new Group(),waist=new Group();scene.add(waist);waist.position.y=scale;scene.rotation.y=rotation;
 const bones=[],chains=[];
 for(let i=0;i<count;i++){
  const chain=[];let parent=waist;
  for(let j=0;j<segments;j++){
   const bone=new Group();bone.isBone=true;bone.name=english?`Skirt_${i}_${j}`:`スカート${i}_${j}`;
   bone.position.set(j===0?Math.cos(i*Math.PI*2/count)*.2*scale:0,j===0?0:-.1*scale,j===0?Math.sin(i*Math.PI*2/count)*.2*scale:0);
   parent.add(bone);parent=bone;bones.push(bone);chain.push(bone);
  }
  chains.push(chain);
 }
 scene.updateMatrixWorld(true);
 const attr=values=>Object.fromEntries(['X','Y','Z','W'].map((axis,c)=>['get'+axis,()=>values[c]]));
 const mesh={isSkinnedMesh:true,skeleton:{bones},geometry:{attributes:{skinIndex:attr([segments-2,0,0,0]),skinWeight:attr([1,0,0,0])}}};
 const vrm={scene},cloth=new ClothDrag(vrm,Vector3);cloth.height=1.7*scale;
 const hit={object:mesh,face:{a:0,b:1,c:2},point:chains[0].at(-1).getWorldPosition(new Vector3())};
 return {scene,chains,cloth,hit,mesh};
}
test('shared discovery handles Japanese/English names with 8/12 chains and different segment counts',()=>{
 for(const [count,segments,english]of [[8,4,false],[12,5,true]]){const f=fixture(count,segments,english);assert.equal(discoverChains(f.scene).length,count);assert.equal(f.cloth.pick(f.hit),f.cloth.chains[0]);}
 assert.deepEqual(discoverChains(new Group()),[]);
});
test('cloth picking requires skirt skin weights and a hem hit, ignoring torso or background',()=>{
 const {cloth,hit,mesh}=fixture();assert.equal(cloth.begin({}),false);
 assert.equal(cloth.pick({...hit,point:new Vector3(0,1.7,0)}),null);
 mesh.geometry.attributes.skinWeight.getX=()=>0;assert.equal(cloth.pick(hit),null);assert.equal(cloth.begin(hit),false);
});
test('drag follows nearby panels in rotated/scaled models, stays bounded, and restores all panels',()=>{
 for(const scale of [.01,1,10])for(const rotation of [0,Math.PI/2]){
  const {cloth,chains,scene,hit}=fixture(12,5,true,scale,rotation),base=chains.flat().map(b=>b.quaternion.clone());
  assert.equal(cloth.begin(hit),true);cloth.move(new Vector3(0,100*scale,20*scale));assert.ok(cloth.target.length()<=cloth.height*.180001);assert.ok(cloth.target.y>0);
  for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}
  assert.ok(chains[0].some((b,i)=>b.quaternion.angleTo(base[i])>.01));
  for(const index of [1,11])assert.ok(chains[index].some(b=>b.quaternion.angleTo(base[chains.flat().indexOf(b)])>.01));
  for(const chain of chains.slice(3,10))for(const b of chain)assert.ok(b.quaternion.angleTo(base[chains.flat().indexOf(b)])<1e-6);
  for(const [bone,q]of cloth.applied)assert.ok(bone.quaternion.angleTo(q)<=80*Math.PI/180+.00001);
  cloth.release();for(let i=0;i<120;i++){cloth.restore();cloth.update(1/60);}cloth.restore();scene.updateMatrixWorld(true);
  for(const [i,b]of chains.flat().entries())assert.ok(b.quaternion.angleTo(base[i])<1e-6);
  assert.equal(cloth.held,false);assert.equal(cloth.chain,null);
 }
});
test('restoring before a spring update preserves its new pose; cancellation restores immediately',()=>{
 const {cloth,chains,hit}=fixture();cloth.begin(hit);cloth.move(new Vector3(.1,0,0));cloth.update(.05);cloth.restore();
 const bone=chains[0].at(-2);bone.rotation.z=.08;const simulated=bone.quaternion.clone();cloth.update(.05);cloth.reset();assert.ok(bone.quaternion.angleTo(simulated)<1e-6);assert.equal(cloth.chain,null);assert.equal(cloth.delta.length(),0);
});

test('a purely upward pull bends hanging cloth rather than shortening or leaving it frozen',()=>{
 const {cloth,chains,hit}=fixture();assert.ok(cloth.begin(hit));const base=chains[0].map(b=>b.quaternion.clone());cloth.move(new Vector3(0,.1,0));cloth.update(.05);assert.ok(chains[0].some((b,i)=>b.quaternion.angleTo(base[i])>.01));cloth.reset();
});

test('real VRM spring bones move the skinned cloth vertices and GPU matrices, then restore cleanly',()=>{
 const {SkinnedMesh,Skeleton,BufferGeometry,BufferAttribute,VRMSpringBoneJoint,VRMSpringBoneManager}=require('./bundle-runtime.cjs');
 for(const [count,segments,english]of [[8,4,false],[12,5,true]]){
  const {scene,chains,cloth}=fixture(count,segments,english),bones=chains.flat(),spring=new VRMSpringBoneManager();
  for(const chain of chains)for(let i=0;i<chain.length-1;i++)spring.addJoint(new VRMSpringBoneJoint(chain[i],chain[i+1]));spring.setInitState();
  const point=chains[0].at(-1).getWorldPosition(new Vector3()),geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(new Float32Array([point.x,point.y,point.z+.03,point.x+.01,point.y,point.z+.03,point.x,point.y+.01,point.z+.03]),3));
  geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array([segments-2,0,0,0,segments-2,0,0,0,segments-2,0,0,0]),4));
  geometry.setAttribute('skinWeight',new BufferAttribute(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),4));
  const mesh=new SkinnedMesh(geometry);scene.add(mesh);mesh.bind(new Skeleton(bones));scene.updateMatrixWorld(true);mesh.skeleton.update();
  const baseline=mesh.getVertexPosition(0,new Vector3()).clone(),matrices=mesh.skeleton.boneMatrices.slice();
  assert.ok(cloth.begin({object:mesh,face:{a:0,b:1,c:2},point:baseline}));cloth.move(new Vector3(.07,.06,.03));
  for(let i=0;i<45;i++){cloth.restore();spring.update(1/60);cloth.update(1/60);mesh.skeleton.update();}
  assert.ok(mesh.getVertexPosition(0,new Vector3()).distanceTo(baseline)>.01,'The mesh must visibly move, not only the quaternion');
  assert.ok(mesh.skeleton.boneMatrices.some((v,i)=>Math.abs(v-matrices[i])>.01),'GPU bone matrices must change');
  cloth.release();for(let i=0;i<120;i++){cloth.restore();spring.update(1/60);cloth.update(1/60);}cloth.restore();mesh.skeleton.update();
  assert.ok(mesh.getVertexPosition(0,new Vector3()).distanceTo(baseline)<1e-5);assert.equal(chains[0][0].matrixAutoUpdate,false);geometry.dispose();mesh.skeleton.dispose();
 }
});

test('coat chains are supported and models without garment bones safely ignore dragging',()=>{
 const f=fixture(7,3,true);for(const chain of f.chains)for(const b of chain)b.name=b.name.replace('Skirt','coat');const coat=new ClothDrag(f.cloth.vrm,Vector3);assert.equal(coat.chains.length,7);assert.ok(coat.begin(f.hit));coat.move(new Vector3(.01,.01,0));coat.update(.016);coat.reset();
 const empty=new ClothDrag({scene:new Group()},Vector3);for(let i=0;i<120;i++){assert.equal(empty.begin(f.hit),false);empty.move(new Vector3(1,1,1));empty.restore();empty.update(.016);empty.release();}assert.equal(empty.chain,null);assert.equal(empty.applied.length,0);
});

test('larger default range visibly exceeds the old range and custom limits survive large drags',()=>{
 const f=fixture(8,4,false),cloth=f.cloth,tip=f.chains[0].at(-1);const start=tip.getWorldPosition(new Vector3());
 cloth.configure({clothReach:.06,clothAngle:.5*180/Math.PI});cloth.begin(f.hit);cloth.move(new Vector3(1,1,1));for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}const oldDistance=tip.getWorldPosition(new Vector3()).distanceTo(start);cloth.reset();
 cloth.configure();cloth.begin(f.hit);cloth.move(new Vector3(1,1,1));for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}assert.ok(tip.getWorldPosition(new Vector3()).distanceTo(start)>oldDistance*1.3);cloth.reset();
 for(const options of [{clothReach:.02,clothAngle:10},{clothReach:.5,clothAngle:120}]){
  cloth.configure(options);cloth.begin(f.hit);cloth.move(new Vector3(100,100,100));for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}
  assert.ok(cloth.target.length()<=cloth.height*options.clothReach+1e-8);for(const [bone,q]of cloth.applied)assert.ok(bone.quaternion.angleTo(q)<=options.clothAngle*Math.PI/180+1e-6);cloth.reset();
 }
});

test('falloff moves immediate neighbors more than the next panels, while the opposite hem stays still',()=>{
 const {cloth,chains,hit}=fixture(12,5);cloth.begin(hit);cloth.move(new Vector3(0,.1,0));
 for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}
 const angle=i=>chains[i].slice(-3,-1).reduce((sum,b)=>sum+b.quaternion.angleTo(b.quaternion.clone().identity()),0);
 assert.ok(angle(0)>angle(1));assert.ok(angle(1)>angle(2));assert.ok(angle(2)>0);assert.equal(angle(6),0);
 const neighborhood=cloth.followers.map(x=>x.chain);cloth.restore();cloth.move(new Vector3(0,100,100));cloth.update(.05);assert.deepEqual(cloth.followers.map(x=>x.chain),neighborhood);
 cloth.release();for(let i=0;i<180;i++){cloth.restore();cloth.update(1/60);}cloth.restore();for(let i=0;i<12;i++)assert.ok(angle(i)<1e-6);
});

test('nearby coat panels, separate garment roots and physically distant chains are excluded',()=>{
 const f=fixture(12,4);for(const chain of f.chains.slice(1,3))for(const bone of chain)bone.name=bone.name.replace('スカート','coat');
 const otherRoot=new Group();f.scene.add(otherRoot);otherRoot.attach(f.chains[11][0]);
 f.chains[10][0].position.x+=10;f.scene.updateMatrixWorld(true);f.cloth.begin(f.hit);
 for(const i of [1,2,10,11])assert.ok(!f.cloth.followers.some(x=>x.chain===f.cloth.chains[i]));
});

test('a single chain still drags and branch bones are restored exactly once',()=>{
 const single=fixture(1,4);assert.ok(single.cloth.begin(single.hit));single.cloth.move(new Vector3(0,.1,0));single.cloth.update(.05);assert.equal(single.cloth.followers.length,1);single.cloth.reset();
 const f=fixture(2,4);const branch=new Group();branch.isBone=true;branch.name='スカートbranch';branch.position.set(.03,-.1,0);f.chains[0][1].add(branch);
 const cloth=new ClothDrag(f.cloth.vrm,Vector3);assert.ok(cloth.begin(f.hit));const baselines=new Map();f.scene.traverse(b=>baselines.set(b,b.quaternion.clone()));cloth.move(new Vector3(0,.1,0));cloth.update(.05);
 assert.equal(new Set(cloth.applied.map(x=>x[0])).size,cloth.applied.length);cloth.reset();for(const [b,q]of baselines)assert.ok(b.quaternion.angleTo(q)<1e-6);
});

test('bending spans the full column, with a stable attachment and increasing rotation toward the hem',()=>{
 for(const segments of [3,5,8]){
  const {cloth,chains,hit}=fixture(12,segments),chain=chains[0],positions=chain.map(b=>b.position.clone());
  cloth.begin(hit);cloth.move(new Vector3(.015,0,.01));for(let i=0;i<45;i++){cloth.restore();cloth.update(1/60);}
  const angles=chain.slice(0,-1).map(b=>b.quaternion.angleTo(b.quaternion.clone().identity()));
  assert.ok(angles[0]>1e-5);assert.ok(angles.at(-1)>angles[0]*1.5);
  for(let i=1;i<angles.length;i++)assert.ok(angles[i]>angles[i-1],`Expected a progressive bend: ${angles}`);
  for(let i=0;i<chain.length;i++)assert.ok(chain[i].position.distanceTo(positions[i])<1e-12,'Bone translations and link lengths stay intact');
  const picked=cloth.followers[0];assert.ok(Math.abs(picked.links.reduce((sum,l)=>sum+l.share,0)-1)<1e-10);
  cloth.release();for(let i=0;i<180;i++){cloth.restore();cloth.update(1/60);}cloth.restore();
  for(const b of chains.flat())assert.ok(b.quaternion.angleTo(b.quaternion.clone().identity())<1e-6);
 }
});

test('short helper links and zero-length tips do not receive excessive rotations',()=>{
 const {cloth,chains,hit,scene}=fixture(8,6),chain=chains[0];chain[2].position.y=-.00000001;chain.at(-1).position.set(0,0,0);scene.updateMatrixWorld(true);hit.point=chain.at(-1).getWorldPosition(new Vector3());
 cloth.begin(hit);cloth.move(new Vector3(.02,0,.01));cloth.update(.05);
 const a=chain[1].quaternion.angleTo(chain[1].quaternion.clone().identity());assert.ok(a<.000001);
 assert.ok(!cloth.applied.some(([bone])=>bone===chain.at(-2)),'Zero length terminal link is skipped');
 for(const [bone]of cloth.applied)for(const key of ['x','y','z','w'])assert.ok(Number.isFinite(bone.quaternion[key]));cloth.reset();
});
