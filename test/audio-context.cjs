module.exports=function(){
 const values=new Float32Array(2000);for(let i=200;i<700;i++)values[i]=.2;
 const buffer={duration:2,sampleRate:1000,length:2000,numberOfChannels:1,getChannelData:()=>values};
 const ctx={state:'running',currentTime:0,destination:{},sources:[],baseLatency:0,outputLatency:0,resume:async()=>{},decodeAudioData:async()=>buffer,createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource(){const s={buffer:null,onended:null,started:false,connect(){},disconnect(){},stop(){},start(t){this.started=true;this.startTime=t;}};ctx.sources.push(s);return s;}};return {ctx,buffer};
};
