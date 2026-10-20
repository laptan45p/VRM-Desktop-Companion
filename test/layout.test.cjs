const {test}=require('node:test'),assert=require('node:assert/strict');
const {TOP,BOTTOM,mascotBounds,fitDistance}=require('../src/layout.cjs');
const {Vector3,PerspectiveCamera}=require('./bundle-runtime.cjs');
test('maximum size reaches 10.0 without fitting to the monitor',()=>{
 const area={x:0,y:0,width:1280,height:680};
 const a=mascotBounds(1.8,area),b=mascotBounds(10.0,area);
 assert.equal(b.width,4400);assert.equal(b.height,5196);
 assert.ok(b.width>area.width&&b.height>area.height);
 assert.equal(b.y+b.height,area.y+area.height);
 const next=mascotBounds(10.0,area,{x:-4000,y:-2000,width:800,height:900});
 assert.equal(next.x+next.width/2,-3600);assert.equal(next.y+next.height,-1100);
});
test('all box corners remain in the camera frame at every scale and aspect, including a deep or wide model',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:0,y:0,width:1280,height:680},{x:0,y:0,width:3840,height:2080}])for(const scale of [.5,.75,1,1.25,1.8,2.7,10.0]){
  const b=mascotBounds(scale,area),aspect=b.width/(b.height-TOP-BOTTOM);
  for(const size of [{x:.8,y:1.7,z:.4},{x:3,y:1.7,z:2},{x:.3,y:3,z:.3}]){
   const camera=new PerspectiveCamera(30,aspect,.01,100);camera.position.set(0,0,fitDistance(size,30,aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
   for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){const p=new Vector3(x*size.x,y*size.y,z*size.z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`cropped at scale ${scale}: ${JSON.stringify(p)}`);assert.ok(p.z>-1&&p.z<1);}
  }
 }
});
test('off-screen placement is preserved until an explicit position reset',()=>{
 const area={x:0,y:0,width:1366,height:728},previous={x:-4000,y:-2000,width:440,height:534};
 const b=mascotBounds(1,area,previous);assert.deepEqual(b,previous);
 const reset=mascotBounds(1,area);assert.equal(reset.x+reset.width,area.width);assert.equal(reset.y+reset.height,area.height);
});
