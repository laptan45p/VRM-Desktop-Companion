const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ttsBase,synthesize,checkEmbedding,VoiceLane}=require('../src/tts.cjs'),{DEFAULTS,localBase}=require('../src/backend.cjs');
async function fixture(run){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tts-')),speakerPath=path.join(dir,'voice.speaker.safetensors');await fs.writeFile(speakerPath,'test embedding');try{await run(speakerPath);}finally{await fs.rm(dir,{recursive:true,force:true});}}
async function server(handler,run){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+s.address().port);}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}}
test('Irodori request uses selected embedding, caption, speed and returns WAV bytes',async()=>fixture(async speakerPath=>{
 await server(async(req,res)=>{assert.equal(req.url,'/v1/audio/speech');let body='';for await(const b of req)body+=b;const p=JSON.parse(body);assert.equal(p.input,'こんにちは');assert.equal(p.irodori.ref_embed,speakerPath);assert.equal(p.irodori.caption,'やさしく');assert.equal(p.speed,1.2);assert.equal(p.response_format,'wav');assert.equal(p.model,'irodori-tts');res.end(require('./audio-fixture.cjs')());},async endpoint=>{const b=await synthesize({...DEFAULTS,ttsEndpoint:endpoint+'/v1',speakerPath,ttsCaption:'やさしく',ttsSpeed:1.2},'こんにちは',new AbortController().signal);assert.equal(Buffer.from(b).toString('ascii',8,12),'WAVE');});
}));
test('TTS accepts loopback and private IPv4 roots without relaxing local LLM endpoints',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]','10.0.0.1','10.255.255.254','172.16.0.1','172.31.255.254','192.168.1.101'])for(const suffix of ['','/','/v1','/v1/'])assert.equal(ttsBase('http://'+host+':8088'+suffix),'http://'+host+':8088');
 for(const endpoint of ['http://172.15.0.1:8088','http://172.32.0.1:8088','http://192.169.1.101:8088','http://8.8.8.8:8088','http://0.0.0.0:8088','http://example.com','http://192.168.1.101.example.com','https://192.168.1.101:8088','http://user:pass@192.168.1.101:8088','http://192.168.1.101:8088/?key=x','http://192.168.1.101:8088/#x','file:///voice.wav','invalid'])assert.throws(()=>ttsBase(endpoint),/TTS/);
 assert.throws(()=>ttsBase('http://192.168.1.101:8088/v1/audio/speech'),/ルートURL/);
 assert.throws(()=>localBase('http://192.168.1.101:8088'),/このPC/);
});
test('saved LAN URL reaches the TTS request and voice lane publishes its WAV',async t=>fixture(async speakerPath=>{
 const endpoint='http://192.168.1.101:8088/',published=[],failed=[],requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url,options});return new Response(require('./audio-fixture.cjs')(),{headers:{'Content-Type':'audio/wav'}});});
 const lane=new VoiceLane({publish:p=>published.push(p),fail:(...args)=>failed.push(args)});
 await lane.request(lane.cancel(),{...DEFAULTS,ttsEndpoint:endpoint,speakerPath},'音声の確認です。');
 assert.equal(requests.length,1);assert.equal(requests[0].url,'http://192.168.1.101:8088/v1/audio/speech');assert.equal(requests[0].options.redirect,'error');const body=JSON.parse(requests[0].options.body);assert.equal(body.input,'音声の確認です。');assert.equal(body.voice,'voice');assert.equal('ref_embed' in body.irodori,false);assert.equal(JSON.stringify(body).includes(speakerPath),false);assert.equal(failed.length,0);assert.equal(published.length,1);assert.equal(Buffer.from(published[0].data).toString('ascii',8,12),'WAVE');
}));
test('LAN speech resolves Japanese Windows embedding names from a different server drive',async t=>{
 const speakerPath='F:\\client-voices\\日本語（テスト）\\テスト音声 話者A_0003000.speaker.safetensors',voiceId='テスト音声 話者A_0003000';
 // Model the server registry scanning D:\\server\\voices, without access to the client F: path.
 const registry=new Map([[voiceId,{ref_embed:'D:\\server\\voices\\'+voiceId+'.speaker.safetensors'}]]),requests=[];
 t.mock.method(fs,'stat',async file=>{assert.equal(file,speakerPath);return {isFile:()=>true,size:100};});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(body.irodori.ref_embed||!registry.has(body.voice))return new Response('No such file or directory',{status:400});return new Response(require('./audio-fixture.cjs')());});
 for(const ttsEndpoint of ['http://192.168.1.101:8088/','http://10.1.2.3:8088/v1','http://172.16.1.2:8088']){
  const audio=await synthesize({...DEFAULTS,ttsEndpoint,speakerPath},'こんにちは',new AbortController().signal);assert.equal(Buffer.from(audio).toString('ascii',8,12),'WAVE');
 }
 for(const body of requests){assert.equal(body.voice,voiceId);assert.equal('ref_embed' in body.irodori,false);assert.equal(body.irodori.chunking_enabled,true);}
});
test('LAN missing voice reports the server voices folder and keeps text on failure',async t=>fixture(async speakerPath=>{
 const published=[],failed=[];t.mock.method(globalThis,'fetch',async()=>new Response('Unknown voice',{status:400}));
 const lane=new VoiceLane({publish:p=>published.push(p),fail:(...args)=>failed.push(args)});await lane.request(lane.cancel(),{...DEFAULTS,ttsEndpoint:'http://192.168.1.101:8088',speakerPath},'残す発言');
 assert.equal(published.length,0);assert.equal(failed.length,1);assert.match(failed[0][1],/HTTP 400/);assert.match(failed[0][1],/server\\voices/);assert.match(failed[0][1],/そろえる必要はありません/);
}));
test('TTS errors preserve text and reject public endpoints, invalid speaker or invalid audio',async()=>fixture(async speakerPath=>{
 await assert.rejects(checkEmbedding('/missing/voice.speaker.safetensors'));await assert.rejects(checkEmbedding(speakerPath+'.exe'));
 await assert.rejects(synthesize({...DEFAULTS,speakerPath,ttsEndpoint:'http://example.com'},'a',new AbortController().signal),/LAN内/);
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

