(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MOUTHS=['aa','ih','ou','ee','oh'];
 const KANA=['あかがさざただなはばぱまやらわぁゃ','いきぎしじちぢにひびぴみりゐぃ','うくぐすずつづぬふぶぷむゆるぅゅゔ','えけげせぜてでねへべぺめれゑぇ','おこごそぞとどのほぼぽもよろをぉょ'];
 function planSpeech(text){
  const chars=Array.from(String(text||'')).slice(0,500),segments=[];let total=0,last='aa';
  chars.forEach((raw,index)=>{
   const code=raw.charCodeAt(0),char=code>=0x30a1&&code<=0x30f6?String.fromCharCode(code-0x60):raw.toLowerCase();
   const pause=/[\s、。，,.!?！？「」『』…:：;；]/.test(char)||char==='ん'||char==='っ';
   let vowel=null;
   if(!pause){const kana=KANA.findIndex(group=>group.includes(char)),latin='aiueo'.indexOf(char);vowel=char==='ー'?last:kana>=0?MOUTHS[kana]:latin>=0?MOUTHS[latin]:MOUTHS[[0,1,0,4,2,3][index%6]];last=vowel;}
   const duration=pause?.19:.085+(index%3)*.009;
   segments.push({start:total,end:total+duration,vowel});total+=duration;
  });
  if(!total)return {segments:[],duration:0};
  const duration=Math.max(1.8,Math.min(28,total)),factor=duration/total;
  return {segments:segments.map(s=>({...s,start:s.start*factor,end:s.end*factor})),duration};
 }
 class LipMotion{
  constructor(){this.values=Object.fromEntries(MOUTHS.map(k=>[k,0]));this.stop();}
  play(text,now){this.plan=planSpeech(text);this.start=now;}
  stop(){this.plan={segments:[],duration:0};this.start=-Infinity;}
  active(now){return now>=this.start&&now<this.start+this.plan.duration;}
  update(vrm,now,dt,enabled=true,audio=null){
   if(!enabled)this.stop();const manager=vrm?.expressionManager,available=MOUTHS.filter(k=>manager?.getExpression(k));
   const t=audio?.active?audio.progress*this.plan.duration:now-this.start,s=enabled&&(audio?.active||this.active(now))?this.plan.segments.find(s=>t>=s.start&&t<s.end):null;
   const targets=Object.fromEntries(MOUTHS.map(k=>[k,0]));
   if((audio?.active||s?.vowel)&&available.length){const key=available.includes(s?.vowel)?s.vowel:available[0],phase=s?(t-s.start)/(s.end-s.start):0;targets[key]=audio?.active?Math.min(.95,Math.max(0,(audio.level-.006)*7)):Math.pow(Math.max(0,Math.sin(Math.PI*phase)),.7)*.8;}
   const blend=1-Math.exp(-26*Math.max(0,Math.min(.1,dt)));
   for(const key of MOUTHS){this.values[key]+=(targets[key]-this.values[key])*blend;if(this.values[key]<.001)this.values[key]=0;if(available.includes(key))manager.setValue(key,enabled?this.values[key]:0);}
   return !!(audio?.active||this.active(now))&&enabled;
  }
 }
 const BONES=['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftHand','rightHand'];
 function capturePose(vrm){const pose=new Map();for(const key of BONES){const b=vrm.humanoid.getNormalizedBoneNode(key);if(b)pose.set(key,{rotation:b.rotation.clone(),position:b.position.clone()});}return pose;}
 class SoftIdle{
  constructor(){this.amount=0;}
  update(vrm,pose,time,dt,{enabled=true,strength=.65,thinking=false}={}){
   const target=enabled?Math.max(0,Math.min(1,strength)):0;
   this.amount+=(target-this.amount)*(1-Math.exp(-5*Math.max(0,Math.min(.1,dt))));
   const a=this.amount,breath=Math.sin(time*1.55),sway=Math.sin(time*.36),rot=(key,x=0,y=0,z=0)=>{const b=vrm.humanoid.getNormalizedBoneNode(key);if(b){b.rotation.x+=x*a;b.rotation.y+=y*a;b.rotation.z+=z*a;}};
   for(const [key,base]of pose){const b=vrm.humanoid.getNormalizedBoneNode(key);if(b){b.rotation.copy(base.rotation);b.position.copy(base.position);}}
   rot('hips',0,Math.sin(time*.24)*.018,sway*.012);
   rot('spine',breath*.01,0,-sway*.009);rot('chest',breath*.008,0,-sway*.006);
   rot('neck',Math.sin(time*.61)*.008,Math.sin(time*.29)*.012,0);
   rot('head',Math.sin(time*.63)*.014+(thinking?.035:0),Math.sin(time*.31)*.035,.018+Math.sin(time*.43)*.026);
   for(const side of [-1,1]){const name=side===1?'left':'right';rot(name+'UpperArm',.015,side*.015,side*(.10+Math.sin(time*.58+side)*.012));rot(name+'LowerArm',.012,-side*.055,side*.025);rot(name+'Hand',Math.sin(time*.61+side)*.024,0,side*(.025+Math.sin(time*.57+side*.9)*.018));}
   return a;
  }
 }
 class ReactionMotion{
  constructor(){this.start=-Infinity;this.emotion=null;this.keys=new Set();}
  trigger(emotion,now,{delay=0}={}){if(['shy','surprised','angry'].includes(emotion)){this.emotion=emotion;this.start=now+(Number.isFinite(delay)?Math.max(0,Math.min(1,delay)):0);}}
  stop(){this.emotion=null;this.start=-Infinity;}
  update(vrm,now,{expressions=true}={}){
   const manager=vrm?.expressionManager;
   for(const k of this.keys)manager?.setValue(k,0);this.keys.clear();
   const t=now-this.start,duration=this.emotion==='surprised'?2.2:3.5;
   if(t<0||t>=duration)return;
   const a=Math.min(1,t/.15,(duration-t)/.65),rot=(key,x=0,y=0,z=0)=>{const b=vrm.humanoid?.getNormalizedBoneNode(key);if(b){b.rotation.x+=x*a;b.rotation.y+=y*a;b.rotation.z+=z*a;}};
   const face=(names,value)=>{if(!expressions)return;const k=names.find(k=>manager?.getExpression(k));if(k){manager.setValue(k,value*a);this.keys.add(k);}};
   if(this.emotion==='shy'){
    face(['blush','shy','embarrassed','happy'],.6);rot('head',.12,-.09,.09);rot('chest',.025,.04);rot('leftUpperArm',.04,0,.08);rot('rightUpperArm',.04,0,-.08);
   }else if(this.emotion==='surprised'){
    face(['surprised'],.85);rot('head',-.10,0,Math.sin(t*15)*.025*Math.exp(-t*3));rot('chest',-.035);rot('leftUpperArm',-.05,0,-.08);rot('rightUpperArm',-.05,0,.08);
   }else{
    face(['angry'],.8);rot('head',.04,Math.sin(t*9)*.09,0);rot('chest',-.02);rot('leftUpperArm',-.04,0,-.08);rot('rightUpperArm',-.04,0,.08);
   }
  }
 }
 class TouchPoseBlend{
  constructor(){this.reset();}
  reset(){this.vrm=null;this.pose=[];this.start=-Infinity;this.duration=.8;}
  active(now){return !!this.vrm&&now>=this.start&&now<this.start+this.duration;}
  begin(vrm,now,duration=.8){
   this.vrm=vrm;this.start=now;this.duration=Number.isFinite(duration)?Math.max(.1,Math.min(2,duration)):.8;
   this.pose=Object.values(vrm.humanoid?.normalizedHumanBones||{}).map(b=>b.node).filter(Boolean).map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone()}));
  }
  update(vrm,now){
   if(this.vrm!==vrm||!this.active(now)){this.reset();return;}
   const t=Math.max(0,Math.min(1,(now-this.start)/this.duration)),amount=1-t*t*(3-2*t);
   for(const p of this.pose){p.node.position.lerp(p.position,amount);p.node.quaternion.slerp(p.quaternion,amount);}
  }
 }
 class ChestPoke{
  constructor(vrm,Vector3){
   this.vrm=vrm;this.Vector3=Vector3;this.active=new Map();this.applied=[];this.parts=[];
   const h=vrm.humanoid,excluded=new Set();
   for(const key of ['hips','spine','chest','upperChest','neck','head']){
    excluded.add(h?.getRawBoneNode?.(key));excluded.add(h?.getNormalizedBoneNode?.(key));
   }
   const named=b=>b?.isBone&&!excluded.has(b)&&/胸|乳|breast|bust|chest/i.test(b.name||'')&&!/ribbon|リボン|紐|ひも|飾|accessor|tie/i.test(b.name||'');
   vrm.scene.updateMatrixWorld(true);
   vrm.scene.traverse(b=>{if(!named(b))return;for(let p=b.parent;p;p=p.parent)if(named(p))return;
    const bones=new Set();b.traverse(c=>{if(c.isBone)bones.add(c);});this.parts.push({bone:b,bones});
   });
   const head=h?.getRawBoneNode?.('head'),foot=h?.getRawBoneNode?.('leftFoot');
   this.height=head&&foot?head.getWorldPosition(new Vector3()).distanceTo(foot.getWorldPosition(new Vector3()))*1.08:1.7;
   this.height=Math.max(.001,this.height);
  }
  pick(hit){
   const mesh=hit?.object,index=mesh?.geometry?.attributes?.skinIndex,weight=mesh?.geometry?.attributes?.skinWeight;
   if(!mesh?.isSkinnedMesh||!index||!weight||!hit.face||!hit.point)return null;
   this.vrm.scene.updateMatrixWorld(true);let best=null,score=-Infinity;
   for(const part of this.parts){
    let influence=0;for(const v of [hit.face.a,hit.face.b,hit.face.c]){let sum=0;for(const a of ['X','Y','Z','W'])if(part.bones.has(mesh.skeleton.bones[index['get'+a](v)]))sum+=weight['get'+a](v);influence+=sum/3;}
    const distance=part.bone.getWorldPosition(new this.Vector3()).distanceTo(hit.point);
    if(influence<.1||distance>this.height*.18)continue;
    const value=influence-distance/this.height;if(value>score){best=part;score=value;}
   }
   return best;
  }
  poke(hit,direction){
   if(!direction||![direction.x,direction.y,direction.z].every(Number.isFinite)||direction.length()<1e-8)return false;
   const part=this.pick(hit);if(!part||!part.bone.parent)return false;
   this.restore();this.vrm.scene.updateMatrixWorld(true);
   const bone=part.bone,world=bone.getWorldPosition(new this.Vector3()),inward=direction.clone().normalize();
   const offset=bone.parent.worldToLocal(world.clone().addScaledVector(inward,this.height*.018)).sub(bone.parent.worldToLocal(world.clone()));
   const contact=bone.worldToLocal(hit.point.clone()),localDirection=bone.worldToLocal(hit.point.clone().add(inward)).sub(contact).normalize();
   const axis=contact.clone().cross(localDirection);if(axis.length()>1e-8)axis.normalize();else axis.set(0,0,0);
   // Restart the bounded impulse rather than accumulating deformation on repeated taps.
   this.active.set(bone,{time:0,offset,axis});return true;
  }
  restore(){
   for(const [bone,position,quaternion]of this.applied){bone.position.copy(position);bone.quaternion.copy(quaternion);bone.updateMatrix();}
   if(this.applied.length)this.vrm.scene.updateMatrixWorld(true);this.applied=[];
  }
  reset(){this.restore();this.active.clear();}
  reactionDelay(){let delay=0;for(const impulse of this.active.values())delay=Math.max(delay,.9-impulse.time);return Math.max(0,delay);}
  update(dt){
   const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
   for(const [bone,impulse]of this.active){
    impulse.time+=step;if(impulse.time>=1.5){this.active.delete(bone);continue;}
    const response=Math.sin(impulse.time*17)*Math.exp(-4.5*impulse.time);
    this.applied.push([bone,bone.position.clone(),bone.quaternion.clone()]);
    bone.position.addScaledVector(impulse.offset,response);
    if(impulse.axis.lengthSq()>0)bone.quaternion.multiply(bone.quaternion.clone().setFromAxisAngle(impulse.axis,.22*response));
    // Spring bones may disable matrixAutoUpdate; write both transforms to the mesh matrices.
    bone.updateMatrix();bone.updateMatrixWorld(true);
   }
   if(this.applied.length)this.vrm.scene.updateMatrixWorld(true);
  }
 }
 return {LipMotion,SoftIdle,ReactionMotion,TouchPoseBlend,ChestPoke,capturePose,planSpeech,MOUTHS};
});

