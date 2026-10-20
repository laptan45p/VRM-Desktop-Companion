const {test}=require('node:test'),assert=require('node:assert/strict');
const {Group,Vector3,Ray,SkinnedMesh,Skeleton,BufferGeometry,BufferAttribute,MeshStandardMaterial}=require('./bundle-runtime.cjs'),{MeshPicking}=require('../src/picking.cjs');
function fixture(relative=true){
 const geometry=new BufferGeometry(),position=new Float32Array([-1,-1,0,1,-1,0,0,1,0]);geometry.setAttribute('position',new BufferAttribute(position,3));geometry.setIndex([0,1,2,0,1,2]);
 geometry.setAttribute('skinIndex',new BufferAttribute(new Uint16Array(12),4));geometry.setAttribute('skinWeight',new BufferAttribute(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),4));
 geometry.morphTargetsRelative=relative;geometry.morphAttributes.position=Array.from({length:138},(_,i)=>{const a=relative?new Float32Array(9):position.slice();if(i===3)for(let j=2;j<9;j+=3)a[j]+=.2;return new BufferAttribute(a,3);});
 const mesh=new SkinnedMesh(geometry,new MeshStandardMaterial()),bone=new Group(),scene=new Group();scene.add(bone,mesh);scene.updateMatrixWorld(true);mesh.bind(new Skeleton([bone]));mesh.morphTargetInfluences[3]=.6;
 const cast={ray:new Ray(new Vector3(0,0,2),new Vector3(0,0,-1)),near:0,far:Infinity,camera:null};return {mesh,bone,scene,cast};
}
function compare(f,picking){const expected=[],actual=[],original=f.mesh.getVertexPosition;f.mesh.raycast(f.cast,expected);picking.intersect(f.scene,f.cast,actual);assert.equal(actual.length,expected.length);assert.ok(actual.length>0);for(let i=0;i<actual.length;i++)assert.ok(actual[i].point.distanceTo(expected[i].point)<1e-9);assert.equal(f.mesh.getVertexPosition,original);}
test('optimized picking matches original skinning for relative/absolute morphs and refreshes after pose/expression changes',()=>{
 for(const relative of [false,true]){const f=fixture(relative),picking=new MeshPicking(Vector3);compare(f,picking);f.mesh.morphTargetInfluences[3]=-.2;f.bone.position.x=.1;f.scene.updateMatrixWorld(true);compare(f,picking);f.mesh.geometry.dispose();f.mesh.material.dispose();}
});
test('each skinned vertex is calculated once per hit query even when shared by triangles',()=>{
 const f=fixture(),picking=new MeshPicking(Vector3),original=f.mesh.applyBoneTransform;let calls=0;f.mesh.applyBoneTransform=function(...args){calls++;return original.apply(this,args);};
 const hits=[];picking.intersect(f.scene,f.cast,hits);assert.equal(hits.length,2);assert.equal(calls,3);calls=0;picking.intersect(f.scene,f.cast,[]);assert.equal(calls,3);
});
test('picking restores original mesh methods even if raycasting fails',()=>{
 const f=fixture(),picking=new MeshPicking(Vector3),original=f.mesh.getVertexPosition;f.mesh.raycast=()=>{throw Error('test');};assert.throws(()=>picking.intersect(f.scene,f.cast,[]),/test/);assert.equal(f.mesh.getVertexPosition,original);
});
