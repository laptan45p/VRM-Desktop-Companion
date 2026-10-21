const {test}=require('node:test'),assert=require('node:assert/strict'),{SpeechAudio}=require('../src/speech-audio.cjs');
const fixture=require('./audio-context.cjs');
test('audio RMS follows playback clock, silence and volume, and closes on end',async()=>{
 const {ctx}=fixture(),states=[],a=new SpeechAudio(()=>ctx,(...s)=>states.push(s));await a.play({id:2,data:new Uint8Array([1]),volume:.4});assert.equal(ctx.sources[0].started,true);assert.equal(a.gain.gain.value,.4);assert.equal(a.sample().level,0);ctx.currentTime=.34;assert.ok(Math.abs(a.sample().level-.2)<1e-6);assert.ok(Math.abs(a.sample().progress-.15)<1e-6);ctx.currentTime=1.5;assert.equal(a.sample().level,0);
 ctx.getOutputTimestamp=()=>({contextTime:.34});assert.ok(a.sample().level>.19);ctx.sources[0].onended();assert.equal(a.active(),false);assert.equal(a.sample(),null);assert.deepEqual(states,[[2,'start'],[2,'ended']]);
});
test('cancelled decode never starts stale audio; playback failure reports without starting',async()=>{
 const {ctx,buffer}=fixture(),states=[],pending=[];ctx.decodeAudioData=()=>new Promise(resolve=>pending.push(resolve));const a=new SpeechAudio(()=>ctx,(...s)=>states.push(s));const p=a.play({id:1,data:[1]});await new Promise(r=>setImmediate(r));a.stop();pending[0](buffer);await p;assert.equal(ctx.sources.length,0);assert.equal(states.length,0);
 ctx.decodeAudioData=async()=>{throw new Error('bad wav');};await a.play({id:2,data:[1]});assert.deepEqual(states,[[2,'error','bad wav']]);assert.equal(a.active(),false);
});
