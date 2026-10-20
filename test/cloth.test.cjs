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
test('drag moves the hem in rotated/scaled models, stays bounded, and restores without disturbing other chains',()=>{
 for(const scale of [.01,1,10])for(const rotation of [0,Math.PI/2]){
  const {cloth,chains,scene,hit}=fixture(12,5,true,scale,rotation),base=chains.flat().map(b=>b.quaternion.clone());
  assert.equal(cloth.begin(hit),true);cloth.move(new Vector3(0,100*scale,20*scale));assert.ok(cloth.target.length()<=cloth.height*.060001);assert.ok(cloth.target.y>0);
  for(let i=0;i<60;i++){cloth.restore();cloth.update(1/60);}
  assert.ok(chains[0].some((b,i)=>b.quaternion.angleTo(base[i])>.01));
  for(const chain of chains.slice(1))for(const b of chain)assert.ok(b.quaternion.angleTo(base[chains.flat().indexOf(b)])<1e-6);
  for(const [bone,q]of cloth.applied)assert.ok(bone.quaternion.angleTo(q)<=.50001);
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
