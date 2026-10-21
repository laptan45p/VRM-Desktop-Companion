(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionVrma=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class VrmaPlayer{
  constructor(THREE,random=Math.random){this.THREE=THREE;this.random=random;this.settings={motionInterval:60,randomMotion:true,greetingMotion:'VRMA_02.vrma'};this.clips=new Map();this.bag=[];this.next=Infinity;this.pending=false;this.current=null;this.time=0;this.pose=[];}
  configure(settings,now=this.time){const changed=this.settings.motionInterval!==settings.motionInterval||this.settings.randomMotion!==settings.randomMotion;this.settings={...this.settings,...settings};if(changed)this.defer(now);}
  bind(vrm){this.dispose();this.vrm=vrm;this.mixer=new this.THREE.AnimationMixer(vrm.scene);this.pose=Object.values(vrm.humanoid.normalizedHumanBones).map(b=>b.node).map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone()}));}
  restorePose(){for(const p of this.pose){p.node.position.copy(p.position);p.node.quaternion.copy(p.quaternion);}}
  install(clips,now=this.time){this.stop(now);this.clips=clips;this.bag=[];this.pending=true;this.defer(now);}
  defer(now=this.time){this.next=now+this.settings.motionInterval;}
  greet(){this.pending=true;}
  interrupt(now=this.time){this.stop(now);this.defer(now);}
  stop(now=this.time){this.mixer?.stopAllAction();this.current=null;this.restorePose();this.defer(now);}
  dispose(){this.stop();if(this.mixer&&this.vrm)this.mixer.uncacheRoot(this.vrm.scene);this.mixer=null;this.vrm=null;this.pose=[];this.clips=new Map();this.bag=[];this.pending=false;}
  pick(){
   if(!this.bag.length){this.bag=Array.from(this.clips.keys());for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}if(this.bag.length>1&&this.bag.at(-1)===this.last)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag.at(-1),this.bag[0]];}
   return this.bag.pop();
  }
  play(name){
   const clip=this.clips.get(name);if(!clip||!this.mixer)return false;
   this.stop();const action=this.mixer.clipAction(clip);action.reset().setLoop(this.THREE.LoopOnce,1);action.clampWhenFinished=true;action.setEffectiveWeight(1).fadeIn(Math.min(.35,clip.duration/3)).play();
   this.current={name,action,age:0,duration:clip.duration,fade:Math.min(.35,clip.duration/3),fading:false};this.last=name;return true;
  }
  update(dt,now,{blocked=false,speaking=false}={}){
   this.time=now;
   if(blocked){if(this.current)this.stop(now);this.defer(now);return;}
   if(speaking&&!this.pending&&!this.current){this.defer(now);return;}
   if(this.pending&&this.clips.size){this.pending=false;this.play(this.settings.greetingMotion);}
   if(!this.current&&this.settings.randomMotion&&this.clips.size&&now>=this.next)this.play(this.pick());
   const c=this.current;if(!c)return;
   c.age+=Math.max(0,dt);
   if(!c.fading&&c.age>=c.duration-c.fade){c.fading=true;c.action.fadeOut(c.fade);}
   this.mixer.update(dt);
   if(c.age>=c.duration+.05)this.stop(now);
  }
 }
 return {VrmaPlayer};
});
