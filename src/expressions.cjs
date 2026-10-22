(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionExpressions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MOUTHS=['aa','ih','ou','ee','oh','a','i','u','e','o'];
 const BLINKS=['blink','blinkLeft','blinkRight','blink_l','blink_r'];
 const RECIPES={
  happy:[[['happy','joy'],.5]],
  calm:[[['relaxed','fun'],.25]],
  angry:[[['angry','怒り'],.8]],
  sad:[[['sad','sorrow','困る'],.6]],
  shy:[[['blush','shy','embarrassed','赤面','チーク','happy'],.6]],
  surprised:[[['surprised','びっくり','びっくり2'],.8]],
 };
 const normalize=s=>String(s).normalize('NFKC').trim().toLowerCase();
 class FaceExpressions{
  constructor(){this.bind(null);}
  bind(vrm){this.clear();this.manager=vrm?.expressionManager||null;this.names=[...new Set((this.manager?.expressions||[]).map(e=>e.expressionName).filter(n=>typeof n==='string'&&n))];this.values=new Map();this.event=null;this.preview=null;}
  clear(){if(this.values)for(const name of this.values.keys())this.manager?.setValue(name,0);if(this.preview)this.manager?.setValue(this.preview.name,0);this.values=new Map();this.event=null;this.preview=null;}
  trigger(mood,now,duration=4){this.event=RECIPES[mood]?{mood,until:now+duration}:null;}
  show(name,weight,now){if(!name){this.preview=null;return;}if(!this.names.includes(name))throw new Error('このVRMに指定の表情はありません。');if(!Number.isFinite(weight)||weight<0||weight>1)throw new Error('表情の強度が不正です。');this.preview={name,weight,until:now+5};}
  update(now,dt,{talking=false,blink=0}={}){
   const manager=this.manager;if(!manager)return;
   const targets=new Map(),preview=this.preview&&now<this.preview.until;
   if(preview){
    // Isolate previews from VRMA, mood, blinking and lip-sync for five seconds.
    for(const name of this.names)manager.setValue(name,0);
    manager.setValue(this.preview.name,this.preview.weight);
    this.values=new Map([[this.preview.name,this.preview.weight]]);return;
   }
   this.preview=null;
   if(this.event&&now<this.event.until){
    for(const [aliases,weight] of RECIPES[this.event.mood]){
     const name=aliases.map(alias=>this.names.find(n=>normalize(n)===normalize(alias))).find(Boolean);
     if(name)targets.set(name,weight);
    }
   }
   // Reduce automatic expressions during speech/blinks to avoid adding their
   // mouth/eyelid deformation to the procedural one. Unknown custom expressions
   // can contain any region, so this also applies to blush/surprise fallbacks.
   const attenuation=(talking?.3:1)*(1-Math.min(1,Math.max(0,blink)));
   const blend=1-Math.exp(-12*Math.max(0,Math.min(.1,dt)));
   for(const name of new Set([...this.values.keys(),...targets.keys()])){
    if(MOUTHS.includes(name)||BLINKS.includes(name)){
     // Returning from a preview must release procedural channels, not zero them.
     this.values.delete(name);continue;
    }
    const value=(this.values.get(name)||0)+((targets.get(name)||0)-(this.values.get(name)||0))*blend;
    manager.setValue(name,value*attenuation);
    if(value<.001&&!targets.has(name)){manager.setValue(name,0);this.values.delete(name);}else this.values.set(name,value);
   }
  }
 }
 // Keep speech timing separate from facial blending and manual previews.
 class SpeechExpressions{
  constructor(faces){this.faces=faces;this.mood='happy';this.utterance=null;}
  setMood(mood,now,duration=4){
   this.mood=mood==='calm'?'happy':mood;
   const current=this.utterance;
   if(current){
    current.mood=this.mood;
    if(current.phase==='pending')return;
    if(current.phase==='playing'){this.faces.trigger(this.mood,now,Infinity);return;}
    if(now<current.until){this.faces.trigger(this.mood,now,current.until-now);return;}
   }
   this.faces.trigger(this.mood,now,duration);
  }
  begin(id,now,{pending=false,duration=0}={}){
   this.utterance={id,mood:this.mood,phase:pending?'pending':'text',until:now+duration+.7};
   this.faces.trigger(this.mood,now,pending?0:duration+.7);
  }
  start(id,now){
   const current=this.utterance;if(!current||current.id!==id||current.phase!=='pending')return;
   current.phase='playing';this.faces.trigger(current.mood,now,Infinity);
  }
  end(id,now){
   const current=this.utterance;if(!current||current.id!==id||current.phase!=='playing')return;
   this.utterance=null;this.faces.trigger(current.mood,now,.7);
  }
  fallback(id,now,duration){
   if(this.utterance?.id!==id)return;
   this.begin(id,now,{duration});
  }
  cancel(now){this.utterance=null;this.faces.trigger(this.mood,now,0);}
 }
 return {FaceExpressions,SpeechExpressions};
});
