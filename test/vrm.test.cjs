const {test}=require('node:test');
const assert=require('node:assert/strict');
// Uses a generated, minimal VRM fixture rather than a third-party character.
const fixture=require('./fixture.cjs');
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,init){this.type=type;Object.assign(this,init);}};
test('load VRM 1.0 and VRM 0.x, update pose/expression/spring runtime and dispose',async()=>{
 const {GLTFLoader,VRMLoaderPlugin,VRMUtils}=require('./bundle-runtime.cjs');
 for(const version of ['1','0']){
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const bytes=new Uint8Array(fixture(version));
  const gltf=await loader.parseAsync(bytes.buffer,'');const vrm=gltf.userData.vrm;
  assert.ok(vrm);assert.equal(vrm.meta.metaVersion,version);assert.ok(vrm.humanoid.getNormalizedBoneNode('head'));
  VRMUtils.rotateVRM0(vrm);
  vrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation.set(0,0,1.12);
  vrm.expressionManager?.setValue('blink',.5);vrm.update(1/30);
  assert.ok(Number.isFinite(vrm.humanoid.getRawBoneNode('head').matrixWorld.elements[0]));
  VRMUtils.deepDispose(vrm.scene);
 }
});
