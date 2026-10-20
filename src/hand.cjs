(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionHand=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class HandDrag{
  constructor(vrm,Vector3){this.vrm=vrm;this.Vector3=Vector3;this.arms=[];this.applied=[];this.arm=null;this.held=false;this.amount=0;this.moved=false;
   for(const side of ['left','right']){
    const h=vrm.humanoid,upper=h?.getNormalizedBoneNode(side+'UpperArm'),lower=h?.getNormalizedBoneNode(side+'LowerArm'),hand=h?.getNormalizedBoneNode(side+'Hand'),raw=h?.getRawBoneNode(side+'Hand');
    if(!upper||!lower||!hand||!raw)continue;const bones=new Set();raw.traverse(b=>bones.add(b));const wrist=h.getRawBoneNode(side+'LowerArm');if(wrist)bones.add(wrist);this.arms.push({side,upper,lower,hand,raw,bones});
   }
  }
  position(b){return b.getWorldPosition(new this.Vector3());}
  pick(hit){
   const mesh=hit?.object,index=mesh?.geometry?.attributes?.skinIndex,weight=mesh?.geometry?.attributes?.skinWeight;if(!mesh?.isSkinnedMesh||!index||!weight||!hit.face)return null;
   this.vrm.scene.updateMatrixWorld(true);let best=null,distance=Infinity;
   for(const arm of this.arms){
    const length=this.position(arm.upper).distanceTo(this.position(arm.lower))+this.position(arm.lower).distanceTo(this.position(arm.hand));if(length<1e-6)continue;
    const d=this.position(arm.raw).distanceTo(hit.point);if(d>length*.26||d>=distance)continue;
    let influence=0;for(const v of [hit.face.a,hit.face.b,hit.face.c]){let sum=0;for(const a of ['X','Y','Z','W'])if(arm.bones.has(mesh.skeleton.bones[index['get'+a](v)]))sum+=weight['get'+a](v);influence=Math.max(influence,sum);}
    if(influence>=.25){best=arm;distance=d;}
   }
   return best;
  }
  begin(hit){const arm=this.pick(hit);if(!arm)return false;this.reset();this.arm=arm;this.held=true;this.start=this.position(arm.hand);this.target=this.start.clone();
   const s=this.position(arm.upper),e=this.position(arm.lower),h=this.position(arm.hand),axis=h.clone().sub(s).normalize();this.a=s.distanceTo(e);this.b=e.distanceTo(h);
   this.pole=e.clone().sub(s);this.pole.addScaledVector(axis,-this.pole.dot(axis));
   if(this.pole.length()< (this.a+this.b)*.02){this.pole.set(0,0,-1).transformDirection(this.vrm.scene.matrixWorld);this.pole.addScaledVector(axis,-this.pole.dot(axis));}
   if(this.pole.length()<1e-6)this.pole.set(arm.side==='left'?1:-1,0,0);this.pole.normalize();this.lastPole=this.pole.clone();return true;
  }
  move(delta){if(!this.held)return;this.target.copy(this.start).add(delta);this.moved=true;}
  release(){this.held=false;if(!this.moved)this.arm=null;}
  restore(){const changed=this.applied.length;for(const [bone,q]of this.applied){bone.quaternion.copy(q);bone.updateMatrix();}this.applied=[];if(changed)this.vrm.scene.updateMatrixWorld(true);}
  reset(){this.restore();this.arm=null;this.held=false;this.amount=0;this.moved=false;}
  align(bone,from,to,amount){
   if(from.length()<1e-8||to.length()<1e-8)return;
   const world=bone.getWorldQuaternion(bone.quaternion.clone()),turn=bone.quaternion.clone().setFromUnitVectors(from.normalize(),to.normalize());const desired=turn.multiply(world);
   if(bone.parent)desired.premultiply(bone.parent.getWorldQuaternion(bone.quaternion.clone()).invert());bone.quaternion.slerp(desired,amount);bone.updateMatrix();bone.updateMatrixWorld(true);
  }
  update(dt){
   if(!this.arm||!this.moved)return;
   this.amount+=((this.held?1:0)-this.amount)*(1-Math.exp(-(this.held?18:9)*Math.max(0,Math.min(.1,dt))));if(!this.held&&this.amount<.001){this.reset();return;}
   this.vrm.scene.updateMatrixWorld(true);const {upper,lower,hand}=this.arm,s=this.position(upper),e=this.position(lower),h=this.position(hand),direction=this.target.clone().sub(s);
   const total=this.a+this.b,min=Math.max(Math.abs(this.a-this.b)+total*.01,total*.05),d=Math.max(min,Math.min(total*.985,direction.length()));
   if(direction.length()<1e-8)direction.copy(h).sub(s);direction.normalize();
   const pole=this.pole.clone().addScaledVector(direction,-this.pole.dot(direction));if(pole.length()<1e-5){pole.set(0,1,0).addScaledVector(direction,-direction.y);if(pole.length()<1e-5)pole.set(1,0,0).addScaledVector(direction,-direction.x);}pole.normalize();if(this.lastPole&&pole.dot(this.lastPole)<0)pole.negate();this.lastPole=pole.clone();
   const along=(this.a*this.a-this.b*this.b+d*d)/(2*d),bend=Math.sqrt(Math.max(0,this.a*this.a-along*along)),elbow=s.clone().addScaledVector(direction,along).addScaledVector(pole,bend),target=s.clone().addScaledVector(direction,d);
   this.applied.push([upper,upper.quaternion.clone()],[lower,lower.quaternion.clone()]);this.align(upper,e.clone().sub(s),elbow.clone().sub(s),this.amount);
   const newElbow=this.position(lower),newHand=this.position(hand);this.align(lower,newHand.sub(newElbow),target.sub(newElbow),this.amount);
   this.vrm.scene.updateMatrixWorld(true);
  }
 }
 return {HandDrag};
});
