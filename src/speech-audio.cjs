(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.companionAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 class SpeechAudio{
  constructor(createContext,onState=()=>{}){this.createContext=createContext;this.onState=onState;this.context=null;this.serial=0;this.source=null;this.gain=null;this.buffer=null;this.id=null;}
  stop(){this.serial++;if(this.source){this.source.onended=null;try{this.source.stop();}catch{}this.source.disconnect();}this.gain?.disconnect();this.source=null;this.gain=null;this.buffer=null;this.id=null;}
  active(){return !!this.source;}
  async play({id,data,volume=1}){
   this.stop();const serial=this.serial;
   try{
    this.context??=this.createContext();const ctx=this.context;
    await ctx.resume();if(serial!==this.serial)return;
    const bytes=new Uint8Array(data),buffer=await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));if(serial!==this.serial)return;
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>300)throw new Error('音声の長さが不正か、5分を超えています。');
    if(ctx.state&&ctx.state!=='running')throw new Error('音声再生を開始できませんでした。');
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=Math.max(0,Math.min(1,volume));source.connect(gain);gain.connect(ctx.destination);
    this.source=source;this.gain=gain;this.buffer=buffer;this.id=id;this.start=ctx.currentTime+.04;
    source.onended=()=>{if(serial!==this.serial)return;this.stop();this.onState(id,'ended');};source.start(this.start);this.onState(id,'start');
   }catch(error){if(serial===this.serial){this.stop();this.onState(id,'error',error.message);}}
  }
  sample(){
   if(!this.source||!this.buffer)return null;
   const ctx=this.context,stamp=ctx.getOutputTimestamp?.(),clock=stamp?.contextTime>0?stamp.contextTime:ctx.currentTime-(ctx.baseLatency||0)-(ctx.outputLatency||0),time=clock-this.start;
   const buffer=this.buffer;if(time<0)return {active:true,progress:0,level:0};
   const center=Math.floor(time*buffer.sampleRate),radius=Math.max(1,Math.floor(buffer.sampleRate*.01)),start=Math.max(0,center-radius),end=Math.min(buffer.length,center+radius);let sum=0,count=0;
   for(let c=0;c<buffer.numberOfChannels;c++){const values=buffer.getChannelData(c);for(let i=start;i<end;i++){sum+=values[i]*values[i];count++;}}
   return {active:true,progress:Math.max(0,Math.min(1,time/buffer.duration)),level:count?Math.sqrt(sum/count):0};
  }
 }
 return {SpeechAudio};
});
