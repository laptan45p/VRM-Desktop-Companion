(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionCloth=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const isCloth=b=>b?.isBone&&/skirt|スカート|coat|コート|jacket|ジャケット/i.test(b.name||'');
 const garmentKind=b=>/skirt|スカート/i.test(b?.name||'')?'skirt':'coat';
 function discoverChains(scene){
  const chains=[];scene.traverse(b=>{if(!isCloth(b)||isCloth(b.parent))return;
   const walk=(node,path)=>{const children=node.children.filter(isCloth);if(!children.length){if(path.length>=2)chains.push(path);return;}for(const c of children)walk(c,[...path,c]);};walk(b,[b]);
  });return chains;
 }
 class ClothDrag{
  constructor(vrm,Vector3,options={}){
   this.vrm=vrm;this.Vector3=Vector3;this.chains=discoverChains(vrm.scene);this.applied=[];this.held=false;this.chain=null;this.delta=new Vector3();this.target=new Vector3();
   const head=vrm.humanoid?.getRawBoneNode('head'),foot=vrm.humanoid?.getRawBoneNode('leftFoot');
   vrm.scene.updateMatrixWorld(true);this.height=head&&foot?head.getWorldPosition(new Vector3()).distanceTo(foot.getWorldPosition(new Vector3()))*1.08:1.7;
   this.height=Math.max(.001,this.height);this.followers=[];this.groupChains=[];this.configure(options);
  }
  configure(options={}){
   const reach=Number(options.clothReach),angle=Number(options.clothAngle);
   this.reachRatio=Number.isFinite(reach)?Math.max(.02,Math.min(.5,reach)):.18;
   this.maxAngle=(Number.isFinite(angle)?Math.max(10,Math.min(120,angle)):80)*Math.PI/180;
  }
  pick(hit){
   if(!this.chains.length)return null;
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
  begin(hit){
   const chain=this.pick(hit);if(!chain)return false;this.restore();this.vrm.scene.updateMatrixWorld(true);this.chain=chain;
   // Freeze the neighborhood at grab time, so a moving hem cannot recruit other panels.
   this.groupChains=this.chains.filter(c=>c[0].parent===chain[0].parent&&garmentKind(c[0])===garmentKind(chain[0]));
   const point=chain.at(-1).getWorldPosition(new this.Vector3());
   const nearby=this.groupChains.filter(c=>c!==chain).map(c=>({chain:c,distance:c.at(-1).getWorldPosition(new this.Vector3()).distanceTo(point)})).sort((a,b)=>a.distance-b.distance);
   const spacing=nearby.find(c=>c.distance>this.height*.0001)?.distance;
   const radius=spacing?Math.min(spacing*2.5,this.height*.25):0;
   this.followers=[{chain,weight:1}];
   for(const item of nearby.filter(c=>c.distance<radius).slice(0,4)){
    const t=item.distance/radius;this.followers.push({chain:item.chain,weight:(1-t)*(1-t)*(1+2*t)});
   }
   for(const follower of this.followers){
    const lengths=follower.chain.slice(1).map((child,i)=>child.getWorldPosition(new this.Vector3()).distanceTo(follower.chain[i].getWorldPosition(new this.Vector3())));
    const total=lengths.reduce((sum,length)=>sum+length,0);let along=0;
    follower.links=lengths.map((length,i)=>{
     const t=total>0?(along+length*.5)/total:0;along+=length;
     // Use arc length rather than bone count, so short helper links do not kink the hem.
     return {bone:follower.chain[i],child:follower.chain[i+1],share:length*(.1+.9*t*t*(3-2*t))};
    });
    const sum=follower.links.reduce((value,link)=>value+link.share,0);
    for(const link of follower.links)link.share=sum>0?link.share/sum:0;
   }
   this.held=true;this.target.set(0,0,0);this.delta.set(0,0,0);return true;
  }
  move(delta){if(!this.held)return;
   // Bound the reach and bend to keep the garment attached and avoid extreme stretching.
   this.target.copy(delta);
   // A vertical pull bends a hanging link outward instead of trying to shorten the bone.
   if(delta.y>0&&this.chain){
    const center=new this.Vector3();for(const chain of this.groupChains)center.add(chain[0].getWorldPosition(new this.Vector3()));center.multiplyScalar(1/this.groupChains.length);
    const outward=this.chain.at(-1).getWorldPosition(new this.Vector3()).sub(center);outward.y=0;if(outward.length()<1e-6)outward.set(0,0,1);
    this.target.addScaledVector(outward.normalize(),delta.y*.5);
   }
   this.target.clampLength(0,this.height*this.reachRatio);
  }
  release(){this.held=false;this.target.set(0,0,0);}
  restore(){const changed=this.applied.length;for(const [bone,q]of this.applied){bone.quaternion.copy(q);bone.updateMatrix();}this.applied=[];if(changed)this.vrm.scene.updateMatrixWorld(true);}
  reset(){this.restore();this.held=false;this.chain=null;this.followers=[];this.groupChains=[];this.delta.set(0,0,0);this.target.set(0,0,0);}
  update(dt){
   this.delta.lerp(this.target,1-Math.exp(-(this.held?18:10)*Math.max(0,Math.min(.1,dt))));
   if(!this.chain||this.delta.length()<this.height*.00001){if(!this.held){this.chain=null;this.followers=[];this.groupChains=[];}return;}
   this.vrm.scene.updateMatrixWorld(true);
   // Blend neighboring panels, but apply shared branch bones only once.
   const links=new Map();
   for(const follower of this.followers)for(const {bone,child,share}of follower.links){
    const strength=follower.weight*share;
    if(strength>0&&(!links.has(bone)||links.get(bone).strength<strength))links.set(bone,{child,weight:follower.weight,strength});
   }
   for(const [bone,{child,weight,strength}]of links){
    const direction=child.position.clone();if(direction.length()<1e-6)continue;
    const world=bone.getWorldPosition(new this.Vector3()).add(this.delta.clone().multiplyScalar(strength));const force=bone.worldToLocal(world);
    const q=bone.quaternion.clone().setFromUnitVectors(direction.clone().normalize(),direction.clone().add(force).normalize()),identity=q.clone().identity(),angle=q.angleTo(identity);
    const limit=this.maxAngle*Math.min(weight,2*strength);if(angle>limit)q.slerp(identity,1-limit/angle);
    this.applied.push([bone,bone.quaternion.clone()]);bone.quaternion.multiply(q);
    // VRM spring joints disable matrixAutoUpdate; quaternion changes alone never reach the mesh.
    bone.updateMatrix();bone.updateMatrixWorld(true);
   }
   this.vrm.scene.updateMatrixWorld(true);
  }
 }
 return {discoverChains,ClothDrag};
});
