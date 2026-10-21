(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionVrma=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class VrmaPlayer{
  constructor(THREE,random=Math.random){this.THREE=THREE;this.random=random;this.settings={motionInterval:60,randomMotion:true,greetingMotion:'VRMA_02.vrma',idleMotion:'',idleMode:'loop',idleSpeed:1,idlePose:50};this.clips=new Map();this.bag=[];this.next=Infinity;this.pending=false;this.current=null;this.background=null;this.time=0;this.pose=[];this.bindings=new WeakMap();this.samples=new Map();}
  configure(settings,now=this.time){
   const next={...this.settings,...settings};
   if(['idleMotion','idleMode','idleSpeed','idlePose'].some(k=>this.settings[k]!==next[k]))this.stopIdle();
   const changed=this.settings.motionInterval!==next.motionInterval||this.settings.randomMotion!==next.randomMotion;
   this.settings=next;if(changed)this.defer(now);
  }
  bind(vrm){this.dispose();this.vrm=vrm;this.mixer=new this.THREE.AnimationMixer(vrm.scene);this.pose=Object.values(vrm.humanoid.normalizedHumanBones).map(b=>b.node).map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone()}));}
  restorePose(){for(const p of this.pose){p.node.position.copy(p.position);p.node.quaternion.copy(p.quaternion);}}
  install(clips,now=this.time){this.interrupt(now);this.clips=clips;this.bag=[];this.pending=true;this.defer(now);}
  defer(now=this.time){this.next=now+this.settings.motionInterval;}
  greet(){this.pending=true;}
  interrupt(now=this.time){this.stop(now);this.stopIdle();this.restorePose();this.samples.clear();this.defer(now);}
  stopIdle(){
   const b=this.background;if(!b)return;b.action.stop();this.mixer.uncacheAction(b.clip);this.background=null;
   const keep=new Set(this.current?.clip.tracks.map(t=>t.name)||[]);for(const key of this.samples.keys())if(!keep.has(key))this.samples.delete(key);
  }
  stop(now=this.time){
   this.current?.action.stop();this.current=null;this.restorePose();
   if(this.background){this.background.action.setEffectiveWeight(this.background.amount);this.sample(0);}
   this.defer(now);
  }
  dispose(){this.interrupt();if(this.mixer&&this.vrm)this.mixer.uncacheRoot(this.vrm.scene);this.mixer=null;this.vrm=null;this.pose=[];this.clips=new Map();this.bag=[];this.pending=false;}
  pick(){
   if(!this.bag.length){this.bag=Array.from(this.clips.keys());for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}if(this.bag.length>1&&this.bag.at(-1)===this.last)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag.at(-1),this.bag[0]];}
   return this.bag.pop();
  }
  play(name){
   const clip=this.clips.get(name);if(!clip||!this.mixer)return false;
   this.stop();const action=this.mixer.clipAction(clip);action.reset().setLoop(this.THREE.LoopOnce,1);action.clampWhenFinished=true;action.setEffectiveWeight(0).play();
   this.current={name,clip,action,age:0,duration:clip.duration,fade:Math.min(.35,clip.duration/3)};this.last=name;return true;
  }
  sample(dt){
   // Three.js skips unchanged track values. Restore its last sample before updating,
   // then apply the result every frame so procedural idle/IK cannot erase static tracks.
   const active=new Map();
   for(const clip of [this.current?.clip,this.background?.clip].filter(Boolean)){
    let bindings=this.bindings.get(clip);
    if(!bindings){bindings=clip.tracks.map(track=>{
     const match=/^(.*)\.(quaternion|position|weight)$/.exec(track.name);if(!match)return null;
     const node=this.vrm.scene.getObjectByName(match[1])||this.vrm.scene.getObjectByProperty('uuid',match[1]);
     return node?{key:track.name,node,property:match[2]}:null;
    }).filter(Boolean);this.bindings.set(clip,bindings);}
    for(const b of bindings)active.set(b.key,b);
   }
   for(const [key,b] of active){const value=this.samples.get(key);if(value!==undefined){if(typeof value==='number')b.node[b.property]=value;else b.node[b.property].copy(value);}}
   this.mixer.update(dt);
   const samples=new Map();for(const [key,b] of active){const value=b.node[b.property];samples.set(key,typeof value==='number'?value:value.clone());}this.samples=samples;
  }
  ensureIdle(dt){
   const source=this.clips.get(this.settings.idleMotion);if(!source||!this.mixer){this.stopIdle();return;}
   if(!this.background){
    // A distinct clip/action allows the same file to serve as idle and greeting.
    const clip=source.clone(),action=this.mixer.clipAction(clip);action.reset().setLoop(this.THREE.LoopRepeat,Infinity).setEffectiveWeight(0).setEffectiveTimeScale(this.settings.idleSpeed).play();
    if(this.settings.idleMode==='pose'){action.time=clip.duration*this.settings.idlePose/100;action.paused=true;}
    this.background={clip,action,amount:0};
   }
   this.background.amount=Math.min(1,this.background.amount+Math.max(0,dt)/.35);
  }
  update(dt,now,{blocked=false,speaking=false,suspendIdle=false}={}){
   this.time=now;
   if(blocked){if(this.current)this.stop(now);this.defer(now);}
   else{
    if(this.pending&&this.clips.size){this.pending=false;this.play(this.settings.greetingMotion);}
    if(speaking)this.defer(now);
    if(!speaking&&!this.current&&this.settings.randomMotion&&this.clips.size&&now>=this.next)this.play(this.pick());
   }
   if(suspendIdle)this.stopIdle();else this.ensureIdle(dt);
   const c=this.current;let weight=0;
   if(c){c.age+=Math.max(0,dt);weight=Math.max(0,Math.min(1,c.age/c.fade,(c.duration-c.age)/c.fade));c.action.setEffectiveWeight(weight);}
   if(this.background)this.background.action.setEffectiveWeight(this.background.amount*(1-weight));
   if(c||this.background)this.sample(dt);
   if(c&&c.age>=c.duration+.05)this.stop(now);
  }
 }
 return {VrmaPlayer};
});
