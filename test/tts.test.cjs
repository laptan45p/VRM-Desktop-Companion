const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {synthesize,checkEmbedding,VoiceLane}=require('../src/tts.cjs'),{DEFAULTS}=require('../src/backend.cjs');
async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tts-')),speakerPath=path.join(dir,'voice.speaker.safetensors');await fs.writeFile(speakerPath,'test embedding');try{await run(speakerPath);}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function server(handler,run){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+s.address().port);}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}}
test('Irodori request uses selected embedding, caption, speed and returns WAV bytes',async()=>fixture(async speakerPath=>{
 await server(async(req,res)=>{assert.equal(req.url,'/v1/audio/speech');let body='';for await(const b of req)body+=b;const p=JSON.parse(body);assert.equal(p.input,'こんにちは');assert.equal(p.irodori.ref_embed,speakerPath);assert.equal(p.irodori.caption,'やさしく');assert.equal(p.speed,1.2);assert.equal(p.response_format,'wav');assert.equal(p.model,'irodori-tts');res.end(require('./audio-fixture.cjs')());},async endpoint=>{const b=await synthesize({...DEFAULTS,ttsEndpoint:endpoint+'/v1',speakerPath,ttsCaption:'やさしく',ttsSpeed:1.2},'こんにちは',new AbortController().signal);assert.equal(Buffer.from(b).toString('ascii',8,12),'WAVE');});
}));
test('TTS errors preserve text and reject nonlocal endpoints, invalid speaker or invalid audio',async()=>fixture(async speakerPath=>{
 await assert.rejects(checkEmbedding('/missing/voice.speaker.safetensors'));await assert.rejects(checkEmbedding(speakerPath+'.exe'));
 await assert.rejects(synthesize({...DEFAULTS,speakerPath,ttsEndpoint:'http://example.com'},'a',new AbortController().signal),/このPC/);
 for(const status of [200,503])await server((_q,r)=>{r.statusCode=status;r.end('bad response');},async endpoint=>{await assert.rejects(synthesize({...DEFAULTS,speakerPath,ttsEndpoint:endpoint},'a',new AbortController().signal),status===503?/HTTP 503/:/WAV/);});
}));
test('TTS request obeys cancellation',async()=>fixture(async speakerPath=>{
 await server(()=>{},async endpoint=>{const c=new AbortController(),p=synthesize({...DEFAULTS,speakerPath,ttsEndpoint:endpoint},'a',c.signal);setTimeout(()=>c.abort(),30);await assert.rejects(p);});
}));
test('voice lane publishes only the latest utterance and cancels stale results/failures',async()=>{
 const requests=[],published=[],failed=[],lane=new VoiceLane({generate:(_s,text,signal)=>new Promise((resolve,reject)=>requests.push({text,signal,resolve,reject})),publish:a=>published.push(a),fail:(...a)=>failed.push(a)});
 const one=lane.request(lane.cancel(),DEFAULTS,'old');const id=lane.cancel(),two=lane.request(id,DEFAULTS,'new');assert.equal(requests[0].signal.aborted,true);requests[1].resolve(new Uint8Array([1]));await two;requests[0].resolve(new Uint8Array([2]));await one;assert.deepEqual(published.map(p=>p.text),['new']);
 const third=lane.request(lane.cancel(),DEFAULTS,'cancelled');lane.cancel();requests[2].reject(new Error('stale'));await third;assert.equal(failed.length,0);const fourth=lane.request(lane.cancel(),DEFAULTS,'failed');requests[3].reject(new Error('connection'));await fourth;assert.equal(failed[0][1],'connection');
});
