(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionInteraction=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const unit=a=>{const d=Math.hypot(a.x,a.y,a.z);return d>1e-6?{x:a.x/d,y:a.y/d,z:a.z/d}:null;};
 // Anatomical axes follow the shoulders, so rear-only regions also rotate with the avatar.
 function classifyPoint(point,joints,scale=1){
  const {head,hips,leftUpperArm:left,rightUpperArm:right}=joints;if(!head||!hips||!left||!right)return null;
  const up=unit(sub(head,hips));if(!up)return null;
  const across=sub(left,right),along=dot(across,up),side=unit({x:across.x-up.x*along,y:across.y-up.y*along,z:across.z-up.z*along});if(!side)return null;
  const front={x:side.y*up.z-side.z*up.y,y:side.z*up.x-side.x*up.z,z:side.x*up.y-side.y*up.x};
  const feet=[joints.leftFoot,joints.rightFoot].filter(Boolean),height=feet.length?Math.max(...feet.map(f=>dot(sub(head,f),up)))*1.08:Math.hypot(...Object.values(sub(head,hips)))/.43;
  if(!(height>1e-5))return null;const s=Math.max(.75,Math.min(1.4,Number(scale)||1));
  function local(origin){const v=sub(point,origin);return {x:dot(v,side)/height,y:dot(v,up)/height,z:dot(v,front)/height};}
  const h=local(head);if(Math.abs(h.x)<.13*s&&h.y>-.025*s&&h.y<.16*s&&Math.abs(h.z)<.16*s)return 'head';
  const c=joints.chest&&local(joints.chest);if(c&&Math.abs(c.x)<.12*s&&Math.abs(c.y-.025)<.07*s&&c.z>.012&&c.z<.18*s)return 'chest';
  const b=local(hips);if(Math.abs(b.x)<.13*s&&b.y>-.105*s&&b.y<.015*s&&b.z<-.018&&b.z>-.18*s)return 'butt';
  return null;
 }
 function gestureKind(distance,duration){if(!Number.isFinite(distance)||!Number.isFinite(duration)||duration<0)return null;if(distance>=18&&duration>=80)return 'stroke';if(distance<=8&&duration<=650)return 'poke';return null;}
 class ReactionCounter{
  constructor(){this.reset();}
  reset(){this.count=0;this.last=-Infinity;}
  perform(region,gesture,now){
   if(!['head','chest','butt','cloth'].includes(region)||!['stroke','poke'].includes(gesture)||!Number.isFinite(now))return null;
   if(region==='cloth'){this.reset();return {emotion:'surprised',region,gesture,count:0};}
   if(region==='head'){this.reset();return {emotion:gesture==='stroke'?'shy':'surprised',region,gesture,count:0};}
   this.count=now>=this.last&&now-this.last<=10000?this.count+1:1;this.last=now;
   return {emotion:this.count>=3?'angry':'shy',region,gesture,count:this.count};
  }
 }
 return {classifyPoint,gestureKind,ReactionCounter};
});
