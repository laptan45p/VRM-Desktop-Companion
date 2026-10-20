(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionCloth=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const isCloth=b=>b?.isBone&&/skirt|スカート/i.test(b.name||'');
 function discoverChains(scene){
  const chains=[];scene.traverse(b=>{if(!isCloth(b)||isCloth(b.parent))return;
   const walk=(node,path)=>{const children=node.children.filter(isCloth);if(!children.length){if(path.length>=2)chains.push(path);return;}for(const c of children)walk(c,[...path,c]);};walk(b,[b]);
  });return chains;
 }
 class ClothDrag{
  constructor(vrm,Vector3){
   this.vrm=vrm;this.Vector3=Vector3;this.chains=discoverChains(vrm.scene);this.applied=[];this.held=false;this.chain=null;this.delta=new Vector3();this.target=new Vector3();
   const head=vrm.humanoid?.getRawBoneNode('head'),foot=vrm.humanoid?.getRawBoneNode('leftFoot');
   vrm.scene.updateMatrixWorld(true);this.height=head&&foot?head.getWorldPosition(new Vector3()).distanceTo(foot.getWorldPosition(new Vector3()))*1.08:1.7;
   this.height=Math.max(.001,this.height);
  }
  pick(hit){
   const mesh=hit?.object,indices=mesh?.geometry?.attributes?.skinIndex,weights=mesh?.geometry?.attributes?.skinWeight;
   if(!mesh?.isSkinnedMesh||!indices||!weights||!hit.face)return null;
   let best=null,distance=this.height*.08;
   for(const chain of this.chains){
    const set=new Set(chain);let influence=0;
    for(const vertex of [hit.face.a,hit.face.b,hit.face.c]){let sum=0;for(const axis of ['X','Y','Z','W']){const bone=mesh.skeleton.bones[indices['get'+axis](vertex)];if(set.has(bone))sum+=weights['get'+axis](vertex);}influence=Math.max(influence,sum);}
    if(influence<.2)continue;
    const d=chain.at(-1).getWorldPosition(new this.Vector3()).distanceTo(hit.point);if(d<distance){distance=d;best=chain;}
   }
   return best;
  }
  begin(hit){const chain=this.pick(hit);if(!chain)return false;this.restore();this.chain=chain;this.held=true;this.target.set(0,0,0);this.delta.set(0,0,0);return true;}
  move(delta){if(!this.held)return;
   // Bound the reach and bend to keep the garment attached and avoid extreme stretching.
   this.target.copy(delta);
   // A vertical pull bends a hanging link outward instead of trying to shorten the bone.
   if(delta.y>0&&this.chain){
    const center=new this.Vector3();for(const chain of this.chains)center.add(chain[0].getWorldPosition(new this.Vector3()));center.multiplyScalar(1/this.chains.length);
    const outward=this.chain.at(-1).getWorldPosition(new this.Vector3()).sub(center);outward.y=0;if(outward.length()<1e-6)outward.set(0,0,1);
    this.target.addScaledVector(outward.normalize(),delta.y*.5);
   }
   this.target.clampLength(0,this.height*.06);
  }
  release(){this.held=false;this.target.set(0,0,0);}
  restore(){const changed=this.applied.length;for(const [bone,q]of this.applied)bone.quaternion.copy(q);this.applied=[];if(changed)this.vrm.scene.updateMatrixWorld(true);}
  reset(){this.restore();this.held=false;this.chain=null;this.delta.set(0,0,0);this.target.set(0,0,0);}
  update(dt){
   this.delta.lerp(this.target,1-Math.exp(-(this.held?18:10)*Math.max(0,Math.min(.1,dt))));
   if(!this.chain||this.delta.length()<this.height*.00001){if(!this.held)this.chain=null;return;}
   this.vrm.scene.updateMatrixWorld(true);
   // Deform only the two terminal links; restore before the next spring simulation step.
   for(let i=Math.max(0,this.chain.length-3);i<this.chain.length-1;i++){
    const bone=this.chain[i],child=this.chain[i+1],direction=child.position.clone();if(direction.length()<1e-6)continue;
    const world=bone.getWorldPosition(new this.Vector3()).add(this.delta.clone().multiplyScalar(.5));const force=bone.worldToLocal(world);
    const q=bone.quaternion.clone().setFromUnitVectors(direction.clone().normalize(),direction.clone().add(force).normalize()),identity=q.clone().identity(),angle=q.angleTo(identity);
    if(angle>.5)q.slerp(identity,1-.5/angle);
    this.applied.push([bone,bone.quaternion.clone()]);bone.quaternion.multiply(q);bone.updateMatrixWorld(true);
   }
   this.vrm.scene.updateMatrixWorld(true);
  }
 }
 return {discoverChains,ClothDrag};
});
