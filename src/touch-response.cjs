'use strict';
// Only the latest completed gesture may publish text. Normal conversation cancels this lane.
class TouchResponder{
 constructor({generate,publish,delay=350,setTimer=setTimeout,clearTimer=clearTimeout}){this.generate=generate;this.publish=publish;this.delay=delay;this.setTimer=setTimer;this.clearTimer=clearTimer;this.serial=0;this.timer=null;this.controller=null;}
 cancel(){this.serial++;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.controller?.abort();this.controller=null;}
 request(settings,history,reaction,fallback){
  this.cancel();const serial=this.serial;
  if(!settings.model?.trim()){this.publish(fallback,reaction);return;}
  this.timer=this.setTimer(async()=>{
   if(serial!==this.serial)return;
   this.timer=null;const controller=new AbortController();this.controller=controller;
   try{
    const text=await this.generate(settings,history,reaction,controller.signal);
    if(serial===this.serial&&!controller.signal.aborted)this.publish(text,reaction);
   }catch{
    if(serial===this.serial&&!controller.signal.aborted)this.publish(fallback,reaction);
   }finally{if(this.controller===controller)this.controller=null;}
  },this.delay);this.timer?.unref?.();
 }
}
module.exports={TouchResponder};
