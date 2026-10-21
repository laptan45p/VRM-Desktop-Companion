// Original synthetic test data, independent of any distributed motion pack.
module.exports=function(){
 const g=JSON.parse(Buffer.from(require('./fixture.cjs')()).toString());delete g.meshes;delete g.materials;g.nodes.pop();g.scenes[0].nodes=[0];
 const bones=g.extensions.VRMC_vrm.humanoid.humanBones;g.extensions={VRMC_vrm_animation:{specVersion:'1.0',humanoid:{humanBones:bones}}};g.extensionsUsed=['VRMC_vrm_animation'];
 const values=new Float32Array([0,.5,1, 0,0,0,1, 0,0,.7071068,.7071068, 0,0,0,1, 0,.9,0, 0,.7,0, 0,.9,0]);
 g.buffers=[{byteLength:values.byteLength,uri:'data:application/octet-stream;base64,'+Buffer.from(values.buffer).toString('base64')}];
 g.bufferViews=[{buffer:0,byteOffset:0,byteLength:12},{buffer:0,byteOffset:12,byteLength:48},{buffer:0,byteOffset:60,byteLength:36}];g.accessors=[{bufferView:0,componentType:5126,type:'SCALAR',count:3,min:[0],max:[1]},{bufferView:1,componentType:5126,type:'VEC4',count:3},{bufferView:2,componentType:5126,type:'VEC3',count:3}];
 g.animations=[{samplers:[{input:0,output:1,interpolation:'LINEAR'},{input:0,output:2,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:bones.leftUpperArm.node,path:'rotation'}},{sampler:1,target:{node:bones.hips.node,path:'translation'}}]}];
 let json=Buffer.from(JSON.stringify(g));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);return Buffer.concat([header,json]);
};
