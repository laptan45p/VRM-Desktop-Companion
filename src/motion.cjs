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
  update(vrm,now,dt,enabled=true){
   if(!enabled)this.stop();const manager=vrm?.expressionManager,available=MOUTHS.filter(k=>manager?.getExpression(k));
   const t=now-this.start,s=enabled&&this.active(now)?this.plan.segments.find(s=>t>=s.start&&t<s.end):null;
   const targets=Object.fromEntries(MOUTHS.map(k=>[k,0]));
   if(s?.vowel&&available.length){const key=available.includes(s.vowel)?s.vowel:available[0],phase=(t-s.start)/(s.end-s.start);targets[key]=Math.pow(Math.max(0,Math.sin(Math.PI*phase)),.7)*.8;}
   const blend=1-Math.exp(-26*Math.max(0,Math.min(.1,dt)));
   for(const key of MOUTHS){this.values[key]+=(targets[key]-this.values[key])*blend;if(this.values[key]<.001)this.values[key]=0;if(available.includes(key))manager.setValue(key,enabled?this.values[key]:0);}
   return this.active(now)&&enabled;
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
  trigger(emotion,now){if(['shy','surprised','angry'].includes(emotion)){this.emotion=emotion;this.start=now;}}
  update(vrm,now){
   const manager=vrm?.expressionManager;
   for(const k of this.keys)manager?.setValue(k,0);this.keys.clear();
   const t=now-this.start,duration=this.emotion==='surprised'?2.2:3.5;
   if(t<0||t>=duration)return;
   const a=Math.min(1,t/.15,(duration-t)/.65),rot=(key,x=0,y=0,z=0)=>{const b=vrm.humanoid?.getNormalizedBoneNode(key);if(b){b.rotation.x+=x*a;b.rotation.y+=y*a;b.rotation.z+=z*a;}};
   const face=(names,value)=>{const k=names.find(k=>manager?.getExpression(k));if(k){manager.setValue(k,value*a);this.keys.add(k);}};
   if(this.emotion==='shy'){
    face(['blush','shy','embarrassed','happy'],.6);rot('head',.12,-.09,.09);rot('chest',.025,.04);rot('leftUpperArm',.04,0,.08);rot('rightUpperArm',.04,0,-.08);
   }else if(this.emotion==='surprised'){
    face(['surprised'],.85);rot('head',-.10,0,Math.sin(t*15)*.025*Math.exp(-t*3));rot('chest',-.035);rot('leftUpperArm',-.05,0,-.08);rot('rightUpperArm',-.05,0,.08);
   }else{
    face(['angry'],.8);rot('head',.04,Math.sin(t*9)*.09,0);rot('chest',-.02);rot('leftUpperArm',-.04,0,-.08);rot('rightUpperArm',-.04,0,.08);
   }
  }
 }
 return {LipMotion,SoftIdle,ReactionMotion,capturePose,planSpeech,MOUTHS};
});
