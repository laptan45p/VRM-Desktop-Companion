function fixture(version='1'){
 const bones=[['hips',null,[0,.9,0]],['spine','hips',[0,.3,0]],['chest','spine',[0,.2,0]],['neck','chest',[0,.15,0]],['head','neck',[0,.15,0]],['leftUpperArm','chest',[.2,.05,0]],['leftLowerArm','leftUpperArm',[.3,0,0]],['leftHand','leftLowerArm',[.25,0,0]],['rightUpperArm','chest',[-.2,.05,0]],['rightLowerArm','rightUpperArm',[-.3,0,0]],['rightHand','rightLowerArm',[-.25,0,0]],['leftUpperLeg','hips',[.1,-.1,0]],['leftLowerLeg','leftUpperLeg',[0,-.4,0]],['leftFoot','leftLowerLeg',[0,-.4,0]],['rightUpperLeg','hips',[-.1,-.1,0]],['rightLowerLeg','rightUpperLeg',[0,-.4,0]],['rightFoot','rightLowerLeg',[0,-.4,0]]];
 const nodes=bones.map(([name,,translation])=>({name,translation,children:[]}));
 bones.forEach(([,parent],i)=>{if(parent)nodes[bones.findIndex(b=>b[0]===parent)].children.push(i);});
 // Embedded triangle prism: enough to exercise embedded buffers, material and geometry loading.
 const vertices=new Float32Array([-.2,0,0,.2,0,0,0,1.8,0,-.2,0,.1,0,1.8,.1,.2,0,.1]);
 const buf=Buffer.from(vertices.buffer);
 nodes.push({mesh:0});
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,nodes.length-1]}],nodes,
 buffers:[{byteLength:buf.length,uri:'data:application/octet-stream;base64,'+buf.toString('base64')}],bufferViews:[{buffer:0,byteOffset:0,byteLength:buf.length}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-.2,0,0],max:[.2,1.8,.1]}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.5,.8,.65,1]},doubleSided:true}]};
 if(version==='1'){gltf.extensionsUsed=['VRMC_vrm'];gltf.extensions={VRMC_vrm:{specVersion:'1.0',meta:{name:'QA fixture',version:'1',authors:['Prototype QA'],licenseUrl:'https://vrm.dev/licenses/1.0/'},humanoid:{humanBones:Object.fromEntries(bones.map(([name],node)=>[name,{node}]))},expressions:{preset:{happy:{isBinary:false,morphTargetBinds:[]},blink:{isBinary:false,morphTargetBinds:[]}}}}};}
 else {gltf.extensionsUsed=['VRM'];gltf.extensions={VRM:{specVersion:'0.0',meta:{title:'QA fixture',version:'1',author:'Prototype QA',allowedUserName:'Everyone',violentUssageName:'Disallow',sexualUssageName:'Disallow',commercialUssageName:'Disallow',licenseName:'CC0'},humanoid:{humanBones:bones.map(([bone],node)=>({bone,node,useDefaultValues:true}))},firstPerson:{firstPersonBone:4,firstPersonBoneOffset:{x:0,y:0,z:0}},blendShapeMaster:{blendShapeGroups:[]},secondaryAnimation:{boneGroups:[],colliderGroups:[]},materialProperties:[{name:'fixture',shader:'VRM_USE_GLTFSHADER',renderQueue:2000,floatProperties:{},vectorProperties:{},textureProperties:{},keywordMap:{},tagMap:{}}]}};}
 return [...Buffer.from(JSON.stringify(gltf))];
}
module.exports=fixture;
