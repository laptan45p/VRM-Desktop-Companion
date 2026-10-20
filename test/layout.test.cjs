const {test}=require('node:test'),assert=require('node:assert/strict');
const {TOP,BOTTOM,mascotBounds,fitDistance}=require('../src/layout.cjs');
const {Vector3,PerspectiveCamera}=require('./bundle-runtime.cjs');
test('scales window within each monitor, preserving foot position and preventing off-screen bounds',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1280,y:100,width:1280,height:680},{x:1920,y:-200,width:2560,height:1400}]){
  let previous;let height=0;
  for(const scale of [.5,1,1.25,1.8,1,.5]){
   const b=mascotBounds(scale,area,previous);assert.ok(b.width<=area.width&&b.height<=area.height);
   assert.ok(b.x>=area.x&&b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);
   assert.equal(b.y+b.height,area.y+area.height);assert.ok(b.height>TOP+BOTTOM);
   if(scale>=1&&scale<=1.8&&previous&&height<=b.height)assert.ok(b.height>=height);
   previous=b;height=b.height;
  }
 }
 const a={x:0,y:0,width:1920,height:1040};assert.ok(mascotBounds(1.8,a).height>mascotBounds(.5,a).height);
});
test('all box corners remain in the camera frame at every scale and aspect, including a deep or wide model',()=>{
 for(const area of [{x:0,y:0,width:1920,height:1040},{x:0,y:0,width:1280,height:680},{x:0,y:0,width:3840,height:2080}])for(const scale of [.5,.75,1,1.25,1.8]){
  const b=mascotBounds(scale,area),aspect=b.width/(b.height-TOP-BOTTOM);
  for(const size of [{x:.8,y:1.7,z:.4},{x:3,y:1.7,z:2},{x:.3,y:3,z:.3}]){
   const camera=new PerspectiveCamera(30,aspect,.01,100);camera.position.set(0,0,fitDistance(size,30,aspect));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
   for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){const p=new Vector3(x*size.x,y*size.y,z*size.z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`cropped at scale ${scale}: ${JSON.stringify(p)}`);assert.ok(p.z>-1&&p.z<1);}
  }
 }
});
test('screen removal and reset recover an off-screen window to the chosen work area',()=>{
 const area={x:0,y:0,width:1366,height:728};const b=mascotBounds(1.8,area,{x:-4000,y:-2000,width:800,height:900});assert.equal(b.x,0);assert.equal(b.y,0);const reset=mascotBounds(.5,area);assert.equal(reset.x+reset.width,area.width);assert.equal(reset.y+reset.height,area.height);
});
