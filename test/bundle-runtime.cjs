// Exercise the actual shipped, prebuilt Three.js/VRM runtime without a GPU.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/renderer.js'),'utf8');
const boundary=source.lastIndexOf('// src/renderer.js');
if(boundary<0)throw new Error('Renderer bundle marker missing');
const context={ArrayBuffer,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,DataView,console,TextDecoder,TextEncoder,URL,Blob,Request,Response,Headers,fetch,AbortSignal,AbortController,performance,setTimeout,clearTimeout,ProgressEvent:class{constructor(type,init){this.type=type;Object.assign(this,init);}}};
vm.runInNewContext(source.slice(0,boundary)+'globalThis.testRuntime={SkinnedMesh,Skeleton,BufferGeometry,BufferAttribute,VRMSpringBoneJoint,VRMSpringBoneManager,Box3,Vector3,PerspectiveCamera,Vector2,Ray,Group,Scene,Mesh,MeshStandardMaterial,CapsuleGeometry,SphereGeometry,HemisphereLight,DirectionalLight,Clock,MathUtils,SRGBColorSpace,GLTFLoader,VRMLoaderPlugin,VRMUtils,AnimationMixer,LoopOnce,VRMAnimationLoaderPlugin,createVRMAnimationClip};})();',context);
module.exports=context.testRuntime;

