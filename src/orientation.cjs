(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionOrientation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class ModelOrientation{
  constructor(Vector3,Box3){this.Vector3=Vector3;this.Box3=Box3;this.frames=new WeakMap();}
  prepare(root,pivotBone){
   if(this.frames.has(root))return;
   const original=root.quaternion.clone(),base=root.position.clone();root.quaternion.identity();root.updateMatrixWorld(true);
   const bounds=new this.Box3().setFromObject(root).applyMatrix4(root.matrixWorld.clone().invert());
   const pivot=pivotBone?root.worldToLocal(pivotBone.getWorldPosition(new this.Vector3())):bounds.getCenter(new this.Vector3());
   this.frames.set(root,{base,pivot,bounds});root.quaternion.copy(original);root.updateMatrixWorld(true);
  }
  apply(root,angles,offsetY=0){
   const frame=this.frames.get(root);if(!frame)return;
   root.rotation.set(angles.angleX*Math.PI/180,angles.angleY*Math.PI/180,angles.angleZ*Math.PI/180);
   const scaledPivot=frame.pivot.clone().multiply(root.scale);
   root.position.copy(frame.base).add(scaledPivot).sub(scaledPivot.clone().applyQuaternion(root.quaternion));root.position.y+=offsetY;root.updateMatrixWorld(true);
  }
  center(root){return root.localToWorld(this.frames.get(root).pivot.clone());}
  bounds(root){return this.frames.get(root).bounds.clone().applyMatrix4(root.matrixWorld);}
 }
 return {ModelOrientation};
});
