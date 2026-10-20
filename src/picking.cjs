(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionPicking=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class MeshPicking{
  constructor(Vector3){this.Vector3=Vector3;this.entries=new WeakMap();}
  intersect(root,cast,hits){root.traverseVisible(mesh=>{if(mesh.isMesh)this.intersectMesh(mesh,cast,hits);});}
  intersectMesh(mesh,cast,hits){
   const geometry=mesh.geometry,position=geometry?.attributes?.position;
   if(!mesh.isSkinnedMesh||!position){mesh.raycast(cast,hits);return;}
   let entry=this.entries.get(mesh);
   if(!entry||entry.geometry!==geometry||entry.count!==position.count){
    entry={geometry,count:position.count,positions:new Float64Array(position.count*3),stamps:new Uint32Array(position.count),serial:0,base:new this.Vector3(),morph:new this.Vector3()};this.entries.set(mesh,entry);
   }
   entry.serial=(entry.serial+1)>>>0;if(entry.serial===0){entry.stamps.fill(0);entry.serial=1;}
   const morphs=geometry.morphAttributes.position||[],active=[];
   for(let i=0;i<morphs.length;i++){const weight=mesh.morphTargetInfluences?.[i]||0;if(weight!==0)active.push([morphs[i],weight]);}
   const own=Object.prototype.hasOwnProperty.call(mesh,'getVertexPosition'),original=mesh.getVertexPosition;
   // Cache each deformed vertex once per raycast, and skip the often hundreds of inactive morphs.
   mesh.getVertexPosition=(index,target)=>{
    const offset=index*3;
    if(entry.stamps[index]===entry.serial)return target.fromArray(entry.positions,offset);
    target.fromBufferAttribute(position,index);entry.base.copy(target);
    for(const [attribute,weight]of active){entry.morph.fromBufferAttribute(attribute,index);if(!geometry.morphTargetsRelative)entry.morph.sub(entry.base);target.addScaledVector(entry.morph,weight);}
    mesh.applyBoneTransform(index,target);target.toArray(entry.positions,offset);entry.stamps[index]=entry.serial;return target;
   };
   try{mesh.raycast(cast,hits);}finally{if(own)mesh.getVertexPosition=original;else delete mesh.getVertexPosition;}
  }
 }
 return {MeshPicking};
});
