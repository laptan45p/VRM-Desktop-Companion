const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const T=require('./bundle-runtime.cjs'),{VrmaPlayer}=require('../src/vrma-player.cjs'),files=require('../src/vrma-files.cjs');
async function setup(version='1'){
 const loader=new T.GLTFLoader();loader.register(p=>new T.VRMLoaderPlugin(p));const vrm=(await loader.parseAsync(new Uint8Array(require('./fixture.cjs')(version)).buffer,'')).userData.vrm;
 const a=new T.GLTFLoader();a.register(p=>new T.VRMAnimationLoaderPlugin(p));const bytes=require('./vrma-fixture.cjs')();const anim=(await a.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).userData.vrmAnimations[0];
 return {vrm,clip:T.createVRMAnimationClip(anim,vrm)};
}
test('VRMA applies actual bone animation to VRM 0 and 1 and restores every joint',async()=>{
 for(const v of ['0','1']){const {vrm,clip}=await setup(v),p=new VrmaPlayer(T);p.bind(vrm);const arm=vrm.humanoid.getNormalizedBoneNode('leftUpperArm'),before=arm.quaternion.clone(),hip=vrm.humanoid.getNormalizedBoneNode('hips'),base=hip.position.clone();p.install(new Map([['VRMA_02.vrma',clip]]));
 for(let i=0;i<10;i++){p.restorePose();p.update(.05,i*.05);vrm.update(.05);}assert.ok(arm.quaternion.angleTo(before)>.1);assert.ok(hip.position.y<base.y);
 for(let i=10;i<25;i++){p.restorePose();p.update(.05,i*.05);vrm.update(.05);}assert.equal(p.current,null);assert.ok(arm.quaternion.angleTo(before)<1e-7);assert.ok(hip.position.distanceTo(base)<1e-7);p.dispose();}
});
test('startup/click greetings take priority; random bag visits all seven and waits after completion',async()=>{
 const {vrm,clip}=await setup(),p=new VrmaPlayer(T,()=>.4);p.bind(vrm);p.configure({motionInterval:10,randomMotion:true,greetingMotion:'2'});p.install(new Map(Array.from({length:7},(_,i)=>[String(i+1),clip.clone()])));p.update(.05,0);assert.equal(p.current.name,'2');
 p.update(1.1,1.1);assert.equal(p.current,null);p.update(.05,11);assert.equal(p.current,null);p.update(.05,11.2);assert.ok(p.current);
 p.greet();p.update(.05,11.3);assert.equal(p.current.name,'2');p.interrupt(12);p.pending=false;
 const seen=[];for(let i=0;i<7;i++){const now=22+i*12;p.update(.05,now);seen.push(p.current.name);p.update(1.1,now+1.1);}assert.equal(new Set(seen).size,7);
});
test('interaction, hidden window and conversation defer playback without catch-up bursts',async()=>{
 const {vrm,clip}=await setup(),p=new VrmaPlayer(T);p.bind(vrm);p.configure({motionInterval:10,randomMotion:true,greetingMotion:'g'});p.install(new Map([['g',clip]]));p.update(.05,0,{blocked:true});assert.equal(p.current,null);p.update(.05,1);assert.equal(p.current.name,'g');p.update(.05,2,{blocked:true});assert.equal(p.current,null);p.update(.05,100,{blocked:true});p.update(.05,101);assert.equal(p.current,null);p.update(.05,120,{speaking:true});assert.equal(p.current,null);p.update(.05,121);assert.equal(p.current,null);p.configure({randomMotion:false,motionInterval:10},122);p.update(.05,200);assert.equal(p.current,null);p.greet();p.update(.05,201);assert.equal(p.current.name,'g');
});
test('motion folder scanning, GLB validation and selection reject unregistered/external data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vrma-'));try{const dir=path.join(root,'vrma');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'VRMA_02.vrma'),require('./vrma-fixture.cjs')());await fs.writeFile(path.join(dir,'other.txt'),'hello');assert.equal(await files.findFolder(root),dir);assert.deepEqual(await files.catalog(dir),['VRMA_02.vrma']);assert.ok((await files.readMotion(dir,'VRMA_02.vrma')).length>0);await assert.rejects(files.readMotion(dir,'../other.vrma'));assert.throws(()=>files.validate(Buffer.from('not glb')));
 const b=require('./vrma-fixture.cjs')(),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n).toString());g.buffers[0].uri='file:///test';let j=Buffer.from(JSON.stringify(g));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const h=Buffer.from(b.subarray(0,20));h.writeUInt32LE(j.length+20,8);h.writeUInt32LE(j.length,12);assert.throws(()=>files.validate(Buffer.concat([h,j])),/外部/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('suspending automatic motion leaves the existing idle pose free to animate',async()=>{
 const {vrm}=await setup(),p=new VrmaPlayer(T);p.bind(vrm);const head=vrm.humanoid.getNormalizedBoneNode('head');head.rotation.x=.12;p.update(.05,1,{blocked:true});assert.ok(Math.abs(head.rotation.x-.12)<1e-8);head.rotation.x=.16;p.update(.05,2,{blocked:true});assert.ok(Math.abs(head.rotation.x-.16)<1e-8);
});
