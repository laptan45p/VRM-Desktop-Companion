const {test}=require('node:test'),assert=require('node:assert/strict');
const {Group,Mesh,SphereGeometry,Vector3,Box3,PerspectiveCamera}=require('./bundle-runtime.cjs');
const {ModelOrientation}=require('../src/orientation.cjs'),{rotationFromDrag,fitDistance}=require('../src/layout.cjs');
function fixture(){const root=new Group(),hips=new Group();hips.position.set(.1,1,0);root.add(hips);const head=new Mesh(new SphereGeometry(.3));head.position.set(0,1.8,0);root.add(head);root.position.set(2,-3,4);root.scale.setScalar(1.2);root.updateMatrixWorld(true);return {root,hips};}
test('XYZ rotation keeps hips fixed without cumulative pivot drift',()=>{
 const {root,hips}=fixture(),o=new ModelOrientation(Vector3,Box3),fixed=hips.getWorldPosition(new Vector3());o.prepare(root,hips);
 for(let n=0;n<20;n++)for(const [angleX,angleY,angleZ] of [[90,0,0],[0,90,0],[0,0,90],[-120,150,85]]){o.apply(root,{angleX,angleY,angleZ});assert.ok(hips.getWorldPosition(new Vector3()).distanceTo(fixed)<1e-9);}
 o.apply(root,{angleX:0,angleY:0,angleZ:0});assert.ok(root.position.distanceTo(new Vector3(2,-3,4))<1e-9);
});
test('camera keeps pivot centered and all rotated bounds visible',()=>{
 const {root,hips}=fixture(),o=new ModelOrientation(Vector3,Box3);o.prepare(root,hips);
 for(const angleX of [-90,0,90])for(const angleY of [-90,0,90])for(const angleZ of [-90,0,90]){
  o.apply(root,{angleX,angleY,angleZ});const box=o.bounds(root),center=o.center(root),size=new Vector3();for(const a of ['x','y','z'])size[a]=2*Math.max(Math.abs(box.min[a]-center[a]),Math.abs(box.max[a]-center[a]));
  const c=new PerspectiveCamera(30,.85,.01,100);c.position.copy(center).add(new Vector3(0,0,fitDistance(size,30,.85)));c.lookAt(center);c.updateMatrixWorld(true);
  const projected=center.clone().project(c);assert.ok(Math.hypot(projected.x,projected.y)<1e-9);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).project(c);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);}
 }
});
test('fallback pivot is fixed; drag axes wrap and reject invalid deltas',()=>{
 const {root}=fixture(),o=new ModelOrientation(Vector3,Box3);o.prepare(root);const fixed=o.center(root);o.apply(root,{angleX:75,angleY:30,angleZ:120});assert.ok(o.center(root).distanceTo(fixed)<1e-9);
 assert.deepEqual(rotationFromDrag({angleX:0,angleY:170,angleZ:20},50,25),{angleX:10,angleY:-170,angleZ:20});assert.deepEqual(rotationFromDrag({angleX:10,angleY:20,angleZ:170},50,100,true),{angleX:10,angleY:20,angleZ:-170});assert.equal(rotationFromDrag({},NaN,0),null);
});
